/**
 * Tiny procedural sound kit: soft plucks, bells and filtered noise through a warm reverb,
 * plus a gentle pentatonic garden loop. No audio files needed.
 */

type Wave = OscillatorType;

const PENTA = [0, 2, 4, 7, 9];
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

class AudioKit {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private verb!: ConvolverNode;
  private verbSend!: GainNode;
  private noise!: AudioBuffer;
  private musicOn = false;
  private nextBeat = 0;
  private beat = 0;
  private timer: number | null = null;
  private chord = 0;
  sfxVol = 0.9;
  musicVol = 0.55;
  private last = new Map<string, number>();

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxVol;
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVol * 0.5;
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);

    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(2.2);
    this.verbSend = ctx.createGain();
    this.verbSend.gain.value = 0.28;
    this.verbSend.connect(this.verb).connect(this.master);

    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
    if (this.musicOn) this.startLoop();
  }

  private impulse(sec: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return b;
  }

  setSfx(v: number) {
    this.sfxVol = v;
    if (this.ctx) this.sfxBus.gain.value = v;
  }

  setMusic(v: number) {
    this.musicVol = v;
    if (this.ctx) this.musicBus.gain.setTargetAtTime(v * 0.5, this.ctx.currentTime, 0.2);
  }

  /** throttle identical sounds so swipes don't machine-gun */
  private gate(key: string, gap: number) {
    const now = performance.now();
    const l = this.last.get(key) ?? 0;
    if (now - l < gap * 1000) return false;
    this.last.set(key, now);
    return true;
  }

  private tone(freq: number, o: { at?: number; dur?: number; wave?: Wave; vol?: number; attack?: number; slide?: number; verb?: number; bus?: GainNode; detune?: number; filter?: number }) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + (o.at ?? 0);
    const dur = o.dur ?? 0.25;
    const osc = ctx.createOscillator();
    osc.type = o.wave ?? 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * o.slide), t0 + dur);
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    const v = o.vol ?? 0.2;
    const a = o.attack ?? 0.006;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node: AudioNode = osc;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.filter;
      osc.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(o.bus ?? this.sfxBus);
    if (o.verb) {
      const s = ctx.createGain();
      s.gain.value = o.verb;
      g.connect(s).connect(this.verbSend);
    }
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private hiss(o: { at?: number; dur?: number; vol?: number; freq?: number; q?: number; type?: BiquadFilterType; sweep?: number; verb?: number }) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + (o.at ?? 0);
    const dur = o.dur ?? 0.2;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(o.freq ?? 1200, t0);
    if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, t0 + dur);
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.vol ?? 0.2, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    if (o.verb) {
      const s = this.ctx!.createGain();
      s.gain.value = o.verb;
      g.connect(s).connect(this.verbSend);
    }
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.05);
  }

  private pluck(n: number, at = 0, vol = 0.18, dur = 0.35, verb = 0.5) {
    const f = midi(n);
    this.tone(f, { at, dur, wave: 'triangle', vol, verb });
    this.tone(f * 2, { at, dur: dur * 0.5, wave: 'sine', vol: vol * 0.35, verb });
  }

  private bell(n: number, at = 0, vol = 0.14, dur = 0.8) {
    const f = midi(n);
    this.tone(f, { at, dur, wave: 'sine', vol, verb: 0.8 });
    this.tone(f * 2.76, { at, dur: dur * 0.4, wave: 'sine', vol: vol * 0.3, verb: 0.8 });
    this.tone(f * 5.4, { at, dur: dur * 0.2, wave: 'sine', vol: vol * 0.12, verb: 0.8 });
  }

  // ───────────────────── sfx ─────────────────────

  ui() {
    if (!this.gate('ui', 0.03)) return;
    this.tone(880, { dur: 0.08, wave: 'sine', vol: 0.12, slide: 1.5 });
  }
  select() {
    this.pluck(76, 0, 0.12, 0.18, 0.2);
  }
  plant() {
    this.hiss({ dur: 0.16, vol: 0.25, freq: 500, type: 'lowpass', sweep: 200 });
    this.tone(160, { dur: 0.15, wave: 'sine', vol: 0.3, slide: 0.5 });
    this.pluck(72, 0.08, 0.12, 0.2);
    this.pluck(79, 0.14, 0.1, 0.25);
  }
  water() {
    this.hiss({ dur: 0.55, vol: 0.12, freq: 2400, q: 0.7, sweep: 900, verb: 0.3 });
    for (let i = 0; i < 4; i++) this.tone(900 + Math.random() * 900, { at: 0.08 + i * 0.09, dur: 0.07, vol: 0.06, slide: 1.8 });
  }
  pop() {
    if (!this.gate('pop', 0.04)) return;
    this.tone(320, { dur: 0.14, wave: 'sine', vol: 0.25, slide: 2.6 });
    this.hiss({ dur: 0.05, vol: 0.08, freq: 3000 });
  }
  ripe() {
    if (!this.gate('ripe', 0.12)) return;
    this.bell(96, 0, 0.04, 0.3);
  }
  catchV(chain: number, perfect: boolean, golden: boolean) {
    if (!this.gate('catch', 0.025)) return;
    const step = Math.min(chain, 8);
    const n = 72 + PENTA[step % 5] + 12 * Math.floor(step / 5);
    this.pluck(n, 0, 0.17, 0.3, 0.4);
    this.tone(midi(n + 12), { at: 0.04, dur: 0.12, vol: 0.06, wave: 'sine' });
    if (perfect) {
      this.bell(n + 12, 0.05, 0.07, 0.5);
      this.bell(n + 19, 0.1, 0.05, 0.5);
    }
    if (golden) for (let i = 0; i < 5; i++) this.bell(84 + PENTA[i], 0.05 + i * 0.05, 0.06, 0.6);
  }
  coin() {
    if (!this.gate('coin', 0.05)) return;
    this.tone(1318, { dur: 0.09, wave: 'square', vol: 0.03, filter: 3500 });
    this.tone(1760, { at: 0.07, dur: 0.22, wave: 'square', vol: 0.03, filter: 3500, verb: 0.3 });
  }
  miss() {
    this.tone(330, { dur: 0.3, wave: 'triangle', vol: 0.12, slide: 0.55 });
    this.hiss({ dur: 0.25, vol: 0.05, freq: 800, sweep: 300 });
  }
  hit() {
    if (!this.gate('hit', 0.04)) return;
    this.hiss({ dur: 0.09, vol: 0.3, freq: 1800, q: 0.8 });
    this.tone(220, { dur: 0.1, wave: 'triangle', vol: 0.2, slide: 0.6 });
  }
  shoo() {
    this.hiss({ dur: 0.4, vol: 0.18, freq: 600, sweep: 3000, q: 0.6 });
    this.pluck(84, 0.05, 0.08, 0.2);
    this.pluck(91, 0.12, 0.08, 0.3);
  }
  caw() {
    if (!this.gate('caw', 0.4)) return;
    this.tone(560, { dur: 0.16, wave: 'sawtooth', vol: 0.05, slide: 0.7, filter: 1600 });
    this.tone(520, { at: 0.2, dur: 0.18, wave: 'sawtooth', vol: 0.05, slide: 0.65, filter: 1600 });
  }
  hop() {
    if (!this.gate('hop', 0.4)) return;
    this.tone(260, { dur: 0.08, vol: 0.08, slide: 1.6 });
  }
  munch() {
    if (!this.gate('munch', 0.5)) return;
    for (let i = 0; i < 3; i++) this.hiss({ at: i * 0.09, dur: 0.05, vol: 0.12, freq: 1400, q: 2 });
  }
  lostPlant() {
    this.tone(392, { dur: 0.25, wave: 'triangle', vol: 0.14, slide: 0.8 });
    this.tone(311, { at: 0.18, dur: 0.4, wave: 'triangle', vol: 0.14, slide: 0.8 });
  }
  pay() {
    [72, 76, 79, 84].forEach((n, i) => this.bell(n, i * 0.07, 0.1, 0.7));
    this.coin();
  }
  combo() {
    [67, 71, 74, 79].forEach((n, i) => this.pluck(n, i * 0.05, 0.1, 0.6, 0.8));
  }
  fail() {
    if (!this.gate('fail', 0.15)) return;
    this.tone(180, { dur: 0.16, wave: 'triangle', vol: 0.16, slide: 0.85 });
    this.tone(150, { at: 0.08, dur: 0.18, wave: 'triangle', vol: 0.12, slide: 0.85 });
  }
  dig() {
    this.hiss({ dur: 0.12, vol: 0.25, freq: 2500, q: 3 });
    this.tone(140, { dur: 0.12, vol: 0.2, slide: 0.6 });
  }
  weed() {
    this.hiss({ dur: 0.18, vol: 0.18, freq: 900, sweep: 2400 });
  }
  clock() {
    [84, 88, 91, 96].forEach((n, i) => this.bell(n, i * 0.06, 0.08, 0.6));
  }
  dash() {
    this.hiss({ dur: 0.9, vol: 0.12, freq: 400, sweep: 1600, q: 0.5 });
    [60, 64, 67, 72, 76].forEach((n, i) => this.pluck(n, i * 0.08, 0.1, 0.25));
  }
  goals() {
    [72, 76, 79, 84, 88].forEach((n, i) => this.bell(n, i * 0.08, 0.1, 0.9));
  }
  boss() {
    this.tone(55, { dur: 1.4, wave: 'sine', vol: 0.4, slide: 0.8 });
    this.tone(82, { dur: 1.2, wave: 'triangle', vol: 0.12, slide: 0.8 });
    this.caw();
  }
  bossHit() {
    this.hit();
    this.tone(110, { dur: 0.2, wave: 'sine', vol: 0.3, slide: 0.5 });
  }
  win() {
    const seq = [72, 76, 79, 84, 79, 84, 88];
    seq.forEach((n, i) => this.pluck(n, i * 0.11, 0.16, 0.5, 0.7));
    [60, 64, 67].forEach((n) => this.tone(midi(n), { at: 0.66, dur: 1.6, wave: 'triangle', vol: 0.07, verb: 0.8, attack: 0.05 }));
  }
  lose() {
    [72, 69, 67, 64].forEach((n, i) => this.pluck(n, i * 0.18, 0.13, 0.6, 0.7));
  }
  star(i: number) {
    this.bell(79 + PENTA[i % 5] + (i >= 3 ? 12 : 0), 0, 0.14, 1.0);
    this.pluck(67 + PENTA[i % 5], 0, 0.1, 0.4);
  }
  swoosh() {
    this.hiss({ dur: 0.3, vol: 0.08, freq: 500, sweep: 2500, q: 0.6 });
  }

  // ───────────────────── music ─────────────────────

  music(on: boolean) {
    this.musicOn = on;
    if (!this.ctx) return;
    if (on) this.startLoop();
    else if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private startLoop() {
    if (this.timer !== null || !this.ctx) return;
    this.nextBeat = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 60);
  }

  private schedule() {
    const ctx = this.ctx!;
    const spb = 60 / 84 / 2; // eighth notes
    // C – Am – F – G in a soft major pentatonic
    const chords = [
      [48, 55, 64],
      [45, 52, 60],
      [41, 48, 57],
      [43, 50, 59],
    ];
    while (this.nextBeat < ctx.currentTime + 0.25) {
      const at = this.nextBeat - ctx.currentTime;
      const b = this.beat % 16;
      if (b === 0) this.chord = (this.chord + 1) % 4;
      const ch = chords[this.chord];
      const bus = this.musicBus;
      if (b === 0) {
        for (const n of ch) this.tone(midi(n), { at, dur: spb * 15, wave: 'triangle', vol: 0.045, attack: 0.4, bus, verb: 0.5, filter: 900 });
        this.tone(midi(ch[0] - 12), { at, dur: spb * 6, wave: 'sine', vol: 0.12, attack: 0.02, bus });
      }
      if (b === 8) this.tone(midi(ch[0] - 12 + 7), { at, dur: spb * 6, wave: 'sine', vol: 0.09, attack: 0.02, bus });
      // gentle arpeggio, sparse & a bit random
      if (b % 2 === 0 && Math.random() < 0.72) {
        const root = 72;
        const n = root + PENTA[(b / 2 + this.chord * 2 + (Math.random() < 0.3 ? 1 : 0)) % 5] + (Math.random() < 0.2 ? 12 : 0);
        const f = midi(n);
        this.tone(f, { at, dur: 0.5, wave: 'triangle', vol: 0.05, bus, verb: 0.9 });
        this.tone(f * 2, { at, dur: 0.18, wave: 'sine', vol: 0.015, bus, verb: 0.9 });
      }
      // soft shaker
      if (b % 2 === 1) {
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        const f = ctx.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = 6000;
        const g = ctx.createGain();
        const t0 = this.nextBeat;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.018, t0 + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
        src.connect(f).connect(g).connect(bus);
        src.start(t0, Math.random() * 0.5);
        src.stop(t0 + 0.08);
      }
      this.nextBeat += spb;
      this.beat++;
    }
  }
}

export const sfx = new AudioKit();
