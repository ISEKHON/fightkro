import { describe, expect, it } from 'vitest';
import { B } from '../src/sim/input';
import { createMatch, step } from '../src/sim/sim';
import type { MatchState } from '../src/sim/types';

function fight(p1 = 'jumla', p2 = 'jumla', stage = 'assembly', extra = {}): MatchState {
  const s = createMatch({ p: [{ char: p1 }, { char: p2 }], stage, hazards: false, ...extra });
  let n = 0;
  while (s.phase !== 'fight' && n++ < 1000) step(s, [0, 0]);
  return s;
}

function run(s: MatchState, seq: (number | [number, number])[], frames = 0) {
  const events: string[] = [];
  for (const m of seq) {
    step(s, Array.isArray(m) ? m : [m, 0]);
    events.push(...s.events.map((e) => e.t));
  }
  for (let i = 0; i < frames; i++) {
    step(s, [0, 0]);
    events.push(...s.events.map((e) => e.t));
  }
  return events;
}

const close = (s: MatchState, d = 0.8) => {
  s.f[0].x = -d / 2;
  s.f[1].x = d / 2;
};

describe('advanced mechanics', () => {
  it('just parry: forward tap right before a hit negates damage', () => {
    const s = fight();
    close(s);
    // P2 starts a straight (8f startup); P1 taps toward P2 a few frames before impact
    const seq: [number, number][] = [];
    seq.push([0, B.HP]);
    for (let i = 0; i < 4; i++) seq.push([0, 0]);
    seq.push([B.R, 0]);
    for (let i = 0; i < 12; i++) seq.push([0, 0]);
    const ev = run(s, seq);
    expect(ev).toContain('parry');
    expect(s.f[0].hp).toBe(s.f[0].maxHp);
  });

  it('throw connects and can be teched with LP+LK', () => {
    const s = fight();
    close(s, 0.75);
    const ev1 = run(s, [B.LP | B.LK], 10);
    expect(ev1).toContain('grab');
    const s2 = fight();
    close(s2, 0.75);
    const seq: [number, number][] = [[B.LP | B.LK, 0]];
    for (let i = 0; i < 6; i++) seq.push([0, 0]);
    seq.push([0, B.LP | B.LK]);
    for (let i = 0; i < 6; i++) seq.push([0, 0]);
    const ev2 = run(s2, seq);
    expect(ev2).toContain('tech');
    expect(s2.f[1].hp).toBe(s2.f[1].maxHp);
  });

  it('rage cancel spends 50 rage and slows the opponent', () => {
    const s = fight();
    close(s);
    s.f[0].rage = 100;
    const ev = run(s, [B.HP, 0, 0, 0, 0, 0, 0, 0, 0, 0, B.RAGE], 20);
    expect(ev).toContain('rageCancel');
    expect(s.f[0].rage).toBeLessThanOrEqual(50);
  });

  it('burst breaks a combo once per round', () => {
    const s = fight();
    close(s);
    s.f[1].rage = 60;
    const seq: [number, number][] = [[B.HP, 0]];
    for (let i = 0; i < 11; i++) seq.push([0, 0]);
    seq.push([0, B.RAGE]);
    for (let i = 0; i < 10; i++) seq.push([0, 0]);
    const ev = run(s, seq);
    expect(ev).toContain('burst');
    expect(s.f[1].burstUsed).toBe(true);
  });

  it('sidestep evades a linear attack', () => {
    const s = fight();
    close(s);
    const seq: [number, number][] = [[0, B.DODGE | B.U]];
    seq.push([0, 0], [0, 0], [B.LP, 0]);
    for (let i = 0; i < 10; i++) seq.push([0, 0]);
    const ev = run(s, seq);
    expect(ev).toContain('evade');
    expect(s.f[1].hp).toBe(s.f[1].maxHp);
  });

  it('wall buster splats a cornered opponent', () => {
    const s = fight();
    s.f[1].x = 6.8;
    s.f[0].x = 5.9;
    const ev = run(s, [B.R | B.HK], 40);
    expect(ev).toContain('wallSplat');
  });

  it('decisive KO triggers FINISH HIM and a finisher input plays it', () => {
    const s = fight();
    close(s);
    s.f[0].wins = 1;
    s.f[1].hp = 1;
    const ev = run(s, [B.LP], 40);
    expect(ev).toContain('finishHim');
    expect(s.phase).toBe('finishHim');
    // let the invulnerability window pass, then ←→↓ + HK (facing right)
    run(s, [], 50);
    const fin = run(s, [B.L, B.L, B.R, B.R, B.D, B.D | B.HK, 0], 5);
    expect(fin).toContain('finisher');
    expect(s.phase).toBe('finisher');
    run(s, [], 320);
    expect(s.phase).toBe('matchOver');
    expect(s.matchWinner).toBe(0);
  });

  it('double jump and air dash work', () => {
    const s = fight();
    const ev = run(s, [B.U, B.U, B.U, B.U, B.U, 0, 0, 0, 0, 0, 0, 0, B.U, 0, 0, B.DODGE], 3);
    expect(ev.filter((e) => e === 'jump').length).toBe(2);
    expect(ev).toContain('dash');
  });

  it('weapon pickup and weapon smash', () => {
    const s = fight();
    s.f[0].x = -4.4; // chair at -4.5 in the assembly
    s.f[1].x = -3.5;
    const ev = run(s, [B.DODGE | B.HP], 20);
    expect(ev).toContain('pickup');
    expect(s.f[0].weapon).toBe('chair');
    const before = s.f[1].hp;
    run(s, [B.HP], 30);
    expect(s.f[1].hp).toBeLessThan(before - 60);
  });

  it('assist call spawns a partner attack', () => {
    const s = createMatch({ p: [{ char: 'jumla', assist: 'bulldozer' }, { char: 'jumla' }], stage: 'assembly', hazards: false });
    let n = 0;
    while (s.phase !== 'fight' && n++ < 1000) step(s, [0, 0]);
    s.f[0].assistCd = 0;
    s.f[1].x = 0.5;
    s.f[0].x = -1.5;
    const ev = run(s, [B.ASSIST], 60);
    expect(ev).toContain('assist');
    expect(s.f[1].hp).toBeLessThan(s.f[1].maxHp);
  });

  it('super costs 2 bars and plays the super freeze', () => {
    const s = fight();
    close(s, 2);
    s.f[0].meter = 200;
    const ev = run(s, [B.D, B.D | B.R, B.R, B.D, B.D | B.R, B.R | B.LP], 60);
    expect(ev).toContain('super');
    expect(s.f[0].meter).toBeLessThan(100);
  });

  it('charge input: hold back then forward + K (Ghotala Hawala Charge)', () => {
    const s = fight('ghotala', 'jumla');
    close(s, 3);
    const seq: number[] = [];
    for (let i = 0; i < 40; i++) seq.push(B.L);
    seq.push(B.R, B.R | B.LK);
    run(s, seq);
    expect(s.f[0].move).toBe('gHawalaL');
  });

  it('360 command grab (Bahubali)', () => {
    const s = fight('bahubali', 'jumla');
    close(s, 0.9);
    const ev = run(s, [B.R, B.R | B.D, B.D, B.D | B.L, B.L, B.L | B.U, B.U | B.LP], 80);
    expect(ev).toContain('grab');
    expect(s.f[1].hp).toBeLessThan(s.f[1].maxHp - 150);
  });

  it('guard crush after sustained blocking', () => {
    const s = fight();
    close(s);
    const seq: [number, number][] = [];
    let crushed = false;
    for (let k = 0; k < 40 && !crushed; k++) {
      seq.length = 0;
      seq.push([B.HK, B.R]);
      for (let i = 0; i < 34; i++) seq.push([0, B.R]);
      const ev = run(s, seq);
      if (ev.includes('guardCrush')) crushed = true;
      close(s);
    }
    expect(crushed).toBe(true);
  });

  it('time-up awards the round to the healthier fighter', () => {
    const s = fight('jumla', 'jumla', 'assembly', { timer: 2 });
    s.f[1].hp = 500;
    run(s, [], 200);
    expect(s.f[0].wins).toBe(1);
  });
});
