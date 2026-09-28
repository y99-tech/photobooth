// Google Drive upload with zero Google SDK: plain REST + a hand-rolled JWT for service accounts.
//  A) OAuth client id/secret + refresh token  → uploads into a normal "My Drive" folder
//  B) Service-account JSON                     → uploads into a Shared Drive folder
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { json, mimeOf } = require('./http');

let cached = { token: null, exp: 0, key: '' };

async function accessToken(cfg) {
  const key = cfg.serviceAccountJson ? 'sa' : cfg.refreshToken;
  if (cached.token && cached.key === key && cached.exp > Date.now() + 60000) return cached.token;
  let body;
  if (cfg.serviceAccountJson) {
    const sa = typeof cfg.serviceAccountJson === 'string' ? JSON.parse(cfg.serviceAccountJson) : cfg.serviceAccountJson;
    const now = Math.floor(Date.now() / 1000);
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/drive.file',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600
    })}`;
    const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url');
    body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` });
  } else if (cfg.refreshToken && cfg.clientId) {
    body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: cfg.refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret
    });
  } else {
    const e = new Error('Google Drive: add OAuth client + refresh token, or a service-account JSON');
    e.permanent = true;
    throw e;
  }
  const tok = await json(await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body }), 'Google auth');
  cached = { token: tok.access_token, exp: Date.now() + tok.expires_in * 1000, key };
  return tok.access_token;
}

async function send({ file, cfg, vars }) {
  const token = await accessToken(cfg);
  const meta = {
    name: path.basename(file),
    description: vars.caption,
    ...(cfg.folderId ? { parents: [cfg.folderId] } : {})
  };
  const boundary = 'pb' + crypto.randomBytes(8).toString('hex');
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mimeOf(file)}\r\n\r\n`),
    fs.readFileSync(file),
    Buffer.from(`\r\n--${boundary}--`)
  ]);
  const up = await json(
    await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
      signal: AbortSignal.timeout(120000)
    }),
    'Google Drive'
  );
  if (cfg.makePublic) {
    await json(
      await fetch(`https://www.googleapis.com/drive/v3/files/${up.id}/permissions?supportsAllDrives=true`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'reader', type: 'anyone' })
      }),
      'Google Drive (share)'
    );
  }
  return { fileId: up.id, url: cfg.makePublic ? up.webViewLink : null };
}

async function test(cfg) {
  const token = await accessToken(cfg);
  if (cfg.folderId) {
    const f = await json(
      await fetch(`https://www.googleapis.com/drive/v3/files/${cfg.folderId}?fields=name&supportsAllDrives=true`, {
        headers: { Authorization: `Bearer ${token}` }
      }),
      'Google Drive'
    );
    return { ok: true, message: `Folder "${f.name}" reachable` };
  }
  return { ok: true, message: 'Google login OK (uploads go to Drive root)' };
}

module.exports = { send, test };
