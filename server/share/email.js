// Email the photo to a guest (address typed on the booth or the guest's phone).
const nodemailer = require('nodemailer');
const path = require('path');
const { need } = require('./http');
const { fill } = require('../util');

function transport(cfg) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: Number(cfg.port),
    secure: !!cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined
  });
}

async function send({ file, cfg, vars, payload }) {
  need(cfg, ['host'], 'Email');
  const to = payload && payload.to;
  if (!to) {
    const e = new Error('Email: no recipient');
    e.permanent = true;
    throw e;
  }
  await transport(cfg).sendMail({
    from: cfg.from || cfg.user,
    to,
    subject: fill(cfg.subject, vars),
    text: fill(cfg.body, vars),
    attachments: [{ filename: path.basename(file), path: file }]
  });
  return { to };
}

async function test(cfg) {
  need(cfg, ['host'], 'Email');
  await transport(cfg).verify();
  return { ok: true, message: 'SMTP login OK' };
}

module.exports = { send, test };
