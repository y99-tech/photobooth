// Send every photo to a Telegram group/channel (great live feed for the couple & family).
const { fileBlob, fileName, json, need } = require('./http');

async function send({ file, cfg, vars }) {
  need(cfg, ['botToken', 'chatId'], 'Telegram');
  // GIFs and MP4 boomerangs loop silently as Telegram "animations"; WebM goes as a video.
  const [method, field] = /\.(gif|mp4)$/i.test(file) ? ['sendAnimation', 'animation'] : /\.webm$/i.test(file) ? ['sendVideo', 'video'] : ['sendPhoto', 'photo'];
  const form = new FormData();
  form.append('chat_id', cfg.chatId);
  form.append('caption', vars.caption.slice(0, 1024));
  form.append(field, fileBlob(file), fileName(file));
  const body = await json(
    await fetch(`https://api.telegram.org/bot${cfg.botToken}/${method}`, { method: 'POST', body: form, signal: AbortSignal.timeout(120000) }),
    'Telegram'
  );
  return { messageId: body.result && body.result.message_id };
}

async function test(cfg) {
  need(cfg, ['botToken', 'chatId'], 'Telegram');
  const body = await json(await fetch(`https://api.telegram.org/bot${cfg.botToken}/getMe`), 'Telegram');
  return { ok: true, message: `Bot @${body.result.username} ready` };
}

module.exports = { send, test };
