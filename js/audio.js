/* REEL STUDIO — audio: procedural BGM, SFX, TTS, narration */
(function () {
  'use strict';
  const RS = window.RS;

  const A = RS.audio = {
    ctx: null, master: null, bgmBus: null, sfxBus: null, voiceBus: null, origBus: null,
    recDest: null, noiseBuf: null, narrationBuf: null, narrationSrc: null,
    bgmVolume: 0.32, duckAmount: 0.55, ducked: false, origGain: 1, voiceVol: 1,
    unlocked: false
  };

  function ensure() {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return A.ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ctx = A.ctx = new AC();
    A.master = ctx.createGain(); A.master.gain.value = 0.9;
    A.bgmBus = ctx.createGain(); A.bgmBus.gain.value = A.bgmVolume;
    A.sfxBus = ctx.createGain(); A.sfxBus.gain.value = 0.9;
    A.voiceBus = ctx.createGain(); A.voiceBus.gain.value = 1;
    A.origBus = ctx.createGain(); A.origBus.gain.value = 1;
    A.bgmBus.connect(A.master);
    A.sfxBus.connect(A.master);
    A.voiceBus.connect(A.master);
    A.origBus.connect(A.master);
    A.master.connect(ctx.destination);
    if (ctx.createMediaStreamDestination) {
      A.recDest = ctx.createMediaStreamDestination();
      A.master.connect(A.recDest);
    }
    // noise buffer
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    A.noiseBuf = buf;
    return ctx;
  }
  A.ensure = ensure;
  A.resume = function () { const c = ensure(); if (c && c.state === 'suspended') c.resume(); return c; };

  /* ── primitives ─────────────────────────────────────── */
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  let ctx;

  function tone(bus, o) {
    const t = o.t, dur = Math.max(0.03, o.dur || 0.2), g = o.gain == null ? 0.08 : o.gain;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(Math.max(20, o.freq), t);
    if (o.glide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.glide), t + dur);
    if (o.detune) osc.detune.value = o.detune;
    let node = osc;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter.type || 'lowpass';
      f.frequency.setValueAtTime(o.filter.freq || 1200, t);
      if (o.filter.to) f.frequency.exponentialRampToValueAtTime(Math.max(60, o.filter.to), t + dur);
      f.Q.value = o.filter.q == null ? 0.8 : o.filter.q;
      node.connect(f); node = f;
    }
    const gn = ctx.createGain();
    const atk = o.attack == null ? 0.008 : o.attack;
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.linearRampToValueAtTime(g, t + atk);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    node.connect(gn); gn.connect(bus);
    osc.start(t); osc.stop(t + dur + 0.03);
  }

  function noise(bus, o) {
    const t = o.t, dur = Math.max(0.03, o.dur || 0.2);
    const src = ctx.createBufferSource();
    src.buffer = A.noiseBuf;
    src.playbackRate.value = o.rate || 1;
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.freq || 1800, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(80, o.to), t + dur);
    f.Q.value = o.q == null ? 1.2 : o.q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.gain == null ? 0.1 : o.gain, t + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(bus);
    src.start(t, Math.random() * 1.4); src.stop(t + dur + 0.02);
  }

  /* ── tracks ─────────────────────────────────────────── */
  const CHORDS = {
    docu: [[0, 4, 7, 11], [9, 12, 16, 19], [-3, 0, 4, 7], [5, 9, 12, 16]],
    tension: [[0, 3, 7], [0, 3, 7], [-2, 1, 5], [-2, 1, 5]],
    trendy: [[0, 3, 7], [5, 8, 12], [-2, 2, 5], [3, 7, 10]],
    humor: [[0, 4, 7], [5, 9, 12], [2, 5, 9], [7, 11, 14]],
    emotion: [[0, 4, 7, 12], [-4, 0, 3, 7], [-7, -3, 0, 4], [-5, -1, 2, 7]]
  };
  const ROOT = 45; // A2

  const TRACKS = {
    docu: {
      bpm: 78,
      play(step, t, bus) {
        const bar = Math.floor(step / 16), s = step % 16, ch = CHORDS.docu[bar % 4];
        if (s === 0) {
          ch.forEach((iv, i) => tone(bus, { t: t + i * 0.012, freq: mtof(ROOT + 12 + iv), dur: 3.4, gain: 0.035, attack: 0.5, type: 'sine' }));
          tone(bus, { t, freq: mtof(ROOT + ch[0]), dur: 2.4, gain: 0.06, attack: 0.02, type: 'sine' });
          noise(bus, { t, dur: 2.5, freq: 500, to: 3000, gain: 0.008, q: .6 });
        }
        const arp = [0, 2, 1, 3, 2, 1, 3, 0];
        if ([0, 3, 6, 10, 12, 14].includes(s)) {
          const iv = ch[arp[(step / 1) % arp.length] % ch.length];
          tone(bus, { t, freq: mtof(ROOT + 24 + iv), dur: 1.1, gain: 0.05, attack: 0.004, type: 'triangle', filter: { freq: 2600 } });
        }
        if (s % 4 === 2) noise(bus, { t, dur: 0.09, freq: 6400, gain: 0.012, q: 2 });
      }
    },
    tension: {
      bpm: 92,
      play(step, t, bus) {
        const bar = Math.floor(step / 16), s = step % 16, ch = CHORDS.tension[bar % 4];
        if (s === 0 || s === 8) {
          const f = s === 0 ? ROOT : ROOT + 12 + ch[2];
          tone(bus, { t, freq: mtof(f), dur: 2.0, gain: 0.075, attack: 0.02, type: 'sawtooth', filter: { freq: 240, q: 3 } });
          if (s === 0) tone(bus, { t, freq: mtof(ROOT + ch[0] + 12), dur: 3.6, gain: 0.03, attack: 0.6, type: 'sine' });
        }
        // pulsing 8th
        if (s % 2 === 0) {
          tone(bus, { t, freq: mtof(ROOT + ch[1] + 12), dur: 0.16, gain: 0.035, type: 'square', filter: { freq: 900, to: 400, q: 2 } });
        }
        if (s === 0 || s === 6 || s === 10) noise(bus, { t, dur: 0.18, freq: 3000, gain: 0.02, q: 1.5 });
        if (s === 14) noise(bus, { t, dur: 0.7, freq: 900, to: 6000, gain: 0.022, q: .8 });
      }
    },
    trendy: {
      bpm: 112,
      play(step, t, bus) {
        const bar = Math.floor(step / 16), s = step % 16, ch = CHORDS.trendy[bar % 4];
        if (s % 4 === 0) tone(bus, { t, freq: 128, dur: 0.28, gain: 0.16, type: 'sine', glide: 42, attack: 0.003 });
        if (s === 4 || s === 12) noise(bus, { t, dur: 0.16, freq: 1800, gain: 0.09, q: 1.4 });
        if (s % 2 === 0) noise(bus, { t, dur: 0.05, freq: 7800, gain: 0.018, q: 2 });
        if (s === 0 || s === 3 || s === 8 || s === 11) {
          tone(bus, { t, freq: mtof(ROOT + ch[0] - 12), dur: 0.22, gain: 0.09, type: 'square', filter: { freq: 520, q: 2 } });
        }
        const arp = [0, 1, 2, 1];
        if ([0, 2, 5, 7, 10, 12, 14].includes(s)) {
          const iv = ch[arp[s % 4]];
          tone(bus, { t, freq: mtof(ROOT + 24 + iv), dur: 0.35, gain: 0.036, type: 'triangle', filter: { freq: 4200, q: 1 } });
        }
      }
    },
    humor: {
      bpm: 120,
      play(step, t, bus) {
        const bar = Math.floor(step / 16), s = step % 16, ch = CHORDS.humor[bar % 4];
        if (s === 0 || s === 8) {
          tone(bus, { t, freq: mtof(ROOT + ch[0] - 12), dur: 0.3, gain: 0.09, type: 'triangle', filter: { freq: 700 } });
        }
        if (s === 4 || s === 12) {
          noise(bus, { t, dur: 0.07, freq: 2600, gain: 0.07, q: 6 });
          tone(bus, { t, freq: mtof(ROOT + ch[2] + 12), dur: 0.12, gain: 0.05, type: 'triangle' });
        }
        if ([2, 6, 10, 14].includes(s)) {
          const iv = ch[(s / 4) % ch.length];
          tone(bus, { t, freq: mtof(ROOT + 12 + iv), dur: 0.14, gain: 0.055, type: 'sawtooth', filter: { freq: 1800, q: 1 } });
        }
        if (bar % 8 === 7 && s >= 12) {
          tone(bus, { t, freq: mtof(ROOT + 12 + ch[0] + (s - 12)), dur: 0.1, gain: 0.05, type: 'square', filter: { freq: 2000 } });
        }
      }
    },
    emotion: {
      bpm: 70,
      play(step, t, bus) {
        const bar = Math.floor(step / 16), s = step % 16, ch = CHORDS.emotion[bar % 4];
        if (s === 0) {
          ch.forEach((iv, i) => tone(bus, { t: t + i * 0.02, freq: mtof(ROOT + 12 + iv), dur: 3.9, gain: 0.028, attack: 0.9, type: 'sawtooth', filter: { freq: 900, q: .8 } }));
          tone(bus, { t, freq: mtof(ROOT + ch[0]), dur: 3.0, gain: 0.05, attack: 0.3, type: 'sine' });
        }
        if ([0, 6, 10, 14].includes(s)) {
          const iv = ch[(s / 2) % ch.length];
          tone(bus, { t, freq: mtof(ROOT + 36 + iv), dur: 1.8, gain: 0.033, attack: 0.003, type: 'sine' });
          tone(bus, { t, freq: mtof(ROOT + 48 + iv), dur: 1.2, gain: 0.012, attack: 0.003, type: 'sine' });
        }
        if (s === 8) noise(bus, { t, dur: 1.4, freq: 1200, to: 4000, gain: 0.01, q: .5 });
      }
    }
  };

  /* ── BGM engine ─────────────────────────────────────── */
  const E = A.engine = { timer: null, id: null, step: 0, next: 0, stepDur: 0.2, playing: false };
  function bgmTarget() {
    const v = A.bgmVolume;
    return A.ducked ? v * (1 - A.duckAmount) : v;
  }
  A.bgmGainTarget = bgmTarget;
  A.startBgm = function (id, fromT, volume) {
    if (!ensure()) return;
    A.stopBgm();
    if (!id || !TRACKS[id]) return;
    const tr = TRACKS[id];
    if (volume != null) A.bgmVolume = volume;
    A.bgmBus.gain.cancelScheduledValues(ctx.currentTime);
    A.bgmBus.gain.setTargetAtTime(bgmTarget(), ctx.currentTime, 0.05);
    E.stepDur = 60 / tr.bpm / 4;
    E.step = Math.max(0, Math.floor((fromT || 0) / E.stepDur));
    E.id = id;
    E.next = ctx.currentTime + 0.08;
    E.playing = true;
    E.timer = setInterval(tick, 25);
    tick();
  };

  function tick() {
    if (!E.playing || !ctx) return;
    const tr = TRACKS[E.id];
    if (!tr) return;
    const ahead = ctx.currentTime + 0.32;
    let guard = 0;
    while (E.next < ahead && guard++ < 96) {
      try { tr.play(E.step, E.next, A.bgmBus); } catch (e) {}
      E.step++; E.next += E.stepDur;
    }
  }
  A.stopBgm = function () {
    if (E.timer) clearInterval(E.timer);
    E.timer = null; E.id = null; E.playing = false;
  };
  A.setBgmVolume = function (v) {
    A.bgmVolume = v;
    if (A.bgmBus) A.bgmBus.gain.setTargetAtTime(bgmTarget(), ctx.currentTime, 0.08);
  };
  A.setDuckAmount = function (v) { A.duckAmount = v; };
  A.duck = function (on) {
    if (A.ducked === on) return;
    A.ducked = on;
    if (A.bgmBus) A.bgmBus.gain.setTargetAtTime(bgmTarget(), ctx.currentTime, 0.12);
  };
  A.setOrigVolume = function (v) {
    A.origGain = v;
    if (A.origBus) A.origBus.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
  };
  A.setVoiceVolume = function (v) { A.voiceVol = v; if (A.voiceBus) A.voiceBus.gain.setTargetAtTime(v, ctx.currentTime, 0.05); };

  /* ── SFX ────────────────────────────────────────────── */
  A.playSfx = function (id, when) {
    if (!id || !ensure()) return;
    const t = Math.max(ctx.currentTime + 0.01, when || 0);
    const bus = A.sfxBus;
    if (id === 'pop') {
      tone(bus, { t, freq: 780, glide: 320, dur: 0.12, gain: 0.16, type: 'sine', attack: 0.002 });
      noise(bus, { t, dur: 0.05, freq: 3000, gain: 0.05, q: 1 });
    } else if (id === 'whoosh') {
      noise(bus, { t, dur: 0.5, freq: 600, to: 5200, gain: 0.13, q: .7, attack: 0.04 });
      noise(bus, { t: t + 0.16, dur: 0.4, freq: 3000, to: 700, gain: 0.08, q: .7 });
    } else if (id === 'impact') {
      tone(bus, { t, freq: 96, glide: 44, dur: 0.5, gain: 0.3, type: 'sine', attack: 0.002 });
      noise(bus, { t, dur: 0.14, freq: 900, gain: 0.12, q: .6 });
      tone(bus, { t: t + 0.01, freq: 1560, dur: 0.28, gain: 0.05, type: 'triangle' });
    } else if (id === 'alert') {
      tone(bus, { t, freq: 880, dur: 0.16, gain: 0.1, type: 'sine' });
      tone(bus, { t: t + 0.17, freq: 1320, dur: 0.28, gain: 0.1, type: 'sine' });
    }
  };

  /* ── narration buffer ───────────────────────────────── */
  A.loadNarration = function (file) {
    return new Promise((resolve, reject) => {
      ensure();
      if (!ctx) return reject(new Error('오디오를 시작할 수 없습니다'));
      const fr = new FileReader();
      fr.onload = () => {
        ctx.decodeAudioData(fr.result.slice(0), buf => { A.narrationBuf = buf; resolve(buf); }, err => reject(err || new Error('오디오 해석 실패')));
      };
      fr.onerror = () => reject(new Error('파일을 읽지 못했습니다'));
      fr.readAsArrayBuffer(file);
    });
  };
  A.startNarration = function (fromT) {
    A.stopNarration();
    if (!A.narrationBuf || !ensure()) return;
    const src = ctx.createBufferSource();
    src.buffer = A.narrationBuf;
    src.connect(A.voiceBus);
    const off = Math.max(0, fromT || 0);
    if (off >= A.narrationBuf.duration) return;
    src.start(ctx.currentTime + 0.05, off);
    A.narrationSrc = src;
  };
  A.stopNarration = function () {
    if (A.narrationSrc) { try { A.narrationSrc.stop(); } catch (e) {} A.narrationSrc.disconnect(); A.narrationSrc = null; }
  };

  /* ── original video sound ───────────────────────────── */
  A.bindVideo = function (videoEl) {
    if (!videoEl || videoEl._rsBound) return;
    try {
      if (!ensure()) return;
      const src = ctx.createMediaElementSource(videoEl);
      src.connect(A.origBus);
      videoEl._rsBound = true;
      videoEl.muted = false;
    } catch (e) { /* 이미 연결됐거나 미지원 */ }
  };

  /* ── TTS ────────────────────────────────────────────── */
  const synth = window.speechSynthesis;
  A.voices = function () {
    if (!synth) return [];
    let list = synth.getVoices() || [];
    const ko = list.filter(v => /^ko/i.test(v.lang));
    return ko.length ? ko : list;
  };
  A.speak = function (text, opts) {
    if (!synth || !text) return;
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(String(text));
      const rate = opts && opts.rate ? opts.rate : 1.05;
      u.rate = Math.max(0.5, Math.min(2, rate));
      u.pitch = 1;
      u.volume = 1;
      const uri = opts && opts.uri;
      const list = A.voices();
      const v = list.find(x => x.voiceURI === uri) || list.find(x => /^ko/i.test(x.lang));
      if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = 'ko-KR'; }
      if (opts && opts.onend) u.onend = opts.onend;
      synth.speak(u);
      return u;
    } catch (e) {}
  };
  A.stopSpeak = function () { try { synth && synth.cancel(); } catch (e) {} };

  /* ── recording mix ──────────────────────────────────── */
  A.recordStream = function () {
    if (!ensure()) return null;
    if (!A.recDest) {
      A.recDest = ctx.createMediaStreamDestination();
      A.master.connect(A.recDest);
    }
    return A.recDest.stream;
  };

  A.stopAll = function () {
    A.stopBgm(); A.stopNarration(); A.stopSpeak();
  };

  // iOS unlock: create context on first gesture
  ['pointerdown', 'touchstart', 'keydown'].forEach(ev => {
    window.addEventListener(ev, function once() {
      if (!A.unlocked) { A.unlocked = true; A.resume(); }
    }, { passive: true });
  });
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => { if (RS.fillVoices) RS.fillVoices(); };
  }
})();
