// Procedural audio: every sound effect, the music and the ambience beds are
// synthesised with WebAudio, so the game ships no audio files and every sound
// hook has a name. To use recorded audio later, register a sample for a name
// with `audio.register(name, url)`; samples take priority over synthesis.

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI -> Hz
const PENTA = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96]; // C5 pentatonic up to C7

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = { sfx: true, music: true };
    this.samples = new Map();
    this.pendingSamples = new Map();
    this.musicState = null;
    this.ambience = null;
    this.lastPlayed = new Map();
    this._out = null;
    this._pitch = 1;
  }

  /** Must be called from a user gesture on iOS. Safe to call repeatedly. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));
      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.2;
      this.master.connect(comp).connect(ctx.destination);
      this.sfxBus = this._bus(0.8);
      this.musicBus = this._bus(0.3);
      this.ambBus = this._bus(0.35);
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this._impulse(2.2, 2.5);
      this.reverbSend = ctx.createGain();
      this.reverbSend.gain.value = 0.35;
      this.reverbSend.connect(this.reverb).connect(this.master);
      this.noiseBuf = this._noise(2);
      this.brownBuf = this._noise(4, 'brown');
      for (const [name, url] of this.pendingSamples) this._loadSample(name, url);
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); // 'suspended', or iOS's 'interrupted' after a call
    // iOS: play a silent buffer inside the gesture
    const b = this.ctx.createBufferSource();
    b.buffer = this.ctx.createBuffer(1, 1, 22050);
    b.connect(this.ctx.destination);
    b.start(0);
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  setEnabled(kind, on) {
    this.enabled[kind] = on;
    if (!this.ctx) return;
    if (kind === 'music') this.musicBus.gain.setTargetAtTime(on ? 0.3 : 0, this.now, 0.2);
    if (kind === 'sfx') {
      this.sfxBus.gain.setTargetAtTime(on ? 0.8 : 0, this.now, 0.05);
      this.ambBus.gain.setTargetAtTime(on ? 0.35 : 0, this.now, 0.2);
    }
  }

  register(name, url) {
    this.pendingSamples.set(name, url);
    if (this.ctx) this._loadSample(name, url);
  }

  async _loadSample(name, url) {
    try {
      const buf = await (await fetch(url)).arrayBuffer();
      this.samples.set(name, await this.ctx.decodeAudioData(buf));
    } catch { /* fall back to synthesis */ }
  }

  // ------------------------------------------------------------ building ---
  _bus(v) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    g.connect(this.master);
    return g;
  }

  _noise(seconds, kind = 'white') {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return buf;
  }

  _impulse(seconds, decay) {
    const rate = this.ctx.sampleRate, len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  /** Oscillator note with an attack/decay envelope. */
  tone(freq, dur, o = {}) {
    const ctx = this.ctx;
    const t = (o.when ?? ctx.currentTime) + (o.delay || 0);
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    const p = o.bus ? 1 : this._pitch; // music and ambience keep their tuning
    freq *= p;
    osc.frequency.setValueAtTime(freq, t);
    if (o.glide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.glide * p), t + (o.glideTime ?? dur));
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    const peak = o.gain ?? 0.3;
    const a = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (o.vibrato) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = o.vibrato[0];
      lg.gain.value = o.vibrato[1];
      lfo.connect(lg).connect(osc.frequency);
      lfo.start(t); lfo.stop(t + dur + 0.05);
    }
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter.type || 'lowpass';
      f.frequency.setValueAtTime(o.filter.freq, t);
      if (o.filter.to) f.frequency.exponentialRampToValueAtTime(o.filter.to, t + dur);
      f.Q.value = o.filter.q ?? 0.7;
      node.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(o.bus || this._out || this.sfxBus);
    if (o.reverb) {
      const s = ctx.createGain();
      s.gain.value = o.reverb;
      g.connect(s).connect(this.reverbSend);
    }
    osc.start(t);
    osc.stop(t + dur + 0.05);
    return osc;
  }

  /** Filtered noise burst. */
  noise(dur, o = {}) {
    const ctx = this.ctx;
    const t = (o.when ?? ctx.currentTime) + (o.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = o.brown ? this.brownBuf : this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass';
    const p = o.bus ? 1 : this._pitch;
    f.frequency.setValueAtTime((o.freq || 1000) * p, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to * p, t + dur);
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    const peak = o.gain ?? 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (o.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(o.bus || this._out || this.sfxBus);
    if (o.reverb) {
      const s = ctx.createGain();
      s.gain.value = o.reverb;
      g.connect(s).connect(this.reverbSend);
    }
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  // ---------------------------------------------------------------- sfx ----
  play(name, opts = {}) {
    if (!this.ctx || !this.enabled.sfx) return;
    // de-duplicate identical sounds fired in the same instant
    const last = this.lastPlayed.get(name) || 0;
    if (this.now - last < 0.025 && !opts.force) return;
    this.lastPlayed.set(name, this.now);
    const sample = this.samples.get(name);
    if (sample) {
      const s = this.ctx.createBufferSource();
      s.buffer = sample;
      const g = this.ctx.createGain();
      g.gain.value = opts.gain ?? 1;
      s.connect(g).connect(this.sfxBus);
      s.start();
      return;
    }
    const fn = SFX[name] || SFX[name.split('.')[0]];
    if (!fn) return;
    // each sound gets its own level from the mix table, and repeated sounds
    // (every fix, every tap) vary a little in pitch so they never sound canned
    const out = this.ctx.createGain();
    out.gain.value = (MIX[name] ?? 1) * (opts.gain ?? 1);
    out.connect(this.sfxBus);
    const vary = opts.vary ?? (VARY.has(name) || name.startsWith('fix.') ? 0.05 : 0);
    this._out = out;
    this._pitch = vary ? Math.pow(2, ((Math.random() * 2 - 1) * vary * 12) / 12) : 1;
    try { fn(this, opts); } finally { this._out = null; this._pitch = 1; }
  }

  // -------------------------------------------------------------- music ----
  startMusic(mood = 'map') {
    if (!this.ctx) return;
    if (this.musicState?.mood === mood) return;
    this.stopMusic();
    const state = (this.musicState = { mood, bar: 0, beat: 0, next: this.now + 0.3, seed: Math.floor(Math.random() * 1e6), stopped: false });
    const tempo = mood === 'play' ? 100 : 88;
    const spb = 60 / tempo;
    // I vi IV V I IV ii V  (F major), as MIDI roots
    const prog = [[53, 'M'], [50, 'm'], [58, 'M'], [48, 'M'], [53, 'M'], [58, 'M'], [55, 'm'], [48, 'M7']];
    const chordTones = (root, q) => [root, root + (q === 'm' ? 3 : 4), root + 7, ...(q === 'M7' ? [root + 10] : [])];
    let rngS = state.seed;
    const rnd = () => ((rngS = (rngS * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const motifs = [];
    for (let m = 0; m < 4; m++) {
      const pat = [];
      for (let b = 0; b < 3; b++) pat.push(rnd() < 0.35 ? [0.5, 0.5] : [1]);
      motifs.push({ pat, steps: [rnd(), rnd(), rnd(), rnd(), rnd(), rnd()] });
    }
    const tick = () => {
      if (state.stopped) return;
      while (state.next < this.now + 0.15) {
        const t = state.next;
        const [root, q] = prog[state.bar % prog.length];
        const tones = chordTones(root, q);
        const beat = state.beat;
        // oom-pah-pah waltz accompaniment
        if (beat === 0) {
          this.tone(NOTE(root - 12), spb * 1.6, { when: t, type: 'triangle', gain: 0.22, attack: 0.01, bus: this.musicBus, filter: { freq: 900 } });
          // the same note an octave up, so phone speakers carry the bass line
          this.tone(NOTE(root), spb * 1.2, { when: t, type: 'triangle', gain: 0.07, attack: 0.01, bus: this.musicBus, filter: { freq: 1400 } });
        }
        else if (mood !== 'quiet') {
          for (const n of tones.slice(1, 3)) this.tone(NOTE(n), spb * 0.5, { when: t, type: 'triangle', gain: 0.05, attack: 0.008, bus: this.musicBus, filter: { freq: 2200 } });
        }
        // music-box melody
        const motif = motifs[(Math.floor(state.bar / 2) + (state.bar % 2)) % motifs.length];
        const division = motif.pat[beat];
        const melodyOn = mood === 'map' || (mood === 'play' && state.bar % 4 < 2) || mood === 'fanfare';
        if (melodyOn) {
          division.forEach((d, i) => {
            const k = motif.steps[(beat * 2 + i) % motif.steps.length];
            if (k < 0.12) return; // rests make it breathe
            const pool = [...tones.map((x) => x + 12), ...tones.map((x) => x + 24)].filter((x) => x >= 72 && x <= 91);
            const n = pool[Math.floor(k * pool.length) % pool.length];
            const when = t + i * d * spb;
            this.tone(NOTE(n), 0.9, { when, type: 'sine', gain: 0.1, attack: 0.004, bus: this.musicBus, reverb: 0.5 });
            this.tone(NOTE(n) * 4.01, 0.25, { when, type: 'sine', gain: 0.018, attack: 0.002, bus: this.musicBus });
          });
        }
        state.beat = (beat + 1) % 3;
        if (state.beat === 0) {
          state.bar++;
          if (state.bar % 16 === 0) motifs.push(motifs.shift());
        }
        state.next += spb;
      }
      state.timer = setTimeout(tick, 40);
    };
    tick();
  }

  stopMusic() {
    if (this.musicState) {
      this.musicState.stopped = true;
      clearTimeout(this.musicState.timer);
      this.musicState = null;
    }
  }

  /** Short celebratory jingle over the music. */
  jingle() {
    if (!this.ctx || !this.enabled.music) return;
    const t = this.now + 0.05;
    [65, 69, 72, 77].forEach((n, i) => this.tone(NOTE(n), 0.6, { when: t + i * 0.11, type: 'triangle', gain: 0.14, bus: this.musicBus, reverb: 0.4 }));
    [77, 81, 84].forEach((n) => this.tone(NOTE(n), 1.4, { when: t + 0.5, type: 'sine', gain: 0.07, bus: this.musicBus, reverb: 0.6, attack: 0.02 }));
  }

  // ----------------------------------------------------------- ambience ----
  startAmbience(kinds = []) {
    this.stopAmbience();
    if (!this.ctx) return;
    const amb = (this.ambience = { nodes: [], timers: [], stopped: false });
    const loopNoise = (o) => {
      const src = this.ctx.createBufferSource();
      src.buffer = o.brown ? this.brownBuf : this.noiseBuf;
      src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = o.type; f.frequency.value = o.freq; f.Q.value = o.q ?? 0.7;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(o.gain, this.now, 1.2);
      const lfo = this.ctx.createOscillator();
      const lg = this.ctx.createGain();
      lfo.frequency.value = o.lfo ?? 0.1; lg.gain.value = o.gain * 0.5;
      lfo.connect(lg).connect(g.gain);
      src.connect(f).connect(g).connect(this.ambBus);
      src.start(); lfo.start();
      amb.nodes.push(src, lfo, g);
    };
    const every = (min, max, fn) => {
      const go = () => {
        if (amb.stopped) return;
        fn();
        amb.timers.push(setTimeout(go, (min + Math.random() * (max - min)) * 1000));
      };
      amb.timers.push(setTimeout(go, Math.random() * max * 1000));
    };
    const has = (k) => kinds.includes(k);
    if (has('breeze') || has('storm')) loopNoise({ type: 'lowpass', freq: has('storm') ? 700 : 450, gain: has('storm') ? 0.1 : 0.05, lfo: 0.07 });
    if (has('river') || has('mill')) loopNoise({ type: 'bandpass', freq: 900, q: 0.5, gain: 0.06, brown: true, lfo: 0.3 });
    if (has('river') || has('mill')) loopNoise({ type: 'highpass', freq: 3000, gain: 0.012, lfo: 0.9 });
    if (has('birds')) every(1.2, 4.5, () => this._chirp());
    if (has('ducks')) every(6, 14, () => this._quack());
    if (has('bees')) every(3, 7, () => this.tone(210 + Math.random() * 40, 1.6, { type: 'sawtooth', gain: 0.012, attack: 0.5, vibrato: [22, 6], bus: this.ambBus, filter: { freq: 700 } }));
    if (has('crickets')) every(0.8, 1.8, () => { for (let i = 0; i < 4; i++) this.tone(4400 + Math.random() * 300, 0.05, { delay: i * 0.07, gain: 0.012, bus: this.ambBus }); });
    if (has('drips')) every(0.6, 2.2, () => this.tone(1400 + Math.random() * 900, 0.12, { type: 'sine', glide: 700, glideTime: 0.1, gain: 0.03, bus: this.ambBus, reverb: 0.3 }));
    if (has('bells')) every(18, 34, () => this._bell(NOTE(62 + [0, 2, 4, 7][Math.floor(Math.random() * 4)]), 0.04));
    if (has('pub')) every(10, 20, () => this.noise(0.4, { type: 'bandpass', freq: 500, q: 1.5, gain: 0.015, bus: this.ambBus }));
  }

  stopAmbience() {
    if (!this.ambience) return;
    this.ambience.stopped = true;
    this.ambience.timers.forEach(clearTimeout);
    for (const n of this.ambience.nodes) {
      try { if (n.gain) n.gain.setTargetAtTime(0, this.now, 0.3); else n.stop(this.now + 1); } catch { /* ignore */ }
    }
    this.ambience = null;
  }

  _chirp() {
    const base = 2600 + Math.random() * 2000;
    const n = 1 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      this.tone(base * (0.9 + Math.random() * 0.25), 0.07 + Math.random() * 0.05, {
        delay: i * (0.09 + Math.random() * 0.05), type: 'sine', glide: base * (1.2 + Math.random() * 0.4), glideTime: 0.06,
        gain: 0.018 + Math.random() * 0.015, bus: this.ambBus, reverb: 0.2,
      });
    }
  }

  _quack() {
    for (let i = 0; i < 2; i++) {
      this.tone(420, 0.14, { delay: i * 0.18, type: 'sawtooth', glide: 300, gain: 0.03, bus: this.ambBus, filter: { type: 'bandpass', freq: 1100, q: 4 } });
    }
  }

  _bell(f, gain = 0.1) {
    [0.5, 1, 1.19, 1.5, 2, 2.52, 3].forEach((p, i) => this.tone(f * p, 2.8 - i * 0.25, { type: 'sine', gain: gain / (i + 1), attack: 0.003, bus: this.ambBus, reverb: 0.4 }));
  }
}

// ------------------------------------------------------------ sound book ----
const SFX = {
  // a fingertip on card: a soft papery tick with a little wooden body
  'ui.tap': (a) => { a.noise(0.035, { freq: 2400, q: 1.4, gain: 0.2 }); a.tone(1300, 0.06, { type: 'triangle', glide: 880, glideTime: 0.05, gain: 0.12 }); },
  'ui.open': (a) => a.noise(0.26, { freq: 700, to: 2600, q: 1.2, gain: 0.12, attack: 0.03 }),
  'ui.close': (a) => a.noise(0.2, { freq: 2400, to: 700, q: 1.2, gain: 0.1, attack: 0.02 }),
  'ui.toggle': (a) => { a.tone(1200, 0.05, { type: 'square', gain: 0.04, filter: { freq: 3000 } }); },
  page: (a) => { a.noise(0.18, { freq: 1500, to: 3500, q: 0.8, gain: 0.1, attack: 0.02 }); a.noise(0.12, { delay: 0.1, freq: 3000, to: 1500, q: 0.8, gain: 0.06 }); },

  'fix.pop': (a) => {
    a.tone(320, 0.09, { glide: 980, glideTime: 0.06, gain: 0.3, type: 'sine' });
    [2093, 2637, 3136].forEach((f, i) => a.tone(f, 0.25, { delay: 0.05 + i * 0.035, gain: 0.06, reverb: 0.5 }));
  },
  'fix.pluck': (a) => {
    a.noise(0.09, { type: 'highpass', freq: 1800, gain: 0.18 });
    a.tone(140, 0.12, { glide: 70, gain: 0.3, delay: 0.03 });
    a.tone(660, 0.08, { glide: 1300, delay: 0.08, gain: 0.12 });
  },
  'fix.swing': (a) => {
    a.tone(170, 0.28, { type: 'sawtooth', gain: 0.05, vibrato: [18, 25], filter: { freq: 900 } });
    a.tone(1250, 0.03, { type: 'square', gain: 0.07, delay: 0.3, filter: { freq: 4000 } });
    a.tone(1870, 0.25, { delay: 0.32, gain: 0.05, reverb: 0.4 });
  },
  'fix.thunk': (a) => {
    a.tone(110, 0.18, { glide: 55, gain: 0.45 });
    a.noise(0.1, { type: 'lowpass', freq: 500, gain: 0.25 });
    a.tone(1570, 0.2, { delay: 0.12, gain: 0.04, reverb: 0.4 });
  },
  'fix.paint': (a) => {
    a.noise(0.38, { freq: 1100, to: 3200, q: 1.4, gain: 0.16, attack: 0.04 });
    a.tone(1318, 0.5, { type: 'triangle', delay: 0.3, gain: 0.08, reverb: 0.5 });
    a.tone(1976, 0.5, { type: 'triangle', delay: 0.36, gain: 0.05, reverb: 0.5 });
  },
  'fix.squeak': (a) => {
    a.tone(1650, 0.09, { glide: 2150, gain: 0.07, vibrato: [30, 60] });
    a.tone(1800, 0.09, { delay: 0.14, glide: 2300, gain: 0.06, vibrato: [30, 60] });
    a.tone(4186, 0.4, { delay: 0.3, gain: 0.04, reverb: 0.7 });
    a.tone(5274, 0.35, { delay: 0.36, gain: 0.03, reverb: 0.7 });
  },
  'fix.bloom': (a) => {
    [72, 76, 79, 84, 88].forEach((n, i) => a.tone(NOTE(n), 0.6, { type: 'triangle', delay: i * 0.045, gain: 0.08, reverb: 0.6 }));
  },
  'fix.lamp': (a) => {
    a.noise(0.2, { type: 'lowpass', freq: 250, to: 1400, gain: 0.25, attack: 0.02 });
    a.tone(220, 0.7, { gain: 0.08, attack: 0.08 });
    a.tone(330, 0.7, { gain: 0.05, attack: 0.1 });
    a.tone(2637, 0.3, { delay: 0.12, gain: 0.03, reverb: 0.6 });
  },
  'fix.sweep': (a) => { a.noise(0.32, { freq: 3200, to: 700, q: 0.9, gain: 0.14, attack: 0.03 }); a.tone(2093, 0.3, { delay: 0.25, gain: 0.04, reverb: 0.6 }); },
  'fix.flap': (a) => {
    for (let i = 0; i < 5; i++) a.noise(0.05, { delay: i * 0.065, freq: 800 + i * 60, q: 1.2, gain: 0.16 - i * 0.02 });
    a.tone(520, 0.2, { delay: 0.05, glide: 420, gain: 0.05, vibrato: [14, 20] });
  },
  combo: (a, o) => {
    const n = Math.min(PENTA.length - 1, Math.max(0, (o.step || 1) - 1));
    a.tone(NOTE(PENTA[n]), 0.45, { type: 'triangle', gain: 0.1, reverb: 0.5 });
    a.tone(NOTE(PENTA[n] + 12), 0.3, { type: 'sine', gain: 0.04, reverb: 0.5 });
  },
  callout: (a) => {
    [72, 76, 79].forEach((n, i) => a.tone(NOTE(n), 0.5, { type: 'triangle', delay: i * 0.06, gain: 0.08, reverb: 0.5 }));
    a.tone(NOTE(84), 0.9, { type: 'sine', delay: 0.18, gain: 0.08, reverb: 0.7 });
  },
  miss: (a) => { a.tone(190, 0.08, { glide: 120, gain: 0.18 }); a.noise(0.05, { type: 'lowpass', freq: 400, gain: 0.08 }); },
  cat: (a) => {
    const t = a.now;
    a.tone(560, 0.5, { when: t, type: 'sawtooth', glide: 820, glideTime: 0.18, gain: 0.08, attack: 0.04, filter: { type: 'bandpass', freq: 1200, to: 900, q: 3 } });
    a.tone(820, 0.3, { when: t + 0.2, type: 'sawtooth', glide: 480, glideTime: 0.28, gain: 0.06, filter: { type: 'bandpass', freq: 1000, q: 3 } });
  },
  shutter: (a) => {
    a.noise(0.012, { type: 'highpass', freq: 4500, gain: 0.35 });
    a.tone(900, 0.02, { type: 'square', gain: 0.06, filter: { freq: 3000 } });
    a.noise(0.03, { delay: 0.075, freq: 1700, q: 2, gain: 0.3 });
    a.tone(140, 0.07, { delay: 0.075, glide: 90, gain: 0.25 });
  },
  flash: (a) => {
    a.tone(1800, 0.35, { glide: 6500, glideTime: 0.34, gain: 0.025 });
    a.noise(0.18, { delay: 0.34, type: 'highpass', freq: 2500, gain: 0.25 });
  },
  print: (a) => {
    a.tone(92, 1.1, { type: 'sawtooth', gain: 0.05, vibrato: [22, 8], filter: { freq: 600 }, attack: 0.05 });
    for (let i = 0; i < 6; i++) a.tone(2400, 0.015, { delay: 0.1 + i * 0.16, type: 'square', gain: 0.025, filter: { freq: 5000 } });
  },
  // a rubber stamp: the thump, plus a mid knock and a paper slap that phone speakers can actually play
  stamp: (a) => {
    a.tone(120, 0.16, { glide: 60, gain: 0.45 });
    a.tone(420, 0.09, { type: 'triangle', glide: 210, gain: 0.3 });
    a.noise(0.05, { freq: 1900, q: 0.9, gain: 0.3 });
    a.noise(0.08, { type: 'lowpass', freq: 900, gain: 0.3 });
  },
  coin: (a) => {
    a.tone(1318, 0.07, { type: 'square', gain: 0.05, filter: { freq: 4000 } });
    a.tone(1976, 0.18, { delay: 0.07, type: 'square', gain: 0.05, filter: { freq: 4000 }, reverb: 0.3 });
  },
  tick: (a) => a.tone(2100, 0.015, { type: 'square', gain: 0.025, filter: { freq: 5000 } }),
  xp: (a, o) => a.tone(600 + (o.k || 0) * 900, 0.05, { type: 'triangle', gain: 0.04 }),
  levelup: (a) => {
    [60, 64, 67, 72].forEach((n, i) => a.tone(NOTE(n + 12), 0.4, { type: 'triangle', delay: i * 0.09, gain: 0.11, reverb: 0.4 }));
    [72, 76, 79].forEach((n) => a.tone(NOTE(n + 12), 1.4, { type: 'sine', delay: 0.38, gain: 0.06, reverb: 0.7, attack: 0.02 }));
  },
  rosette: (a) => {
    [67, 71, 74].forEach((n) => a.tone(NOTE(n), 0.9, { type: 'sawtooth', gain: 0.035, attack: 0.08, filter: { freq: 1800 }, reverb: 0.4 }));
    a._bell(NOTE(79), 0.08);
  },
  unlock: (a) => { for (let i = 0; i < 10; i++) a.tone(NOTE(PENTA[i]), 0.5, { delay: i * 0.035, gain: 0.05, reverb: 0.6 }); },
  restore: (a) => {
    for (let i = 0; i < 11; i++) a.tone(NOTE(PENTA[i]), 0.7, { delay: i * 0.05, gain: 0.05, reverb: 0.7, type: 'triangle' });
    [65, 69, 72].forEach((n) => a.tone(NOTE(n), 1.8, { delay: 0.1, gain: 0.05, attack: 0.3, reverb: 0.6 }));
  },
  collect: (a) => {
    [84, 88, 91, 96].forEach((n, i) => a.tone(NOTE(n), 0.35, { delay: i * 0.05, gain: 0.07, reverb: 0.6 }));
    a.tone(300, 0.08, { glide: 900, gain: 0.15 });
  },
  whistle: (a) => {
    a.tone(700, 1.3, { type: 'sawtooth', gain: 0.05, attack: 0.08, filter: { freq: 1600 }, vibrato: [5, 6] });
    a.tone(880, 1.3, { type: 'sawtooth', gain: 0.04, attack: 0.08, filter: { freq: 1800 }, vibrato: [5, 6] });
    a.noise(1.3, { freq: 2500, q: 0.6, gain: 0.05, attack: 0.1 });
  },
  bell: (a) => a._bell(NOTE(64), 0.12),
  hint: (a) => { a.tone(1568, 0.3, { gain: 0.06, reverb: 0.6 }); a.tone(2349, 0.4, { delay: 0.08, gain: 0.05, reverb: 0.6 }); },
  nudge: (a) => a.tone(3136, 0.3, { gain: 0.02, reverb: 0.7 }),
  // the last fix: a warm rising run, a bell and a shimmer, before the shutter
  complete: (a) => {
    [60, 64, 67, 72, 76, 79].forEach((n, i) => a.tone(NOTE(n + 12), 0.9 - i * 0.06, { type: 'triangle', delay: i * 0.055, gain: 0.09, reverb: 0.5 }));
    a._bell(NOTE(84), 0.08);
    a.noise(0.9, { type: 'highpass', freq: 6000, gain: 0.03, attack: 0.25, reverb: 0.5 });
  },
  // a found thing tucked into its slot in the bar, pitched by how many of that job are done
  arrive: (a, o) => {
    const n = NOTE(PENTA[Math.min(PENTA.length - 1, (o.step || 1) + 1)]);
    a.noise(0.04, { freq: 3000, q: 1.2, gain: 0.12 });
    a.tone(n, 0.22, { type: 'triangle', gain: 0.1, reverb: 0.3 });
  },
  whoosh: (a) => a.noise(0.28, { freq: 900, to: 2600, q: 0.8, gain: 0.07, attack: 0.08 }),
};

// Mix: each sound's level relative to its synthesis, balanced by rendering every
// sound offline and matching loudness targets (node tools/qa/shots.mjs mix).
const MIX = {
  'fix.pop': 2.29,
  'fix.pluck': 1.62,
  'fix.swing': 3.24,
  'fix.thunk': 1.64,
  'fix.paint': 1.88,
  'fix.squeak': 3.16,
  'fix.bloom': 1.32,
  'fix.lamp': 1.45,
  'fix.sweep': 4.22,
  'fix.flap': 5.31,
  'combo': 3.13,
  'callout': 1.53,
  'miss': 2,
  'cat': 8.22,
  'shutter': 1.74,
  'flash': 1.08,
  'print': 1.7,
  'stamp': 1.48,
  'coin': 2.43,
  'levelup': 1.24,
  'rosette': 2.3,
  'unlock': 1.51,
  'restore': 1.08,
  'collect': 1.68,
  'whistle': 1.36,
  'hint': 2.11,
  'nudge': 3.09,
  'ui.tap': 6.24,
  'ui.open': 3.47,
  'ui.close': 3.13,
  'page': 3.24,
  'complete': 1.27,
  'arrive': 3.27,
  'whoosh': 2.75,
  'tick': 5.89,
};
// sounds that vary slightly in pitch each time (all fix.* sounds do too)
const VARY = new Set(['ui.tap', 'miss', 'stamp', 'arrive', 'coin', 'tick', 'page', 'whoosh']);

export const audio = new AudioEngine();
