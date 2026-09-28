// Photo printing.
//  - Linux / Raspberry Pi / macOS: CUPS (`lp`) — DNP, Canon SELPHY, HiTi, Epson, HP… via gutenprint / vendor drivers
//  - Windows: bundled PowerShell script using the Windows print system (any installed printer)
// Jobs run one at a time; the remaining-paper counter stops guests printing into an empty tray.
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const store = require('./store');

// Remaining paper lives in its own file so saving settings never resets the live counter.
// -1 = not tracked (unlimited).
const STATE = path.join(store.DIRS.data, 'print.json');
let paper = { left: -1, printed: 0 };
try { paper = { ...paper, ...JSON.parse(fs.readFileSync(STATE, 'utf8')) }; } catch {}
function savePaper() {
  fs.writeFileSync(STATE, JSON.stringify(paper));
}
function setPaper(left) {
  paper.left = Number.isFinite(Number(left)) ? Math.max(-1, Math.round(Number(left))) : -1;
  savePaper();
  return paper;
}

const WIN_SCRIPT = path.join(config.ROOT, 'scripts', 'print-windows.ps1');
const queue = [];
let running = false;
let listeners = [];
let seq = 0;

function onChange(fn) {
  listeners.push(fn);
}

function emit(job) {
  for (const fn of listeners) fn(job);
}

function run(cmd, args, timeout = 60000) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        const missing = err.code === 'ENOENT';
        return reject(new Error(missing ? `${cmd} not found — install CUPS (sudo apt install cups)` : (stderr || err.message).trim()));
      }
      resolve(stdout);
    });
  });
}

async function listPrinters() {
  if (process.platform === 'win32') {
    const out = await run('powershell', ['-NoProfile', '-Command', 'Get-Printer | Select-Object -ExpandProperty Name']);
    const def = await run('powershell', ['-NoProfile', '-Command',
      '(Get-CimInstance Win32_Printer | Where-Object Default).Name']).catch(() => '');
    return { printers: out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean), default: def.trim() || null };
  }
  const out = await run('lpstat', ['-e']).catch(() => '');
  const def = await run('lpstat', ['-d']).catch(() => '');
  const m = def.match(/:\s*(\S+)/);
  return { printers: out.split('\n').map((s) => s.trim()).filter(Boolean), default: m ? m[1] : null };
}

async function printFile(file, copies) {
  const c = config.get().print;
  if (process.platform === 'win32') {
    return run('powershell', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', WIN_SCRIPT,
      '-File', file, '-Printer', c.printer || '', '-Copies', String(copies),
      '-Scaling', c.scaling, '-Margin', String(c.marginMm || 0)
    ], 120000);
  }
  const args = ['-n', String(copies), '-o', `print-scaling=${c.scaling === 'fill' ? 'fill' : 'fit'}`];
  if (c.scaling !== 'fill') args.push('-o', 'fit-to-page'); // older CUPS
  if (c.printer) args.unshift('-d', c.printer);
  if (c.media) args.push('-o', `media=${c.media}`);
  if (c.borderless) args.push('-o', 'StpBorderless=True', '-o', 'Borderless=True');
  for (const opt of c.extraOptions || []) args.push('-o', opt);
  args.push(file);
  const out = await run('lp', args);
  const m = out.match(/request id is (\S+)/);
  return m ? m[1] : out.trim();
}

function status() {
  const c = config.get().print;
  return {
    enabled: !!c.enabled,
    paperLeft: paper.left,
    printed: paper.printed,
    queued: queue.length + (running ? 1 : 0),
    maxCopies: c.maxCopies
  };
}

function check(copies) {
  const c = config.get().print;
  if (!c.enabled) throw new Error('Printing is off');
  if (paper.left >= 0 && paper.left < copies) {
    throw new Error(paper.left === 0 ? 'Printer is out of paper — please ask the host' : `Only ${paper.left} print(s) left`);
  }
}

// Adds a job; resolves immediately with the job (status via onChange).
function enqueue({ photoId, file, copies, source }) {
  const c = config.get().print;
  copies = Math.max(1, Math.min(Number(copies) || 1, source === 'admin' ? 99 : c.maxCopies || 1));
  check(copies);
  // Reserve the paper now so parallel guests can't overdraw the tray.
  if (paper.left >= 0) paper.left -= copies;
  paper.printed += copies;
  savePaper();
  const job = { id: ++seq, photoId, file, copies, status: 'queued', error: null, at: Date.now() };
  queue.push(job);
  emit(job);
  pump();
  return job;
}

async function pump() {
  if (running || !queue.length) return;
  running = true;
  const job = queue.shift();
  job.status = 'printing';
  emit(job);
  try {
    job.printerJob = await printFile(job.file, job.copies);
    job.status = 'done';
    console.log(`[print] ✓ ${job.photoId} ×${job.copies} ${job.printerJob || ''}`);
  } catch (e) {
    job.status = 'failed';
    job.error = e.message;
    // Give the reserved paper back.
    if (paper.left >= 0) paper.left += job.copies;
    paper.printed -= job.copies;
    savePaper();
    console.warn(`[print] ✗ ${job.photoId}: ${e.message}`);
  } finally {
    running = false;
    emit(job);
    pump();
  }
}

module.exports = { listPrinters, enqueue, status, onChange, check, setPaper };
