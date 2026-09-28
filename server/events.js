// Event profiles: save the whole setup of an event (texts, look, sharing, assets) and switch
// between clients in one tap. Every photo is tagged with the event it was taken at.
const fs = require('fs');
const path = require('path');
const config = require('./config');
const store = require('./store');

const PROFILES = path.join(store.DIRS.data, 'profiles');
const ASSET_FILES = ['overlay.png', 'logo.png', 'logo.jpg', 'music.mp3', 'music.m4a', 'mosaic.jpg', 'mosaic.png'];
// Machine settings stay with the booth, not the event.
const MACHINE_KEYS = ['port', 'adminPin', 'dslr', 'video', 'publicBaseUrl'];

function slug(s) {
  return String(s || 'event')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w؀-ۿ]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 50) || 'event';
}

function currentId() {
  const e = config.get().event;
  return e.id || slug(e.title);
}

// Photos taken before events existed belong to the current event.
function migrate() {
  const id = currentId();
  let n = 0;
  for (const p of store.all()) if (!p.event) { p.event = id; n++; }
  if (n) store.update(store.all()[0].id, {});
}

function copyDir(src, dst) {
  fs.rmSync(dst, { recursive: true, force: true });
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(dst, f));
}

function list() {
  if (!fs.existsSync(PROFILES)) return [];
  return fs
    .readdirSync(PROFILES)
    .map((d) => {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(PROFILES, d, 'profile.json'), 'utf8'));
        return { id: d, name: j.name, title: j.config.event.title, date: j.config.event.date, savedAt: j.savedAt, current: d === currentId() };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.savedAt - a.savedAt);
}

function save(name) {
  const c = config.get();
  const id = currentId();
  const dir = path.join(PROFILES, id);
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  const snapshot = { ...c, event: { ...c.event, id } };
  for (const k of MACHINE_KEYS) delete snapshot[k];
  fs.writeFileSync(path.join(dir, 'profile.json'), JSON.stringify({ name: name || c.event.title, savedAt: Date.now(), config: snapshot }, null, 2));
  for (const f of fs.readdirSync(path.join(dir, 'assets'))) fs.rmSync(path.join(dir, 'assets', f), { force: true });
  for (const f of ASSET_FILES) {
    const src = path.join(store.DIRS.data, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, 'assets', f));
  }
  copyDir(path.join(store.DIRS.data, 'backgrounds'), path.join(dir, 'backgrounds'));
  return list();
}

function load(id) {
  const dir = path.join(PROFILES, path.basename(id));
  const prof = JSON.parse(fs.readFileSync(path.join(dir, 'profile.json'), 'utf8'));
  const c = config.get();
  const next = { ...prof.config };
  for (const k of MACHINE_KEYS) next[k] = c[k];
  config.save(next);
  for (const f of ASSET_FILES) fs.rmSync(path.join(store.DIRS.data, f), { force: true });
  const assets = path.join(dir, 'assets');
  if (fs.existsSync(assets)) for (const f of fs.readdirSync(assets)) fs.copyFileSync(path.join(assets, f), path.join(store.DIRS.data, f));
  copyDir(path.join(dir, 'backgrounds'), path.join(store.DIRS.data, 'backgrounds'));
  fs.mkdirSync(path.join(store.DIRS.data, 'backgrounds'), { recursive: true });
  return config.get();
}

// Start a fresh event: new title/id, same look & settings (save a profile first to keep the old one).
function startNew({ title, subtitle, date }) {
  const c = config.get();
  const base = slug(`${title || 'event'}-${date || new Date().toISOString().slice(0, 10)}`);
  let id = base;
  for (let i = 2; list().some((p) => p.id === id) || store.all().some((p) => p.event === id); i++) id = `${base}-${i}`;
  return config.save({ ...c, event: { ...c.event, title: title || c.event.title, subtitle: subtitle ?? c.event.subtitle, date: date || '', id } });
}

function remove(id) {
  if (path.basename(id) === currentId()) throw new Error('This is the current event — load another one first');
  fs.rmSync(path.join(PROFILES, path.basename(id)), { recursive: true, force: true });
  return list();
}

module.exports = { currentId, migrate, list, save, load, startNew, remove, slug };
