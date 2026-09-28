// Shared helpers for HTTP-based uploaders (uses Node's built-in fetch / FormData).
const fs = require('fs');
const path = require('path');

function fileBlob(file) {
  return new Blob([fs.readFileSync(file)], { type: 'image/jpeg' });
}

function fileName(file) {
  return path.basename(file);
}

async function json(res, what) {
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) {
    const msg = (body && body.error && (body.error.message || body.error)) || text.slice(0, 300);
    const err = new Error(`${what}: HTTP ${res.status} ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
    // 4xx (except rate limit / timeout) will not fix itself by retrying.
    err.permanent = res.status >= 400 && res.status < 500 && ![408, 429].includes(res.status);
    throw err;
  }
  return body;
}

function need(cfg, keys, name) {
  const missing = keys.filter((k) => !cfg[k]);
  if (missing.length) {
    const e = new Error(`${name}: missing setting(s) ${missing.join(', ')}`);
    e.permanent = true;
    throw e;
  }
}

module.exports = { fileBlob, fileName, json, need };
