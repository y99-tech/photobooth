// Generic uploader for digital wedding platforms, online guestbooks, or your own API.
// Sends multipart/form-data: the photo + configurable text fields (greeting, guest, caption…).
const { fileBlob, fileName, json, need } = require('./http');
const { fill, pick } = require('../util');

async function send({ file, cfg, vars }) {
  need(cfg, ['url'], cfg.name || 'Wedding platform');
  const form = new FormData();
  for (const [k, v] of Object.entries(cfg.fields || {})) form.append(k, fill(v, vars));
  form.append(cfg.fileField || 'photo', fileBlob(file), fileName(file));
  const headers = {};
  for (const [k, v] of Object.entries(cfg.headers || {})) if (v) headers[k] = fill(v, vars);
  const res = await fetch(fill(cfg.url, vars), {
    method: cfg.method || 'POST',
    headers,
    body: form,
    signal: AbortSignal.timeout(60000)
  });
  const body = await json(res, cfg.name || 'Wedding platform');
  const url = typeof body === 'object' ? pick(body, cfg.urlPath) : null;
  return { url: typeof url === 'string' ? url : null };
}

module.exports = { send };
