// End-of-night keepsake for the couple: one ZIP with every photo, strip, GIF, boomerang, guest
// upload and video message, an offline guestbook album (open in any browser / print to PDF) and
// an optional highlight slideshow video (made with ffmpeg).
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const yazl = require('yazl');
const config = require('./config');
const store = require('./store');
const media = require('./media');

const OUT = path.join(store.DIRS.data, 'keepsake');
fs.mkdirSync(OUT, { recursive: true });
const jobs = {}; // eventId -> { status, error, file, at }

function folder(p) {
  if (p.mode === 'message') return 'video-messages';
  if (p.source === 'guest') return 'guest-uploads';
  if (p.mode === 'strip') return 'strips';
  if (p.kind === 'gif') return 'gifs';
  if (p.kind === 'video') return 'boomerangs';
  return 'photos';
}

function eventPhotos(eventId) {
  return store
    .all()
    .filter((p) => (p.event || eventId) === eventId && !p.pending && !p.hidden)
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt);
}

const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function albumHtml(ev, items) {
  const rtl = /[֐-ࣿ]/.test(ev.title + items.map((i) => i.p.greeting).join('')) ? ' dir="auto"' : '';
  const card = ({ p, rel }) => {
    const m = p.kind === 'video'
      ? `<video src="${esc(rel)}" controls playsinline ${p.mode === 'message' ? '' : 'muted loop autoplay'}></video>`
      : `<img src="${esc(rel)}" loading="lazy" alt="">`;
    const words = p.greeting ? `<p class="g"${rtl}>“${esc(p.greeting)}”</p>` : '';
    const who = p.guest ? `<p class="n"${rtl}>— ${esc(p.guest)}</p>` : '';
    return `<figure>${m}${words}${who}<figcaption>${new Date(p.createdAt).toLocaleString()}</figcaption></figure>`;
  };
  const messages = items.filter((i) => i.p.mode === 'message');
  const rest = items.filter((i) => i.p.mode !== 'message');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(ev.title)} — Guestbook</title>
<style>
body{margin:0;background:#faf7f2;color:#2b2622;font-family:Georgia,'Times New Roman',serif}
header{text-align:center;padding:48px 16px 24px}h1{font-size:44px;margin:0;font-weight:400}h2{font-weight:400;color:#a07c4a;margin:.3em 0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:24px;padding:16px 24px 48px;max-width:1300px;margin:0 auto}
figure{margin:0;background:#fff;padding:14px;border-radius:6px;box-shadow:0 4px 18px rgba(0,0,0,.08);break-inside:avoid;page-break-inside:avoid}
figure img,figure video{width:100%;display:block;border-radius:3px}.g{font-style:italic;font-size:19px;margin:.8em 0 .2em}.n{color:#a07c4a;margin:0}
figcaption{color:#999;font-size:12px;margin-top:.6em}section>h3{text-align:center;font-weight:400;font-size:28px;margin-top:40px}
@media print{body{background:#fff}.grid{grid-template-columns:repeat(2,1fr)}video{display:none}}
</style></head><body>
<header><h1>${esc(ev.title)}</h1><h2>${esc([ev.subtitle, ev.date].filter(Boolean).join(' · '))}</h2><p>${items.length} memories · Guestbook album</p></header>
${messages.length ? `<section><h3>🎥 Video messages</h3><div class="grid">${messages.map(card).join('')}</div></section>` : ''}
<section><h3>📸 Photos</h3><div class="grid">${rest.map(card).join('')}</div></section>
</body></html>`;
}

// Streams the ZIP straight to the browser (works for thousands of files, little memory).
function zip(res, eventId) {
  const ev = config.get().event;
  const z = new yazl.ZipFile();
  const items = [];
  for (const p of eventPhotos(eventId)) {
    const src = store.filePath(p);
    if (!fs.existsSync(src)) continue;
    const rel = `${folder(p)}/${p.file}`;
    z.addFile(src, rel, { compress: false });
    items.push({ p, rel });
  }
  z.addBuffer(Buffer.from(albumHtml(ev, items)), 'Guestbook-album.html');
  const hl = jobs[eventId] && jobs[eventId].status === 'done' && jobs[eventId].file;
  if (hl && fs.existsSync(hl)) z.addFile(hl, 'Highlight-video.mp4', { compress: false });
  z.addBuffer(
    Buffer.from(
      `${ev.title}\r\n\r\nOpen "Guestbook-album.html" in any browser to see every photo with its greeting.\r\n` +
        `Print it (Ctrl+P -> Save as PDF) for a printable guestbook.\r\n\r\nFolders: photos, strips, gifs, boomerangs, guest-uploads, video-messages.\r\n`
    ),
    'READ-ME.txt'
  );
  z.end();
  const name = `${ev.title || 'photobooth'}-keepsake.zip`.replace(/[^\w؀-ۿ .&-]+/g, '');
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
  z.outputStream.pipe(res);
}

// Highlight slideshow (photos + strips, 2.5 s each, music if uploaded).
async function highlight(eventId) {
  if (jobs[eventId] && jobs[eventId].status === 'running') return jobs[eventId];
  if (!(await media.hasFfmpeg())) throw new Error('Install ffmpeg to make the highlight video (winget install ffmpeg / sudo apt install ffmpeg)');
  const photos = eventPhotos(eventId).filter((p) => (p.kind || 'photo') === 'photo' && !p.hidden);
  if (!photos.length) throw new Error('No photos yet');
  // Keep it watchable: at most 150 slides, evenly picked across the night.
  const step = Math.max(1, photos.length / 150);
  const pick = [];
  for (let i = 0; i < photos.length && pick.length < 150; i += step) pick.push(photos[Math.floor(i)]);
  const list = path.join(OUT, `${eventId}-list.txt`);
  const lines = pick.flatMap((p) => [`file '${store.filePath(p).replace(/'/g, "'\\''")}'`, 'duration 2.5']);
  lines.push(`file '${store.filePath(pick[pick.length - 1]).replace(/'/g, "'\\''")}'`);
  fs.writeFileSync(list, lines.join('\n'));
  const out = path.join(OUT, `${eventId}-highlight.mp4`);
  const music = ['music.mp3', 'music.m4a'].map((f) => path.join(store.DIRS.data, f)).find((f) => fs.existsSync(f));
  const args = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list];
  if (music) args.push('-stream_loop', '-1', '-i', music);
  args.push(
    '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0f0d0b,fps=25,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-movflags', '+faststart'
  );
  if (music) args.push('-c:a', 'aac', '-b:a', '160k', '-shortest');
  args.push(out);
  const job = (jobs[eventId] = { status: 'running', error: null, file: out, at: Date.now(), slides: pick.length });
  execFile(config.get().video.ffmpeg || 'ffmpeg', args, { timeout: 30 * 60e3 }, (err, _o, stderr) => {
    job.status = err ? 'failed' : 'done';
    job.error = err ? (stderr || err.message).trim().slice(0, 300) : null;
    fs.rmSync(list, { force: true });
  });
  return job;
}

function highlightStatus(eventId) {
  const j = jobs[eventId];
  if (j) return { status: j.status, error: j.error, slides: j.slides, url: j.status === 'done' ? `/api/admin/highlight.mp4` : null };
  const f = path.join(OUT, `${eventId}-highlight.mp4`);
  if (fs.existsSync(f)) {
    jobs[eventId] = { status: 'done', file: f };
    return { status: 'done', url: '/api/admin/highlight.mp4' };
  }
  return { status: 'none' };
}

module.exports = { zip, highlight, highlightStatus, eventPhotos, folder, jobs };
