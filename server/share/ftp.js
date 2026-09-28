// Upload to your own web hosting (cPanel, shared hosting, NAS…) over FTP / FTPS.
const ftp = require('basic-ftp');
const path = require('path');
const { need } = require('./http');

async function connect(cfg) {
  const client = new ftp.Client(30000);
  await client.access({
    host: cfg.host,
    port: Number(cfg.port) || 21,
    user: cfg.user,
    password: cfg.password,
    secure: !!cfg.secure
  });
  return client;
}

async function send({ file, cfg }) {
  need(cfg, ['host', 'user'], 'FTP');
  const client = await connect(cfg);
  try {
    if (cfg.remoteDir) await client.ensureDir(cfg.remoteDir);
    const name = path.basename(file);
    await client.uploadFrom(file, name);
    const prefix = (cfg.publicUrlPrefix || '').replace(/\/$/, '');
    return { url: prefix ? `${prefix}/${name}` : null };
  } finally {
    client.close();
  }
}

async function test(cfg) {
  need(cfg, ['host', 'user'], 'FTP');
  const client = await connect(cfg);
  try {
    if (cfg.remoteDir) await client.ensureDir(cfg.remoteDir);
    return { ok: true, message: `Connected, folder ${await client.pwd()} ready` };
  } finally {
    client.close();
  }
}

module.exports = { send, test };
