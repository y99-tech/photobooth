// Kiosk controller: attract → live/countdown → review (greeting) → share.
(async function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let cfg, status, overlay = null;
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

  const TEMPLATES = [
    ['elegant', 'Elegant'],
    ['polaroid', 'Polaroid'],
    ['minimal', 'Minimal'],
    ['none', 'No frame']
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
    mode = mode || cfg.booth.mode;
    template = template || cfg.booth.template;

    const want = cfg.booth.camera;
    camera = want === 'auto' ? (status.camera.available ? 'dslr' : 'webcam') : want;
    $('#camLabel').textContent = camera === 'dslr' ? `📷 ${status.camera.model || 'DSLR'}` : '🎥 Webcam';

    overlay = null;
    if (status.overlay) {
      try { overlay = await Compose.loadImage('/overlay.png?' + Date.now()); } catch {}
    }
    renderModes();
    renderTemplates();
    renderGreetings();
    $('#greetBox').classList.toggle('hidden', !cfg.booth.allowGuestGreeting);
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

  function renderModes() {
    $$('#modeRow [data-mode]').forEach((b) => b.classList.toggle('sel', b.dataset.mode === mode));
  }

  function renderTemplates() {
    const box = $('#tplChips');
    box.innerHTML = '';
    for (const [k, label] of TEMPLATES) {
      const b = document.createElement('button');
      b.className = 'chip' + (k === template ? ' sel' : '');
      b.textContent = label;
      b.onclick = () => { template = k; renderTemplates(); redraw(); report(); };
      box.appendChild(b);
    }
  }

  function renderGreetings() {
    const box = $('#greetChips');
    box.innerHTML = '';
    for (const g of cfg.event.greetings || []) {
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

  function home() {
    stopWebcam();
    stopDslrLive();
    shots = [];
    composed = null;
    current = null;
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
    show('live');
    const useWebcam = camera === 'webcam';
    $('#video').classList.toggle('hidden', !useWebcam);
    $('#video').classList.toggle('mirror', !!cfg.booth.mirrorPreview);
    $('#dslrLive').classList.toggle('hidden', useWebcam || !cfg.dslr.livePreview);
    $('#noLive').classList.toggle('hidden', useWebcam || cfg.dslr.livePreview);
    try {
      if (useWebcam) await startWebcam();
      else startDslrLive();
      const total = mode === 'strip' ? 4 : 1;
      for (let i = 0; i < total; i++) {
        $('#shotinfo').textContent = total > 1 ? `Photo ${i + 1} of ${total}` : '';
        await countdown(i === 0 ? cfg.booth.countdown : Math.min(3, cfg.booth.countdown));
        flash();
        shots.push(await captureOne());
        if (!useWebcam && i < total - 1) startDslrLive();
      }
      stopDslrLive();
      stopWebcam();
      busy = false;
      openReview();
    } catch (e) {
      busy = false;
      console.error(e);
      toast('⚠️ ' + (e.message || 'Camera error'), 5000);
      if (camera === 'dslr' && cfg.booth.camera === 'auto') {
        camera = 'webcam'; // fall back so the party goes on
        $('#camLabel').textContent = '🎥 Webcam (DSLR failed)';
      }
      home();
    }
  }

  async function countdown(n) {
    const el = $('#countdown');
    for (let i = n; i > 0; i--) {
      el.textContent = i;
      el.classList.remove('tick');
      void el.offsetWidth;
      el.classList.add('tick');
      await sleep(1000);
    }
    el.textContent = '';
    el.classList.remove('tick');
  }

  function flash() {
    const f = $('#flash');
    f.classList.add('on');
    setTimeout(() => f.classList.remove('on'), 120);
  }

  // ---------------- review ----------------
  function openReview() {
    syncGreetChips();
    show('review');
    redraw();
  }

  function redraw() {
    if (!shots.length) return;
    composed = Compose.compose({
      images: shots.map((s) => s.img),
      template,
      greeting: $('#greeting').value.trim(),
      guest: $('#guest').value.trim(),
      event: cfg.event,
      accent: cfg.booth.accent,
      longEdge: cfg.booth.maxLongEdge,
      overlay
    });
    const box = $('#reviewPic');
    box.innerHTML = '';
    box.appendChild(composed);
  }

  let redrawT;
  function redrawSoon() {
    clearTimeout(redrawT);
    redrawT = setTimeout(redraw, 250);
    resetIdle();
  }

  async function accept() {
    if (screen !== 'review' || !composed || busy) return;
    busy = true;
    try {
      const blob = await Compose.toJpeg(composed, cfg.booth.jpegQuality);
      const q = new URLSearchParams({
        greeting: $('#greeting').value.trim(),
        guest: $('#guest').value.trim(),
        camera,
        raw: shots.map((s) => s.raw).filter(Boolean).map((r) => r.split('/').pop()).join(',')
      });
      current = await api('/api/photos?' + q, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
      $('#finalImg').src = current.url;
      $('#qrImg').src = `/api/photos/${current.id}/qr.svg`;
      renderShareStatus(current);
      $$('#socialBtns .btn').forEach((b) => (b.disabled = false));
      setCopies(1);
      $('#printBtn').disabled = false;
      $('#printBtn').textContent = cfg.print.auto ? '🖨️ Print another' : '🖨️ Print';
      $('#printMsg').textContent = current.printError ? '⚠️ ' + current.printError : cfg.print.auto && cfg.print.enabled ? '🖨️ Printing your photo…' : '';
      show('shareScr');
    } catch (e) {
      toast('⚠️ Could not save: ' + e.message, 5000);
    } finally {
      busy = false;
    }
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
      toast(`Posting to ${SOCIAL[target]}…`);
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
      $('#printMsg').textContent = `🖨️ Printing ${r.copies} cop${r.copies > 1 ? 'ies' : 'y'}…` + (r.queued > 1 ? ` (${r.queued - 1} ahead of you)` : '');
      setTimeout(() => { btn.disabled = false; btn.textContent = '🖨️ Print another'; }, 4000);
    } catch (e) {
      $('#printMsg').textContent = '⚠️ ' + e.message;
      btn.disabled = /maximum|out of paper/i.test(e.message);
    }
    resetIdle();
  }

  function onPrint({ job }) {
    if (!job || !current || job.photoId !== current.id || screen !== 'shareScr') return;
    const MSG = {
      queued: '🖨️ Waiting for the printer…',
      printing: '🖨️ Printing… collect your photo at the printer',
      done: '✅ Sent to the printer — collect it in a moment!',
      failed: '⚠️ Print failed: ' + job.error
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
        body: JSON.stringify({ to })
      });
      $('#email').value = '';
      if (window.OSK) OSK.hide();
      toast('📧 On its way to ' + to);
    } catch (e) {
      toast('⚠️ ' + e.message);
    }
    resetIdle();
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
      case 'mode': if (['single', 'strip'].includes(value)) { mode = value; renderModes(); report(); } break;
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
    const m = e.target.closest('[data-mode]');
    if (m) { mode = m.dataset.mode; renderModes(); report(); return; }
    if (e.target.closest('#fsBtn') || e.target.closest('.corner')) return;
    startSession();
  });
  $('#fsBtn').onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  };
  $('#retakeBtn').onclick = () => startSession();
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
  try { await Promise.all(["40px 'Great Vibes'", "40px 'Playfair Display'", "italic 40px 'Playfair Display'"].map((f) => document.fonts.load(f))); } catch {}
  await init();
  wake();
  connectEvents();
  show('attract');
})();
