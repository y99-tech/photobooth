// Kiosk controller: attract → live/countdown → review (greeting) → share.
(async function () {
  const $ = (s) => document.querySelector(s);
  const t = (k, v) => I18n.t(k, v);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let cfg, status, overlay = null, logo = null;
  let beautyOn = true;
  let camera = 'webcam'; // resolved: "dslr" | "webcam"
  let stream = null;
  let screen = 'attract';
  let mode, template;
  let shots = []; // { img, raw? }
  let composed = null;
  let current = null; // saved photo summary
  let idleTimer = null;
  let busy = false;
  let copies = 1;
  let anim = null; // { frames: composed canvases, seq, frameMs, player }
  // Green screen
  let backgrounds = []; // { id, name, el }
  let bgId = null;
  let keyRgb = null; // sampled screen colour when keyColor is "auto"
  let liveKey = null;

  const MODES = {
    single: () => t('single'),
    strip: () => t('strip'),
    gif: () => t('gif'),
    boomerang: () => t('boomerang'),
    message: () => t('message')
  };
  const isAnim = (m = mode) => m === 'gif' || m === 'boomerang';
  let message = null; // video guestbook recording { blob, url, thumb }

  const TEMPLATES = [
    ['elegant', () => t('elegant')],
    ['polaroid', () => t('polaroid')],
    ['minimal', () => t('minimal')],
    ['none', () => t('none')]
  ];
  const SOCIAL = { facebook: 'Facebook', instagram: 'Instagram', telegram: 'Telegram' };

  async function api(url, opts = {}) {
    const r = await fetch(url, opts);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }

  function toast(msg, ms = 2600) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.add('hidden'), ms);
  }

  // ---------------- setup ----------------
  async function init() {
    cfg = await api('/api/config');
    status = await api('/api/status');
    document.documentElement.style.setProperty('--accent', cfg.booth.accent);
    document.title = cfg.event.title + ' · Photobooth';
    $('#evTitle').textContent = cfg.event.title;
    $('#evSub').textContent = [cfg.event.subtitle, cfg.event.date].filter(Boolean).join(' · ');
    const modes = (cfg.booth.modes || Object.keys(MODES)).filter((m) => MODES[m]);
    cfg.booth.modes = modes.length ? modes : ['single'];
    const langs = (cfg.booth.languages || []).filter((l) => I18n.LANGS.includes(l));
    if (!langs.includes(cfg.booth.language || 'en')) langs.unshift(cfg.booth.language || 'en');
    cfg.booth.languages = langs;
    setLang(langs.includes(I18n.get()) && langInit ? I18n.get() : cfg.booth.language || 'en', true);
    langInit = true;
    mode = cfg.booth.modes.includes(mode) ? mode : cfg.booth.modes.includes(cfg.booth.mode) ? cfg.booth.mode : cfg.booth.modes[0];
    template = template || cfg.booth.template;

    const want = cfg.booth.camera;
    camera = want === 'auto' ? (status.camera.available ? 'dslr' : 'webcam') : want;
    $('#camLabel').textContent = camera === 'dslr' ? `📷 ${status.camera.model || 'DSLR'}` : '🎥 Webcam';

    overlay = null;
    if (status.overlay) {
      try { overlay = await Compose.loadImage('/overlay.png?' + Date.now()); } catch {}
    }
    logo = null;
    if (status.assets && status.assets.logo) {
      try { logo = await Compose.loadImage('/asset/logo?' + Date.now()); } catch {}
    }
    beautyOn = cfg.booth.beauty !== false;
    Sound.setup(cfg.sound, document.documentElement.lang || 'en');
    await Stickers.ready();
    renderStickerPicks();
    $('#stickerBox').classList.toggle('hidden', cfg.booth.stickers === false);
    await loadBackgrounds();
    renderModes();
    renderTemplates();
    renderGreetings();
    $('#greetBox').classList.toggle('hidden', !cfg.booth.allowGuestGreeting);
    $('#uploadQr').classList.toggle('hidden', !cfg.guestUploads.enabled);
    $('#consentRow').classList.toggle('hidden', !cfg.leads.enabled);
    $('#consentText').textContent = t('offers', { business: cfg.leads.business || '' });
    $('#uploadHint').classList.toggle('hidden', !cfg.guestUploads.enabled);
    $('#printBox').classList.toggle('hidden', !cfg.print.enabled);
    $('#copiesBox').classList.toggle('hidden', (cfg.print.maxCopies || 1) < 2);
    $('#emailBox').classList.toggle('hidden', !(cfg.booth.allowEmail && cfg.share.email));
    const social = Object.keys(SOCIAL).filter((k) => cfg.share[k]);
    $('#socialBox').classList.toggle('hidden', !social.length);
    $('#socialBtns').innerHTML = '';
    for (const k of social) {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = SOCIAL[k];
      b.onclick = () => shareTo(k, b);
      $('#socialBtns').appendChild(b);
    }
  }

  // ---------------- green screen ----------------
  const gsOn = () => !!(cfg.greenScreen && cfg.greenScreen.enabled);

  async function loadBackgrounds() {
    backgrounds = [];
    if (!gsOn()) { $('#bgBox').classList.add('hidden'); return; }
    for (const b of Chroma.builtinList()) backgrounds.push({ ...b, el: Chroma.builtin(b.id.slice(8)) });
    try {
      const up = await api('/api/backgrounds');
      const loaded = await Promise.all(up.map((b) => Compose.loadImage(b.url).then((el) => ({ ...b, el })).catch(() => null)));
      // Uploaded backgrounds first: they are the ones made for this event.
      backgrounds = loaded.filter(Boolean).concat(backgrounds);
    } catch {}
    resetBackground();
    $('#bgBox').classList.toggle('hidden', !cfg.greenScreen.allowGuestChoice || backgrounds.length < 2);
    renderBackgrounds();
  }

  function resetBackground() {
    const want = cfg.greenScreen.defaultBackground;
    bgId = (backgrounds.find((b) => b.id === want) || backgrounds[0] || {}).id || null;
  }

  function currentBg() {
    const b = backgrounds.find((x) => x.id === bgId) || backgrounds[0];
    return b && b.el;
  }

  function renderBackgrounds() {
    const box = $('#bgChips');
    box.innerHTML = '';
    for (const b of backgrounds) {
      const btn = document.createElement('button');
      btn.className = b.id === bgId ? 'sel' : '';
      btn.title = b.name;
      const thumb = document.createElement('canvas');
      thumb.width = 150;
      thumb.height = 100;
      const d = { w: b.el.naturalWidth || b.el.width, h: b.el.naturalHeight || b.el.height };
      const s = Math.max(150 / d.w, 100 / d.h);
      thumb.getContext('2d').drawImage(b.el, (150 - d.w * s) / 2, (100 - d.h * s) / 2, d.w * s, d.h * s);
      btn.append(thumb, Object.assign(document.createElement('span'), { textContent: b.name }));
      btn.onclick = () => { bgId = b.id; renderBackgrounds(); redraw(); resetIdle(); };
      box.appendChild(btn);
    }
  }

  function gsCfg() {
    return { ...cfg.greenScreen, keyRgb: cfg.greenScreen.keyColor === 'auto' ? keyRgb : null };
  }

  function ensureKey(src) {
    if (cfg.greenScreen.keyColor === 'auto' && !keyRgb) keyRgb = Chroma.sampleKey(src);
  }

  function fit(img, longEdge) {
    const w = img.videoWidth || img.naturalWidth || img.width, h = img.videoHeight || img.naturalHeight || img.height;
    const s = longEdge / Math.max(w, h);
    if (s >= 1) return img;
    const c = document.createElement('canvas');
    c.width = Math.round(w * s);
    c.height = Math.round(h * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  // Per-shot pipeline: background replacement → beauty. Cached, so typing a greeting stays fast.
  function keyed(shot, longEdge) {
    const bgOn = gsOn() && !!currentBg();
    const tag = [bgOn ? bgId : '-', beautyOn, longEdge].join('|');
    if (shot.cache && shot.cache.tag === tag) return shot.cache.canvas;
    let img = fit(shot.img, longEdge);
    if (bgOn && aiBg()) {
      if (shot.mask) img = AI.composite(img, shot.mask, currentBg());
    } else if (bgOn) {
      ensureKey(shot.img);
      img = Chroma.key(img, currentBg(), gsCfg(), longEdge);
    }
    if (beautyOn) img = Compose.beauty(img, { smoothing: cfg.booth.beautySmoothing ?? 0.6 });
    shot.cache = { tag, canvas: img };
    return img;
  }

  // ---------------- stickers ----------------
  function renderStickerPicks() {
    const box = $('#stickerPicks');
    box.innerHTML = '';
    for (const id of Stickers.LIST) {
      const b = document.createElement('button');
      b.appendChild(Stickers.img(id).cloneNode());
      b.onclick = () => { Stickers.add(id); stickerTools(); resetIdle(); };
      box.appendChild(b);
    }
  }

  function stickerTools() {
    $('#stickerTools').classList.toggle('hidden', !Stickers.hasSelection());
  }

  function attachStickers() {
    Stickers.attach($('#stickerLayer'), composed, stickerTools);
  }

  // Background removal by AI (no backdrop needed) instead of chroma key.
  const aiBg = () => cfg.greenScreen.method === 'ai';

  // Person masks for every captured shot / frame (once; switching backgrounds is then instant).
  async function prepareMasks() {
    if (!gsOn() || !aiBg() || !currentBg()) return;
    $('#shotinfo').textContent = '✨ ' + t('removingBg');
    try {
      for (const s of shots) if (!s.mask) s.mask = await AI.personMask(s.img);
    } catch (e) {
      console.warn('AI background removal unavailable', e);
      toast('⚠️ ' + t('aiUnavailable'), 4000);
    }
    $('#shotinfo').textContent = '';
  }

  async function startLiveKey(src, flipX) {
    stopLiveKey();
    if (!gsOn() || !cfg.greenScreen.livePreview || !currentBg()) return;
    const ready = () => (src.videoWidth || src.naturalWidth) > 0;
    for (let i = 0; i < 50 && !ready(); i++) await sleep(100);
    if (!ready()) return;
    if (aiBg()) {
      liveKey = AI.live($('#keyLive'), src, currentBg, { flipX });
    } else if (cfg.greenScreen.keyColor === 'auto') {
      // Sample the backdrop from an un-mirrored copy of the first frame.
      keyRgb = Chroma.sampleKey(src);
    }
    if (!aiBg()) liveKey = Chroma.live($('#keyLive'), src, currentBg, gsCfg(), { flipX });
    $('#keyLive').classList.remove('hidden');
    $('#video').classList.add('hidden');
    $('#dslrLive').classList.add('hidden');
  }

  function stopLiveKey() {
    if (liveKey) liveKey.stop();
    liveKey = null;
    $('#keyLive').classList.add('hidden');
  }

  // ---------------- languages ----------------
  let langInit = false;
  function setLang(l, quiet) {
    I18n.set(l);
    Sound.setup(cfg.sound, I18n.get());
    const box = $('#langRow');
    box.innerHTML = cfg.booth.languages.length > 1
      ? cfg.booth.languages.map((x) => `<button class="btn ghost${x === I18n.get() ? ' sel' : ''}" data-lang="${x}">${I18n.NAMES[x] || x}</button>`).join('')
      : '';
    if (quiet) return;
    renderModes();
    renderTemplates();
    renderGreetings();
    report();
  }

  // Greetings: the host's own list in the booth's main language, translations for the others.
  function greetingList() {
    const l = I18n.get();
    const own = cfg.event.greetingsByLang && cfg.event.greetingsByLang[l];
    if (own && own.length) return own;
    // The host's list is used unless it is still the untouched English default.
    const custom = JSON.stringify(cfg.event.greetings || []) !== JSON.stringify(I18n.defaultGreetings());
    return l === (cfg.booth.language || 'en') && (custom || l === 'en') ? cfg.event.greetings || [] : t('greetings');
  }

  function renderModes() {
    const row = $('#modeRow');
    row.classList.toggle('hidden', cfg.booth.modes.length < 2);
    row.innerHTML = cfg.booth.modes
      .map((m) => `<button class="btn ghost${m === mode ? ' sel' : ''}" data-mode="${m}">${MODES[m]()}</button>`)
      .join('');
  }

  function setMode(m) {
    if (!cfg.booth.modes.includes(m) || busy) return;
    mode = m;
    renderModes();
    report();
  }

  function renderTemplates() {
    const box = $('#tplChips');
    box.innerHTML = '';
    for (const [k, label] of TEMPLATES) {
      const b = document.createElement('button');
      b.className = 'chip' + (k === template ? ' sel' : '');
      b.textContent = label();
      b.onclick = () => { template = k; renderTemplates(); redraw(); report(); };
      box.appendChild(b);
    }
  }

  function renderGreetings() {
    const box = $('#greetChips');
    box.innerHTML = '';
    for (const g of greetingList()) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = g;
      b.onclick = () => { $('#greeting').value = $('#greeting').value === g ? '' : g; syncGreetChips(); redraw(); };
      box.appendChild(b);
    }
  }

  function syncGreetChips() {
    const v = $('#greeting').value;
    $$('#greetChips .chip').forEach((c) => c.classList.toggle('sel', c.textContent === v));
  }

  // ---------------- screens ----------------
  function show(name) {
    screen = name;
    document.body.dataset.screen = name;
    for (const s of ['attract', 'live', 'review', 'shareScr']) $('#' + s).classList.toggle('hidden', s !== name);
    if (window.OSK) OSK.hide();
    resetIdle();
    report();
  }

  function report() {
    fetch('/api/kiosk/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ screen, mode, template, camera, photoId: current && current.id, busy })
    }).catch(() => {});
  }

  function resetIdle() {
    clearTimeout(idleTimer);
    if (screen === 'review' || screen === 'shareScr') {
      idleTimer = setTimeout(() => {
        // Unsaved review gets saved automatically so no photo is lost.
        if (screen === 'review') accept().then(home);
        else home();
      }, (cfg.booth.idleSeconds || 90) * 1000);
    }
  }

  function stopAnim() {
    if (anim && anim.player) anim.player.stop();
    anim = null;
  }

  function home() {
    stopAnim();
    stopLiveKey();
    keyRgb = null;
    if (gsOn()) { resetBackground(); renderBackgrounds(); }
    if (!keepCamera()) { stopWebcam(); stopDslrLive(); }
    shots = [];
    composed = null;
    current = null;
    Stickers.clear();
    beautyOn = cfg.booth.beauty !== false;
    if (I18n.get() !== (cfg.booth.language || 'en')) setLang(cfg.booth.language || 'en'); // next guest starts in the main language
    Sound.startMusic();
    $('#greeting').value = '';
    $('#guest').value = '';
    $('#email').value = '';
    show('attract');
  }

  // ---------------- camera ----------------
  async function startWebcam() {
    if (stream) return;
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: 'user' },
      audio: false
    });
    const v = $('#video');
    v.srcObject = stream;
    await v.play().catch(() => {});
    if (!v.videoWidth) await new Promise((r) => v.addEventListener('loadedmetadata', r, { once: true }));
  }

  function stopWebcam() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  function startDslrLive() {
    const img = $('#dslrLive');
    if (cfg.dslr.livePreview) img.src = '/api/dslr/preview?' + Date.now();
  }

  function stopDslrLive() {
    $('#dslrLive').removeAttribute('src');
  }

  async function captureOne() {
    if (camera === 'webcam') {
      const v = $('#video');
      const c = document.createElement('canvas');
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      const ctx = c.getContext('2d');
      if (cfg.booth.mirrorPreview) { ctx.translate(c.width, 0); ctx.scale(-1, 1); } // match what guests saw
      ctx.drawImage(v, 0, 0);
      return { img: c };
    }
    const r = await api('/api/dslr/capture', { method: 'POST' });
    return { img: await Compose.loadImage(r.url), raw: r.url };
  }

  // ---------------- shooting ----------------
  async function startSession() {
    if (busy) return;
    busy = true;
    shots = [];
    stopAnim();
    Sound.duck(true);
    show('live');
    const useWebcam = camera === 'webcam';
    $('#video').classList.toggle('hidden', !useWebcam);
    $('#video').classList.toggle('mirror', !!cfg.booth.mirrorPreview);
    $('#dslrLive').classList.toggle('hidden', useWebcam || !cfg.dslr.livePreview);
    $('#noLive').classList.toggle('hidden', useWebcam || cfg.dslr.livePreview);
    try {
      if (mode === 'message') {
        await recordMessage();
        busy = false;
        openReview();
        return;
      }
      if (useWebcam) await startWebcam();
      else startDslrLive();
      await startLiveKey(useWebcam ? $('#video') : $('#dslrLive'), useWebcam && cfg.booth.mirrorPreview);
      if (mode === 'boomerang') await shootBoomerang(useWebcam);
      const total = mode === 'strip' ? 4 : mode === 'gif' ? cfg.animation.gifFrames || 4 : mode === 'boomerang' ? 0 : 1;
      for (let i = 0; i < total; i++) {
        $('#shotinfo').textContent = total > 1 ? t(mode === 'gif' ? 'poseOf' : 'photoOf', { i: i + 1, n: total }) : '';
        const between = mode === 'gif' ? 1 : 3; // GIF frames come quickly, like a flipbook
        await countdown(i === 0 ? cfg.booth.countdown : Math.min(between, cfg.booth.countdown));
        flash();
        shots.push(await captureOne());
        if (!useWebcam && i < total - 1) startDslrLive();
      }
      stopLiveKey();
      if (!keepCamera()) { stopDslrLive(); stopWebcam(); }
      await prepareMasks();
      busy = false;
      openReview();
    } catch (e) {
      busy = false;
      stopLiveKey();
      console.error(e);
      toast('⚠️ ' + (e.message || 'Camera error'), 5000);
      if (camera === 'dslr' && cfg.booth.camera === 'auto') {
        camera = 'webcam'; // fall back so the party goes on
        $('#camLabel').textContent = '🎥 Webcam (DSLR failed)';
      }
      home();
    }
  }

  async function shootBoomerang(useWebcam) {
    const src = useWebcam ? $('#video') : $('#dslrLive');
    if (!useWebcam && !cfg.dslr.livePreview) throw new Error('Boomerang needs DSLR live view (or use the webcam)');
    if (!useWebcam) await waitForFrame(src);
    $('#shotinfo').textContent = t('boomReady');
    await countdown(cfg.booth.countdown);
    $('#shotinfo').textContent = t('boomMove');
    const frames = await Animate.burst(src, {
      seconds: cfg.animation.boomerangSeconds || 1.5,
      fps: cfg.animation.boomerangFps || 15,
      maxWidth: cfg.animation.size || 720,
      mirror: useWebcam && cfg.booth.mirrorPreview
    });
    if (frames.length < 3) throw new Error('No live picture from the camera');
    shots = frames.map((img) => ({ img }));
  }

  async function waitForFrame(img) {
    for (let i = 0; i < 50 && !img.naturalWidth; i++) await sleep(100);
  }

  async function countdown(n) {
    const el = $('#countdown');
    for (let i = n; i > 0; i--) {
      el.textContent = i;
      Sound.tick(i);
      el.classList.remove('tick');
      void el.offsetWidth;
      el.classList.add('tick');
      await sleep(1000);
    }
    el.textContent = '';
    el.classList.remove('tick');
  }

  function flash() {
    Sound.shutter();
    const f = $('#flash');
    f.classList.add('on');
    setTimeout(() => f.classList.remove('on'), 120);
  }

  // ---------------- video guestbook ----------------
  function messageMime() {
    const prefs = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    return prefs.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
  }

  async function recordMessage() {
    message = null;
    const ms = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: { echoCancellation: true, noiseSuppression: true }
    });
    const v = $('#video');
    v.classList.remove('hidden');
    v.classList.toggle('mirror', !!cfg.booth.mirrorPreview);
    $('#dslrLive').classList.add('hidden');
    $('#noLive').classList.add('hidden');
    v.srcObject = ms;
    await v.play().catch(() => {});
    try {
      $('#shotinfo').textContent = t('msgReady');
      await countdown(cfg.guestbook.countdown || 3);
      const mime = messageMime();
      const rec = new MediaRecorder(ms, mime ? { mimeType: mime, videoBitsPerSecond: 4e6 } : undefined);
      const chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const stopped = new Promise((r) => (rec.onstop = r));
      rec.start(1000);
      Sound.beep(1175, 200);
      let thumb = null;
      setTimeout(() => { thumb = Animate.grab(v, 480, false); }, 1200);
      const max = cfg.guestbook.maxSeconds || 20;
      const btn = $('#msgStopBtn');
      btn.textContent = t('msgStop');
      btn.classList.remove('hidden');
      const done = new Promise((r) => (btn.onclick = r));
      for (let s = max; s > 0; s--) {
        $('#shotinfo').textContent = t('msgRec', { s });
        if ((await Promise.race([sleep(1000).then(() => 0), done.then(() => 1)])) === 1) break;
      }
      btn.classList.add('hidden');
      rec.stop();
      await stopped;
      const blob = new Blob(chunks, { type: (mime || 'video/webm').split(';')[0] });
      message = { blob, url: URL.createObjectURL(blob), thumb: thumb || Animate.grab(v, 480, false) };
    } finally {
      ms.getTracks().forEach((tr) => tr.stop());
      v.srcObject = stream || null;
      $('#shotinfo').textContent = '';
    }
  }

  // ---------------- review ----------------
  function openReview() {
    document.body.dataset.shotMode = mode;
    syncGreetChips();
    Stickers.clear();
    $('#beautyBtn').classList.toggle('sel', beautyOn);
    show('review');
    redraw();
  }

  function redraw() {
    if (mode === 'message') return showMessage();
    if (!shots.length) return;
    if (isAnim()) return redrawAnim();
    composed = Compose.compose(composeOpts(shots.map((s) => keyed(s, cfg.booth.maxLongEdge)), cfg.booth.maxLongEdge));
    showReviewCanvas(composed);
  }

  function showReviewCanvas(c) {
    const box = $('#reviewPic');
    box.querySelectorAll('canvas').forEach((x) => x.remove());
    box.prepend(c);
    requestAnimationFrame(attachStickers);
  }

  function composeOpts(images, longEdge) {
    return {
      images,
      template,
      greeting: $('#greeting').value.trim(),
      guest: $('#guest').value.trim(),
      event: cfg.event,
      accent: cfg.booth.accent,
      longEdge,
      overlay,
      logo,
      branding: cfg.branding,
      layout: mode === 'strip' ? cfg.booth.fourShotLayout || 'strip' : undefined
    };
  }

  // Every frame gets the same frame template + greeting, then plays in a loop.
  function redrawAnim() {
    stopAnim();
    const size = cfg.animation.size || 720;
    const frames = shots.map((s) => Compose.compose(composeOpts([keyed(s, size)], size)));
    const seq = Animate.sequence(frames.length, mode);
    const frameMs = mode === 'gif' ? cfg.animation.gifFrameMs || 600 : Math.round(1000 / (cfg.animation.boomerangFps || 15));
    const canvas = document.createElement('canvas');
    anim = { frames, seq, frameMs, player: Animate.player(canvas, frames, seq, frameMs) };
    composed = canvas;
    showReviewCanvas(canvas);
  }

  async function encodeAnim() {
    // Stickers are baked into a copy of every frame.
    const frames = anim.frames.map((f) => {
      if (!Stickers.count()) return f;
      const c = document.createElement('canvas');
      c.width = f.width;
      c.height = f.height;
      c.getContext('2d').drawImage(f, 0, 0);
      return Stickers.bake(c);
    });
    const { seq, frameMs } = anim;
    const asVideo = mode === 'boomerang' && cfg.animation.boomerangFormat !== 'gif' && Animate.videoMime();
    if (asVideo) return Animate.encodeVideo(frames, seq, frameMs, cfg.animation.videoLoops || 2);
    return Animate.encodeGif(frames, seq, frameMs);
  }

  let redrawT;
  function redrawSoon() {
    clearTimeout(redrawT);
    redrawT = setTimeout(redraw, 250);
    resetIdle();
  }

  function showMessage() {
    if (!message) return;
    const box = $('#reviewPic');
    box.querySelectorAll('canvas, video').forEach((x) => x.remove());
    const v = Object.assign(document.createElement('video'), { src: message.url, controls: true, autoplay: true, playsInline: true });
    box.prepend(v);
    composed = v;
  }

  // Small preview for the gallery / mosaic (fast on phones).
  function makeThumb(src) {
    if (!src) return null;
    const w = src.videoWidth || src.width, h = src.videoHeight || src.height;
    const s = Math.min(1, 480 / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * s);
    c.height = Math.round(h * s);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c;
  }

  async function accept() {
    if (screen !== 'review' || !composed || busy) return;
    busy = true;
    const btn = $('#acceptBtn');
    const label = btn.textContent;
    try {
      let blob, final = null, thumbSrc = null;
      if (mode === 'message') {
        if (!message) return;
        btn.disabled = true;
        btn.textContent = t('savingVideo');
        blob = message.blob;
        thumbSrc = message.thumb;
      } else if (isAnim()) {
        thumbSrc = Stickers.bake(copyCanvas(anim.frames[0]));
        btn.disabled = true;
        btn.textContent = t(mode === 'boomerang' ? 'makingBoomerang' : 'makingGif');
        blob = await encodeAnim();
      } else {
        final = Stickers.bake(copyCanvas(composed));
        thumbSrc = final;
        blob = await Compose.toJpeg(final, cfg.booth.jpegQuality);
      }
      // Strips print two-up on a 4x6 sheet; that sheet is uploaded right after the photo.
      const sheet = final && mode === 'strip' && (cfg.booth.fourShotLayout || 'strip') === 'strip' && cfg.print.enabled ? Compose.stripSheet(final) : null;
      const q = new URLSearchParams({
        greeting: $('#greeting').value.trim(),
        guest: $('#guest').value.trim(),
        camera,
        mode,
        print: sheet ? '0' : '1',
        raw: shots.map((s) => s.raw).filter(Boolean).map((r) => r.split('/').pop()).join(',')
      });
      current = await api('/api/photos?' + q, { method: 'POST', headers: { 'Content-Type': blob.type.split(';')[0] }, body: blob });
      const th = makeThumb(thumbSrc);
      if (th) Compose.toJpeg(th, 0.8).then((b) => fetch(`/api/photos/${current.id}/thumb`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: b })).catch(() => {});
      if (mode === 'message') {
        URL.revokeObjectURL(message.url);
        message = null;
        toast(t('thanksMessage'), 5000);
      }
      if (sheet) {
        await api(`/api/photos/${current.id}/printfile`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: await Compose.toJpeg(sheet, 0.92) });
        if (cfg.print.auto) {
          try {
            await api(`/api/photos/${current.id}/print`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ copies: cfg.print.autoCopies || 1 }) });
          } catch (e) { current.printError = e.message; }
        }
      }
      stopAnim();
      Stickers.clear();
      const isVideo = current.kind === 'video';
      $('#finalImg').classList.toggle('hidden', isVideo);
      $('#finalVid').classList.toggle('hidden', !isVideo);
      if (isVideo) { $('#finalVid').src = current.url; $('#finalVid').muted = current.mode !== 'message'; $('#finalVid').play().catch(() => {}); }
      else { $('#finalVid').removeAttribute('src'); $('#finalImg').src = current.url; }
      $('#printBox').classList.toggle('hidden', !cfg.print.enabled || current.kind !== 'photo');
      $('#qrImg').src = `/api/photos/${current.id}/qr.svg`;
      renderShareStatus(current);
      $$('#socialBtns .btn').forEach((b) => (b.disabled = false));
      setCopies(1);
      $('#printBtn').disabled = false;
      $('#printBtn').textContent = t(cfg.print.auto ? 'printAnother' : 'print');
      $('#printMsg').textContent = current.printError ? '⚠️ ' + current.printError : cfg.print.auto && cfg.print.enabled ? t('printing', { n: '' }) : '';
      show('shareScr');
    } catch (e) {
      toast(t('couldNotSave') + e.message, 5000);
    } finally {
      busy = false;
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  function copyCanvas(src) {
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    c.getContext('2d').drawImage(src, 0, 0);
    return c;
  }

  // ---------------- share ----------------
  const LABELS = { drive: 'Google Drive', ftp: 'Website', wedding: 'Wedding album', facebook: 'Facebook', instagram: 'Instagram', telegram: 'Telegram', email: 'Email' };
  const ICON = { done: '✓', failed: '✗', running: '…', queued: '…', retry: '↻' };

  function renderShareStatus(p) {
    if (cfg.weddingName) LABELS.wedding = cfg.weddingName;
    $('#shareStatus').innerHTML = Object.entries(p.shares || {})
      .map(([k, s]) => `<span class="pill ${s.status}">${ICON[s.status] || ''} ${LABELS[k] || k}</span>`)
      .join('');
  }

  async function shareTo(target, btn) {
    if (!current) return;
    btn.disabled = true;
    try {
      await api(`/api/photos/${current.id}/share/${target}`, { method: 'POST' });
      toast(t('postingTo', { x: SOCIAL[target] }));
    } catch (e) {
      btn.disabled = false;
      toast('⚠️ ' + e.message);
    }
    resetIdle();
  }

  function setCopies(n) {
    copies = Math.max(1, Math.min(n, cfg.print.maxCopies || 1));
    $('#copies').textContent = copies;
    $('#copiesMinus').disabled = copies <= 1;
    $('#copiesPlus').disabled = copies >= (cfg.print.maxCopies || 1);
  }

  async function printPhoto() {
    if (!current) return;
    const btn = $('#printBtn');
    btn.disabled = true;
    try {
      const r = await api(`/api/photos/${current.id}/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ copies })
      });
      $('#printMsg').textContent = t('printing', { n: '×' + r.copies });
      setTimeout(() => { btn.disabled = false; btn.textContent = t('printAnother'); }, 4000);
    } catch (e) {
      $('#printMsg').textContent = '⚠️ ' + e.message;
      btn.disabled = /maximum|out of paper/i.test(e.message);
    }
    resetIdle();
  }

  function onPrint({ job }) {
    if (!job || !current || job.photoId !== current.id || screen !== 'shareScr') return;
    const MSG = {
      queued: t('waitingPrinter'),
      printing: t('printingCollect'),
      done: t('printSent'),
      failed: t('printFailed') + job.error
    };
    $('#printMsg').textContent = MSG[job.status] || '';
    if (job.status === 'failed') $('#printBtn').disabled = false;
  }

  async function sendEmail() {
    const to = $('#email').value.trim();
    if (!current || !to) return;
    try {
      await api(`/api/photos/${current.id}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, consent: $('#consent').checked })
      });
      $('#email').value = '';
      $('#consent').checked = false;
      if (window.OSK) OSK.hide();
      toast(t('emailSent', { to }));
    } catch (e) {
      toast('⚠️ ' + e.message);
    }
    resetIdle();
  }

  // ---------------- hands-free (✌️ / 😁 / 👏 to shoot, 👍 to accept) ----------------
  const keepCamera = () => !!(cfg.handsFree && cfg.handsFree.enabled);
  let hfWatch = null, hfClap = null;

  async function startHandsFree() {
    stopHandsFree();
    if (!keepCamera()) return;
    const h = cfg.handsFree;
    const box = $('#hfBox');
    let src;
    try {
      if (camera === 'webcam') {
        await startWebcam();
        src = $('#hfCam');
        src.srcObject = stream;
        src.play().catch(() => {});
      } else if (cfg.dslr.livePreview) {
        src = $('#hfDslr');
        src.src = '/api/dslr/preview?hf=' + Date.now();
      }
    } catch (e) { console.warn('hands-free camera', e); }
    $('#hfCam').classList.toggle('hidden', !src || src.id !== 'hfCam');
    $('#hfDslr').classList.toggle('hidden', !src || src.id !== 'hfDslr');
    const hints = [h.peace && '✌️', h.smile && '😁', h.clap && '👏'].filter(Boolean).join(' ');
    $('#hfHint').textContent = hints ? t('handsFreeHint', { icons: hints }) : '';
    box.classList.remove('hidden');
    if (src) {
      hfWatch = AI.watch(src, h, (kind) => {
        if (busy) return;
        if (screen === 'attract' && (kind === 'peace' || kind === 'smile')) startSession();
        else if (screen === 'review' && kind === 'thumbsup') accept();
        else if (screen === 'shareScr' && (kind === 'thumbsup' || kind === 'peace')) home();
      });
    }
    if (h.clap) hfClap = await AI.clap(h.clapSensitivity, () => { if (!busy && screen !== 'live') primary(); });
  }

  function stopHandsFree() {
    if (hfWatch) hfWatch.stop();
    if (hfClap) hfClap.stop();
    hfWatch = hfClap = null;
    $('#hfBox').classList.add('hidden');
  }

  // ---------------- one-button flow (Bluetooth shutter / clicker / phone remote) ----------------
  function primary() {
    if (screen === 'attract') startSession();
    else if (screen === 'review') accept();
    else if (screen === 'shareScr') home();
  }

  function handleRemote({ cmd, value }) {
    resetIdle();
    switch (cmd) {
      case 'shoot':
        if (screen === 'attract') startSession();
        else if (screen === 'shareScr') { home(); startSession(); }
        else if (screen === 'review') { shots = []; startSession(); }
        break;
      case 'accept': if (screen === 'review') accept(); break;
      case 'retake': if (screen === 'review') startSession(); break;
      case 'home': if (!busy) home(); break;
      case 'mode': if (screen === 'attract') setMode(value); break;
      case 'template': if (TEMPLATES.some(([k]) => k === value)) { template = value; renderTemplates(); redraw(); report(); } break;
      case 'greeting': $('#greeting').value = String(value || '').slice(0, 160); syncGreetChips(); redraw(); break;
      case 'camera': if (['dslr', 'webcam'].includes(value)) { camera = value; $('#camLabel').textContent = value === 'dslr' ? '📷 DSLR' : '🎥 Webcam'; report(); } break;
      case 'reload': if (screen === 'attract' && !busy) location.reload(); break;
    }
  }

  function connectEvents() {
    const es = new EventSource('/api/events');
    es.addEventListener('remote', (e) => handleRemote(JSON.parse(e.data)));
    es.addEventListener('photo', (e) => {
      const p = JSON.parse(e.data);
      if (current && p && p.id === current.id) { current = p; renderShareStatus(p); }
    });
    es.addEventListener('print', (e) => onPrint(JSON.parse(e.data)));
    es.onopen = () => report();
  }

  // ---------------- wire up ----------------
  $('#attract').addEventListener('click', (e) => {
    const lb = e.target.closest('[data-lang]');
    if (lb) { setLang(lb.dataset.lang); return; }
    const m = e.target.closest('#modeRow [data-mode]');
    if (m) { setMode(m.dataset.mode); return; }
    if (e.target.closest('#fsBtn') || e.target.closest('.corner') || e.target.closest('#langRow')) return;
    startSession();
  });
  $('#fsBtn').onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  };
  $('#beautyBtn').onclick = () => { beautyOn = !beautyOn; $('#beautyBtn').classList.toggle('sel', beautyOn); redraw(); resetIdle(); };
  $$('#stickerTools [data-st]').forEach((b) => (b.onclick = () => { Stickers.adjust(b.dataset.st); stickerTools(); resetIdle(); }));
  window.addEventListener('resize', () => Stickers.sync());
  $('#retakeBtn').onclick = () => { if (!busy) startSession(); };
  $('#acceptBtn').onclick = accept;
  $('#doneBtn').onclick = home;
  $('#emailBtn').onclick = sendEmail;
  $('#printBtn').onclick = printPhoto;
  $('#copiesMinus').onclick = () => { setCopies(copies - 1); resetIdle(); };
  $('#copiesPlus').onclick = () => { setCopies(copies + 1); resetIdle(); };
  $('#greeting').addEventListener('input', () => { syncGreetChips(); redrawSoon(); });
  $('#guest').addEventListener('input', redrawSoon);
  $('#email').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendEmail(); });

  document.addEventListener('keydown', (e) => {
    const typing = e.target.matches && e.target.matches('input, textarea');
    if (typing) return;
    const keys = cfg.booth.triggerKeys || [];
    if (keys.includes(e.key) || keys.includes(e.code)) {
      e.preventDefault();
      primary();
    } else if (e.key === 'Escape') {
      home();
    }
  });
  document.addEventListener('pointerdown', resetIdle, { passive: true });
  document.addEventListener('contextmenu', (e) => e.preventDefault()); // long-press on touch screens

  // Keep the screen awake at the venue.
  async function wake() {
    try { if (navigator.wakeLock) await navigator.wakeLock.request('screen'); } catch {}
  }
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && wake());

  // Canvas only uses a web font once it is loaded.
  try { await Promise.all(["40px 'Great Vibes'", "40px 'Playfair Display'", "italic 40px 'Playfair Display'", "40px 'Aref Ruqaa'", "40px 'Amiri'"].map((f) => document.fonts.load(f))); } catch {}
  await init();
  Sound.startMusic();
  startHandsFree();
  wake();
  connectEvents();
  show('attract');
})();
