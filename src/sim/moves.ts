import type { Box, MoveDef, ProjDef } from './types';

const box = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });

type Partial2 = Partial<MoveDef> & Pick<MoveDef, 'startup' | 'active' | 'recovery' | 'damage' | 'pose'>;

export function mv(id: string, name: string, p: Partial2): MoveDef {
  return {
    id,
    name,
    kind: 'normal',
    height: 'mid',
    hitstun: 18,
    blockstun: 12,
    push: 1.5,
    box: box(0.8, 1.3, 0.4, 0.25),
    cancel: 1,
    linear: true,
    gore: 1,
    ...p,
  } as MoveDef;
}

export function proj(kind: string, p: Partial<ProjDef> & Pick<ProjDef, 'damage'>): ProjDef {
  return {
    kind,
    speed: 0.14,
    life: 90,
    y: 1.3,
    box: box(0, 0, 0.3, 0.3),
    hitstun: 20,
    blockstun: 14,
    push: 1.6,
    height: 'mid',
    hits: 1,
    linear: true,
    strength: 1,
    gore: 1,
    ...p,
  };
}

/** Shared normals every fighter starts with; characters override individual entries. */
export function baseNormals(): Record<string, MoveDef> {
  const m: MoveDef[] = [
    mv('5LP', 'Jab', { startup: 4, active: 2, recovery: 8, damage: 30, height: 'high', hitstun: 14, blockstun: 10, push: 1.0, box: box(0.75, 1.45, 0.38, 0.16), pose: 'jab', cancel: 1, chains: ['5LP', '5LK', '5HP', '2LP'], limb: 'fist', sfx: 'light', gore: 0, input: 'LP' }),
    mv('5HP', 'Straight', { startup: 8, active: 3, recovery: 16, damage: 70, height: 'high', hitstun: 20, blockstun: 14, push: 2.2, box: box(0.95, 1.4, 0.45, 0.18), pose: 'straight', cancel: 2, chains: ['6HK'], crumple: true, lunge: 0.35, limb: 'fist', sfx: 'heavy', gore: 1, input: 'HP' }),
    mv('5LK', 'Knee Poke', { startup: 5, active: 3, recovery: 10, damage: 35, hitstun: 15, blockstun: 10, push: 1.2, box: box(0.85, 0.9, 0.4, 0.2), pose: 'lkick', cancel: 1, chains: ['5HK', '5HP'], limb: 'foot', sfx: 'light', gore: 0, input: 'LK' }),
    mv('5HK', 'Roundhouse', { startup: 10, active: 4, recovery: 20, damage: 85, hitstun: 22, blockstun: 15, push: 3.6, box: box(1.05, 1.3, 0.5, 0.3), pose: 'roundhouse', cancel: 2, wallSplat: true, linear: false, limb: 'foot', sfx: 'heavy', gore: 2, input: 'HK' }),
    mv('2LP', 'Low Jab', { startup: 4, active: 2, recovery: 9, damage: 25, hitstun: 14, blockstun: 9, push: 0.9, box: box(0.75, 0.85, 0.38, 0.16), pose: 'lowjab', cancel: 1, chains: ['2LP', '2LK', '2HP', '5LP'], limb: 'fist', sfx: 'light', gore: 0, input: '↓+LP' }),
    mv('2HP', 'Launcher', { startup: 7, active: 4, recovery: 22, damage: 75, hitstun: 30, blockstun: 14, push: 0.6, launch: 10, box: box(0.6, 1.7, 0.4, 0.6), pose: 'uppercut', cancel: 2, jumpCancel: true, invuln: [1, 6], limb: 'fist', sfx: 'heavy', gore: 2, input: '↓+HP (launch, jump-cancel)' }),
    mv('2LK', 'Low Short', { startup: 5, active: 2, recovery: 11, damage: 28, height: 'low', hitstun: 15, blockstun: 9, push: 1.0, box: box(0.85, 0.2, 0.45, 0.18), pose: 'lowkick', cancel: 1, chains: ['2HK', '2HP'], limb: 'foot', sfx: 'light', gore: 0, input: '↓+LK' }),
    mv('2HK', 'Sweep', { startup: 9, active: 4, recovery: 24, damage: 70, height: 'low', hitstun: 22, blockstun: 14, push: 1.4, knockdown: true, launch: 3, box: box(1.1, 0.2, 0.55, 0.2), pose: 'sweep', cancel: 2, linear: false, limb: 'foot', sfx: 'heavy', gore: 1, input: '↓+HK (knockdown)' }),
    mv('6HP', 'Overhead Hammer', { startup: 18, active: 3, recovery: 16, damage: 80, height: 'overhead', hitstun: 20, blockstun: 12, push: 1.6, groundBounce: true, box: box(0.85, 1.2, 0.45, 0.45), pose: 'overhead', cancel: 2, lunge: 0.4, limb: 'fist', sfx: 'crunch', gore: 2, input: '→+HP (overhead, ground bounce)' }),
    mv('6HK', 'Wall Buster', { startup: 13, active: 4, recovery: 20, damage: 95, hitstun: 24, blockstun: 16, push: 5.2, wallSplat: true, box: box(1.0, 1.1, 0.5, 0.35), pose: 'sidekick', cancel: 2, lunge: 0.6, limb: 'foot', sfx: 'crunch', gore: 2, input: '→+HK (wall splat)' }),
    mv('3HK', 'Shin Breaker', { startup: 11, active: 3, recovery: 18, damage: 60, height: 'low', hitstun: 20, blockstun: 12, push: 1.0, otg: true, box: box(0.95, 0.25, 0.5, 0.3), pose: 'stomp', cancel: 2, limb: 'foot', sfx: 'crunch', gore: 2, input: '↘+HK (hits downed foes)' }),
    mv('jLP', 'Air Jab', { kind: 'air', startup: 4, active: 6, recovery: 6, damage: 35, height: 'overhead', hitstun: 15, blockstun: 10, push: 1.0, box: box(0.65, 0.95, 0.4, 0.3), pose: 'airpunch', cancel: 1, air: true, chains: ['jHP', 'jLK', 'jHK'], limb: 'fist', sfx: 'light', gore: 0, input: 'air LP' }),
    mv('jHP', 'Air Hammer', { kind: 'air', startup: 7, active: 5, recovery: 10, damage: 70, height: 'overhead', hitstun: 20, blockstun: 13, push: 1.6, groundBounce: true, box: box(0.7, 0.7, 0.45, 0.4), pose: 'airhpunch', cancel: 2, air: true, limb: 'fist', sfx: 'heavy', gore: 1, input: 'air HP (ground bounce)' }),
    mv('jLK', 'Air Knee', { kind: 'air', startup: 5, active: 8, recovery: 6, damage: 40, height: 'overhead', hitstun: 16, blockstun: 10, push: 1.2, box: box(0.6, 0.7, 0.4, 0.35), pose: 'airkick', cancel: 1, air: true, chains: ['jHK', 'jHP'], limb: 'foot', sfx: 'light', gore: 0, input: 'air LK' }),
    mv('jHK', 'Flying Kick', { kind: 'air', startup: 8, active: 6, recovery: 10, damage: 80, height: 'overhead', hitstun: 20, blockstun: 14, push: 2.6, box: box(0.9, 0.6, 0.5, 0.35), pose: 'airhkick', cancel: 2, air: true, limb: 'foot', sfx: 'heavy', gore: 1, input: 'air HK' }),
    mv('throw', 'Throw', { kind: 'throw', startup: 5, active: 2, recovery: 22, damage: 0, height: 'unblockable', hitstun: 0, blockstun: 0, push: 0, box: box(0.7, 1.1, 0.35, 0.5), pose: 'grab', cancel: 0, grab: { range: 0.95, dmg: 120, frames: 40, vx: 0.11, vy: 0.17 }, sfx: 'grab', gore: 1, input: 'LP+LK (←: back throw)' }),
    mv('wHP', 'Weapon Smash', { kind: 'weapon', startup: 10, active: 4, recovery: 18, damage: 115, hitstun: 24, blockstun: 16, push: 3.4, wallSplat: true, linear: false, box: box(1.15, 1.3, 0.55, 0.45), pose: 'swingH', cancel: 2, limb: 'weapon', sfx: 'crunch', gore: 3, input: 'HP with weapon' }),
    mv('wHK', 'Weapon Crusher', { kind: 'weapon', startup: 15, active: 5, recovery: 22, damage: 140, height: 'overhead', hitstun: 30, blockstun: 18, push: 1.2, launch: 9, groundBounce: true, box: box(1.05, 1.0, 0.55, 0.7), pose: 'swingV', cancel: 2, limb: 'weapon', sfx: 'crunch', gore: 3, input: 'HK with weapon' }),
    mv('wThrow', 'Weapon Toss', { kind: 'special', startup: 10, active: 1, recovery: 16, damage: 0, hitstun: 0, blockstun: 0, push: 0, box: box(0, 0, 0, 0), pose: 'cast', cancel: 3, projectile: proj('weapon', { damage: 95, speed: 0.22, knockdown: true, launch: 5, gore: 2, strength: 2 }), input: 'DODGE+HP with weapon' }),
    mv('taunt', 'Taunt', { kind: 'normal', startup: 50, active: 0, recovery: 0, damage: 0, hitstun: 0, blockstun: 0, push: 0, box: box(0, 0, 0, 0), pose: 'taunt', cancel: 0, input: 'TAUNT' }),
  ];
  const out: Record<string, MoveDef> = {};
  for (const x of m) out[x.id] = x;
  return out;
}

export { box };
