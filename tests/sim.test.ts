import { describe, expect, it } from 'vitest';
import { B } from '../src/sim/input';
import { createMatch, hashState, step, cloneState } from '../src/sim/sim';
import { PLAYABLE, ROSTER } from '../src/sim/roster';
import type { MatchState } from '../src/sim/types';

function run(s: MatchState, frames: number, a: (f: number) => number, b: (f: number) => number = () => 0) {
  for (let i = 0; i < frames; i++) step(s, [a(s.frame), b(s.frame)]);
}

function toFight(s: MatchState) {
  let n = 0;
  while (s.phase !== 'fight' && n++ < 1000) step(s, [0, 0]);
}

function lcg(seed: number) {
  let x = seed;
  return () => {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    return x;
  };
}

describe('sim', () => {
  it('reaches the fight phase', () => {
    const s = createMatch({ p: [{ char: 'jumla' }, { char: 'ghotala' }], stage: 'assembly' });
    toFight(s);
    expect(s.phase).toBe('fight');
  });

  it('is deterministic across 3600 frames of random input for every matchup', () => {
    for (const c of ROSTER) {
      const make = () => createMatch({ p: [{ char: c.id }, { char: PLAYABLE[(ROSTER.indexOf(c) + 3) % PLAYABLE.length] }], stage: 'tollplaza', seed: 99 });
      const r1 = lcg(7), r2 = lcg(7);
      const s1 = make(), s2 = make();
      const masks1: number[] = [];
      for (let i = 0; i < 3600; i++) {
        const a = r1() & 0x1fff, b = (r1() >>> 3) & 0x1fff;
        masks1.push(a, b);
        step(s1, [a, b]);
      }
      for (let i = 0; i < 3600; i++) {
        const a = r2() & 0x1fff, b = (r2() >>> 3) & 0x1fff;
        step(s2, [a, b]);
      }
      expect(hashState(s1)).toBe(hashState(s2));
      expect(Number.isFinite(s1.f[0].x)).toBe(true);
    }
  });

  it('clone + resimulate gives identical state (rollback)', () => {
    const s = createMatch({ p: [{ char: 'didi' }, { char: 'anchor' }], stage: 'studio', seed: 5 });
    const r = lcg(3);
    const inputs: [number, number][] = [];
    for (let i = 0; i < 900; i++) inputs.push([r() & 0x1fff, r() & 0x1fff]);
    for (let i = 0; i < 600; i++) step(s, inputs[i]);
    const snap = cloneState(s);
    for (let i = 600; i < 900; i++) step(s, inputs[i]);
    const h1 = hashState(s);
    for (let i = 600; i < 900; i++) step(snap, inputs[i]);
    expect(hashState(snap)).toBe(h1);
  });

  it('a jab hits and deals damage', () => {
    const s = createMatch({ p: [{ char: 'jumla' }, { char: 'jumla' }], stage: 'assembly' });
    toFight(s);
    s.f[0].x = -0.4;
    s.f[1].x = 0.4;
    run(s, 1, () => B.LP);
    run(s, 20, () => 0);
    expect(s.f[1].hp).toBeLessThan(s.f[1].maxHp);
  });

  it('blocking a jab prevents damage', () => {
    const s = createMatch({ p: [{ char: 'jumla' }, { char: 'jumla' }], stage: 'assembly' });
    toFight(s);
    s.f[0].x = -0.4;
    s.f[1].x = 0.4;
    run(s, 1, () => B.LP, () => B.R);
    run(s, 20, () => 0, () => B.R);
    expect(s.f[1].hp).toBe(s.f[1].maxHp);
  });

  it('quarter-circle forward + punch throws a projectile', () => {
    const s = createMatch({ p: [{ char: 'jumla' }, { char: 'jumla' }], stage: 'assembly' });
    toFight(s);
    const seq = [B.D, B.D, B.D | B.R, B.D | B.R, B.R, B.R | B.LP];
    let i = 0;
    let saw = false;
    for (let k = 0; k < 30; k++) {
      step(s, [seq[i++] ?? 0, 0]);
      if (s.events.some((e) => e.t === 'proj')) saw = true;
    }
    expect(saw).toBe(true);
  });

  it('chains 5LP > 5LP > 5HP into a 3-hit combo', () => {
    const s = createMatch({ p: [{ char: 'jumla' }, { char: 'jumla' }], stage: 'assembly' });
    toFight(s);
    s.f[0].x = -0.35;
    s.f[1].x = 0.35;
    s.f[1].x = 6.5; // put the defender in the corner so pushback doesn't separate
    s.f[0].x = 5.8;
    const presses: Record<number, number> = { 0: B.LP, 8: B.LP, 16: B.HP };
    let best = 0;
    for (let k = 0; k < 60; k++) {
      step(s, [presses[k] ?? 0, 0]);
      best = Math.max(best, s.f[1].comboHits);
    }
    expect(best).toBeGreaterThanOrEqual(3);
  });

  it('a full match against a random masher always ends', () => {
    const s = createMatch({ p: [{ char: 'bahubali' }, { char: 'votechor' }], stage: 'maidan', seed: 2, timer: 30 });
    const r = lcg(11);
    let n = 0;
    while (s.phase !== 'matchOver' && n++ < 60 * 60 * 6) step(s, [r() & 0x1fff, r() & 0x1fff]);
    expect(s.phase).toBe('matchOver');
  });
});
