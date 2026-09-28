// Composes the final photo in the browser: layout (single / 4-shot strip) + frame template
// + greeting text + optional custom PNG overlay. Pure canvas, no libraries.
(function (global) {
  const SERIF = "'Playfair Display', Georgia, 'Times New Roman', serif";
  const SCRIPT = "'Great Vibes', 'Brush Script MT', 'Segoe Script', 'URW Chancery L', cursive";

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image failed to load: ' + src));
      img.src = src;
    });
  }

  function dims(img) {
    return { w: img.videoWidth || img.naturalWidth || img.width, h: img.videoHeight || img.naturalHeight || img.height };
  }

  // Draw img covering the box (center crop).
  function cover(ctx, img, x, y, w, h) {
    const d = dims(img);
    const s = Math.max(w / d.w, h / d.h);
    const sw = w / s, sh = h / s;
    ctx.drawImage(img, (d.w - sw) / 2, (d.h - sh) / 2, sw, sh, x, y, w, h);
  }

  function wrap(ctx, text, maxW) {
    const lines = [];
    for (const para of String(text || '').split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; }
        else line = test;
      }
      lines.push(line);
    }
    return lines.filter((l, i, a) => l || (i > 0 && i < a.length - 1));
  }

  // Fit text into a box by shrinking the font; returns the lines drawn.
  function textBox(ctx, text, { x, y, w, h, font, size, color, align = 'center', lineH = 1.25, shadow }) {
    if (!text) return;
    let s = size;
    let lines;
    for (; s > 8; s *= 0.92) {
      ctx.font = font.replace('{s}', Math.round(s));
      lines = wrap(ctx, text, w);
      if (lines.length * s * lineH <= h) break;
    }
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    if (shadow) { ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = s * 0.35; }
    const total = lines.length * s * lineH;
    const ax = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x;
    lines.forEach((l, i) => ctx.fillText(l, ax, y + (h - total) / 2 + s * lineH * (i + 0.5)));
    ctx.shadowBlur = 0;
  }

  // Build the photo area (single image or 2x2 strip) onto its own canvas.
  function layoutPhotos(images, longEdge) {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    if (images.length === 1) {
      const d = dims(images[0]);
      const s = Math.min(1, longEdge / Math.max(d.w, d.h));
      c.width = Math.round(d.w * s);
      c.height = Math.round(d.h * s);
      ctx.drawImage(images[0], 0, 0, c.width, c.height);
      return c;
    }
    const d = dims(images[0]);
    const ratio = d.w / d.h;
    c.width = longEdge;
    c.height = Math.round(longEdge / ratio);
    const gap = Math.round(longEdge * 0.012);
    const cw = (c.width - gap) / 2, ch = (c.height - gap) / 2;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    images.slice(0, 4).forEach((img, i) => {
      cover(ctx, img, (i % 2) * (cw + gap), Math.floor(i / 2) * (ch + gap), cw, ch);
    });
    return c;
  }

  /**
   * opts: { images, template, greeting, guest, event:{title,subtitle,date,hashtag}, accent, longEdge, overlay }
   */
  function compose(opts) {
    const { template = 'elegant', greeting = '', guest = '', event = {}, accent = '#c9a36b', longEdge = 2400 } = opts;
    const photo = layoutPhotos(opts.images, longEdge);
    const W0 = photo.width, H0 = photo.height;
    const U = Math.max(W0, H0) / 100; // 1% of long edge
    const out = document.createElement('canvas');
    const ctx = out.getContext('2d');
    const sign = guest ? `— ${guest}` : '';
    const title = [event.title, event.date].filter(Boolean).join('  ·  ');

    if (template === 'polaroid') {
      const pad = U * 3.2, bottom = U * 17;
      out.width = W0 + pad * 2;
      out.height = H0 + pad + bottom;
      ctx.fillStyle = '#fbf8f3';
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(photo, pad, pad);
      const by = H0 + pad;
      textBox(ctx, greeting || event.subtitle, { x: pad * 2, y: by + U, w: out.width - pad * 4, h: bottom * 0.52, font: `{s}px ${SCRIPT}`, size: U * 5.2, color: '#2b2622' });
      textBox(ctx, [sign, title].filter(Boolean).join('   ·   '), { x: pad * 2, y: by + bottom * 0.58, w: out.width - pad * 4, h: bottom * 0.28, font: `italic {s}px ${SERIF}`, size: U * 2.3, color: accent });
    } else if (template === 'elegant') {
      out.width = W0;
      out.height = H0;
      ctx.drawImage(photo, 0, 0);
      const bandH = H0 * (greeting ? 0.3 : 0.18);
      const g = ctx.createLinearGradient(0, H0 - bandH * 1.3, 0, H0);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.45, 'rgba(0,0,0,.55)');
      g.addColorStop(1, 'rgba(0,0,0,.85)');
      ctx.fillStyle = g;
      ctx.fillRect(0, H0 - bandH * 1.3, W0, bandH * 1.3);
      const m = U * 4;
      let y = H0 - bandH;
      if (greeting) {
        textBox(ctx, greeting, { x: m, y, w: W0 - m * 2, h: bandH * 0.52, font: `{s}px ${SCRIPT}`, size: U * 5, color: '#fff', shadow: true });
        y += bandH * 0.52;
      }
      textBox(ctx, sign, { x: m, y, w: W0 - m * 2, h: bandH * 0.18, font: `italic {s}px ${SERIF}`, size: U * 2.2, color: '#eee', shadow: true });
      ctx.strokeStyle = accent; ctx.lineWidth = U * 0.15;
      const ly = H0 - bandH * 0.24;
      ctx.beginPath(); ctx.moveTo(W0 * 0.38, ly); ctx.lineTo(W0 * 0.62, ly); ctx.stroke();
      textBox(ctx, [event.title, event.subtitle, event.date].filter(Boolean).join('  ·  '), { x: m, y: ly + U, w: W0 - m * 2, h: bandH * 0.18, font: `{s}px ${SERIF}`, size: U * 2, color: accent });
    } else if (template === 'minimal') {
      out.width = W0;
      out.height = H0;
      ctx.drawImage(photo, 0, 0);
      const m = U * 2.5;
      const txt = [greeting, sign, event.hashtag || event.title].filter(Boolean).join('\n');
      textBox(ctx, txt, { x: W0 * 0.4, y: H0 - U * 22 - m, w: W0 * 0.6 - m, h: U * 22, font: `600 {s}px system-ui, sans-serif`, size: U * 2.3, color: '#fff', align: 'right', shadow: true });
    } else {
      out.width = W0;
      out.height = H0;
      ctx.drawImage(photo, 0, 0);
    }

    // Designer overlay (transparent PNG frame made for the event) on top of everything.
    if (opts.overlay) ctx.drawImage(opts.overlay, 0, 0, out.width, out.height);
    return out;
  }

  function toJpeg(canvas, quality = 0.9) {
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  }

  global.Compose = { compose, loadImage, toJpeg };
})(window);
