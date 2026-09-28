// Upload queue: every share job is persisted on the photo record and retried until it
// succeeds, so a flaky venue Wi-Fi / 4G dongle never loses a photo.
const config = require('../config');
const store = require('../store');
const { baseUrl, fill } = require('../util');

const targets = {
  drive: require('./drive'),
  ftp: require('./ftp'),
  wedding: require('./wedding'),
  facebook: require('./facebook'),
  instagram: require('./instagram'),
  telegram: require('./telegram'),
  email: require('./email')
};

// Hosting targets run first so Instagram (which needs a public URL) can use their links.
const ORDER = ['ftp', 'wedding', 'drive', 'facebook', 'telegram', 'instagram', 'email'];
const MAX_ATTEMPTS = 8;
const RETRY_MS = 30000;
const running = new Set();
let listeners = [];

function onChange(fn) {
  listeners.push(fn);
}

function emit(photo) {
  for (const fn of listeners) fn(photo);
}

function vars(photo, extra = {}) {
  const c = config.get();
  const v = {
    title: c.event.title,
    subtitle: c.event.subtitle,
    date: c.event.date,
    hashtag: c.event.hashtag,
    greeting: photo.greeting || '',
    guest: photo.guest || 'A guest',
    url: publicUrl(photo) || `${baseUrl()}/p/${photo.id}`,
    localUrl: `${baseUrl()}/p/${photo.id}`,
    id: photo.id,
    ...extra
  };
  v.caption = fill(c.caption, v).replace(/\n—\s*A guest/, '').trim();
  return v;
}

function publicUrl(photo) {
  for (const t of ['ftp', 'wedding', 'drive']) {
    const s = photo.shares && photo.shares[t];
    if (s && s.status === 'done' && s.url) return s.url;
  }
  return null;
}

function enqueue(photo, list) {
  const c = config.get();
  for (const t of list) {
    if (!targets[t] || !c.share[t] || !c.share[t].enabled) continue;
    const cur = photo.shares && photo.shares[t];
    if (cur && (cur.status === 'done' || cur.status === 'running')) continue;
    store.setShare(photo.id, t, { status: 'queued', attempts: 0, error: null, payload: null });
  }
  emit(store.get(photo.id));
  pump();
}

// Queue a share that needs extra input (e.g. email address) from the guest.
function enqueueWith(photo, target, payload) {
  store.setShare(photo.id, target, { status: 'queued', attempts: 0, error: null, payload });
  emit(store.get(photo.id));
  pump();
}

async function runJob(photo, t) {
  const key = `${photo.id}:${t}`;
  if (running.has(key)) return;
  running.add(key);
  const share = photo.shares[t];
  store.setShare(photo.id, t, { status: 'running', attempts: (share.attempts || 0) + 1 });
  emit(store.get(photo.id));
  try {
    const cfg = config.get().share[t];
    const result = await targets[t].send({
      photo,
      file: store.filePath(photo),
      cfg,
      vars: vars(photo),
      payload: share.payload
    });
    store.setShare(photo.id, t, { status: 'done', error: null, ...(result || {}) });
    console.log(`[share] ${t} ✓ ${photo.id}${result && result.url ? ' → ' + result.url : ''}`);
  } catch (e) {
    const attempts = store.get(photo.id).shares[t].attempts;
    const failed = attempts >= MAX_ATTEMPTS || e.permanent;
    store.setShare(photo.id, t, {
      status: failed ? 'failed' : 'retry',
      error: e.message,
      nextAt: Date.now() + RETRY_MS * Math.min(attempts, 6)
    });
    console.warn(`[share] ${t} ✗ ${photo.id} (${attempts}/${MAX_ATTEMPTS}): ${e.message}`);
  } finally {
    running.delete(key);
    emit(store.get(photo.id));
    pump();
  }
}

function pump() {
  const now = Date.now();
  for (const photo of store.all().slice(0, 500)) {
    if (!photo.shares) continue;
    for (const t of ORDER) {
      const s = photo.shares[t];
      if (!s) continue;
      const ready = s.status === 'queued' || (s.status === 'retry' && (s.nextAt || 0) <= now);
      if (!ready) continue;
      // Instagram waits for a hosting target to produce a public URL.
      if (t === 'instagram' && !publicUrl(photo)) {
        const pending = ['ftp', 'wedding', 'drive'].some((h) => {
          const hs = photo.shares[h];
          return hs && !['done', 'failed'].includes(hs.status);
        });
        if (pending) continue;
      }
      runJob(photo, t);
    }
  }
}

function start() {
  // Resume jobs interrupted by a restart / power cut.
  for (const photo of store.all()) {
    for (const [t, s] of Object.entries(photo.shares || {})) {
      if (s.status === 'running') store.setShare(photo.id, t, { status: 'retry', nextAt: 0 });
    }
  }
  setInterval(pump, 5000);
  pump();
}

async function test(target) {
  const t = targets[target];
  if (!t) throw new Error('Unknown target');
  if (!t.test) return { ok: true, message: 'No test available — take a photo to try it.' };
  return t.test(config.get().share[target]);
}

module.exports = { enqueue, enqueueWith, start, onChange, publicUrl, vars, test, targets };
