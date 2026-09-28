// Sounds: spoken countdown (system voices, offline), beeps & shutter click (synthesised with
// Web Audio — no audio files needed) and optional background music uploaded by the host.
(function (global) {
  let ctx = null;
  let cfg = { enabled: true, voice: true, beeps: true, shutter: true, music: false, musicVolume: 0.25 };
  let lang = 'en';
  let music = null;

  function ac() {
    if (!ctx) {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function beep(freq = 880, ms = 140, vol = 0.25) {
    if (!cfg.enabled || !cfg.beeps) return;
    const a = ac();
    if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + ms / 1000);
    o.connect(g).connect(a.destination);
    o.start();
    o.stop(a.currentTime + ms / 1000);
  }

  // Mechanical-sounding shutter: two short filtered noise bursts.
  function shutter() {
    if (!cfg.enabled || !cfg.shutter) return;
    const a = ac();
    if (!a) return;
    [0, 0.07].forEach((t, k) => {
      const len = Math.floor(a.sampleRate * 0.05);
      const buf = a.createBuffer(1, len, a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
      src.buffer = buf;
      f.type = 'bandpass';
      f.frequency.value = k ? 2500 : 1600;
      g.gain.value = 0.9;
      src.connect(f).connect(g).connect(a.destination);
      src.start(a.currentTime + t);
    });
  }

  function voiceFor(l) {
    const vs = (global.speechSynthesis && speechSynthesis.getVoices()) || [];
    return vs.find((v) => v.lang && v.lang.toLowerCase().startsWith(l)) || null;
  }

  function say(text) {
    if (!cfg.enabled || !cfg.voice || !global.speechSynthesis || !text) return false;
    const v = voiceFor(lang);
    if (!v && lang !== 'en') return false; // no voice for this language → beeps only
    const u = new SpeechSynthesisUtterance(text);
    if (v) u.voice = v;
    u.lang = v ? v.lang : lang;
    u.rate = 1.05;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    return true;
  }

  // One countdown tick: spoken number if a voice exists, otherwise a beep.
  function tick(n, words) {
    if (!say(words && words[n] ? words[n] : String(n))) beep(n === 1 ? 1175 : 880);
  }

  function startMusic() {
    if (!cfg.enabled || !cfg.music) return stopMusic();
    if (!music) {
      music = new Audio('/asset/music');
      music.loop = true;
    }
    music.volume = Math.min(1, Math.max(0, Number(cfg.musicVolume) || 0.25));
    music.play().catch(() => {});
  }

  function duck(on) {
    if (music) music.volume = on ? 0.05 : Math.min(1, Number(cfg.musicVolume) || 0.25);
  }

  function stopMusic() {
    if (music) music.pause();
  }

  function setup(c, l) {
    cfg = { ...cfg, ...(c || {}) };
    lang = l || 'en';
    if (global.speechSynthesis) speechSynthesis.getVoices(); // warm up voice list
  }

  // Browsers need one user gesture before audio can play.
  document.addEventListener('pointerdown', () => ac(), { once: true });

  global.Sound = { setup, beep, shutter, say, tick, startMusic, stopMusic, duck };
})(window);
