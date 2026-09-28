const os = require('os');
const config = require('./config');

function lanIp() {
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const [name, addrs] of Object.entries(nets)) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) candidates.push({ name, address: a.address });
    }
  }
  // Prefer Wi-Fi / hotspot style interfaces.
  const pref = candidates.find((c) => /^(wl|wlan|ap|en0)/i.test(c.name)) || candidates[0];
  return pref ? pref.address : '127.0.0.1';
}

function baseUrl() {
  const c = config.get();
  if (c.publicBaseUrl) return c.publicBaseUrl.replace(/\/$/, '');
  return `http://${lanIp()}:${Number(process.env.PORT) || c.port}`;
}

function fill(template, vars) {
  return String(template || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}

function pick(obj, dotPath) {
  return String(dotPath || '')
    .split('.')
    .filter(Boolean)
    .reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

module.exports = { lanIp, baseUrl, fill, pick };
