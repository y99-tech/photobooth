const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');
const config = require('./config');
const store = require('./store');
const camera = require('./camera');
const share = require('./share');
const { baseUrl, lanIp } = require('./util');

config.load();
const app = express();
const PUBLIC = path.join(config.ROOT, 'public');
const OVERLAY = path.join(store.DIRS.data, 'overlay.png');

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

// ---------- auth helpers ----------
function safeEq(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function adminAuth(req, res, next) {
  if (safeEq(req.get('x-pin'), config.get().adminPin)) return next();
  res.status(401).json({ error: 'Wrong PIN' });
}
function remoteAuth(req, res, next) {
  const c = config.get();
  const pin = req.get('x-pin') || req.query.pin;
  if (safeEq(pin, c.booth.remotePin || c.adminPin)) return next();
  res.status(401).json({ error: 'Wrong PIN' });
}

// ---------- live events (Server-Sent Events): kiosk <-> phone remote <-> gallery ----------
const clients = new Set();
let kioskState = { screen: 'attract', at: Date.now() };

function broadcast(type, data) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write(`event: state\ndata: ${JSON.stringify(kioskState)}\n\n`);
  clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => {
    clearInterval(ping);
    clients.delete(res);
  });
});

share.onChange((photo) => broadcast('photo', summary(photo)));

// Kiosk reports what it is showing, so phone remotes can mirror it.
app.post('/api/kiosk/state', (req, res) => {
  kioskState = { ...req.body, at: Date.now() };
  broadcast('state', kioskState);
  res.json({ ok: true });
});

// Phone remote → kiosk commands.
const REMOTE_CMDS = new Set(['shoot', 'retake', 'accept', 'home', 'mode', 'template', 'greeting', 'camera', 'reload']);
app.post('/api/remote', remoteAuth, (req, res) => {
  const { cmd, value } = req.body || {};
  if (!REMOTE_CMDS.has(cmd)) return res.status(400).json({ error: 'Unknown command' });
  broadcast('remote', { cmd, value });
  res.json({ ok: true });
});
app.get('/api/remote/check', remoteAuth, (req, res) => res.json({ ok: true }));

// ---------- booth ----------
app.get('/api/config', (req, res) => res.json({ ...config.publicView(), baseUrl: baseUrl() }));

app.get('/api/status', async (req, res) => {
  res.json({
    camera: await camera.detect(),
    platform: process.platform,
    baseUrl: baseUrl(),
    lanIp: lanIp(),
    photos: store.all().length,
    overlay: fs.existsSync(OVERLAY)
  });
});

app.get('/api/dslr/preview', camera.previewHandler);

app.post('/api/dslr/capture', async (req, res) => {
  try {
    const file = await camera.capture(store.DIRS.raw);
    res.json({ url: `/raw/${path.basename(file)}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.use('/raw', express.static(store.DIRS.raw, { maxAge: 0 }));
app.use('/photos', express.static(store.DIRS.photos, { maxAge: '7d', immutable: true }));
app.get('/overlay.png', (req, res) => (fs.existsSync(OVERLAY) ? res.sendFile(OVERLAY) : res.status(404).end()));

function summary(p) {
  if (!p) return null;
  return {
    id: p.id,
    url: `/photos/${p.file}`,
    page: `${baseUrl()}/p/${p.id}`,
    publicUrl: share.publicUrl(p),
    greeting: p.greeting,
    guest: p.guest,
    createdAt: p.createdAt,
    shares: Object.fromEntries(
      Object.entries(p.shares || {}).map(([k, v]) => [k, { status: v.status, url: v.url || null, error: v.error || null }])
    )
  };
}

// Final composed JPEG (with greeting/frame) from the kiosk.
app.post('/api/photos', express.raw({ type: 'image/jpeg', limit: '40mb' }), (req, res) => {
  if (!req.body || !req.body.length) return res.status(400).json({ error: 'No image' });
  if (req.body[0] !== 0xff || req.body[1] !== 0xd8) return res.status(400).json({ error: 'Not a JPEG' });
  const id = store.newId();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = `${stamp}_${id}.jpg`;
  fs.writeFileSync(path.join(store.DIRS.photos, file), req.body);
  const photo = store.add({
    id,
    file,
    greeting: String(req.query.greeting || '').slice(0, 500),
    guest: String(req.query.guest || '').slice(0, 100),
    camera: String(req.query.camera || ''),
    createdAt: Date.now(),
    shares: {}
  });
  // Clean up the raw DSLR frame(s) once the composed photo is saved.
  if (req.query.raw) {
    for (const r of String(req.query.raw).split(',')) {
      fs.rm(path.join(store.DIRS.raw, path.basename(r)), { force: true }, () => {});
    }
  }
  share.enqueue(photo, config.get().autoShare || []);
  broadcast('photo', summary(store.get(id)));
  res.json(summary(store.get(id)));
});

app.get('/api/photos', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 60, 500);
  res.json(store.list({ limit, offset: Number(req.query.offset) || 0 }).map(summary));
});

app.get('/api/photos/:id', (req, res) => {
  const p = store.get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json(summary(p));
});

app.get('/api/photos/:id/qr.svg', async (req, res) => {
  const p = store.get(req.params.id);
  if (!p) return res.status(404).end();
  const target = config.get().qrTarget === 'remote' && share.publicUrl(p) ? share.publicUrl(p) : `${baseUrl()}/p/${p.id}`;
  res.type('image/svg+xml').send(await QRCode.toString(target, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }));
});

// QR for joining the phone remote / the Wi-Fi gallery.
app.get('/api/qr.svg', async (req, res) => {
  const to = String(req.query.to || '/gallery');
  if (!to.startsWith('/')) return res.status(400).end();
  res.type('image/svg+xml').send(await QRCode.toString(baseUrl() + to, { type: 'svg', margin: 1 }));
});

app.post('/api/photos/:id/email', (req, res) => {
  const p = store.get(req.params.id);
  const to = String((req.body && req.body.to) || '').trim();
  if (!p) return res.status(404).json({ error: 'Not found' });
  if (!config.get().share.email.enabled) return res.status(400).json({ error: 'Email is off' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ error: 'Invalid email' });
  share.enqueueWith(p, 'email', { to });
  res.json({ ok: true });
});

// Guest taps "post to Facebook / Instagram / Telegram" on the booth.
app.post('/api/photos/:id/share/:target', (req, res) => {
  const p = store.get(req.params.id);
  const t = req.params.target;
  if (!p) return res.status(404).json({ error: 'Not found' });
  if (!share.targets[t] || t === 'email') return res.status(400).json({ error: 'Unknown target' });
  if (!config.get().share[t].enabled) return res.status(400).json({ error: `${t} is off` });
  share.enqueue(p, [t]);
  res.json({ ok: true });
});

// ---------- admin ----------
app.get('/api/admin/config', adminAuth, (req, res) => res.json(config.get()));
app.put('/api/admin/config', adminAuth, (req, res) => {
  const saved = config.save(req.body);
  broadcast('remote', { cmd: 'reload' });
  res.json(saved);
});
app.post('/api/admin/test/:target', adminAuth, async (req, res) => {
  try {
    res.json(await share.test(req.params.target));
  } catch (e) {
    res.status(400).json({ ok: false, message: e.message });
  }
});
app.post('/api/admin/retry/:id', adminAuth, (req, res) => {
  const p = store.get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const failed = Object.entries(p.shares || {}).filter(([, s]) => s.status === 'failed').map(([t]) => t);
  for (const t of failed) store.setShare(p.id, t, { status: 'queued', attempts: 0 });
  share.enqueue(p, []);
  res.json({ retried: failed });
});
app.post('/api/admin/overlay', adminAuth, express.raw({ type: 'image/png', limit: '20mb' }), (req, res) => {
  if (!req.body || req.body.readUInt32BE(0) !== 0x89504e47) return res.status(400).json({ error: 'PNG only' });
  fs.writeFileSync(OVERLAY, req.body);
  broadcast('remote', { cmd: 'reload' });
  res.json({ ok: true });
});
app.delete('/api/admin/overlay', adminAuth, (req, res) => {
  fs.rmSync(OVERLAY, { force: true });
  broadcast('remote', { cmd: 'reload' });
  res.json({ ok: true });
});

// ---------- pages ----------
const page = (f) => (req, res) => res.sendFile(path.join(PUBLIC, f));
app.get('/p/:id', page('guest.html'));
app.get('/gallery', page('gallery.html'));
app.get('/remote', page('remote.html'));
app.get('/admin', page('admin.html'));
app.use(express.static(PUBLIC, { maxAge: '1h' }));

const port = Number(process.env.PORT) || config.get().port;
share.start();
app.listen(port, '0.0.0.0', () => {
  console.log(`\n  📸 Photobooth running`);
  console.log(`     Booth screen : http://localhost:${port}/`);
  console.log(`     Phone remote : ${baseUrl()}/remote`);
  console.log(`     Guest gallery: ${baseUrl()}/gallery`);
  console.log(`     Admin        : http://localhost:${port}/admin  (PIN ${config.get().adminPin === '1234' ? '1234 — change it!' : 'set'})\n`);
});
