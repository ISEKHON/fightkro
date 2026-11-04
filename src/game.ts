// Game runtime: fixed 60 Hz simulation, input sources, rendering, audio + HUD event fan-out.
import { createMatch, step, hashState } from './sim/sim';
import type { GameEvent, MatchCfg, MatchState } from './sim/types';
import { B } from './sim/input';
import { CHARS } from './sim/roster';
import { GameRenderer, type RenderSettings } from './render/renderer';
import { HUD } from './ui/hud';
import { TouchController } from './ui/touch';
import { audio } from './audio/audio';
import { connectedPads, keyboardMask, padMask, rumble } from './core/input';
import { settings } from './core/store';
import { CPU, GhostRecorder, type Difficulty, type GhostProfile } from './ai/cpu';
import * as THREE from 'three';
import { lookFor } from './render/looks';

export type SourceKind = 'p1' | 'kb0' | 'kb1' | 'pad0' | 'pad1' | 'touch' | 'cpu' | 'net' | 'replay' | 'dummy';

export interface MatchOpts {
  sources: [SourceKind, SourceKind];
  difficulty?: Difficulty;
  ghost?: GhostProfile | null;
  names?: [string, string];
  onEnd?: (s: MatchState, replay: Replay) => void;
  /** network driver takes over stepping */
  driver?: Driver;
  allowPause?: boolean;
  record?: boolean;
  replay?: Replay;
}

export interface Replay {
  v: 1;
  cfg: MatchCfg;
  inputs: number[]; // interleaved p1,p2 per frame, run-length encoded on save
  hash: number;
  date: number;
  names: [string, string];
}

/** A driver advances the simulation; local play steps directly, netplay uses rollback. */
export interface Driver {
  /** called once per 60Hz tick with this machine's input; returns the state to render + new events */
  tick(local: number): { state: MatchState; events: GameEvent[] } | null;
  dispose(): void;
  status?(): string;
}

export class Game {
  renderer: GameRenderer;
  hud: HUD;
  touch: TouchController;
  s: MatchState | null = null;
  opts: MatchOpts | null = null;
  cpus: (CPU | null)[] = [null, null];
  running = false;
  paused = false;
  acc = 0;
  last = 0;
  pendingEvents: GameEvent[] = [];
  replayInputs: number[] = [];
  replayCursor = 0;
  ghostRec = new GhostRecorder();
  onPause: () => void = () => {};
  onFrame: (dt: number) => void = () => {};
  menuScene: ((dt: number) => void) | null = null;
  fps = 60;
  private frames = 0;
  private fpsT = 0;
  private endFired = false;
  dummyMode: 'stand' | 'crouch' | 'jump' | 'block' | 'cpu' | 'record' | 'playback' = 'stand';
  dummyRec: number[] = [];
  dummyPlay = 0;
  private lastHitRumble = 0;

  constructor(public canvas: HTMLCanvasElement, uiRoot: HTMLElement, rs: RenderSettings) {
    this.renderer = new GameRenderer(canvas, rs);
    this.hud = new HUD(uiRoot);
    this.touch = new TouchController(uiRoot);
    this.touch.onPause = () => this.onPause();
    this.touch.ctx = () => {
      const s = this.s;
      if (!s) return { facing: 1, dist: 3, oppAir: false, char: 'jumla', meter: 0, rage: 0, hasWeapon: false };
      const side = this.opts?.sources[0] === 'touch' || this.opts?.sources[0] === 'p1' ? 0 : 1;
      const f = s.f[side];
      const o = s.f[1 - side];
      return { facing: f.facing, dist: Math.abs(o.x - f.x), oppAir: o.y > 0.2, char: f.char, meter: f.meter, rage: f.rage, hasWeapon: !!f.weapon };
    };
    this.hud.project = (x, y) => {
      const v = new THREE.Vector3(x, y, 0).project(this.renderer.camera);
      return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
    };
    window.addEventListener('resize', () => this.renderer.resize());
    requestAnimationFrame((t) => this.loop(t));
  }

  start(cfg: MatchCfg, opts: MatchOpts) {
    this.stop();
    this.opts = opts;
    this.s = opts.driver ? null : createMatch(cfg);
    const preview = this.s ?? createMatch(cfg);
    this.renderer.setMatch(preview);
    this.hud.setMatch(preview, opts.names);
    this.hud.show(true);
    this.cpus = opts.sources.map((src, i) => (src === 'cpu' ? new CPU(i as 0 | 1, opts.difficulty ?? settings.difficulty, (cfg.seed ?? 1) + i * 77, i === 1 ? opts.ghost ?? null : null) : null));
    this.touch.show(opts.sources.includes('touch'));
    this.replayInputs = [];
    this.replayCursor = 0;
    this.running = true;
    this.paused = false;
    this.endFired = false;
    this.acc = 0;
    this.ghostRec = new GhostRecorder();
    this.dummyRec = [];
    audio.startMusic(CHARS[cfg.p[1].char]?.boss || CHARS[cfg.p[0].char]?.boss ? 'boss' : 'fight');
    audio.setCrowd(true, 0.4);
    audio.setRain(cfg.stage === 'tollplaza');
    const isStudio = cfg.stage === 'studio';
    void isStudio;
  }

  stop() {
    this.opts?.driver?.dispose();
    this.running = false;
    this.s = null;
    this.opts = null;
    this.touch.show(false);
    this.hud.show(false);
    audio.setCrowd(false);
    audio.setRain(false);
  }

  readSource(src: SourceKind, side: number, s: MatchState): number {
    const pads = connectedPads();
    switch (src) {
      case 'p1': {
        let m = keyboardMask(0, true) | padMask(pads[0]);
        m |= this.touch.read();
        return m;
      }
      case 'kb0':
        return keyboardMask(0) | padMask(pads[0]) | this.touch.read();
      case 'kb1':
        return keyboardMask(1) | padMask(pads[1]);
      case 'pad0':
        return padMask(pads[0]);
      case 'pad1':
        return padMask(pads[1]);
      case 'touch':
        return this.touch.read() | keyboardMask(0, true) | padMask(pads[0]);
      case 'cpu':
        return this.cpus[side]?.next(s) ?? 0;
      case 'dummy':
        return this.dummyInput(s, side);
      case 'replay': {
        const v = this.opts?.replay?.inputs[this.replayCursor * 2 + side] ?? 0;
        return v;
      }
      default:
        return 0;
    }
  }

  private dummyInput(s: MatchState, side: number): number {
    const f = s.f[side];
    const back = f.facing > 0 ? B.L : B.R;
    switch (this.dummyMode) {
      case 'crouch':
        return B.D;
      case 'jump':
        return s.frame % 50 < 4 ? B.U : 0;
      case 'block':
        return back | (s.frame % 120 < 60 ? B.D : 0);
      case 'cpu':
        if (!this.cpus[side]) this.cpus[side] = new CPU(side as 0 | 1, 'normal', 3);
        return this.cpus[side]!.next(s);
      case 'record': {
        const m = keyboardMask(1) | padMask(connectedPads()[1]);
        this.dummyRec.push(m);
        return m;
      }
      case 'playback':
        if (!this.dummyRec.length) return 0;
        return this.dummyRec[this.dummyPlay++ % this.dummyRec.length];
      default:
        return 0;
    }
  }

  private tick() {
    if (!this.opts) return;
    const o = this.opts;
    if (o.driver) {
      const localSide = o.sources[0] === 'net' ? 1 : 0;
      const src = o.sources[localSide];
      const fakeState = this.s ?? createMatch({ p: [{ char: 'jumla' }, { char: 'jumla' }], stage: 'assembly' });
      const local = this.readSource(src, localSide, fakeState);
      const r = o.driver.tick(local);
      if (r) {
        if (!this.s) {
          this.renderer.setMatch(r.state);
          this.hud.setMatch(r.state, o.names);
        }
        this.s = r.state;
        this.pendingEvents.push(...r.events);
      }
      return;
    }
    const s = this.s!;
    const i0 = this.readSource(o.sources[0], 0, s);
    const i1 = this.readSource(o.sources[1], 1, s);
    if (o.record !== false && o.sources[0] !== 'replay') this.replayInputs.push(i0, i1);
    step(s, [i0, i1]);
    this.replayCursor++;
    if (o.sources[0] !== 'cpu' && o.sources[0] !== 'replay') this.ghostRec.record(s, 0);
    this.pendingEvents.push(...s.events);
  }

  private loop(t: number) {
    requestAnimationFrame((tt) => this.loop(tt));
    const dt = Math.min(0.1, (t - this.last) / 1000 || 0);
    this.last = t;
    this.frames++;
    this.fpsT += dt;
    if (this.fpsT >= 1) {
      this.fps = this.frames / this.fpsT;
      this.frames = 0;
      this.fpsT = 0;
    }
    this.onFrame(dt);
    if (!this.running || (!this.s && !this.opts?.driver)) {
      if (this.menuScene) this.menuScene(dt);
      return;
    }
    if (!this.paused) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= 1 / 60 && n < 5) {
        this.tick();
        this.acc -= 1 / 60;
        n++;
      }
      if (n >= 5) this.acc = 0;
    }
    const s = this.s;
    if (!s) return;
    const ev = this.pendingEvents;
    this.pendingEvents = [];
    for (const e of ev) {
      this.sound(e, s);
      this.hud.event(e, s);
    }
    this.renderer.frame(s, ev, this.paused ? 0 : dt);
    this.hud.update(s, dt);
    // adaptive music intensity
    const lowHp = Math.min(...s.f.map((f) => f.hp / f.maxHp));
    const combo = Math.max(...s.f.map((f) => f.comboHits));
    audio.intensity = Math.min(1, (1 - lowHp) * 0.6 + combo * 0.06 + (s.phase === 'finishHim' ? 0.5 : 0));
    audio.setCrowd(true, 0.4 + Math.abs(s.spin) / 100 + combo * 0.05);
    if (s.phase === 'matchOver' && !this.endFired && s.pf > (s.finisher ? 30 : 150)) {
      this.endFired = true;
      const rep: Replay = { v: 1, cfg: s.cfg, inputs: this.replayInputs, hash: hashState(s), date: Date.now(), names: this.opts?.names ?? [CHARS[s.f[0].char].name, CHARS[s.f[1].char].name] };
      this.opts?.onEnd?.(s, rep);
    }
  }

  private sound(e: GameEvent, s: MatchState) {
    const vib = (ms: number) => settings.haptics && navigator.vibrate?.(ms);
    switch (e.t) {
      case 'hit': {
        const v = e.v ?? 30;
        const k = e.k ?? '';
        if (k.startsWith('5LP') && s.f[e.s ?? 0].char === 'didi') audio.play('slap');
        else audio.play(v >= 90 || (e.n ?? 0) >= 3 ? 'crunch' : v >= 55 ? 'heavy' : 'light', v / 60);
        if ((e.n ?? 0) >= 3 && settings.gore !== 'off') audio.play('bone');
        if (e.c === 1) audio.play('tick');
        const now = performance.now();
        if (now - this.lastHitRumble > 60) {
          this.lastHitRumble = now;
          const pads = connectedPads();
          const victim = e.s === 0 ? 1 : 0;
          const pad = pads[this.opts?.sources[victim] === 'kb1' || this.opts?.sources[victim] === 'pad1' ? 1 : 0];
          rumble(pad, Math.min(1, v / 120), 80 + v);
          if (this.opts?.sources.includes('touch')) vib(Math.min(60, 10 + v / 3));
        }
        break;
      }
      case 'block':
        audio.play('block');
        break;
      case 'parry':
        audio.play('parry');
        break;
      case 'whoosh':
        audio.play('whoosh', e.k === 'heavy' || e.k === 'crunch' ? 1.4 : 0.8);
        break;
      case 'jump':
        audio.play('jump');
        break;
      case 'land':
        audio.play('land');
        break;
      case 'knockdown':
      case 'slam':
      case 'groundBounce':
        audio.play('thud');
        break;
      case 'wallSplat':
        audio.play('crunch');
        audio.crowdSwell(0.8, 1.2);
        break;
      case 'wallBreak':
        audio.play('explode');
        audio.play('glass');
        audio.crowdSwell(1.2, 2);
        break;
      case 'super':
        audio.play(e.v ? 'xray' : 'super');
        audio.say(e.v ? 'X-Ray!' : 'Super!', { pitch: 0.5 });
        break;
      case 'xray':
        audio.play('bone');
        audio.play('bone');
        break;
      case 'rageCancel':
      case 'burst':
      case 'install':
        audio.play('rage');
        break;
      case 'proj':
        audio.play(e.k === 'moneybag' || e.k === 'coins' ? 'coins' : e.k === 'scream' ? 'scream' : e.k === 'truck' ? 'horn' : 'proj');
        break;
      case 'grab':
        audio.play('grab');
        break;
      case 'tech':
        audio.play('tech');
        break;
      case 'hazardWarn':
        audio.play(e.k === 'convoy' ? 'horn' : 'moo');
        break;
      case 'crowdThrow':
        audio.play('boo');
        break;
      case 'round':
        audio.say(e.v ? 'Final round' : `Round ${e.n}`);
        audio.play('bell');
        break;
      case 'fight':
        audio.say('Fight!', { pitch: 0.5, rate: 1.1 });
        break;
      case 'ko':
        audio.play('boom');
        audio.say(e.v === 1 ? 'Perfect!' : 'K. O.!', { pitch: 0.4 });
        audio.play('cheer');
        vib(200);
        break;
      case 'timeUp':
        audio.say('Time up!');
        break;
      case 'finishHim':
        audio.say('Khatam karo!', { pitch: 0.3, rate: 0.8 });
        audio.play('boom');
        break;
      case 'finisher':
        audio.play('super');
        setTimeout(() => audio.play('explode'), 1500);
        setTimeout(() => audio.say('Brutal!', { pitch: 0.3 }), 2600);
        setTimeout(() => audio.play('cheer'), 2800);
        break;
      case 'taunt': {
        const look = lookFor(e.k ?? 'jumla');
        audio.say(CHARS[e.k ?? 'jumla']?.slogan ?? 'Haha', { pitch: look.voice.pitch, rate: look.voice.rate, voice: 'char' });
        break;
      }
      case 'weaponBreak':
        audio.play('crunch');
        break;
      case 'pickup':
        audio.play('select');
        break;
      case 'clash':
        audio.play('block');
        break;
      case 'firstBlood':
        audio.say('First blood!', { pitch: 0.5 });
        break;
      case 'counter':
        break;
      case 'guardCrush':
        audio.play('glass');
        break;
      case 'teleport':
        audio.play('proj');
        break;
      case 'matchOver':
        audio.say(s.matchWinner < 0 ? 'Draw' : `${CHARS[s.f[s.matchWinner].char].name} wins`, { pitch: 0.5 });
        break;
    }
  }
}
