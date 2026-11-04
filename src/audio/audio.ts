// Fully synthesized audio: SFX, procedural dhol/tabla adaptive music, crowd beds and a
// speech-synthesis announcer. No audio files are shipped.
import { settings } from '../core/store';

type Ctx = AudioContext;

export class Audio {
  ctx: Ctx | null = null;
  master!: GainNode;
  sfxBus!: GainNode;
  musicBus!: GainNode;
  crowdBus!: GainNode;
  noiseBuf!: AudioBuffer;
  musicOn = false;
  intensity = 0;
  private nextBeat = 0;
  private step = 0;
  private timer: number | null = null;
  private crowdSrc: AudioBufferSourceNode | null = null;
  private crowdGain!: GainNode;
  private rainSrc: AudioBufferSourceNode | null = null;
  private tempo = 132;
  private scale = [0, 1, 4, 5, 7, 8, 11, 12];
  private root = 50;
  private melodyPhrase: number[] = [];
  mood: 'menu' | 'fight' | 'boss' = 'menu';

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    } catch {
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 0.9;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(c.destination);
    this.sfxBus = c.createGain();
    this.musicBus = c.createGain();
    this.crowdBus = c.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.crowdBus.connect(this.master);
    this.applyVolumes();
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.newPhrase();
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.sfxBus.gain.value = settings.sfx;
    this.musicBus.gain.value = settings.music * 0.55;
    this.crowdBus.gain.value = settings.sfx * 0.5;
  }

  private t() {
    return this.ctx!.currentTime;
  }

  private env(g: GainNode, t: number, a: number, peak: number, dcy: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dcy);
  }

  private noise(t: number, dur: number, type: BiquadFilterType, freq: number, q: number, peak: number, bus = this.sfxBus, freqEnd?: number) {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    this.env(g, t, 0.003, peak, dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  private tone(t: number, dur: number, type: OscillatorType, f0: number, f1: number, peak: number, bus = this.sfxBus, attack = 0.003) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    this.env(g, t, attack, peak, dur);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  play(name: string, power = 1) {
    if (!this.ctx) return;
    const t = this.t();
    const p = Math.min(2, power);
    switch (name) {
      case 'light':
        this.noise(t, 0.08, 'bandpass', 1800, 1.2, 0.5);
        this.tone(t, 0.08, 'sine', 180, 60, 0.6);
        break;
      case 'heavy':
        this.noise(t, 0.16, 'lowpass', 1600, 0.8, 0.8);
        this.tone(t, 0.2, 'sine', 140, 40, 1.0);
        this.tone(t, 0.05, 'square', 90, 50, 0.25);
        break;
      case 'crunch':
        this.noise(t, 0.22, 'lowpass', 2400, 0.7, 0.9);
        this.tone(t, 0.25, 'sine', 120, 35, 1.1);
        for (let i = 0; i < 4; i++) this.noise(t + 0.02 * i, 0.03, 'highpass', 3000, 1, 0.5);
        break;
      case 'bone':
        for (let i = 0; i < 7; i++) this.noise(t + i * 0.018 + Math.random() * 0.01, 0.025, 'bandpass', 2500 + Math.random() * 2500, 4, 0.9);
        this.tone(t, 0.3, 'sine', 90, 30, 1.0);
        break;
      case 'slap':
        this.noise(t, 0.06, 'highpass', 2500, 0.8, 1.0);
        this.noise(t, 0.12, 'bandpass', 1200, 2, 0.4);
        break;
      case 'block':
        this.tone(t, 0.08, 'triangle', 900, 600, 0.25);
        this.noise(t, 0.05, 'highpass', 4000, 1, 0.35);
        break;
      case 'whoosh':
        this.noise(t, 0.16 * p, 'bandpass', 600, 2.2, 0.18 * p, this.sfxBus, 2600);
        break;
      case 'parry':
        this.tone(t, 0.35, 'sine', 1400, 1500, 0.45);
        this.tone(t, 0.35, 'sine', 2100, 2150, 0.25);
        this.noise(t, 0.08, 'highpass', 5000, 1, 0.3);
        break;
      case 'jump':
        this.noise(t, 0.08, 'bandpass', 900, 1.5, 0.12, this.sfxBus, 1800);
        break;
      case 'land':
        this.tone(t, 0.08, 'sine', 90, 50, 0.3);
        this.noise(t, 0.06, 'lowpass', 600, 1, 0.2);
        break;
      case 'thud':
        this.tone(t, 0.3, 'sine', 80, 30, 1.0);
        this.noise(t, 0.25, 'lowpass', 500, 1, 0.6);
        break;
      case 'boom':
        this.tone(t, 0.9, 'sine', 70, 25, 1.2);
        this.noise(t, 0.9, 'lowpass', 900, 0.7, 1.0, this.sfxBus, 120);
        break;
      case 'explode':
        this.noise(t, 1.4, 'lowpass', 3000, 0.5, 1.2, this.sfxBus, 100);
        this.tone(t, 1.2, 'sine', 60, 20, 1.3);
        break;
      case 'super':
        this.tone(t, 0.6, 'sawtooth', 200, 900, 0.25);
        this.tone(t, 0.6, 'sine', 400, 1800, 0.3);
        this.noise(t, 0.6, 'bandpass', 800, 3, 0.3, this.sfxBus, 6000);
        break;
      case 'xray':
        this.tone(t, 0.5, 'square', 60, 40, 0.4);
        this.play('bone');
        break;
      case 'rage':
        this.tone(t, 0.4, 'sawtooth', 120, 60, 0.4);
        this.noise(t, 0.5, 'lowpass', 1200, 4, 0.5, this.sfxBus, 200);
        break;
      case 'proj':
        this.noise(t, 0.25, 'bandpass', 1500, 4, 0.25, this.sfxBus, 500);
        this.tone(t, 0.2, 'triangle', 600, 300, 0.15);
        break;
      case 'coins':
        for (let i = 0; i < 6; i++) this.tone(t + i * 0.05, 0.12, 'square', 2200 + Math.random() * 800, 2000, 0.08);
        break;
      case 'moo':
        this.tone(t, 0.9, 'sawtooth', 160, 110, 0.35, this.sfxBus, 0.08);
        this.tone(t, 0.9, 'sawtooth', 162, 108, 0.2, this.sfxBus, 0.08);
        break;
      case 'horn':
        this.tone(t, 0.5, 'square', 440, 440, 0.18);
        this.tone(t, 0.5, 'square', 554, 554, 0.12);
        break;
      case 'scream':
        this.noise(t, 0.5, 'bandpass', 1400, 6, 0.6, this.sfxBus, 2600);
        this.tone(t, 0.5, 'sawtooth', 600, 900, 0.18);
        break;
      case 'grab':
        this.noise(t, 0.08, 'bandpass', 700, 1.5, 0.4);
        break;
      case 'tech':
        this.tone(t, 0.12, 'square', 700, 1000, 0.15);
        break;
      case 'ui':
        this.tone(t, 0.05, 'square', 880, 880, 0.08);
        break;
      case 'select':
        this.tone(t, 0.12, 'triangle', 660, 990, 0.18);
        break;
      case 'confirm':
        this.tone(t, 0.08, 'square', 523, 523, 0.15);
        this.tone(t + 0.08, 0.16, 'square', 784, 784, 0.15);
        break;
      case 'back':
        this.tone(t, 0.1, 'triangle', 500, 300, 0.15);
        break;
      case 'bell':
        for (const f of [880, 1320, 1760]) this.tone(t, 1.4, 'sine', f, f * 0.99, 0.15);
        break;
      case 'firework':
        this.noise(t, 0.4, 'highpass', 2000, 1, 0.25);
        this.tone(t, 0.15, 'sine', 300, 80, 0.3);
        break;
      case 'stamp':
        this.tone(t, 0.2, 'sine', 100, 40, 0.8);
        this.noise(t, 0.1, 'lowpass', 1000, 1, 0.6);
        break;
      case 'glass':
        for (let i = 0; i < 10; i++) this.tone(t + Math.random() * 0.2, 0.2, 'sine', 3000 + Math.random() * 3000, 2500, 0.06);
        this.noise(t, 0.3, 'highpass', 4000, 1, 0.5);
        break;
      case 'cheer':
        this.crowdSwell(1.0, 1.6);
        break;
      case 'boo':
        this.tone(t, 1.2, 'sawtooth', 140, 110, 0.12, this.crowdBus, 0.2);
        this.tone(t, 1.2, 'sawtooth', 150, 115, 0.1, this.crowdBus, 0.2);
        this.noise(t, 1.2, 'lowpass', 500, 1, 0.2, this.crowdBus);
        break;
      case 'tick':
        this.tone(t, 0.04, 'square', 1200, 1200, 0.06);
        break;
    }
  }

  crowdSwell(amount: number, dur: number) {
    if (!this.ctx) return;
    const t = this.t();
    this.noise(t, dur, 'bandpass', 900, 0.6, 0.35 * amount, this.crowdBus);
    this.noise(t + 0.1, dur * 0.8, 'bandpass', 1800, 0.8, 0.2 * amount, this.crowdBus);
  }

  setCrowd(on: boolean, level = 0.3) {
    if (!this.ctx) return;
    if (on && !this.crowdSrc) {
      const c = this.ctx;
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 700;
      f.Q.value = 0.4;
      this.crowdGain = c.createGain();
      this.crowdGain.gain.value = 0.06 * level;
      src.connect(f).connect(this.crowdGain).connect(this.crowdBus);
      src.start();
      this.crowdSrc = src;
    } else if (!on && this.crowdSrc) {
      this.crowdSrc.stop();
      this.crowdSrc = null;
    }
    if (on && this.crowdGain) this.crowdGain.gain.setTargetAtTime(0.06 * level, this.t(), 0.3);
  }

  setRain(on: boolean) {
    if (!this.ctx) return;
    if (on && !this.rainSrc) {
      const c = this.ctx;
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 2500;
      const g = c.createGain();
      g.gain.value = 0.05;
      src.connect(f).connect(g).connect(this.crowdBus);
      src.start();
      this.rainSrc = src;
    } else if (!on && this.rainSrc) {
      this.rainSrc.stop();
      this.rainSrc = null;
    }
  }

  // ------------------------------------------------------------ announcer
  say(text: string, opts: { pitch?: number; rate?: number; voice?: 'announcer' | 'char' } = {}) {
    if (!settings.voice) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.pitch = opts.pitch ?? 0.6;
      u.rate = opts.rate ?? 0.95;
      u.volume = Math.min(1, settings.sfx + 0.1);
      const voices = speechSynthesis.getVoices();
      const v = voices.find((v) => /en-IN|hi-IN/.test(v.lang)) ?? voices.find((v) => /en/.test(v.lang));
      if (v) u.voice = v;
      if (opts.voice !== 'char') speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch {
      /* no speech */
    }
  }

  // ------------------------------------------------------------ procedural music
  startMusic(mood: 'menu' | 'fight' | 'boss') {
    if (!this.ctx) return;
    this.mood = mood;
    this.tempo = mood === 'menu' ? 104 : mood === 'boss' ? 150 : 136;
    this.root = mood === 'boss' ? 45 : mood === 'menu' ? 52 : 50;
    this.scale = mood === 'menu' ? [0, 2, 4, 7, 9, 12, 14, 16] : [0, 1, 4, 5, 7, 8, 11, 12];
    this.newPhrase();
    if (this.musicOn) return;
    this.musicOn = true;
    this.nextBeat = this.t() + 0.1;
    this.step = 0;
    const tick = () => {
      if (!this.musicOn || !this.ctx) return;
      while (this.nextBeat < this.t() + 0.2) {
        this.schedule(this.step, this.nextBeat);
        this.nextBeat += 60 / this.tempo / 4;
        this.step++;
      }
      this.timer = window.setTimeout(tick, 50);
    };
    tick();
  }

  stopMusic() {
    this.musicOn = false;
    if (this.timer) clearTimeout(this.timer);
  }

  private newPhrase() {
    this.melodyPhrase = [];
    for (let i = 0; i < 16; i++) this.melodyPhrase.push(Math.random() < 0.55 ? Math.floor(Math.random() * this.scale.length) : -1);
  }

  private midi(n: number) {
    return 440 * Math.pow(2, (n - 69) / 12);
  }

  private schedule(step: number, t: number) {
    const s16 = step % 16;
    const bar = Math.floor(step / 16);
    const I = this.mood === 'menu' ? 0.2 : 0.35 + this.intensity * 0.65;
    const mb = this.musicBus;
    // dhol: bass "dha" on 1, 4(and), 7, 11; treble "ta" offbeats (bhangra-ish chaal)
    const bass = [0, 3, 6, 10, 12];
    if (bass.includes(s16)) {
      this.tone(t, 0.28, 'sine', 95, 45, 0.9, mb);
      this.noise(t, 0.05, 'lowpass', 400, 1, 0.3, mb);
    }
    if ([2, 5, 8, 11, 14].includes(s16) && I > 0.3) this.noise(t, 0.05, 'highpass', 3500, 1, 0.22 * I, mb);
    if (s16 % 2 === 1 && I > 0.6) this.noise(t, 0.03, 'bandpass', 5000, 2, 0.08 * I, mb);
    // tabla "na" ringing tone
    if ([4, 12].includes(s16)) this.tone(t, 0.25, 'sine', this.midi(this.root + 24), this.midi(this.root + 24) * 1.01, 0.18, mb);
    // bass line
    if (s16 % 4 === 0) {
      const deg = [0, 0, 5, 4][bar % 4];
      const n = this.root - 12 + this.scale[deg % this.scale.length];
      this.tone(t, 0.32, 'sawtooth', this.midi(n), this.midi(n), 0.12 + 0.08 * I, mb, 0.01);
    }
    // melody (shehnai-ish square + vibrato)
    const m = this.melodyPhrase[s16];
    if (m >= 0 && (this.mood !== 'menu' || s16 % 2 === 0)) {
      const n = this.root + 12 + this.scale[m];
      this.tone(t, 0.18, 'square', this.midi(n), this.midi(n) * 0.995, 0.05 + 0.05 * I, mb, 0.01);
      if (I > 0.7) this.tone(t, 0.18, 'sawtooth', this.midi(n + 12), this.midi(n + 12), 0.03, mb, 0.01);
    }
    // brass stabs when the fight is hot
    if (I > 0.8 && s16 === 0 && bar % 2 === 0) for (const k of [0, 4, 7]) this.tone(t, 0.25, 'sawtooth', this.midi(this.root + k), this.midi(this.root + k), 0.06, mb, 0.02);
    if (s16 === 15 && bar % 4 === 3) this.newPhrase();
  }
}

export const audio = new Audio();
