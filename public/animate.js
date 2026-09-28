// Boomerang & GIF support: burst capture, looping preview, GIF encoding (gifenc) and
// video recording (MediaRecorder → MP4 when the browser can, otherwise WebM).
(function (global) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function srcSize(el) {
    return { w: el.videoWidth || el.naturalWidth || el.width, h: el.videoHeight || el.naturalHeight || el.height };
  }

  // Copy the current frame of a <video>/<img>/<canvas>, scaled to maxWidth.
  function grab(el, maxWidth, mirror) {
    const d = srcSize(el);
    if (!d.w || !d.h) return null;
    const s = Math.min(1, maxWidth / d.w);
    const c = document.createElement('canvas');
    c.width = Math.round(d.w * s);
    c.height = Math.round(d.h * s);
    const ctx = c.getContext('2d');
    if (mirror) { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(el, 0, 0, c.width, c.height);
    return c;
  }

  // Burst of frames from a live source (webcam <video> or DSLR live-view <img>).
  async function burst(el, { seconds, fps, maxWidth, mirror, onProgress }) {
    const frames = [];
    const total = Math.max(2, Math.round(seconds * fps));
    const step = 1000 / fps;
    const t0 = performance.now();
    for (let i = 0; i < total; i++) {
      const f = grab(el, maxWidth, mirror);
      if (f) frames.push(f);
      if (onProgress) onProgress((i + 1) / total);
      const wait = t0 + (i + 1) * step - performance.now();
      if (wait > 0) await sleep(wait);
    }
    return frames;
  }

  // Frame order: GIF plays forward; boomerang plays forward then backward.
  function sequence(n, kind) {
    const fwd = Array.from({ length: n }, (_, i) => i);
    if (kind !== 'boomerang' || n < 3) return fwd;
    return fwd.concat(fwd.slice(1, -1).reverse());
  }

  // Loops frames on a visible canvas for the review screen.
  function player(canvas, frames, seq, frameMs) {
    let i = 0, timer = null;
    const ctx = canvas.getContext('2d');
    canvas.width = frames[0].width;
    canvas.height = frames[0].height;
    function tick() {
      ctx.drawImage(frames[seq[i % seq.length]], 0, 0);
      i++;
      timer = setTimeout(tick, frameMs);
    }
    tick();
    return { stop: () => clearTimeout(timer) };
  }

  let gifenc;
  async function encodeGif(frames, seq, frameMs) {
    gifenc = gifenc || (await import('/vendor/gifenc.esm.js'));
    const { GIFEncoder, quantize, applyPalette } = gifenc;
    const w = frames[0].width, h = frames[0].height;
    const gif = GIFEncoder();
    // Quantize each distinct frame once, then reuse it for repeated (boomerang) frames.
    const cache = new Map();
    for (let k = 0; k < seq.length; k++) {
      const idx = seq[k];
      if (!cache.has(idx)) {
        const data = frames[idx].getContext('2d').getImageData(0, 0, w, h).data;
        const palette = quantize(data, 256, { format: 'rgb444' });
        cache.set(idx, { index: applyPalette(data, palette, 'rgb444'), palette });
        await sleep(0); // keep the UI responsive
      }
      const { index, palette } = cache.get(idx);
      gif.writeFrame(index, w, h, { palette, delay: frameMs, repeat: 0 });
    }
    gif.finish();
    return new Blob([gif.bytes()], { type: 'image/gif' });
  }

  function videoMime() {
    const prefs = [
      'video/mp4;codecs=avc1.42E01E', // H.264 — plays everywhere (Chrome/Edge with proprietary codecs)
      'video/mp4;codecs=avc1',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm'
    ];
    return prefs.find((t) => global.MediaRecorder && MediaRecorder.isTypeSupported(t)) || null;
  }

  // Records the looping animation in real time into a video file.
  async function encodeVideo(frames, seq, frameMs, loops) {
    const mime = videoMime();
    if (!mime) throw new Error('This browser cannot record video');
    const c = document.createElement('canvas');
    // Even dimensions are required by most H.264 encoders.
    c.width = frames[0].width & ~1;
    c.height = frames[0].height & ~1;
    c.style.cssText = 'position:fixed;left:-99999px;top:0';
    document.body.appendChild(c);
    const ctx = c.getContext('2d');
    ctx.drawImage(frames[seq[0]], 0, 0);
    const stream = c.captureStream(Math.round(1000 / frameMs));
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6e6 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((r) => (rec.onstop = r));
    rec.start();
    const t0 = performance.now();
    const total = seq.length * loops;
    for (let k = 0; k < total; k++) {
      ctx.drawImage(frames[seq[k % seq.length]], 0, 0);
      const wait = t0 + (k + 1) * frameMs - performance.now();
      if (wait > 0) await sleep(wait);
    }
    rec.stop();
    await done;
    stream.getTracks().forEach((t) => t.stop());
    c.remove();
    return new Blob(chunks, { type: mime.split(';')[0] });
  }

  global.Animate = { grab, burst, sequence, player, encodeGif, encodeVideo, videoMime };
})(window);
