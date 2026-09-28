// DSLR / mirrorless support.
//  - Linux / Raspberry Pi / macOS: gphoto2 (2,500+ Canon, Nikon, Sony, Fuji… models)
//  - Windows: digiCamControl (Canon / Nikon / Sony) — CLI for capture, web server for live view
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('./config');

let previewProc = null;
let previewClients = new Set();
let lastFrame = null;
let busy = false;

function driver() {
  const d = config.get().dslr.driver || 'auto';
  if (d !== 'auto') return d;
  return process.platform === 'win32' ? 'digicam' : 'gphoto2';
}

function bin() {
  const c = config.get().dslr;
  return driver() === 'digicam' ? c.digicamCmd : c.gphoto2 || 'gphoto2';
}

function run(args, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    execFile(bin(), args, { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message).trim()));
      resolve(stdout);
    });
  });
}

async function detect() {
  if (busy) return { available: true, model: 'busy', driver: driver() };
  if (driver() === 'digicam') return detectDigicam();
  try {
    const out = await run(['--auto-detect'], 5000);
    const lines = out.split('\n').slice(2).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return { available: false, reason: 'No camera detected' };
    const model = lines[0].replace(/\s+usb:.*$/i, '').trim();
    return { available: true, model, driver: 'gphoto2' };
  } catch (e) {
    const missing = /ENOENT/.test(e.message);
    return { available: false, reason: missing ? 'gphoto2 is not installed' : e.message };
  }
}

async function detectDigicam() {
  if (!fs.existsSync(bin())) {
    return { available: false, driver: 'digicam', reason: `digiCamControl not found at ${bin()}` };
  }
  try {
    const r = await fetch(`${config.get().dslr.digicamWebUrl}/session.json`, { signal: AbortSignal.timeout(2000) });
    const j = await r.json();
    const cam = j.CameraName || j.cameraName || 'Camera via digiCamControl';
    return { available: true, driver: 'digicam', model: cam };
  } catch {
    // CLI exists but web server is off: capture works, live view will not.
    return { available: true, driver: 'digicam', model: 'digiCamControl (enable its web server for live view)' };
  }
}

// ---- Live view: gphoto2 --capture-movie streams MJPEG on stdout; we re-serve it. ----
function startPreview() {
  if (previewProc || busy) return;
  if (driver() === 'digicam') return startDigicamPreview();
  const proc = spawn(bin(), ['--stdout', '--capture-movie'], { stdio: ['ignore', 'pipe', 'ignore'] });
  previewProc = proc;
  let buf = Buffer.alloc(0);
  proc.stdout.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const soi = buf.indexOf(Buffer.from([0xff, 0xd8]));
      if (soi < 0) { buf = Buffer.alloc(0); break; }
      const eoi = buf.indexOf(Buffer.from([0xff, 0xd9]), soi + 2);
      if (eoi < 0) { if (soi > 0) buf = buf.subarray(soi); break; }
      const frame = buf.subarray(soi, eoi + 2);
      buf = buf.subarray(eoi + 2);
      lastFrame = Buffer.from(frame);
      for (const res of previewClients) writeFrame(res, lastFrame);
    }
    if (buf.length > 8 * 1024 * 1024) buf = Buffer.alloc(0);
  });
  proc.on('error', () => {});
  proc.on('close', () => {
    if (previewProc === proc) previewProc = null;
  });
}

// digiCamControl serves single live-view JPEGs; poll and re-serve them as MJPEG.
function startDigicamPreview() {
  const url = config.get().dslr.digicamWebUrl;
  const handle = { stopped: false, kill() { this.stopped = true; this.emitClose(); }, once(ev, cb) { this.emitClose = cb; }, emitClose() {} };
  previewProc = handle;
  execFile(config.get().dslr.digicamRemoteCmd, ['/c', 'do', 'LiveViewWnd_Show'], () => {});
  (async function loop() {
    while (!handle.stopped && previewProc === handle) {
      try {
        const r = await fetch(`${url}/liveview.jpg?t=${Date.now()}`, { signal: AbortSignal.timeout(2000) });
        if (r.ok) {
          lastFrame = Buffer.from(await r.arrayBuffer());
          for (const res of previewClients) writeFrame(res, lastFrame);
        }
      } catch {}
      await new Promise((ok) => setTimeout(ok, 80));
    }
    if (previewProc === handle) previewProc = null;
  })();
}

function stopPreview() {
  return new Promise((resolve) => {
    if (!previewProc) return resolve();
    const proc = previewProc;
    previewProc = null;
    proc.once('close', () => setTimeout(resolve, 300)); // let USB settle
    proc.kill('SIGINT');
    setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} resolve(); }, 3000);
  });
}

function writeFrame(res, frame) {
  res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`);
  res.write(frame);
  res.write('\r\n');
}

function previewHandler(req, res) {
  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
    'Cache-Control': 'no-cache, no-store',
    Connection: 'close'
  });
  previewClients.add(res);
  if (lastFrame) writeFrame(res, lastFrame);
  startPreview();
  req.on('close', () => {
    previewClients.delete(res);
    if (!previewClients.size) stopPreview();
  });
}

async function capture(destDir) {
  if (busy) throw new Error('Camera busy');
  busy = true;
  const hadPreview = previewClients.size > 0;
  try {
    await stopPreview();
    if (driver() === 'digicam') {
      const out = path.join(destDir, `dslr-${Date.now()}.jpg`);
      await run(['/filename', out, '/capture'], config.get().dslr.captureTimeoutMs);
      if (!fs.existsSync(out)) throw new Error('digiCamControl did not save a photo (set camera to JPEG)');
      return out;
    }
    const file = path.join(destDir, `dslr-${Date.now()}.%C`);
    await run(
      ['--capture-image-and-download', '--force-overwrite', '--filename', file],
      config.get().dslr.captureTimeoutMs
    );
    // Prefer the JPEG if camera shoots RAW+JPEG.
    const base = path.basename(file, '.%C');
    const files = fs.readdirSync(destDir).filter((f) => f.startsWith(base));
    const jpg = files.find((f) => /\.jpe?g$/i.test(f));
    for (const f of files) if (f !== jpg) fs.rmSync(path.join(destDir, f), { force: true });
    if (!jpg) throw new Error('Camera did not return a JPEG (set camera to JPEG or RAW+JPEG)');
    return path.join(destDir, jpg);
  } finally {
    busy = false;
    if (hadPreview && previewClients.size) startPreview();
  }
}

// Battery level in % (gphoto2 cameras that report it). Skipped while the camera is in use.
async function battery() {
  if (busy || previewProc || driver() !== 'gphoto2') return null;
  const out = await run(['--get-config', '/main/status/batterylevel'], 5000);
  const m = out.match(/Current:\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

module.exports = { battery, driver, detect, previewHandler, capture, stopPreview };
