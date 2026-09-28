// Composes the final photo in the browser: layout (single / 4-shot strip) + frame template
// + greeting text + optional custom PNG overlay. Pure canvas, no libraries.
(function (global) {
  const SERIF = "'Playfair Display', Georgia, 'Times New Roman', serif";
  const SCRIPT = "'Great Vibes', 'Brush Script MT', 'Segoe Script', 'URW Chancery L', cursive";
  // Arabic greetings get an Arabic calligraphy font and right-to-left layout.
  const ARABIC_SCRIPT = "'Aref Ruqaa', 'Amiri', 'Noto Naskh Arabic', 'Segoe UI', serif";
  const ARABIC_SERIF = "'Amiri', 'Noto Naskh Arabic', 'Segoe UI', serif";
  const RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

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
    if (RTL.test(text)) {
      font = font.replace(SCRIPT, ARABIC_SCRIPT).replace(SERIF, ARABIC_SERIF);
      ctx.direction = 'rtl';
    } else {
      ctx.direction = 'ltr';
    }
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
    ctx.direction = 'ltr';
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

  // Classic photobooth strip (2x6 inch proportions): photos stacked vertically + footer.
  const STRIP_STYLE = {
    elegant: { bg: '#15110d', title: null, text: '#f3ece2' },
    polaroid: { bg: '#fbf8f3', title: '#2b2622', text: '#2b2622' },
    minimal: { bg: '#ffffff', title: '#111111', text: '#333333' },
    none: { bg: '#ffffff', title: '#111111', text: '#333333' }
  };

  function composeStrip(opts) {
    const { template = 'elegant', greeting = '', guest = '', event = {}, accent = '#c9a36b', longEdge = 2400 } = opts;
    const H = Math.round(longEdge), W = Math.round(H / 3);
    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    const ctx = out.getContext('2d');
    const st = STRIP_STYLE[template] || STRIP_STYLE.elegant;
    ctx.fillStyle = st.bg;
    ctx.fillRect(0, 0, W, H);
    const m = W * 0.06, gap = W * 0.03, footer = H * (template === 'none' ? 0.08 : 0.19);
    const n = Math.min(4, opts.images.length);
    const slotH = (H - m * 2 - footer - gap * (n - 1)) / n;
    opts.images.slice(0, 4).forEach((img, i) => cover(ctx, img, m, m + i * (slotH + gap), W - m * 2, slotH));
    const fy = H - footer - m * 0.5, U = W / 100;
    if (template === 'none') {
      textBox(ctx, event.title, { x: m, y: fy, w: W - m * 2, h: footer, font: `{s}px ${SCRIPT}`, size: U * 11, color: st.title });
    } else {
      textBox(ctx, event.title, { x: m, y: fy, w: W - m * 2, h: footer * 0.36, font: `{s}px ${SCRIPT}`, size: U * 12, color: st.title || accent });
      textBox(ctx, greeting, { x: m, y: fy + footer * 0.36, w: W - m * 2, h: footer * 0.34, font: `italic {s}px ${SERIF}`, size: U * 5.2, color: st.text });
      textBox(ctx, [guest && `— ${guest}`, event.date || event.hashtag].filter(Boolean).join('  ·  '), { x: m, y: fy + footer * 0.72, w: W - m * 2, h: footer * 0.2, font: `{s}px ${SERIF}`, size: U * 4.2, color: accent });
    }
    if (opts.overlay) ctx.drawImage(opts.overlay, 0, 0, W, H);
    drawLogo(ctx, opts.logo, W, H, opts.branding);
    return out;
  }

  // 4x6 inch print sheet holding two identical strips (cut down the middle).
  function stripSheet(strip) {
    const c = document.createElement('canvas');
    c.width = strip.width * 2;
    c.height = strip.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(strip, 0, 0);
    ctx.drawImage(strip, strip.width, 0);
    return c;
  }

  // Business / event logo watermark.
  function drawLogo(ctx, logo, W, H, b = {}) {
    if (!logo) return;
    const d = dims(logo);
    // Sized from the width so it stays small on tall strips; never taller than 12% of the image.
    let lw = W * (Number(b.logoSize) || 0.14);
    if ((lw * d.h) / d.w > H * 0.12) lw = (H * 0.12 * d.w) / d.h;
    const lh = (lw * d.h) / d.w;
    const m = Math.min(W, H) * (b.margin ?? 0.03);
    const pos = b.logoPosition || 'bottom-right';
    const x = pos.includes('left') ? m : pos.includes('center') ? (W - lw) / 2 : W - lw - m;
    const y = pos.includes('top') ? m : H - lh - m;
    ctx.save();
    ctx.globalAlpha = b.logoOpacity ?? 0.9;
    ctx.drawImage(logo, x, y, lw, lh);
    ctx.restore();
  }

  // Beauty mode: gentle auto-exposure/colour + skin-only smoothing (keeps eyes, hair, background sharp).
  function beauty(img, opts = {}) {
    const d = dims(img);
    const out = document.createElement('canvas');
    out.width = d.w;
    out.height = d.h;
    const ctx = out.getContext('2d');
    // 1) measure brightness on a small copy
    const sw = 96, sh = Math.max(1, Math.round((96 * d.h) / d.w));
    const small = document.createElement('canvas');
    small.width = sw;
    small.height = sh;
    const sctx = small.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(img, 0, 0, sw, sh);
    const px = sctx.getImageData(0, 0, sw, sh).data;
    let lum = 0;
    for (let i = 0; i < px.length; i += 4) lum += (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
    lum /= px.length / 4;
    const bright = opts.autoEnhance === false ? 1 : Math.min(1.35, Math.max(0.92, 0.5 / Math.max(lum, 0.05)));
    ctx.filter = opts.autoEnhance === false ? 'none' : `brightness(${bright.toFixed(3)}) contrast(1.05) saturate(1.1)`;
    ctx.drawImage(img, 0, 0);
    ctx.filter = 'none';
    const amount = opts.smoothing ?? 0.6;
    if (amount <= 0) return out;
    // 2) skin mask (classic RGB skin rule) at reduced resolution, feathered
    const mw = 320, mh = Math.max(1, Math.round((320 * d.h) / d.w));
    const mask = document.createElement('canvas');
    mask.width = mw;
    mask.height = mh;
    const mctx = mask.getContext('2d', { willReadFrequently: true });
    mctx.drawImage(out, 0, 0, mw, mh);
    const md = mctx.getImageData(0, 0, mw, mh);
    const a = md.data;
    for (let i = 0; i < a.length; i += 4) {
      const r = a[i], g = a[i + 1], b = a[i + 2];
      const skin = r > 95 && g > 40 && b > 20 && r > g && r > b && r - Math.min(g, b) > 15 && Math.abs(r - g) > 15;
      a[i] = a[i + 1] = a[i + 2] = 255;
      a[i + 3] = skin ? 255 : 0;
    }
    mctx.putImageData(md, 0, 0);
    // 3) blurred copy, cut to the (feathered) skin mask, blended over the photo
    const soft = document.createElement('canvas');
    soft.width = d.w;
    soft.height = d.h;
    const s = soft.getContext('2d');
    const r = Math.max(2, Math.round(d.w * 0.004));
    s.filter = `blur(${r}px)`;
    s.drawImage(out, 0, 0);
    s.filter = `blur(${r * 2}px)`;
    s.globalCompositeOperation = 'destination-in';
    s.drawImage(mask, 0, 0, d.w, d.h);
    ctx.globalAlpha = amount;
    ctx.drawImage(soft, 0, 0);
    ctx.globalAlpha = 1;
    return out;
  }

  /**
   * opts: { images, template, greeting, guest, event:{title,subtitle,date,hashtag}, accent, longEdge, overlay }
   */
  function compose(opts) {
    if (opts.layout === 'strip' && opts.images.length > 1) return composeStrip(opts);
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
    drawLogo(ctx, opts.logo, out.width, out.height, opts.branding);
    return out;
  }

  function toJpeg(canvas, quality = 0.9) {
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  }

  global.Compose = { compose, loadImage, toJpeg, stripSheet, beauty, RTL };
})(window);
