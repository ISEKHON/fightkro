import { numpad } from './input';

export const HIST = 64;

export interface History {
  hist: number[];
  hi: number;
}

export function pushHistory(h: History, mask: number) {
  h.hi = (h.hi + 1) % HIST;
  h.hist[h.hi] = mask;
}

export const at = (h: History, age: number) => h.hist[(h.hi - age + HIST * 4) % HIST];

interface Step {
  d: number[];
  opt?: boolean;
}

const s = (d: number[], opt = false): Step => ({ d, opt });

export const MOTIONS = {
  QCF: { steps: [s([2]), s([3], true), s([6])], window: 16 },
  QCB: { steps: [s([2]), s([1], true), s([4])], window: 16 },
  DP: { steps: [s([6]), s([2, 1]), s([3])], window: 18 },
  RDP: { steps: [s([4]), s([2, 3]), s([1])], window: 18 },
  HCF: { steps: [s([4]), s([1], true), s([2]), s([3], true), s([6])], window: 26 },
  HCB: { steps: [s([6]), s([3], true), s([2]), s([1], true), s([4])], window: 26 },
  QCF2: { steps: [s([2]), s([3], true), s([6]), s([2]), s([3], true), s([6])], window: 34 },
  QCB2: { steps: [s([2]), s([1], true), s([4]), s([2]), s([1], true), s([4])], window: 34 },
  BFD: { steps: [s([4, 1, 7]), s([6, 3, 9]), s([2, 1, 3])], window: 30 },
  FBF: { steps: [s([6, 3, 9]), s([4, 1, 7]), s([6, 3, 9])], window: 30 },
  DDOWN: { steps: [s([2, 1, 3]), s([5, 4, 6]), s([2, 1, 3])], window: 20 },
} as const;

export type MotionName = keyof typeof MOTIONS | 'CHARGE_BF' | 'CHARGE_DU' | 'SPD' | 'NONE';

/** Match a motion ending within the last few frames. `leniency` scales windows (touch players get more). */
export function matchMotion(h: History, facing: number, name: MotionName, leniency = 1): boolean {
  if (name === 'NONE') return true;
  if (name === 'CHARGE_BF') return matchCharge(h, facing, [1, 4, 7], [3, 6, 9]);
  if (name === 'CHARGE_DU') return matchCharge(h, facing, [1, 2, 3], [7, 8, 9]);
  if (name === 'SPD') return match360(h, facing, leniency);
  const m = MOTIONS[name];
  const steps = m.steps as readonly Step[];
  const window = Math.round(m.window * leniency);
  let ptr = steps.length - 1;
  let started = false;
  for (let age = 0; age <= window; age++) {
    const d = numpad(at(h, age), facing);
    if (!started) {
      if (steps[ptr].d.includes(d)) {
        started = true;
        ptr--;
        if (ptr < 0) return true;
      } else if (age > 8) return false;
      continue;
    }
    if (steps[ptr].d.includes(d)) {
      ptr--;
      if (ptr < 0) return true;
    } else if (steps[ptr].opt && ptr > 0 && steps[ptr - 1].d.includes(d)) {
      ptr -= 2;
      if (ptr < 0) return true;
    }
  }
  return false;
}

function matchCharge(h: History, facing: number, hold: number[], release: number[]): boolean {
  let age = 0;
  for (; age <= 8; age++) if (release.includes(numpad(at(h, age), facing))) break;
  if (age > 8) return false;
  let start = -1;
  for (let a = age + 1; a <= age + 12 && a < HIST; a++) {
    if (hold.includes(numpad(at(h, a), facing))) {
      start = a;
      break;
    }
  }
  if (start < 0) return false;
  let n = 0;
  for (let a = start; a < HIST - 1; a++) {
    if (hold.includes(numpad(at(h, a), facing))) n++;
    else break;
  }
  return n >= 30;
}

function match360(h: History, facing: number, leniency: number): boolean {
  const seen = { d: false, b: false, f: false, u: false };
  const w = Math.round(32 * leniency);
  for (let age = 0; age <= w; age++) {
    const d = numpad(at(h, age), facing);
    if (d <= 3) seen.d = true;
    if (d === 1 || d === 4 || d === 7) seen.b = true;
    if (d === 3 || d === 6 || d === 9) seen.f = true;
    if (d >= 7) seen.u = true;
  }
  return seen.d && seen.b && seen.f && seen.u;
}

/** Double-tap in a direction (66 = dash, 44 = backdash). */
export function matchDoubleTap(h: History, facing: number, fwd: boolean): boolean {
  const want = fwd ? [6] : [4];
  const is = (age: number) => want.includes(numpad(at(h, age), facing));
  if (!is(0) || is(1)) return false; // need a fresh press now
  let gap = false;
  for (let age = 1; age <= 14; age++) {
    if (!is(age)) gap = true;
    else if (gap) return true;
  }
  return false;
}
