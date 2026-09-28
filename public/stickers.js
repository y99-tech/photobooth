// Digital props & stickers: tap to add, drag to move, pinch (or buttons) to resize/rotate,
// then they are baked into the final photo / every GIF & boomerang frame.
(function (global) {
  const SVG = {
    heart: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 90"><path d="M50 88C20 64 2 46 2 26 2 12 13 2 27 2c10 0 18 5 23 13C55 7 63 2 73 2c14 0 25 10 25 24 0 20-18 38-48 62z" fill="#e23b5a" stroke="#fff" stroke-width="4"/><ellipse cx="28" cy="24" rx="9" ry="6" fill="#fff" opacity=".45" transform="rotate(-30 28 24)"/></svg>`,
    crown: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><path d="M8 70 4 18l28 22L60 4l28 36 28-22-4 52z" fill="#f2c14e" stroke="#b8862b" stroke-width="4" stroke-linejoin="round"/><rect x="8" y="64" width="104" height="12" rx="3" fill="#e0a92f" stroke="#b8862b" stroke-width="3"/><circle cx="60" cy="40" r="7" fill="#e23b5a"/><circle cx="32" cy="48" r="5" fill="#3b82f6"/><circle cx="88" cy="48" r="5" fill="#22c55e"/><circle cx="4" cy="18" r="5" fill="#f2c14e"/><circle cx="60" cy="4" r="5" fill="#f2c14e"/><circle cx="116" cy="18" r="5" fill="#f2c14e"/></svg>`,
    glasses: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 60"><path d="M4 14h152v8H4z" fill="#111"/><path d="M10 16h58c0 22-6 38-30 38S10 40 10 16zM92 16h58c0 22-6 38-28 38s-30-16-30-38z" fill="#111"/><path d="M20 22h20c-2 8-8 12-16 12M102 22h20c-2 8-8 12-16 12" stroke="#666" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`,
    mustache: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 60"><path d="M80 18c10-14 30-16 44-6 10 8 14 22 30 20-8 20-40 26-60 14-8-5-12-10-14-14-2 4-6 9-14 14-20 12-52 6-60-14 16 2 20-12 30-20 14-10 34-8 44 6z" fill="#2b1d14"/></svg>`,
    bowtie: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 70"><path d="M70 35 8 6v58zM70 35l62-29v58z" fill="#e23b5a" stroke="#9f1d37" stroke-width="4" stroke-linejoin="round"/><rect x="58" y="22" width="24" height="26" rx="6" fill="#c02a47" stroke="#9f1d37" stroke-width="4"/></svg>`,
    partyhat: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 120"><path d="M45 8 82 110H8z" fill="#8b5cf6" stroke="#5b21b6" stroke-width="4" stroke-linejoin="round"/><path d="M30 50l20 8M22 74l36 12M16 96l52 12" stroke="#fde047" stroke-width="8" stroke-linecap="round"/><circle cx="45" cy="10" r="10" fill="#f472b6"/></svg>`,
    married: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 110"><path d="M110 4v26" stroke="#8a6a3d" stroke-width="6"/><rect x="6" y="28" width="208" height="76" rx="14" fill="#fbf8f3" stroke="#c9a36b" stroke-width="6"/><text x="110" y="64" font-family="Great Vibes, cursive" font-size="40" text-anchor="middle" fill="#2b2622">Just Married</text><text x="110" y="92" font-family="Georgia, serif" font-size="18" text-anchor="middle" fill="#c9a36b">♥ ♥ ♥</text></svg>`,
    lips: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 70"><path d="M4 30C24 8 44 2 58 12c6 4 10 4 12 4s6 0 12-4c14-10 34-4 54 18-22 26-44 38-66 38S26 56 4 30z" fill="#d61f45"/><path d="M8 31c30 6 50 8 62 4 12 4 32 2 62-4" stroke="#8a0f28" stroke-width="4" fill="none"/></svg>`,
    ring: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120"><circle cx="50" cy="78" r="34" fill="none" stroke="#e2b857" stroke-width="10"/><path d="M34 34 50 8l16 26-16 12z" fill="#bfe9ff" stroke="#6fb7d9" stroke-width="3" stroke-linejoin="round"/><path d="M34 34h32" stroke="#6fb7d9" stroke-width="3"/></svg>`,
    love: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 110"><path d="M20 8h120c8 0 14 6 14 14v50c0 8-6 14-14 14H62L34 106l6-20H20c-8 0-14-6-14-14V22c0-8 6-14 14-14z" fill="#fff" stroke="#e23b5a" stroke-width="5"/><text x="80" y="60" font-family="Great Vibes, cursive" font-size="40" text-anchor="middle" fill="#e23b5a">Love!</text></svg>`,
    sparkle: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 2c4 30 18 44 48 48-30 4-44 18-48 48-4-30-18-44-48-48 30-4 44-18 48-48z" fill="#fde047" stroke="#eab308" stroke-width="3"/><path d="M82 6c1 8 4 11 12 12-8 1-11 4-12 12-1-8-4-11-12-12 8-1 11-4 12-12z" fill="#fff59d"/></svg>`,
    flower: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="#f9a8d4" stroke="#db2777" stroke-width="2">${[0, 72, 144, 216, 288].map((r) => `<ellipse cx="50" cy="26" rx="16" ry="24" transform="rotate(${r} 50 50)"/>`).join('')}</g><circle cx="50" cy="50" r="13" fill="#fde047" stroke="#eab308" stroke-width="3"/></svg>`
  };
  const LIST = Object.keys(SVG);
  const images = {};

  function img(id) {
    if (!images[id]) {
      const i = new Image();
      i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(SVG[id]);
      images[id] = i;
    }
    return images[id];
  }
  const ready = () => Promise.all(LIST.map((id) => (img(id).complete ? 1 : new Promise((r) => { img(id).onload = img(id).onerror = r; }))));

  // placed: { id, x, y (center, 0..1 of target), w (width fraction), rot (rad) }
  let placed = [];
  let selected = -1;
  let layer = null, target = null, onChange = () => {};

  function attach(layerEl, targetEl, changed) {
    layer = layerEl;
    target = targetEl;
    onChange = changed || onChange;
    sync();
  }

  function sync() {
    if (!layer) return;
    if (!target || !target.isConnected) { layer.innerHTML = ''; return; }
    const r = target.getBoundingClientRect();
    const pr = layer.offsetParent ? layer.offsetParent.getBoundingClientRect() : { left: 0, top: 0 };
    Object.assign(layer.style, { left: r.left - pr.left + 'px', top: r.top - pr.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    layer.innerHTML = '';
    placed.forEach((p, i) => {
      const el = img(p.id).cloneNode();
      el.className = 'sticker' + (i === selected ? ' sel' : '');
      const w = p.w * r.width;
      const ar = (img(p.id).naturalHeight || 1) / (img(p.id).naturalWidth || 1);
      Object.assign(el.style, {
        width: w + 'px',
        left: p.x * r.width - w / 2 + 'px',
        top: p.y * r.height - (w * ar) / 2 + 'px',
        transform: `rotate(${p.rot}rad)`
      });
      el.draggable = false;
      el.dataset.i = i;
      layer.appendChild(el);
    });
  }

  function add(id) {
    placed.push({ id, x: 0.3 + Math.random() * 0.4, y: 0.25 + Math.random() * 0.3, w: 0.22, rot: 0 });
    selected = placed.length - 1;
    sync();
    onChange();
  }

  function adjust(kind) {
    const p = placed[selected];
    if (!p) return;
    if (kind === 'bigger') p.w = Math.min(0.9, p.w * 1.2);
    if (kind === 'smaller') p.w = Math.max(0.05, p.w / 1.2);
    if (kind === 'rotate') p.rot += Math.PI / 12;
    if (kind === 'remove') { placed.splice(selected, 1); selected = placed.length - 1; }
    sync();
    onChange();
  }

  function clear() {
    placed = [];
    selected = -1;
    sync();
  }

  // Touch: one finger drags, two fingers pinch-zoom + rotate. Mouse wheel resizes.
  const pointers = new Map();
  let gesture = null;
  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest && e.target.closest('.sticker');
    if (!el || !layer || !layer.contains(el)) return;
    e.preventDefault();
    selected = Number(el.dataset.i);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    startGesture();
    layer.querySelectorAll('.sticker').forEach((s) => s.classList.toggle('sel', Number(s.dataset.i) === selected));
    onChange('select');
  });
  document.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId) || !gesture) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = placed[selected];
    const r = layer.getBoundingClientRect();
    const pts = [...pointers.values()];
    if (pts.length === 1 && gesture.n === 1) {
      p.x = Math.min(1, Math.max(0, gesture.x + (pts[0].x - gesture.p[0].x) / r.width));
      p.y = Math.min(1, Math.max(0, gesture.y + (pts[0].y - gesture.p[0].y) / r.height));
    } else if (pts.length >= 2 && gesture.n >= 2) {
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const ang = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      p.w = Math.min(0.9, Math.max(0.05, gesture.w * (dist / gesture.dist)));
      p.rot = gesture.rot + (ang - gesture.ang);
    }
    sync();
  });
  const end = (e) => {
    if (!pointers.delete(e.pointerId)) return;
    if (pointers.size) startGesture(); else { gesture = null; onChange(); }
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
  document.addEventListener('wheel', (e) => {
    const el = e.target.closest && e.target.closest('.sticker');
    if (!el) return;
    e.preventDefault();
    selected = Number(el.dataset.i);
    adjust(e.deltaY < 0 ? 'bigger' : 'smaller');
  }, { passive: false });

  function startGesture() {
    const p = placed[selected];
    if (!p) return;
    const pts = [...pointers.values()];
    gesture = { n: pts.length, p: pts, x: p.x, y: p.y, w: p.w, rot: p.rot };
    if (pts.length >= 2) {
      gesture.dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
      gesture.ang = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
    }
  }

  // Bake the stickers into a canvas (same relative positions as on screen).
  function bake(canvas) {
    if (!placed.length) return canvas;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    for (const p of placed) {
      const i = img(p.id);
      const w = p.w * W, h = (w * (i.naturalHeight || 1)) / (i.naturalWidth || 1);
      ctx.save();
      ctx.translate(p.x * W, p.y * H);
      ctx.rotate(p.rot);
      ctx.drawImage(i, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
    return canvas;
  }

  global.Stickers = { LIST, img, ready, attach, sync, add, adjust, clear, bake, count: () => placed.length, hasSelection: () => selected >= 0 && !!placed[selected] };
})(window);
