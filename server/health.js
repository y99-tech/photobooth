// Booth health: camera battery, disk space, paper, upload backlog, CPU temperature — with alerts
// pushed to the phone remote so the host knows before something runs out mid-party.
const fs = require('fs');
const os = require('os');
const config = require('./config');
const store = require('./store');
const camera = require('./camera');
const printer = require('./printer');

let battery = { value: null, at: 0 };

function cpuTemp() {
  try {
    return Math.round(Number(fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8')) / 1000);
  } catch {
    return null;
  }
}

function disk() {
  try {
    const s = fs.statfsSync(store.DIRS.data);
    return { freeGB: +((s.bavail * s.bsize) / 1e9).toFixed(1), totalGB: +((s.blocks * s.bsize) / 1e9).toFixed(1) };
  } catch {
    return null;
  }
}

function uploads() {
  const out = { queued: 0, failed: 0, done: 0 };
  for (const p of store.all().slice(0, 3000)) {
    for (const s of Object.values(p.shares || {})) {
      if (s.status === 'failed') out.failed++;
      else if (s.status === 'done') out.done++;
      else out.queued++;
    }
  }
  return out;
}

async function check() {
  const c = config.get();
  const cam = await camera.detect();
  if (cam.available && camera.driver() === 'gphoto2' && Date.now() - battery.at > 120000) {
    battery = { value: await camera.battery().catch(() => null), at: Date.now() };
  }
  const h = {
    at: Date.now(),
    camera: { ...cam, battery: cam.available ? battery.value : null },
    disk: disk(),
    print: printer.status(),
    uploads: uploads(),
    cpuTemp: cpuTemp(),
    uptimeMin: Math.round(os.uptime() / 60),
    photos: store.all().length
  };
  const alerts = [];
  if (c.booth.camera === 'dslr' && !cam.available) alerts.push({ level: 'error', text: `DSLR not found: ${cam.reason || 'check cable / power'}` });
  if (h.camera.battery != null && h.camera.battery <= 20) alerts.push({ level: h.camera.battery <= 10 ? 'error' : 'warn', text: `Camera battery ${h.camera.battery}%` });
  if (h.disk && h.disk.freeGB < 2) alerts.push({ level: h.disk.freeGB < 0.5 ? 'error' : 'warn', text: `Only ${h.disk.freeGB} GB disk space left` });
  if (h.print.enabled && h.print.paperLeft >= 0 && h.print.paperLeft <= 10) alerts.push({ level: h.print.paperLeft === 0 ? 'error' : 'warn', text: h.print.paperLeft === 0 ? 'Printer is out of paper' : `Only ${h.print.paperLeft} prints of paper left` });
  if (h.uploads.failed) alerts.push({ level: 'warn', text: `${h.uploads.failed} upload(s) failed — see Admin` });
  if (h.uploads.queued > 25) alerts.push({ level: 'warn', text: `${h.uploads.queued} uploads waiting — check the internet connection` });
  if (h.cpuTemp != null && h.cpuTemp >= 80) alerts.push({ level: 'warn', text: `Booth computer is hot (${h.cpuTemp}°C)` });
  h.alerts = alerts;
  return h;
}

module.exports = { check };
