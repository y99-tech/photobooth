// Links for the phone apps (iOS / Android "Photobooth Remote"):
//  - Wi-Fi: announces the booth on the local network (Bonjour / mDNS, "_photobooth._tcp")
//    and answers on <host>.local, so the app finds it without typing an IP address.
//  - Bluetooth LE: a small GATT service so the app keeps working with no Wi-Fi at all.
//  - NFC: the tag stuck on the booth just holds the booth's web address (see nfcInfo()).
//
// Bluetooth protocol (shared with mobile/ios and mobile/android):
//   service 7b9a0001-3c4e-4f5a-9b1d-2f6e8c0d1a70
//   CMD     7b9a0002-…  write          app → booth
//   EVT     7b9a0003-…  notify         booth → app
// Every message is UTF-8 JSON split into packets; the first byte of each packet is
// 0x01 when more packets follow and 0x00 on the last one.
//   app → booth : {"id":1,"c":"shoot","v":null,"p":"1234"}    (c = command, v = value, p = PIN)
//   booth → app : {"t":"ack","id":1,"ok":true} | {"t":"ack","id":1,"ok":false,"e":"Wrong PIN"}
//                 {"t":"state",…} {"t":"print",…} {"t":"photo",…} {"t":"health",…}
// "hello" works without a PIN; every other command needs it, and live updates are only
// sent to phones that have sent the right PIN on this connection.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const store = require('./store');
const { lanIp } = require('./util');

const UUID = (n) => `7b9a000${n}-3c4e-4f5a-9b1d-2f6e8c0d1a70`;
const SERVICE_UUID = UUID(1);
const CMD_UUID = UUID(2);
const EVT_UUID = UUID(3);
const VERSION = require('../package.json').version;

let bonjour = null;
let published = null;
const ble = { state: 'off', error: null, clients: new Map() }; // handle -> { send, max, authed, buf }
let handler = async () => ({});

function boothId() {
  const f = path.join(store.DIRS.data, 'booth-id');
  try {
    return fs.readFileSync(f, 'utf8').trim();
  } catch {
    const id = crypto.randomBytes(4).toString('hex');
    fs.writeFileSync(f, id);
    return id;
  }
}

function name() {
  const c = config.get();
  return String(c.link.name || c.event.title || 'Photobooth').slice(0, 40);
}

// Host name the booth answers to on the local network, e.g. "photobooth" → photobooth.local
function host() {
  const h = String(config.get().link.host || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  return h || os.hostname().toLowerCase().replace(/\.local$/, '');
}

function bluetoothWanted() {
  const b = String(config.get().link.bluetooth).trim().toLowerCase();
  if (b === 'auto') return process.platform === 'win32' || process.platform === 'darwin';
  return ['true', 'on', 'yes', '1'].includes(b);
}

// ---------------------------------------------------------------- Wi-Fi (Bonjour)
function startBonjour(port) {
  if (!config.get().link.bonjour) return;
  try {
    const { Bonjour } = require('bonjour-service');
    bonjour = new Bonjour({}, (e) => console.warn('  Bonjour:', e.message));
    published = bonjour.publish({
      name: `${name()} (${boothId()})`,
      type: 'photobooth',
      protocol: 'tcp',
      host: `${host()}.local`,
      port,
      txt: { v: VERSION, id: boothId(), name: name(), host: `${host()}.local`, ip: lanIp(), port: String(port), ble: bluetoothWanted() ? '1' : '0' }
    });
    published.on('error', (e) => console.warn('  Bonjour:', e.message));
  } catch (e) {
    console.warn('  Bonjour not available:', e.message);
  }
}

// ---------------------------------------------------------------- Bluetooth LE
function frame(obj, max) {
  const data = Buffer.from(JSON.stringify(obj));
  const size = Math.max(19, (max || 20) - 1);
  const out = [];
  for (let i = 0; i < data.length || i === 0; i += size) {
    const chunk = data.subarray(i, i + size);
    out.push(Buffer.concat([Buffer.from([i + size < data.length ? 1 : 0]), chunk]));
  }
  return out;
}

function sendTo(client, obj) {
  for (const pkt of frame(obj, client.max)) {
    try {
      client.send(pkt);
    } catch {}
  }
}

// Live updates (only to phones that sent the right PIN).
function push(type, data) {
  if (!ble.clients.size) return;
  const msg = compact(type, data);
  if (!msg) return;
  for (const c of ble.clients.values()) if (c.authed && c.send) sendTo(c, msg);
}

// Small versions of the live events (Bluetooth is slow).
function compact(type, d) {
  if (!d) return null;
  if (type === 'state') return { t: 'state', screen: d.screen, mode: d.mode, template: d.template, camera: d.camera };
  if (type === 'print') return { t: 'print', status: d.job && d.job.status, error: d.job && d.job.error, queued: d.queued, paperLeft: d.paperLeft, enabled: d.enabled };
  if (type === 'photo') return { t: 'photo', id: d.id, kind: d.kind };
  if (type === 'health') {
    return {
      t: 'health',
      alerts: (d.alerts || []).slice(0, 5).map((a) => ({ level: a.level, text: String(a.text).slice(0, 80) })),
      battery: d.camera ? d.camera.battery : null,
      camera: d.camera ? !!d.camera.available : null,
      freeGB: d.disk ? d.disk.freeGB : null,
      paperLeft: d.print ? d.print.paperLeft : null,
      photos: d.photos
    };
  }
  return null;
}

async function onMessage(handle, raw) {
  const client = ble.clients.get(handle) || {};
  let msg;
  try {
    msg = JSON.parse(raw.toString('utf8'));
  } catch {
    return;
  }
  const reply = (o) => {
    if (client.send) sendTo(client, { ...o, t: 'ack', id: msg.id });
  };
  try {
    const out = await handler({ cmd: msg.c, value: msg.v, pin: msg.p, transport: 'bluetooth' });
    if (msg.c !== 'hello') client.authed = true;
    reply({ ok: true, ...out });
    if (msg.c === 'check' && out.state) sendTo(client, compact('state', out.state));
  } catch (e) {
    if (e.status === 401) client.authed = false;
    reply({ ok: false, e: e.message });
  }
}

function startBluetooth() {
  if (!bluetoothWanted()) return;
  let bleno;
  try {
    bleno = require('@stoprocent/bleno');
  } catch (e) {
    ble.state = 'unavailable';
    ble.error = e.message;
    console.warn('  Bluetooth not available:', e.message);
    return;
  }
  const evt = new bleno.Characteristic({
    uuid: EVT_UUID,
    properties: ['notify'],
    onSubscribe(handle, maxValueSize, update) {
      const c = ble.clients.get(handle) || { buf: [] };
      Object.assign(c, { send: update, max: maxValueSize || 20 });
      ble.clients.set(handle, c);
    },
    onUnsubscribe(handle) {
      const c = ble.clients.get(handle);
      if (c) c.send = null;
    }
  });
  const cmd = new bleno.Characteristic({
    uuid: CMD_UUID,
    properties: ['write', 'writeWithoutResponse'],
    onWriteRequest(handle, data, offset, withoutResponse, callback) {
      const c = ble.clients.get(handle) || { buf: [] };
      ble.clients.set(handle, c);
      if (data.length) {
        c.buf = c.buf || [];
        c.buf.push(data.subarray(1));
        if (Buffer.concat(c.buf).length > 4096) c.buf = []; // ignore runaway messages
        if (data[0] === 0) {
          const whole = Buffer.concat(c.buf);
          c.buf = [];
          onMessage(handle, whole);
        }
      }
      if (!withoutResponse) callback(bleno.Characteristic.RESULT_SUCCESS);
    }
  });
  const service = new bleno.PrimaryService({ uuid: SERVICE_UUID, characteristics: [cmd, evt] });

  bleno.on('stateChange', (state) => {
    ble.state = state;
    if (state === 'poweredOn') {
      bleno.startAdvertising('Photobooth', [SERVICE_UUID], (e) => {
        if (e) {
          ble.error = e.message;
          console.warn('  Bluetooth advertising failed:', e.message);
        }
      });
    } else {
      bleno.stopAdvertising();
    }
  });
  bleno.on('advertisingStart', (e) => {
    if (!e) {
      bleno.setServices([service], (err) => {
        if (err) ble.error = err.message;
        else console.log('     Bluetooth    : on (Photobooth Remote app)');
      });
    }
  });
  bleno.on('disconnect', (address, handle) => ble.clients.delete(handle));
  ble.state = 'starting';
}

// ---------------------------------------------------------------- NFC
// What to write on an NFC sticker on the booth. Phones open the booth's remote page when they
// touch it, and the Photobooth Remote app (Android) opens straight to this booth.
function nfcInfo(port, baseUrl) {
  return {
    stable: `http://${host()}.local:${port}/remote`,
    current: `${baseUrl}/remote`,
    androidPackage: 'app.photobooth.remote'
  };
}

function status(port, baseUrl) {
  return {
    name: name(),
    id: boothId(),
    host: `${host()}.local`,
    bonjour: !!published,
    bluetooth: bluetoothWanted() ? ble.state : 'off',
    bluetoothError: ble.error,
    bluetoothPhones: [...ble.clients.values()].filter((c) => c.authed).length,
    nfc: nfcInfo(port, baseUrl)
  };
}

function start({ port, onCommand }) {
  handler = onCommand;
  startBonjour(port);
  startBluetooth();
}

function stop() {
  try {
    if (bonjour) bonjour.unpublishAll(() => bonjour.destroy());
  } catch {}
}

module.exports = { start, stop, push, status, name, host, boothId, frame, VERSION, SERVICE_UUID, CMD_UUID, EVT_UUID };
