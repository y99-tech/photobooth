// Tiny JSON-file database of photos + their share status. No native deps, SD-card friendly.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ROOT } = require('./config');

const DATA = process.env.PHOTOBOOTH_DATA || path.join(ROOT, 'data');
const DIRS = {
  data: DATA,
  photos: path.join(DATA, 'photos'),
  raw: path.join(DATA, 'raw'),
  db: path.join(DATA, 'photos.json')
};
for (const d of [DIRS.data, DIRS.photos, DIRS.raw]) fs.mkdirSync(d, { recursive: true });

let photos = [];
try {
  photos = JSON.parse(fs.readFileSync(DIRS.db, 'utf8'));
} catch {}

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DIRS.db + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(photos, null, 1));
    fs.renameSync(tmp, DIRS.db); // atomic: survives power loss mid-write
  }, 200);
}

function newId() {
  // Short, unguessable-enough id for guest links (no sequential enumeration).
  return crypto.randomBytes(6).toString('base64url');
}

function add(record) {
  photos.unshift(record);
  persist();
  return record;
}

function get(id) {
  return photos.find((p) => p.id === id);
}

function update(id, patch) {
  const p = get(id);
  if (!p) return null;
  Object.assign(p, patch);
  persist();
  return p;
}

function setShare(id, target, patch) {
  const p = get(id);
  if (!p) return null;
  p.shares = p.shares || {};
  p.shares[target] = { ...(p.shares[target] || {}), ...patch, at: Date.now() };
  persist();
  return p;
}

function list({ limit = 100, offset = 0 } = {}) {
  return photos.slice(offset, offset + limit);
}

function all() {
  return photos;
}

function filePath(p) {
  return path.join(DIRS.photos, p.file);
}

module.exports = { DIRS, newId, add, get, update, setShare, list, all, filePath };
