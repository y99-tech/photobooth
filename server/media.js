// Recognises uploaded media by its bytes (never trusts the Content-Type) and, when ffmpeg is
// installed, turns WebM / non-H.264 recordings into MP4 that plays on every phone and social app.
const { execFile } = require('child_process');
const fs = require('fs');
const config = require('./config');

const TYPES = {
  jpg: { ext: 'jpg', mime: 'image/jpeg', kind: 'photo' },
  gif: { ext: 'gif', mime: 'image/gif', kind: 'gif' },
  mp4: { ext: 'mp4', mime: 'video/mp4', kind: 'video' },
  webm: { ext: 'webm', mime: 'video/webm', kind: 'video' }
};

function detect(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return TYPES.jpg;
  if (buf.toString('ascii', 0, 4) === 'GIF8') return TYPES.gif;
  if (buf.toString('ascii', 4, 8) === 'ftyp') return TYPES.mp4; // MP4 and iPhone MOV
  if (buf.readUInt32BE(0) === 0x1a45dfa3) return TYPES.webm;
  return null;
}

function byExt(file) {
  const ext = String(file).split('.').pop().toLowerCase();
  return TYPES[ext === 'jpeg' ? 'jpg' : ext] || TYPES.jpg;
}

// H.264 MP4s already play everywhere; anything else is worth converting.
function needsConversion(type, buf) {
  if (type.ext === 'webm') return true;
  // (iPhone HEVC videos become H.264 too, so every phone can play them.)
  return type.ext === 'mp4' && !buf.includes('avc1');
}

let ffmpegOk = null;
function hasFfmpeg() {
  if (ffmpegOk !== null) return Promise.resolve(ffmpegOk);
  return new Promise((resolve) => {
    execFile(config.get().video.ffmpeg || 'ffmpeg', ['-version'], { timeout: 5000 }, (err) => {
      ffmpegOk = !err;
      resolve(ffmpegOk);
    });
  });
}

function toMp4(src, dest) {
  return new Promise((resolve, reject) => {
    execFile(
      config.get().video.ffmpeg || 'ffmpeg',
      // Audio is kept (video guestbook messages); silent clips simply have none.
      ['-y', '-loglevel', 'error', '-i', src, '-c:a', 'aac', '-b:a', '128k', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21',
        '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-movflags', '+faststart', dest],
      { timeout: 120000 },
      (err, _out, stderr) => (err ? reject(new Error((stderr || err.message).trim())) : resolve(dest))
    );
  });
}

// Returns the final file name (converted or original).
async function normalize(dir, name, type, buf) {
  const c = config.get().video;
  if (!c.convertToMp4 || !needsConversion(type, buf) || !(await hasFfmpeg())) return { name, type };
  const src = `${dir}/${name}`;
  const outName = name.replace(/\.\w+$/, '') + (type.ext === 'mp4' ? '-h264.mp4' : '.mp4');
  try {
    await toMp4(src, `${dir}/${outName}`);
    fs.rmSync(src, { force: true });
    return { name: outName, type: TYPES.mp4 };
  } catch (e) {
    console.warn(`[video] mp4 conversion failed, keeping ${type.ext}: ${e.message}`);
    fs.rmSync(`${dir}/${outName}`, { force: true });
    return { name, type };
  }
}

module.exports = { detect, byExt, normalize, hasFfmpeg, TYPES };
