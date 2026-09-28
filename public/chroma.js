// Green-screen (chroma key) background replacement.
// WebGL shader (fast even on a Raspberry Pi) with a plain-canvas fallback.
// Keying math follows the well-known OBS chroma key: distance in CbCr space,
// "similarity" / "smoothness" edge, and spill suppression to remove green fringes.
(function (global) {
  const VERT = `
    attribute vec2 p;
    varying vec2 uv;
    void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;
  const FRAG = `
    precision mediump float;
    uniform sampler2D fg;
    uniform sampler2D bg;
    uniform vec3 keyColor;
    uniform float similarity;
    uniform float smoothness;
    uniform float spill;
    uniform float flipX;
    uniform vec2 bgScale;
    uniform vec2 bgOffset;
    varying vec2 uv;
    vec2 cbcr(vec3 c) {
      return vec2(c.r * -0.169 + c.g * -0.331 + c.b * 0.5 + 0.5, c.r * 0.5 + c.g * -0.419 + c.b * -0.081 + 0.5);
    }
    void main() {
      vec2 fuv = vec2(flipX > 0.5 ? 1.0 - uv.x : uv.x, uv.y);
      vec4 c = texture2D(fg, fuv);
      float base = distance(cbcr(c.rgb), cbcr(keyColor)) - similarity;
      float alpha = pow(clamp(base / smoothness, 0.0, 1.0), 1.5);
      float spillVal = pow(clamp(base / spill, 0.0, 1.0), 1.5);
      float luma = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 fgc = mix(vec3(luma), c.rgb, spillVal);
      vec3 b = texture2D(bg, uv * bgScale + bgOffset).rgb;
      gl_FragColor = vec4(mix(b, fgc, alpha), 1.0);
    }`;

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    const n = m ? parseInt(m[1], 16) : 0x00b140;
    return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  function size(el) {
    return { w: el.videoWidth || el.naturalWidth || el.width, h: el.videoHeight || el.naturalHeight || el.height };
  }

  // Maps the output 0..1 UV onto the background so it "covers" the frame (center crop).
  function coverUv(outW, outH, bg) {
    const b = size(bg);
    const outAR = outW / outH, bgAR = b.w / b.h;
    let sx = 1, sy = 1;
    if (bgAR > outAR) sx = outAR / bgAR; else sy = bgAR / outAR;
    return { scale: [sx, sy], offset: [(1 - sx) / 2, (1 - sy) / 2] };
  }

  // ---- WebGL keyer ----
  function glKeyer() {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (!gl) return null;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (n) => gl.getUniformLocation(prog, n);
    const tex = (unit) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return t;
    };
    const fgTex = tex(0), bgTex = tex(1);
    gl.uniform1i(U('fg'), 0);
    gl.uniform1i(U('bg'), 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    let lastBg = null;

    return {
      canvas,
      maxTex,
      render(src, bg, w, h, o) {
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        gl.viewport(0, 0, w, h);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, fgTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src);
        if (bg !== lastBg) {
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, bgTex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, bg);
          lastBg = bg;
        }
        const cu = coverUv(w, h, bg);
        gl.uniform3fv(U('keyColor'), o.key);
        gl.uniform1f(U('similarity'), o.similarity);
        gl.uniform1f(U('smoothness'), Math.max(0.001, o.smoothness));
        gl.uniform1f(U('spill'), Math.max(0.001, o.spill));
        gl.uniform1f(U('flipX'), o.flipX ? 1 : 0);
        gl.uniform2fv(U('bgScale'), cu.scale);
        gl.uniform2fv(U('bgOffset'), cu.offset);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        return canvas;
      }
    };
  }

  // ---- CPU fallback (same maths, slower) ----
  function cpuKeyer() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const bgc = document.createElement('canvas');
    const bctx = bgc.getContext('2d', { willReadFrequently: true });
    return {
      canvas,
      maxTex: 8192,
      render(src, bg, w, h, o) {
        canvas.width = bgc.width = w;
        canvas.height = bgc.height = h;
        ctx.save();
        if (o.flipX) { ctx.translate(w, 0); ctx.scale(-1, 1); }
        ctx.drawImage(src, 0, 0, w, h);
        ctx.restore();
        const b = size(bg), cu = coverUv(w, h, bg);
        bctx.drawImage(bg, cu.offset[0] * b.w, cu.offset[1] * b.h, cu.scale[0] * b.w, cu.scale[1] * b.h, 0, 0, w, h);
        const f = ctx.getImageData(0, 0, w, h), bd = bctx.getImageData(0, 0, w, h).data, d = f.data;
        const [kr, kg, kb] = o.key;
        const kcb = kr * -0.169 + kg * -0.331 + kb * 0.5, kcr = kr * 0.5 + kg * -0.419 + kb * -0.081;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i] / 255, g = d[i + 1] / 255, bl = d[i + 2] / 255;
          const cb = r * -0.169 + g * -0.331 + bl * 0.5, cr = r * 0.5 + g * -0.419 + bl * -0.081;
          const base = Math.hypot(cb - kcb, cr - kcr) - o.similarity;
          const a = Math.pow(Math.min(1, Math.max(0, base / o.smoothness)), 1.5);
          const sp = Math.pow(Math.min(1, Math.max(0, base / o.spill)), 1.5);
          const l = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
          for (let k = 0; k < 3; k++) {
            const fc = (l + ([r, g, bl][k] - l) * sp) * 255;
            d[i + k] = bd[i + k] + (fc - bd[i + k]) * a;
          }
        }
        ctx.putImageData(f, 0, 0);
        return canvas;
      }
    };
  }

  let keyer = null;
  function getKeyer() {
    if (!keyer) {
      try { keyer = glKeyer(); } catch (e) { console.warn('WebGL keyer failed, using CPU', e); }
      keyer = keyer || cpuKeyer();
    }
    return keyer;
  }

  // Thresholds are relative to how far the screen colour is from neutral grey, so the same
  // settings work for a vivid chroma green, a duller real-world backdrop, or a blue screen —
  // and skin, black suits and white dresses (all near grey in CbCr) are never keyed out.
  function opts(cfg, extra = {}) {
    const key = Array.isArray(cfg.keyRgb) ? cfg.keyRgb : hexToRgb(cfg.keyColor);
    const cb = key[0] * -0.169 + key[1] * -0.331 + key[2] * 0.5;
    const cr = key[0] * 0.5 + key[1] * -0.419 + key[2] * -0.081;
    const kd = Math.max(0.08, Math.hypot(cb, cr)); // distance from grey in CbCr
    return {
      key,
      similarity: (Number(cfg.similarity) || 0.4) * kd,
      smoothness: (Number(cfg.smoothness) || 0.1) * kd,
      spill: (Number(cfg.spill) || 0.3) * kd,
      ...extra
    };
  }

  // Keys src onto bg and returns a new 2D canvas (limited to maxLongEdge).
  function key(src, bg, cfg, maxLongEdge = 2400) {
    const k = getKeyer();
    const s = size(src);
    const scale = Math.min(1, maxLongEdge / Math.max(s.w, s.h), k.maxTex / Math.max(s.w, s.h));
    const w = Math.round(s.w * scale), h = Math.round(s.h * scale);
    let input = src;
    if (scale < 1 || src.tagName === 'IMG' && !src.complete) {
      input = document.createElement('canvas');
      input.width = w;
      input.height = h;
      input.getContext('2d').drawImage(src, 0, 0, w, h);
    }
    k.render(input, bg, w, h, opts(cfg));
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    out.getContext('2d').drawImage(k.canvas, 0, 0);
    return out;
  }

  // Estimates the screen colour from the top corners of a frame (usually pure backdrop).
  function sampleKey(src) {
    const s = size(src);
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = Math.max(1, Math.round((64 * s.h) / s.w));
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0, c.width, c.height);
    const px = [];
    const band = Math.max(1, Math.round(c.height * 0.15));
    for (const x0 of [0, c.width - 10]) {
      const d = ctx.getImageData(x0, 0, 10, band).data;
      for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
    }
    // Keep the most saturated-green/blue half, then average (ignores stray objects).
    const score = (p) => Math.max(p[1], p[2]) - p[0];
    px.sort((a, b) => score(b) - score(a));
    const top = px.slice(0, Math.max(1, px.length >> 1));
    const avg = [0, 1, 2].map((k) => top.reduce((t, p) => t + p[k], 0) / top.length / 255);
    return avg;
  }

  // Live keyed preview: draws the camera onto a visible canvas every frame.
  function live(canvas, src, getBg, cfg, { flipX, maxWidth = 960 } = {}) {
    const k = getKeyer();
    const ctx = canvas.getContext('2d');
    let raf = 0, stopped = false;
    function frame() {
      if (stopped) return;
      const s = size(src);
      if (s.w && s.h) {
        const sc = Math.min(1, maxWidth / s.w);
        const w = Math.round(s.w * sc), h = Math.round(s.h * sc);
        try {
          k.render(src, getBg(), w, h, opts(cfg, { flipX }));
          if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
          ctx.drawImage(k.canvas, 0, 0);
        } catch {}
      }
      raf = requestAnimationFrame(frame);
    }
    frame();
    return { stop() { stopped = true; cancelAnimationFrame(raf); } };
  }

  // ---- Built-in backgrounds, drawn procedurally (no image files, works offline) ----
  function rng(seed) {
    return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  }

  function bokeh(ctx, w, h, colors, n, seed) {
    const r = rng(seed);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const x = r() * w, y = r() * h, rad = (0.02 + r() * 0.07) * w;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      const c = colors[i % colors.length];
      g.addColorStop(0, `rgba(${c},${0.25 + r() * 0.35})`);
      g.addColorStop(0.7, `rgba(${c},${0.1 + r() * 0.15})`);
      g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  const BUILTIN = {
    gold: ['Golden lights', (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, w * 0.7);
      g.addColorStop(0, '#5a4127'); g.addColorStop(1, '#140d07');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      bokeh(ctx, w, h, ['255,200,120', '255,170,80', '255,230,170'], 70, 7);
    }],
    blush: ['Blush & bloom', (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#f7d9d3'); g.addColorStop(0.5, '#f1c6c9'); g.addColorStop(1, '#e9b7a6');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      bokeh(ctx, w, h, ['255,255,255', '255,230,220'], 45, 11);
    }],
    night: ['Starry night', (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#0b1030'); g.addColorStop(1, '#2a1f4d');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const r = rng(3);
      for (let i = 0; i < 400; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`;
        ctx.beginPath(); ctx.arc(r() * w, r() * h, r() * 1.8 + 0.3, 0, Math.PI * 2); ctx.fill();
      }
      bokeh(ctx, w, h, ['140,150,255', '255,200,255'], 18, 5);
    }],
    ivory: ['Classic ivory', (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.75);
      g.addColorStop(0, '#fbf6ee'); g.addColorStop(1, '#d9ccb8');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }]
  };

  const cache = {};
  function builtin(id) {
    if (!cache[id]) {
      const c = document.createElement('canvas');
      c.width = 1920;
      c.height = 1280;
      BUILTIN[id][1](c.getContext('2d'), c.width, c.height);
      cache[id] = c;
    }
    return cache[id];
  }

  function builtinList() {
    return Object.entries(BUILTIN).map(([id, [name]]) => ({ id: 'builtin:' + id, name }));
  }

  global.Chroma = { key, live, sampleKey, builtin, builtinList, hexToRgb };
})(window);
