// Offline AI (MediaPipe Tasks, runs in the browser — no internet, no cloud):
//  • person segmentation → background removal WITHOUT a green screen
//  • gesture recognition (✌️ peace sign, 👍 thumbs up) and smile detection → hands-free shooting
//  • clap detection (microphone level spike)
(function (global) {
  let vision = null, fileset = null;
  const tasks = {};
  let available = null;

  async function status() {
    if (!available) available = await fetch('/api/ai').then((r) => r.json()).catch(() => ({}));
    return available;
  }

  async function lib() {
    if (!vision) {
      vision = await import('/vendor/mediapipe/vision_bundle.mjs');
      fileset = await vision.FilesetResolver.forVisionTasks('/vendor/mediapipe/wasm');
    }
    return vision;
  }

  // Tries the GPU first (fast), falls back to CPU (works everywhere).
  async function create(Cls, model, extra) {
    const v = await lib();
    for (const delegate of ['GPU', 'CPU']) {
      try {
        return await v[Cls].createFromOptions(fileset, { baseOptions: { modelAssetPath: '/models/' + model, delegate }, ...extra });
      } catch (e) {
        if (delegate === 'CPU') throw e;
      }
    }
  }

  async function task(name) {
    if (!tasks[name]) {
      tasks[name] = (async () => {
        if (name === 'segImage') return create('ImageSegmenter', 'selfie_segmenter.tflite', { runningMode: 'IMAGE', outputConfidenceMasks: true, outputCategoryMask: false });
        if (name === 'segVideo') return create('ImageSegmenter', 'selfie_segmenter.tflite', { runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false });
        if (name === 'gesture') return create('GestureRecognizer', 'gesture_recognizer.task', { runningMode: 'VIDEO', numHands: 4 });
        if (name === 'face') return create('FaceLandmarker', 'face_landmarker.task', { runningMode: 'VIDEO', numFaces: 6, outputFaceBlendshapes: true });
      })();
      tasks[name].catch(() => delete tasks[name]);
    }
    return tasks[name];
  }

  // ---- background removal ----
  function maskToCanvas(mpMask) {
    const w = mpMask.width, h = mpMask.height;
    const f = mpMask.getAsFloat32Array();
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < f.length; i++) {
      // Soft threshold: crisp body, soft hair edge.
      const a = Math.min(1, Math.max(0, (f[i] - 0.3) / 0.4));
      img.data[i * 4 + 3] = a * 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  function scaled(src, maxSide) {
    const w = src.videoWidth || src.naturalWidth || src.width, h = src.videoHeight || src.naturalHeight || src.height;
    const s = Math.min(1, maxSide / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * s);
    c.height = Math.round(h * s);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c;
  }

  // Person mask for a still image (alpha = person).
  async function personMask(src) {
    const seg = await task('segImage');
    const input = scaled(src, 1024);
    const res = seg.segment(input);
    const mask = maskToCanvas(res.confidenceMasks[0]);
    res.close && res.close();
    return mask;
  }

  function coverDraw(ctx, bg, w, h) {
    const bw = bg.naturalWidth || bg.width, bh = bg.naturalHeight || bg.height;
    const s = Math.max(w / bw, h / bh);
    ctx.drawImage(bg, (w - bw * s) / 2, (h - bh * s) / 2, bw * s, bh * s);
  }

  // Person (via mask) over the chosen background.
  function composite(src, mask, bg, flipX) {
    const w = src.videoWidth || src.naturalWidth || src.width, h = src.videoHeight || src.naturalHeight || src.height;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (flipX) { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.filter = `blur(${Math.max(1, Math.round(w / 600))}px)`; // feather the edge
    ctx.drawImage(mask, 0, 0, w, h);
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-in';
    ctx.drawImage(src, 0, 0, w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'destination-over';
    coverDraw(ctx, bg, w, h);
    ctx.globalCompositeOperation = 'source-over';
    return c;
  }

  // Live preview with the background replaced (segments ~every frame).
  function live(canvas, src, getBg, { flipX, maxWidth = 960 } = {}) {
    let stopped = false, raf = 0, seg = null;
    const ctx = canvas.getContext('2d');
    task('segVideo').then((s) => (seg = s)).catch(() => {});
    function frame() {
      if (stopped) return;
      const w0 = src.videoWidth || src.naturalWidth, h0 = src.videoHeight || src.naturalHeight;
      if (seg && w0 && getBg()) {
        try {
          const input = scaled(src, maxWidth);
          const res = seg.segmentForVideo(input, performance.now());
          const mask = maskToCanvas(res.confidenceMasks[0]);
          res.close && res.close();
          const out = composite(input, mask, getBg(), flipX);
          if (canvas.width !== out.width || canvas.height !== out.height) { canvas.width = out.width; canvas.height = out.height; }
          ctx.drawImage(out, 0, 0);
        } catch {}
      }
      raf = requestAnimationFrame(frame);
    }
    frame();
    return { stop() { stopped = true; cancelAnimationFrame(raf); } };
  }

  // ---- hands-free triggers ----
  // Calls onTrigger(kind) when a gesture/smile is held for holdMs. kinds: peace, thumbsup, smile.
  function watch(src, opts, onTrigger) {
    let stopped = false, timer = 0, gest = null, face = null, since = {}, last = 0;
    if (opts.peace || opts.thumbsUp) task('gesture').then((t) => (gest = t)).catch(() => {});
    if (opts.smile) task('face').then((t) => (face = t)).catch(() => {});
    function hold(kind, on) {
      if (!on) { delete since[kind]; return false; }
      since[kind] = since[kind] || performance.now();
      return performance.now() - since[kind] >= (opts.holdMs || 800);
    }
    function loop() {
      if (stopped) return;
      const ready = (src.videoWidth || src.naturalWidth) > 0;
      const now = performance.now();
      if (ready && now > last + 30) {
        last = now;
        try {
          let peace = false, thumbs = false, smile = false;
          if (gest) {
            const r = gest.recognizeForVideo(src, now);
            for (const hand of r.gestures || []) {
              const g = hand[0];
              if (!g || g.score < 0.6) continue;
              if (g.categoryName === 'Victory') peace = true;
              if (g.categoryName === 'Thumb_Up') thumbs = true;
            }
          }
          if (face) {
            const r = face.detectForVideo(src, now + 0.5);
            smile = (r.faceBlendshapes || []).some((b) => {
              const s = (n) => (b.categories.find((c) => c.categoryName === n) || { score: 0 }).score;
              return (s('mouthSmileLeft') + s('mouthSmileRight')) / 2 > (opts.smileThreshold || 0.6);
            });
          }
          const fire = [['peace', opts.peace && peace], ['thumbsup', opts.thumbsUp && thumbs], ['smile', opts.smile && smile]];
          for (const [k, on] of fire) {
            if (hold(k, on)) { since = {}; onTrigger(k); break; }
          }
          if (opts.onSeen) opts.onSeen({ peace, thumbs, smile });
        } catch {}
      }
      timer = setTimeout(loop, 150); // ~6 checks/second is plenty and light on a Pi
    }
    loop();
    return { stop() { stopped = true; clearTimeout(timer); } };
  }

  // Clap = sudden loud, short sound. Needs microphone permission.
  async function clap(sensitivity, onClap) {
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } }); } catch { return { stop() {} }; }
    const ac = new (global.AudioContext || global.webkitAudioContext)();
    const an = ac.createAnalyser();
    an.fftSize = 1024;
    ac.createMediaStreamSource(stream).connect(an);
    const buf = new Float32Array(an.fftSize);
    let avg = 0.01, lastClap = 0, stopped = false;
    const threshold = 0.9 - Math.min(0.8, Math.max(0, sensitivity ?? 0.5)) * 0.8; // 0.1–0.9 peak
    (function loop() {
      if (stopped) return;
      an.getFloatTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v));
      const now = performance.now();
      if (peak > threshold && peak > avg * 6 && now - lastClap > 1500) { lastClap = now; onClap(); }
      avg = avg * 0.95 + peak * 0.05;
      requestAnimationFrame(loop);
    })();
    return { stop() { stopped = true; stream.getTracks().forEach((t) => t.stop()); ac.close(); } };
  }

  global.AI = { status, personMask, composite, live, watch, clap, warm: (n) => task(n).catch(() => null) };
})(window);
