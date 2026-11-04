// CPU opponent. Reads the match state (no peeking at the opponent's raw inputs), plans short
// input sequences (combos, specials, movement) and executes them frame by frame.
import { B } from '../sim/input';
import { CHARS, getMove } from '../sim/roster';
import type { FighterState, MatchState, MoveDef } from '../sim/types';
import { motionMacro } from '../ui/touch';

export type Difficulty = 'easy' | 'normal' | 'hard' | 'brutal';

interface Params {
  react: number;
  block: number;
  punish: number;
  aggression: number;
  antiAir: number;
  combo: number;
  special: number;
  parry: number;
  tech: number;
  burst: number;
  meter: number;
}

export const DIFF: Record<Difficulty, Params> = {
  easy: { react: 24, block: 0.15, punish: 0.12, aggression: 0.35, antiAir: 0.12, combo: 0.15, special: 0.2, parry: 0.0, tech: 0.1, burst: 0.1, meter: 0.25 },
  normal: { react: 13, block: 0.42, punish: 0.45, aggression: 0.55, antiAir: 0.42, combo: 0.5, special: 0.38, parry: 0.04, tech: 0.4, burst: 0.4, meter: 0.6 },
  hard: { react: 7, block: 0.68, punish: 0.78, aggression: 0.68, antiAir: 0.72, combo: 0.82, special: 0.5, parry: 0.12, tech: 0.75, burst: 0.7, meter: 0.85 },
  brutal: { react: 3, block: 0.86, punish: 0.95, aggression: 0.78, antiAir: 0.9, combo: 0.97, special: 0.55, parry: 0.28, tech: 0.95, burst: 0.92, meter: 1 },
};

export type ActionKind = 'approach' | 'retreat' | 'jumpin' | 'poke' | 'special' | 'throw' | 'block' | 'fireball' | 'dash' | 'super' | 'taunt' | 'pressure' | 'wait';

export interface GhostProfile {
  name: string;
  /** situation key -> action weights */
  w: Record<string, Partial<Record<ActionKind, number>>>;
}

export class CPU {
  p: Params;
  plan: number[] = [];
  cool = 0;
  holdDir = 0;
  rng: () => number;
  ghost: GhostProfile | null = null;

  constructor(public side: 0 | 1, diff: Difficulty, seed = 1, ghost: GhostProfile | null = null) {
    this.p = DIFF[diff];
    let x = seed * 9301 + 49297;
    this.rng = () => {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      return x / 0x7fffffff;
    };
    this.ghost = ghost;
  }

  private dir(f: FighterState, d: number) {
    let m = 0;
    const fwd = f.facing > 0 ? B.R : B.L;
    const back = f.facing > 0 ? B.L : B.R;
    if ([7, 8, 9].includes(d)) m |= B.U;
    if ([1, 2, 3].includes(d)) m |= B.D;
    if ([3, 6, 9].includes(d)) m |= fwd;
    if ([1, 4, 7].includes(d)) m |= back;
    return m;
  }

  private push(...masks: number[]) {
    this.plan.push(...masks);
  }
  private wait(n: number, mask = 0) {
    for (let i = 0; i < n; i++) this.plan.push(mask);
  }
  private press(f: FighterState, d: number, btn: number, hold = 2) {
    for (let i = 0; i < hold; i++) this.plan.push(this.dir(f, d) | btn);
  }

  private special(f: FighterState, pred: (m: MoveDef) => boolean, strength: 'l' | 'h' | 'ex' = 'l') {
    const c = CHARS[f.char];
    const sp = c.specials.find((s) => pred(getMove(f.char, s.l)));
    if (!sp) return false;
    const btn = sp.btn === 'P' ? (strength === 'ex' ? B.LP | B.HP : strength === 'h' ? B.HP : B.LP) : strength === 'ex' ? B.LK | B.HK : strength === 'h' ? B.HK : B.LK;
    this.plan.push(...motionMacro(sp.motion, btn, f.facing));
    return true;
  }

  private comboRoute(f: FighterState, o: FighterState, s: MatchState) {
    const r = this.rng();
    const c = CHARS[f.char];
    const exOk = f.meter >= 100 && this.rng() < this.p.meter;
    const enderStrength: 'l' | 'h' | 'ex' = exOk ? 'ex' : this.rng() < 0.5 ? 'h' : 'l';
    const ender = () => {
      if (f.meter >= 300 && this.rng() < this.p.meter * (o.hp / o.maxHp < 0.45 ? 1 : 0.4)) {
        this.plan.push(...motionMacro('QCF2', B.HP | B.HK, f.facing));
        return;
      }
      if (f.meter >= 200 && this.rng() < this.p.meter * 0.6) {
        const sp = c.supers[0];
        this.plan.push(...motionMacro(sp.motion, sp.btn === 'P' ? B.LP : B.LK, f.facing));
        return;
      }
      if (!this.special(f, (m) => m.kind === 'special' && !m.projectile && !m.teleport && !m.counterInto && !m.grab && m.damage > 0, enderStrength)) this.press(f, 5, B.HK);
    };
    if (r < 0.3) {
      this.press(f, 5, B.LP);
      this.wait(6);
      this.press(f, 5, B.LP);
      this.wait(6);
      this.press(f, 5, B.HP);
      this.wait(5);
      if (this.rng() < this.p.combo) ender();
    } else if (r < 0.5) {
      this.press(f, 2, B.LK);
      this.wait(7, this.dir(f, 2));
      this.press(f, 2, B.LP);
      this.wait(7, this.dir(f, 2));
      this.press(f, 2, B.HK);
    } else if (r < 0.7 && this.p.combo > 0.4) {
      this.press(f, 2, B.HP);
      this.wait(9);
      this.wait(4, this.dir(f, 9));
      this.wait(8);
      this.press(f, 5, B.LP);
      this.wait(6);
      this.press(f, 5, B.HP);
      this.wait(14);
      this.press(f, 5, B.HK);
    } else if (r < 0.85) {
      this.press(f, 5, B.LK);
      this.wait(7);
      this.press(f, 5, B.HK);
      this.wait(5);
      if (this.rng() < this.p.combo) ender();
    } else {
      this.press(f, 6, B.HK);
      this.wait(18);
      if (this.rng() < this.p.combo) {
        this.wait(2, this.dir(f, 6));
        this.wait(2);
        this.wait(10, this.dir(f, 6));
        this.press(f, 5, B.HP);
      }
    }
    // rage cancel extension on harder levels
    if (f.rage >= 50 && this.rng() < this.p.combo * 0.3) {
      this.push(B.RAGE, 0, 0);
      this.press(f, 5, B.HP);
    }
    void s;
  }

  private situation(f: FighterState, o: FighterState): string {
    const d = Math.abs(o.x - f.x);
    const db = d < 1.5 ? 'close' : d < 3.5 ? 'mid' : 'far';
    const os = o.st === 'jump' ? 'air' : o.st === 'attack' ? 'atk' : 'ground';
    return db + ':' + os;
  }

  private chooseAction(f: FighterState, o: FighterState): ActionKind {
    const d = Math.abs(o.x - f.x);
    const ag = this.p.aggression;
    const w: Partial<Record<ActionKind, number>> = {};
    if (d > 4.2) {
      w.approach = 3 * ag;
      w.dash = 2 * ag;
      w.fireball = 3 * this.p.special;
      w.wait = 1 - ag;
      w.taunt = f.hp > o.hp ? 0.2 : 0.02;
    } else if (d > 1.6) {
      w.approach = 2 * ag;
      w.jumpin = 1.4 * ag;
      w.poke = 2;
      w.fireball = 1.5 * this.p.special;
      w.special = 1 * this.p.special;
      w.retreat = 0.6 * (1 - ag);
      w.wait = 0.6;
    } else {
      w.pressure = 3 * ag;
      w.throw = 1.0;
      w.special = 0.8 * this.p.special;
      w.block = 1.2 * this.p.block;
      w.retreat = 0.4;
    }
    if (f.meter >= 200) w.super = 0.6 * this.p.meter;
    if (this.ghost) {
      const g = this.ghost.w[this.situation(f, o)];
      if (g) for (const [k, v] of Object.entries(g)) w[k as ActionKind] = (w[k as ActionKind] ?? 0) * 0.3 + (v as number) * 3;
    }
    let tot = 0;
    for (const v of Object.values(w)) tot += v ?? 0;
    let r = this.rng() * tot;
    for (const [k, v] of Object.entries(w)) {
      r -= v ?? 0;
      if (r <= 0) return k as ActionKind;
    }
    return 'wait';
  }

  private doAction(a: ActionKind, f: FighterState, o: FighterState, s: MatchState) {
    const d = Math.abs(o.x - f.x);
    switch (a) {
      case 'approach':
        this.wait(10 + Math.floor(this.rng() * 20), this.dir(f, 6));
        break;
      case 'dash':
        this.push(this.dir(f, 6), 0, this.dir(f, 6), this.dir(f, 6));
        this.wait(14, this.dir(f, 6));
        break;
      case 'retreat':
        this.wait(10 + Math.floor(this.rng() * 15), this.dir(f, 4));
        break;
      case 'jumpin':
        this.wait(5, this.dir(f, 9));
        this.wait(20);
        this.press(f, 5, this.rng() < 0.5 ? B.HK : B.HP);
        this.wait(14);
        if (this.rng() < this.p.combo) this.comboRoute(f, o, s);
        break;
      case 'poke':
        this.press(f, this.rng() < 0.4 ? 2 : 5, this.rng() < 0.5 ? B.HK : B.LK);
        this.wait(8);
        break;
      case 'fireball':
        if (!this.special(f, (m) => !!m.projectile || !!m.travel, this.rng() < 0.3 ? 'h' : 'l')) this.wait(10, this.dir(f, 6));
        break;
      case 'special':
        if (d < 1.3 && this.special(f, (m) => !!m.grab, 'l')) break;
        this.special(f, (m) => !!m.travel || !!m.lunge || !!m.teleport, 'l');
        break;
      case 'throw':
        this.wait(4, this.dir(f, 6));
        this.push(B.LP | B.LK, B.LP | B.LK, 0);
        break;
      case 'block':
        this.wait(14, this.dir(f, this.rng() < 0.5 ? 1 : 4));
        break;
      case 'pressure': {
        const r = this.rng();
        if (r < 0.55) this.comboRoute(f, o, s);
        else if (r < 0.7) {
          this.press(f, 6, B.HP); // overhead mixup
        } else if (r < 0.85) {
          this.press(f, 2, B.LK);
          this.wait(8);
          this.push(B.LP | B.LK, 0);
        } else {
          this.press(f, 3, B.HK);
        }
        break;
      }
      case 'super': {
        if (f.meter >= 300 && d < 2.5) this.plan.push(...motionMacro('QCF2', B.HP | B.HK, f.facing));
        else {
          const sp = CHARS[f.char].supers[0];
          this.plan.push(...motionMacro(sp.motion, sp.btn === 'P' ? B.LP : B.LK, f.facing));
        }
        break;
      }
      case 'taunt':
        this.push(B.TAUNT, 0);
        break;
      case 'wait':
        this.wait(8 + Math.floor(this.rng() * 12));
        break;
    }
  }

  next(s: MatchState): number {
    const f = s.f[this.side];
    const o = s.f[1 - this.side];
    if (s.phase === 'intro') return 0;
    if (s.phase !== 'fight' && s.phase !== 'finishHim') {
      this.plan = [];
      return 0;
    }
    // finish him!
    if (s.phase === 'finishHim' && o.hp <= 0 && f.hp > 0) {
      if (this.plan.length) return this.plan.shift()!;
      const c = CHARS[f.char];
      const fin = c.finishers[Math.floor(this.rng() * c.finishers.length)];
      const d = Math.abs(o.x - f.x);
      if (d > Math.min(2.2, fin.range)) {
        this.wait(10, this.dir(f, 6));
      } else {
        this.wait(20);
        this.plan.push(...motionMacro(fin.motion, B[fin.btn], f.facing));
      }
      return this.plan.shift() ?? 0;
    }
    if (f.hp <= 0) return 0;

    // emergency reactions interrupt plans
    if (['hitstun', 'air', 'wallsplat', 'crumple'].includes(f.st)) {
      this.plan = [];
      if (!f.burstUsed && f.rage >= 25 && f.comboHits >= 4 && this.rng() < this.p.burst * 0.08) return B.RAGE;
      return 0;
    }
    if (f.st === 'knockdown') {
      this.plan = [];
      return f.techWindow > 0 && this.rng() < this.p.tech * 0.15 ? B.DODGE | (this.rng() < 0.5 ? this.dir(f, 4) : 0) : 0;
    }
    if (f.st === 'grabbed') {
      this.plan = [];
      return this.rng() < this.p.tech * 0.25 ? B.LP | B.LK : 0;
    }

    const d = Math.abs(o.x - f.x);
    const oMove = o.st === 'attack' && o.move ? getMove(o.char, o.move) : null;
    const threatening = oMove && o.mf < oMove.startup + oMove.active && d < 2.6 && oMove.damage > 0;
    if (this.cool > 0) this.cool--;
    const actionable = ['idle', 'walk', 'crouch', 'run', 'blockstun'].includes(f.st);

    if (actionable && threatening && this.cool === 0) {
      this.cool = this.p.react;
      if (this.rng() < this.p.block) {
        this.plan = [];
        const low = oMove!.height === 'low';
        const hold = this.dir(f, low ? 1 : 4);
        if (this.rng() < this.p.parry) return this.dir(f, 6);
        this.wait(Math.max(8, oMove!.active + 10), hold);
        return this.plan.shift()!;
      }
    }
    // projectile incoming
    const proj = s.projs.find((p) => p.owner !== f.side && Math.sign(f.x - p.x) === Math.sign(p.vx) && Math.abs(f.x - p.x) < 3.2);
    if (actionable && proj && this.cool === 0 && !this.plan.length) {
      this.cool = this.p.react;
      const r = this.rng();
      if (r < this.p.block * 0.5) this.wait(20, this.dir(f, 4));
      else if (r < this.p.block * 0.8) {
        this.wait(4, this.dir(f, 9));
        this.wait(18);
        this.press(f, 5, B.HK);
      } else if (r < this.p.block) this.push(B.DODGE | B.U, 0);
    }
    // anti-air
    if (actionable && o.st === 'jump' && o.vy < 0.05 && d < 2.4 && Math.sign(o.vx) === -Math.sign(o.x - f.x) && this.cool === 0) {
      this.cool = this.p.react;
      if (this.rng() < this.p.antiAir) {
        this.plan = [];
        if (!this.special(f, (m) => !!m.vy && m.damage > 0, f.meter >= 100 && this.rng() < 0.3 ? 'ex' : 'l')) this.press(f, 2, B.HP);
      }
    }
    // whiff punish
    if (actionable && oMove && o.mf >= oMove.startup + oMove.active && d < 2.2 && !this.plan.length && this.rng() < this.p.punish * 0.5) {
      this.comboRoute(f, o, s);
    }
    // grab a weapon lying nearby
    if (actionable && !f.weapon && !this.plan.length && s.props.some((p) => !p.taken && Math.abs(p.x - f.x) < 1) && this.rng() < 0.03) this.push(B.DODGE | B.HP, 0);
    // assist
    if (actionable && f.assistCd <= 0 && d > 2 && d < 5 && this.rng() < 0.01 * this.p.aggression) this.push(B.ASSIST, 0);

    if (this.plan.length) return this.plan.shift()!;
    if (!actionable && f.st !== 'jump') return 0;
    if (f.st === 'jump') return 0;
    if (this.cool > 0 && this.rng() < 0.5) return 0;
    this.doAction(this.chooseAction(f, o), f, o, s);
    this.cool = Math.max(this.cool, Math.floor(this.p.react / 2));
    return this.plan.shift() ?? 0;
  }
}

// ---------------------------------------------------------------- ghost recorder
export class GhostRecorder {
  w: Record<string, Partial<Record<ActionKind, number>>> = {};
  private lastSt = '';
  record(s: MatchState, side: number) {
    const f = s.f[side];
    const o = s.f[1 - side];
    if (s.phase !== 'fight') return;
    const d = Math.abs(o.x - f.x);
    const key = (d < 1.5 ? 'close' : d < 3.5 ? 'mid' : 'far') + ':' + (o.st === 'jump' ? 'air' : o.st === 'attack' ? 'atk' : 'ground');
    let a: ActionKind | null = null;
    const changed = f.st !== this.lastSt;
    this.lastSt = f.st;
    if (!changed) return;
    if (f.st === 'walk') a = Math.sign(f.vx) === f.facing ? 'approach' : 'retreat';
    else if (f.st === 'dash' || f.st === 'run') a = 'dash';
    else if (f.st === 'prejump') a = 'jumpin';
    else if (f.st === 'taunt') a = 'taunt';
    else if (f.st === 'throwing') a = 'throw';
    else if (f.st === 'attack' && f.move) {
      const m = getMove(f.char, f.move);
      a = m.kind === 'super' || m.kind === 'xray' ? 'super' : m.projectile ? 'fireball' : m.kind === 'special' ? 'special' : d < 1.5 ? 'pressure' : 'poke';
    }
    if (!a) return;
    const slot = (this.w[key] ??= {});
    slot[a] = (slot[a] ?? 0) + 1;
  }
  profile(name: string): GhostProfile {
    const w: GhostProfile['w'] = {};
    for (const [k, v] of Object.entries(this.w)) {
      const tot = Object.values(v).reduce((a, b) => a + (b ?? 0), 0) || 1;
      w[k] = Object.fromEntries(Object.entries(v).map(([a, n]) => [a, Math.round(((n ?? 0) / tot) * 100) / 100]));
    }
    return { name, w };
  }
}

export function mergeGhost(a: GhostProfile | null, b: GhostProfile): GhostProfile {
  if (!a) return b;
  const w = structuredClone(a.w);
  for (const [k, v] of Object.entries(b.w)) {
    const slot = (w[k] ??= {});
    for (const [act, n] of Object.entries(v)) slot[act as ActionKind] = ((slot[act as ActionKind] ?? 0) * 0.7 + (n as number) * 0.3);
  }
  return { name: b.name, w };
}
