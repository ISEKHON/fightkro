import { baseNormals, box, mv, proj } from './moves';
import type { AssistDef, CharDef, CharStats, FinisherDef, MoveDef, SpecialInput } from './types';
import type { MotionName } from './motion';

type MovePartial = Parameters<typeof mv>[2];

/** Build light / heavy / EX versions of a special from one definition. */
function tri(
  out: Record<string, MoveDef>,
  id: string,
  name: string,
  base: MovePartial,
  heavy: Partial<MoveDef> = {},
  ex: Partial<MoveDef> = {},
): { l: string; h: string; ex: string } {
  const b = { kind: 'special' as const, cancel: 3, gore: 2, ...base };
  out[id + 'L'] = mv(id + 'L', name, b);
  out[id + 'H'] = mv(id + 'H', name + ' (H)', {
    ...b,
    startup: b.startup + 2,
    damage: Math.round(b.damage * 1.2),
    push: b.push ? b.push * 1.2 : 2,
    ...heavy,
  });
  out[id + 'X'] = mv(id + 'X', 'EX ' + name, {
    ...b,
    damage: Math.round(b.damage * 1.35),
    meterCost: 100,
    invuln: [0, Math.max(4, b.startup)],
    gore: 3,
    ...ex,
  });
  return { l: id + 'L', h: id + 'H', ex: id + 'X' };
}

function sp(motion: MotionName, btn: 'P' | 'K', v: { l: string; h: string; ex: string }): SpecialInput {
  return { motion, btn, ...v };
}

const fin = (id: string, name: string, motion: MotionName, btn: FinisherDef['btn'], kind: FinisherDef['kind'], range = 2.6, frames = 300): FinisherDef => ({ id, name, motion, btn, kind, range, frames });

function stats(p: Partial<CharStats>): CharStats {
  return { hp: 1000, walk: 0.045, back: 0.034, dash: 0.15, jumpV: 0.185, jumpVx: 0.07, gravity: 0.0095, power: 1, width: 0.36, height: 1.8, ...p };
}

function superMove(id: string, name: string, p: MovePartial): MoveDef {
  return mv(id, name, { kind: 'super', cancel: 4, meterCost: 200, gore: 3, invuln: [0, 10], wallBreak: true, sfx: 'super', ...p });
}

function xrayMove(id: string, name: string, p: Partial<MovePartial> = {}): MoveDef {
  return mv(id, name, {
    kind: 'xray',
    startup: 9,
    active: 4,
    recovery: 30,
    damage: 330,
    hitstun: 60,
    blockstun: 20,
    push: 2,
    launch: 4,
    knockdown: true,
    box: box(1.0, 1.2, 0.6, 0.6),
    pose: 'rush',
    cancel: 4,
    meterCost: 300,
    invuln: [0, 12],
    lunge: 2.2,
    gore: 4,
    wallBreak: true,
    sfx: 'xray',
    input: '↓↘→↓↘→ + HP+HK',
    ...p,
  });
}

const commonFinishers = (a: string, b: string, c: string, cName: string, aName: string, bName: string): FinisherDef[] => [
  fin(a, aName, 'BFD', 'HK', 'brutal'),
  fin(b, bName, 'DDOWN', 'HP', 'brutal'),
  fin(c, cName, 'FBF', 'HP', 'comedy', 99),
  fin('stage', 'Stage Finisher', 'DDOWN', 'LK', 'stage', 99),
];

function assist(p: Partial<AssistDef> & { name: string }): AssistDef {
  return { frames: 60, activeFrom: 18, activeTo: 26, vx: 0.12, box: box(0.7, 1.1, 0.5, 0.5), damage: 70, launch: 7, push: 2, hitstun: 30, pose: 'rush', ...p };
}

// ------------------------------------------------------------------------------------------
// 1. JUMLA KUMAR — the promise machine. Balanced shoto: fireball, rising uppercut, rush kick.
function jumla(): CharDef {
  const m = baseNormals();
  const s1 = tri(m as never, 'jWave', 'Jumla Wave', {
    startup: 12, active: 1, recovery: 26, damage: 0, hitstun: 0, blockstun: 0, push: 0, box: box(0, 0, 0, 0), pose: 'cast',
    projectile: proj('promise', { damage: 60, speed: 0.13, hitstun: 22, blockstun: 16 }), input: '↓↘→ + P',
  }, { projectile: proj('promise', { damage: 75, speed: 0.19, hitstun: 22, blockstun: 16 }) },
  { projectile: proj('promise', { damage: 45, speed: 0.17, hits: 3, hitEvery: 6, hitstun: 26, blockstun: 18, strength: 3, knockdown: true, launch: 4 }) });
  const s2 = tri(m as never, 'jDin', 'Achha Din Uppercut', {
    startup: 4, active: 10, recovery: 28, damage: 110, hitstun: 30, blockstun: 18, push: 1, launch: 13, knockdown: true,
    box: box(0.55, 1.6, 0.45, 0.8), pose: 'dragonpunch', invuln: [0, 6], vy: 0.2, airborne: true, travel: 0.04, input: '→↓↘ + P',
  }, { damage: 140, vy: 0.24, launch: 15 }, { hits: 3, hitEvery: 4, damage: 60, invuln: [0, 14], vy: 0.26 });
  const s3 = tri(m as never, 'jRush', 'Mann Ki Kick', {
    startup: 10, active: 10, recovery: 20, damage: 90, hitstun: 24, blockstun: 12, push: 3, travel: 0.17, wallSplat: true,
    box: box(0.8, 1.0, 0.55, 0.5), pose: 'flyingkick', linear: false, input: '↓↙← + K',
  }, { travel: 0.21, damage: 110 }, { hits: 2, hitEvery: 5, armor: [0, 12], travel: 0.22 });
  m['super1'] = superMove('super1', 'Maha Jumla Barrage', {
    startup: 8, active: 1, recovery: 40, damage: 0, hitstun: 0, blockstun: 0, push: 0, box: box(0, 0, 0, 0), pose: 'cast2',
    projectile: proj('megaPromise', { damage: 70, speed: 0.2, hits: 5, hitEvery: 5, hitstun: 40, blockstun: 22, strength: 9, box: box(0, 0, 0.7, 0.7), knockdown: true, launch: 6, gore: 3 }),
    input: '↓↘→↓↘→ + P',
  });
  m['xray'] = xrayMove('xray', 'Note-Ban Spine Snap');
  return {
    id: 'jumla', name: 'JUMLA KUMAR', title: 'The Promise Machine', party: 'Vikas Vaada Party',
    bio: 'Has promised everything to everyone, twice. Delivers only uppercuts.', slogan: 'Har vaada, har baar!',
    stats: stats({}), moves: m,
    specials: [sp('DP', 'P', s2), sp('QCF', 'P', s1), sp('QCB', 'K', s3)],
    supers: [{ motion: 'QCF2', btn: 'P', move: 'super1' }], xray: 'xray',
    finishers: commonFinishers('jF1', 'jF2', 'jC', 'Selfie Statue', 'Promise Shredder', 'Fifteen Lakh Pieces'),
    assist: assist({ name: 'Jumla Wave', pose: 'cast', projectile: proj('promise', { damage: 55, speed: 0.16 }), activeFrom: 20, activeTo: 21 }),
  };
}

// 2. GHOTALA SETH — heavy money bruiser with armor and lobs.
function ghotala(): CharDef {
  const m = baseNormals();
  m['5HP'] = mv('5HP', 'Moneybag Swing', { ...m['5HP'], startup: 10, damage: 90, box: box(1.15, 1.2, 0.55, 0.35), pose: 'swingH', limb: 'weapon' });
  const s1 = tri(m as never, 'gLob', 'Black Money Lob', {
    startup: 14, active: 1, recovery: 24, damage: 0, hitstun: 0, blockstun: 0, push: 0, box: box(0, 0, 0, 0), pose: 'lob',
    projectile: proj('moneybag', { damage: 80, speed: 0.08, vy: 0.2, gravity: 0.008, height: 'overhead', knockdown: true, launch: 4, box: box(0, 0, 0.4, 0.4), strength: 2 }), input: '↓↙← + P',
  }, { projectile: proj('moneybag', { damage: 95, speed: 0.13, vy: 0.21, gravity: 0.008, height: 'overhead', knockdown: true, launch: 4, box: box(0, 0, 0.4, 0.4), strength: 2 }) },
  { projectile: proj('moneybag', { damage: 55, speed: 0.1, vy: 0.22, gravity: 0.008, height: 'overhead', count: 3, spread: 0.035, knockdown: true, launch: 4, box: box(0, 0, 0.4, 0.4), strength: 3 }) });
  const s2 = tri(m as never, 'gHawala', 'Hawala Charge', {
    startup: 12, active: 14, recovery: 22, damage: 110, hitstun: 26, blockstun: 16, push: 4, travel: 0.16, armor: [0, 16], wallSplat: true,
    box: box(0.75, 1.1, 0.55, 0.6), pose: 'rush', limb: 'body', input: '[←] → + K (charge)',
  }, { travel: 0.2, damage: 135 }, { armor: [0, 26], damage: 150, wallBreak: true });
  const s3 = tri(m as never, 'gBribe', 'Bribe Grab', {
    kind: 'cmdgrab', startup: 6, active: 3, recovery: 30, damage: 0, hitstun: 0, blockstun: 0, push: 0, height: 'unblockable',
    box: box(0.75, 1.1, 0.4, 0.6), pose: 'grab', grab: { range: 1.15, dmg: 190, frames: 60, vx: 0.05, vy: 0.22, cmd: true }, input: '360 + P',
  }, { grab: { range: 1.0, dmg: 230, frames: 70, vx: 0.05, vy: 0.24, cmd: true } }, { grab: { range: 1.6, dmg: 260, frames: 80, vx: 0.05, vy: 0.25, cmd: true } });
  m['super1'] = superMove('super1', 'Swiss Bank Avalanche', {
    startup: 10, active: 30, recovery: 30, damage: 40, hits: 8, hitEvery: 4, hitstun: 40, blockstun: 20, push: 0.6, launch: 6, knockdown: true,
    box: box(1.6, 1.0, 1.4, 1.2), pose: 'cast2', linear: false, input: '↓↘→↓↘→ + P',
  });
  m['xray'] = xrayMove('xray', 'Kickback Crunch', { pose: 'swingV' });
  return {
    id: 'ghotala', name: 'GHOTALA SETH', title: 'Scam Emperor', party: 'Paisa Pehle Party',
    bio: 'Owns three islands, two ministers and zero tax receipts.', slogan: 'Sab bikta hai!',
    stats: stats({ hp: 1120, walk: 0.036, back: 0.028, dash: 0.12, jumpV: 0.17, power: 1.08, width: 0.46, height: 1.75 }), moves: m,
    specials: [sp('SPD', 'P', s3), sp('CHARGE_BF', 'K', s2), sp('QCB', 'P', s1)],
    supers: [{ motion: 'QCF2', btn: 'P', move: 'super1' }], xray: 'xray',
    finishers: commonFinishers('gF1', 'gF2', 'gC', 'Audit Ambush', 'Coin Crush', 'Vault Slam'),
    assist: assist({ name: 'Coin Rain', pose: 'lob', projectile: proj('coins', { damage: 50, speed: 0.1, vy: 0.18, gravity: 0.008, height: 'overhead', knockdown: true }), activeFrom: 18, activeTo: 19 }),
  };
}

// 3. BULLDOZER BHAIYA — rushdown with armored charges and a command grab.
function bulldozer(): CharDef {
  const m = baseNormals();
  m['6HK'] = mv('6HK', 'Bucket Kick', { ...m['6HK'], damage: 105, push: 6 });
  const s1 = tri(m as never, 'bCharge', 'Demolition Charge', {
    startup: 9, active: 16, recovery: 20, damage: 100, hitstun: 26, blockstun: 16, push: 5, travel: 0.19, armor: [0, 14], wallSplat: true,
    box: box(0.8, 1.1, 0.6, 0.6), pose: 'rush', limb: 'body', input: '[←] → + P (charge)',
  }, { travel: 0.24, damage: 125 }, { armor: [0, 24], damage: 140, wallBreak: true });
  const s2 = tri(m as never, 'bSlam', 'Bucket Slam', {
    startup: 16, active: 6, recovery: 20, damage: 110, height: 'overhead', hitstun: 26, blockstun: 16, push: 1.2, groundBounce: true, vy: 0.17, airborne: true, travel: 0.09,
    box: box(0.6, 0.5, 0.65, 0.6), pose: 'slam', linear: false, input: '→↓↘ + K',
  }, { travel: 0.12, damage: 130 }, { invuln: [0, 12], damage: 150 });
  const s3 = tri(m as never, 'bGrab', 'Encroachment Removal', {
    kind: 'cmdgrab', startup: 5, active: 3, recovery: 32, damage: 0, hitstun: 0, blockstun: 0, push: 0, height: 'unblockable',
    box: box(0.75, 1.1, 0.4, 0.6), pose: 'grab', grab: { range: 1.1, dmg: 200, frames: 64, vx: 0.14, vy: 0.2, cmd: true }, input: '360 + K',
  }, { grab: { range: 1.0, dmg: 240, frames: 70, vx: 0.15, vy: 0.22, cmd: true } }, { grab: { range: 1.5, dmg: 270, frames: 80, vx: 0.16, vy: 0.24, cmd: true } });
  m['super1'] = superMove('super1', 'Full Bulldoze', {
    startup: 12, active: 28, recovery: 26, damage: 260, hitstun: 50, blockstun: 22, push: 6, travel: 0.28, knockdown: true, launch: 7,
    box: box(1.0, 1.0, 0.9, 1.0), pose: 'rush', armor: [0, 40], linear: false, input: '↓↘→↓↘→ + P',
  });
  m['xray'] = xrayMove('xray', 'Demolition X-Ray', { pose: 'swingV' });
  return {
    id: 'bulldozer', name: 'BULLDOZER BHAIYA', title: 'The Demolisher', party: 'Mitti Mein Mila Do Morcha',
    bio: 'Solves every problem with a bulldozer. Every. Single. One.', slogan: 'Pehle girao, baad mein socho!',
    stats: stats({ hp: 1080, walk: 0.042, dash: 0.17, power: 1.05, width: 0.42, height: 1.85 }), moves: m,
    specials: [sp('SPD', 'K', s3), sp('CHARGE_BF', 'P', s1), sp('DP', 'K', s2)],
    supers: [{ motion: 'QCF2', btn: 'P', move: 'super1' }], xray: 'xray',
    finishers: commonFinishers('bF1', 'bF2', 'bC', 'Illegal Construction', 'Bulldozer Flat', 'Rubble Burial'),
    assist: assist({ name: 'Mini Dozer', vx: 0.22, frames: 70, activeFrom: 14, activeTo: 40, damage: 80, push: 4, pose: 'rush' }),
  };
}

// 4. VOTECHOR VIKAS — trickster: teleports, low slides, multi-hit projectiles.
function votechor(): CharDef {
  const m = baseNormals();
  m['5LK'] = mv('5LK', 'Sneaky Shin', { ...m['5LK'], height: 'low', box: box(0.85, 0.3, 0.45, 0.2) });
  const s1 = tri(m as never, 'vPort', 'Ballot Box Warp', {
    startup: 14, active: 1, recovery: 14, damage: 0, hitstun: 0, blockstun: 0, push: 0, box: box(0, 0, 0, 0), pose: 'teleport', teleport: -1.0, invuln: [2, 16], input: '→↓↘ + K (behind)',
  }, { teleport: 1.2 }, { teleport: -1.0, startup: 8, invuln: [0, 12] });
  const s2 = tri(m as never, 'vSlide', 'EVM Slide', {
    startup: 8, active: 14, recovery: 18, damage: 70, height: 'low', hitstun: 22, blockstun: 12, push: 1.6, travel: 0.18, knockdown: true, launch: 4,
    box: box(0.8, 0.3, 0.6, 0.3), pose: 'slide', linear: false, input: '↓↘→ + K',
  }, { travel: 0.22 }, { hits: 3, hitEvery: 5, damage: 40, invuln: [0, 10] });
  const s3 = tri(m as never, 'vSwarm', 'Bogus Voter Swarm', {
    startup: 13, active: 1, recovery: 24, damage: 0, hitstun: 0, blockstun: 0, push: 0, box: box(0, 0, 0, 0), pose: 'cast',
    projectile: proj('ballots', { damage: 22, speed: 0.11, hits: 4, hitEvery: 6, hitstun: 18, blockstun: 10, box: box(0, 0, 0.45, 0.45) }), input: '↓↘→ + P',
  }, { projectile: proj('ballots', { damage: 26, speed: 0.15, hits: 4, hitEvery: 6, hitstun: 18, blockstun: 10, box: box(0, 0, 0.45, 0.45) }) },
  { projectile: proj('ballots', { damage: 24, speed: 0.13, hits: 7, hitEvery: 5, hitstun: 22, blockstun: 12, strength: 3, box: box(0, 0, 0.6, 0.6), knockdown: true, launch: 4 }) });
  m['super1'] = superMove('super1', 'Booth Capture', {
    kind: 'super', startup: 7, active: 4, recovery: 34, damage: 0, hitstun: 0, blockstun: 0, push: 0, height: 'unblockable',
    box: box(0.9, 1.1, 0.6, 0.8), pose: 'grab', grab: { range: 1.6, dmg: 320, frames: 110, vx: 0.08, vy: 0.25, cmd: true }, input: '↓↘→↓↘→ + K',
  });
  m['xray'] = xrayMove('xray', 'Rigged Ribcage', { pose: 'flyingkick' });
  return {
    id: 'votechor', name: 'VOTECHOR VIKAS', title: 'The Booth Ninja', party: 'Gupt Matdaan Sangh',
    bio: 'Won 112% of the vote in his own constituency. Twice.', slogan: 'Vote tumhara, jeet hamari!',
    stats: stats({ hp: 940, walk: 0.052, back: 0.042, dash: 0.18, jumpV: 0.195, jumpVx: 0.08, width: 0.33, height: 1.75 }), moves: m,
    specials: [sp('DP', 'K', s1), sp('QCF', 'K', s2), sp('QCF', 'P', s3)],
    supers: [{ motion: 'QCF2', btn: 'K', move: 'super1' }], xray: 'xray',
    finishers: commonFinishers('vF1', 'vF2', 'vC', 'Recount Forever', 'Stamp of Doom', 'Ballot Stuffing'),
    assist: assist({ name: 'Slide Tackle', vx: 0.2, pose: 'slide', box: box(0.8, 0.3, 0.6, 0.3), activeFrom: 12, activeTo: 34, damage: 60, launch: 5 }),
  };
}

// 5. DIDI DHAMAKA — aggressive with a rage-install super.
function didi(): CharDef {
  const m = baseNormals();
  m['5LP'] = mv('5LP', 'Slap', { ...m['5LP'], damage: 34, pose: 'slap', sfx: 'slap' });
  const s1 = tri(m as never, 'dChappal', 'Chappal Shot', {
    startup: 9, active: 1, recovery: 22, damage: 0, hitstun: 0, blockstun: 0, push: 0, box: box(0, 0, 0, 0), pose: 'cast',
    projectile: proj('chappal', { damage: 50, speed: 0.2, y: 1.45, box: box(0, 0, 0.22, 0.18), height: 'high' }), input: '↓↘→ + P',
  }, { projectile: proj('chappal', { damage: 58, speed: 0.26, y: 1.45, box: box(0, 0, 0.22, 0.18), height: 'high' }) },
  { projectile: proj('chappal', { damage: 40, speed: 0.24, count: 3, spread: 0.03, vy: 0.04, gravity: 0.002, y: 1.3, box: box(0, 0, 0.25, 0.2), strength: 3 }) });
  const s2 = tri(m as never, 'dSpin', 'Tantrum Tornado', {
    startup: 5, active: 20, recovery: 22, damage: 30, hits: 4, hitEvery: 5, hitstun: 18, blockstun: 10, push: 1.2, travel: 0.06, launch: 7,
    box: box(0.3, 1.2, 0.8, 0.7), pose: 'spin', invuln: [0, 8], linear: false, input: '→↓↘ + P',
  }, { hits: 5, travel: 0.08 }, { hits: 6, invuln: [0, 18], damage: 30 });
  const s3 = tri(m as never, 'dRoll', 'Rally Roll', {
    startup: 7, active: 16, recovery: 16, damage: 75, hitstun: 22, blockstun: 12, push: 2.5, travel: 0.2, knockdown: true, launch: 6,
    box: box(0.6, 0.6, 0.6, 0.6), pose: 'roll', linear: false, input: '↓↙← + K',
  }, { travel: 0.25 }, { damage: 100, invuln: [0, 20] });
  m['super1'] = superMove('super1', 'Dhamaka Mode', {
    startup: 30, active: 1, recovery: 10, damage: 0, hitstun: 0, blockstun: 0, push: 0, box: box(0, 0, 0, 0), pose: 'powerup', install: 480, invuln: [0, 30], wallBreak: false, input: '↓↘→↓↘→ + K (rage install)',
  });
  m['super2'] = superMove('super2', 'Slipper Storm', {
    startup: 8, active: 1, recovery: 34, damage: 0, hitstun: 0, blockstun: 0, push: 0, box: box(0, 0, 0, 0), pose: 'cast2',
    projectile: proj('chappalStorm', { damage: 45, speed: 0.24, hits: 6, hitEvery: 4, hitstun: 40, blockstun: 20, strength: 9, box: box(0, 0, 0.8, 0.8), knockdown: true, launch: 7, gore: 2 }), input: '↓↘→↓↘→ + P',
  });
  m['xray'] = xrayMove('xray', 'Dhamaka Detonation', { pose: 'slap' });
  return {
    id: 'didi', name: 'DIDI DHAMAKA', title: 'The Firecracker', party: 'Jal Uthho Jan Morcha',
    bio: 'Has never lost an argument. Has also never ended one.', slogan: 'Aaj toh dhamaka hoga!',
    stats: stats({ hp: 960, walk: 0.05, dash: 0.17, jumpV: 0.19, width: 0.33, height: 1.65 }), moves: m,
    specials: [sp('DP', 'P', s2), sp('QCF', 'P', s1), sp('QCB', 'K', s3)],
    supers: [{ motion: 'QCF2', btn: 'K', move: 'super1' }, { motion: 'QCF2', btn: 'P', move: 'super2' }], xray: 'xray',
    finishers: commonFinishers('dF1', 'dF2', 'dC', 'Dharna Forever', 'Chappal Execution', 'Firecracker Finale'),
    assist: assist({ name: 'Chappal Toss', pose: 'cast', projectile: proj('chappal', { damage: 45, speed: 0.24, y: 1.45, height: 'high' }), activeFrom: 14, activeTo: 15 }),
  };
}

// 6. BAHUBALI BHAIYA — grappler, slow but devastating.
function bahubali(): CharDef {
  const m = baseNormals();
  m['5HP'] = mv('5HP', 'Lariat Arm', { ...m['5HP'], startup: 11, damage: 95, box: box(1.05, 1.4, 0.55, 0.3), pose: 'lariat' });
  m['throw'] = mv('throw', 'Body Slam', { ...m['throw'], grab: { range: 1.05, dmg: 150, frames: 48, vx: 0.04, vy: 0.12 } });
  const s1 = tri(m as never, 'hSuplex', 'Dynasty Suplex', {
    kind: 'cmdgrab', startup: 4, active: 3, recovery: 34, damage: 0, hitstun: 0, blockstun: 0, push: 0, height: 'unblockable',
    box: box(0.75, 1.1, 0.4, 0.6), pose: 'grab', grab: { range: 1.15, dmg: 230, frames: 70, vx: -0.06, vy: 0.25, cmd: true }, input: '360 + P',
  }, { grab: { range: 1.05, dmg: 270, frames: 80, vx: -0.06, vy: 0.27, cmd: true } }, { grab: { range: 1.7, dmg: 300, frames: 90, vx: -0.06, vy: 0.28, cmd: true } });
  const s2 = tri(m as never, 'hLariat', 'Padyatra Lariat', {
    startup: 10, active: 14, recovery: 22, damage: 100, hitstun: 26, blockstun: 16, push: 3.5, travel: 0.13, armor: [0, 14], knockdown: true, launch: 6,
    box: box(0.8, 1.4, 0.7, 0.4), pose: 'lariat', linear: false, input: '↓↘→ + P',
  }, { travel: 0.17, damage: 125 }, { armor: [0, 24], damage: 140 });
  const s3 = tri(m as never, 'hHug', 'Bear Hug Diplomacy', {
    kind: 'cmdgrab', startup: 8, active: 6, recovery: 30, damage: 0, hitstun: 0, blockstun: 0, push: 0, height: 'unblockable', travel: 0.12,
    box: box(0.75, 1.1, 0.5, 0.6), pose: 'grab', grab: { range: 1.2, dmg: 170, frames: 70, vx: 0.08, vy: 0.15, cmd: true }, input: '↓↙← + K (running grab)',
  }, { travel: 0.16, grab: { range: 1.2, dmg: 190, frames: 70, vx: 0.08, vy: 0.15, cmd: true } }, { travel: 0.2, invuln: [0, 10], grab: { range: 1.4, dmg: 220, frames: 75, vx: 0.08, vy: 0.15, cmd: true } });
  m['super1'] = superMove('super1', 'Akhada Annihilation', {
    kind: 'super', startup: 4, active: 4, recovery: 40, damage: 0, hitstun: 0, blockstun: 0, push: 0, height: 'unblockable',
    box: box(0.9, 1.1, 0.6, 0.8), pose: 'grab', grab: { range: 1.8, dmg: 400, frames: 130, vx: 0.04, vy: 0.3, cmd: true }, input: '↓↘→↓↘→ + P',
  });
  m['xray'] = xrayMove('xray', 'Spine Suplex X-Ray', { pose: 'lariat' });
  return {
    id: 'bahubali', name: 'BAHUBALI BHAIYA', title: 'The Local Don', party: 'Dabangg Dal',
    bio: 'Wins every election unopposed. Opponents tend to "change their mind".', slogan: 'Area hamara, rules hamare!',
    stats: stats({ hp: 1180, walk: 0.034, back: 0.026, dash: 0.11, jumpV: 0.165, jumpVx: 0.06, power: 1.12, width: 0.5, height: 1.95 }), moves: m,
    specials: [sp('SPD', 'P', s1), sp('QCF', 'P', s2), sp('QCB', 'K', s3)],
    supers: [{ motion: 'QCF2', btn: 'P', move: 'super1' }], xray: 'xray',
    finishers: commonFinishers('hF1', 'hF2', 'hC', 'Akhada Wedding', 'Pile Driver', 'Spine Breaker'),
    assist: assist({ name: 'Lariat Dash', vx: 0.16, pose: 'lariat', activeFrom: 14, activeTo: 32, damage: 80, launch: 8 }),
  };
}

// 7. TOLLTAX TAU — zoner with barriers, traps and fast shots.
function tolltax(): CharDef {
  const m = baseNormals();
  m['5HK'] = mv('5HK', 'Lathi Sweep', { ...m['5HK'], box: box(1.25, 1.2, 0.55, 0.3), limb: 'weapon', pose: 'swingH' });
  const s1 = tri(m as never, 'tTag', 'FASTag Zap', {
    startup: 10, active: 1, recovery: 22, damage: 0, hitstun: 0, blockstun: 0, push: 0, box: box(0, 0, 0, 0), pose: 'cast',
    projectile: proj('zap', { damage: 45, speed: 0.24, y: 1.25, box: box(0, 0, 0.3, 0.12) }), input: '↓↘→ + P',
  }, { projectile: proj('zap', { damage: 55, speed: 0.32, y: 1.0, box: box(0, 0, 0.3, 0.12) }) },
  { projectile: proj('zap', { damage: 35, speed: 0.3, hits: 3, hitEvery: 4, y: 1.15, box: box(0, 0, 0.45, 0.2), strength: 3, stunOnHit: 50 }) });
  const s2 = tri(m as never, 'tBarrier', 'Toll Barrier', {
    startup: 16, active: 1, recovery: 20, damage: 0, hitstun: 0, blockstun: 0, push: 0, box: box(0, 0, 0, 0), pose: 'slam',
    projectile: proj('barrier', { damage: 40, speed: 0, stationary: true, life: 220, y: 0.8, box: box(1.6, 0, 0.25, 0.8), hits: 3, hitEvery: 20, strength: 5, push: 3, linear: false }), input: '↓↘→ + K (wall)',
  }, { projectile: proj('barrier', { damage: 40, speed: 0, stationary: true, life: 220, y: 0.8, box: box(2.8, 0, 0.25, 0.8), hits: 3, hitEvery: 20, strength: 5, push: 3, linear: false }) },
  { projectile: proj('barrier', { damage: 50, speed: 0.05, life: 160, y: 0.8, box: box(1.6, 0, 0.3, 0.9), hits: 5, hitEvery: 12, strength: 9, push: 3.5, linear: false, knockdown: true, launch: 5 }) });
  const s3 = tri(m as never, 'tPothole', 'Pothole Trap', {
    startup: 12, active: 1, recovery: 18, damage: 0, hitstun: 0, blockstun: 0, push: 0, box: box(0, 0, 0, 0), pose: 'stomp',
    projectile: proj('pothole', { damage: 60, speed: 0.06, life: 300, y: 0.05, box: box(0, 0, 0.5, 0.12), height: 'low', knockdown: true, launch: 8, strength: 0, linear: false }), input: '↓↙← + K (trap)',
  }, { projectile: proj('pothole', { damage: 70, speed: 0.1, life: 300, y: 0.05, box: box(0, 0, 0.5, 0.12), height: 'low', knockdown: true, launch: 8, strength: 0, linear: false }) },
  { projectile: proj('pothole', { damage: 90, speed: 0.08, life: 360, y: 0.05, box: box(0, 0, 0.8, 0.15), height: 'low', knockdown: true, launch: 11, strength: 0, linear: false, gore: 3 }) });
  m['super1'] = superMove('super1', 'National Highway Jam', {
    startup: 10, active: 1, recovery: 36, damage: 0, hitstun: 0, blockstun: 0, push: 0, box: box(0, 0, 0, 0), pose: 'cast2',
    projectile: proj('truck', { damage: 300, speed: 0.3, life: 80, y: 1.0, box: box(0, 0, 1.4, 1.0), hits: 1, hitstun: 60, blockstun: 24, strength: 9, knockdown: true, launch: 10, push: 6, linear: false, gore: 4 }), input: '↓↘→↓↘→ + P',
  });
  m['xray'] = xrayMove('xray', 'Toll Booth Tibia', { pose: 'swingV' });
  return {
    id: 'tolltax', name: 'TOLLTAX TAU', title: 'Gatekeeper of NH-420', party: 'Sadak Suraksha Sena',
    bio: 'Charges you to enter, to leave, and to complain about it.', slogan: 'Paisa do, aage jao!',
    stats: stats({ hp: 990, walk: 0.04, power: 0.98, height: 1.78 }), moves: m,
    specials: [sp('QCF', 'P', s1), sp('QCF', 'K', s2), sp('QCB', 'K', s3)],
    supers: [{ motion: 'QCF2', btn: 'P', move: 'super1' }], xray: 'xray',
    finishers: commonFinishers('tF1', 'tF2', 'tC', 'Lifetime Challan', 'Barrier Guillotine', 'Pothole Plunge'),
    assist: assist({ name: 'Barrier Drop', pose: 'slam', projectile: proj('barrier', { damage: 40, speed: 0, stationary: true, life: 120, y: 0.8, box: box(1.5, 0, 0.25, 0.8), strength: 5, linear: false }), activeFrom: 16, activeTo: 17 }),
  };
}

// 8. CHIKHTA ANCHOR — long reach, stun scream, counter stance.
function anchor(): CharDef {
  const m = baseNormals();
  m['5HP'] = mv('5HP', 'Mic Jab', { ...m['5HP'], box: box(1.2, 1.4, 0.5, 0.18), limb: 'weapon' });
  m['5HK'] = mv('5HK', 'Teleprompter Kick', { ...m['5HK'], box: box(1.15, 1.25, 0.5, 0.3) });
  const s1 = tri(m as never, 'aScream', 'Prime-Time Scream', {
    startup: 14, active: 1, recovery: 24, damage: 0, hitstun: 0, blockstun: 0, push: 0, box: box(0, 0, 0, 0), pose: 'scream',
    projectile: proj('scream', { damage: 30, speed: 0.12, life: 40, y: 1.4, box: box(0, 0, 0.6, 0.6), hits: 2, hitEvery: 8, stunOnHit: 40, strength: 2 }), input: '↓↘→ + P (stun)',
  }, { projectile: proj('scream', { damage: 35, speed: 0.15, life: 50, y: 1.4, box: box(0, 0, 0.7, 0.7), hits: 2, hitEvery: 8, stunOnHit: 55, strength: 2 }) },
  { projectile: proj('scream', { damage: 30, speed: 0.15, life: 60, y: 1.3, box: box(0, 0, 0.9, 0.9), hits: 4, hitEvery: 6, stunOnHit: 75, strength: 4 }) });
  const s2 = tri(m as never, 'aBreak', 'Breaking News', {
    startup: 5, active: 8, recovery: 26, damage: 100, hitstun: 30, blockstun: 16, push: 1.2, launch: 12, knockdown: true, vy: 0.18, airborne: true,
    box: box(0.75, 1.7, 0.5, 0.7), pose: 'dragonpunch', invuln: [0, 6], limb: 'weapon', input: '→↓↘ + P',
  }, { damage: 125, vy: 0.22 }, { hits: 3, hitEvery: 4, damage: 55, invuln: [0, 12] });
  const s3 = tri(m as never, 'aCounter', 'Debate Interrupt', {
    startup: 3, active: 22, recovery: 18, damage: 0, hitstun: 0, blockstun: 0, push: 0, box: box(0, 0, 0, 0), pose: 'stance', counterInto: 'aRebuttal', input: '↓↙← + K (counter)',
  }, { active: 30 }, { active: 30, recovery: 8 });
  m['aRebuttal'] = mv('aRebuttal', 'Rebuttal!', { kind: 'special', startup: 2, active: 4, recovery: 20, damage: 150, hitstun: 40, blockstun: 0, push: 5, launch: 9, knockdown: true, wallSplat: true, box: box(0.9, 1.3, 0.7, 0.7), pose: 'swingH', cancel: 3, invuln: [0, 6], gore: 3, linear: false, limb: 'weapon' });
  m['super1'] = superMove('super1', 'Nation Wants To Know', {
    startup: 8, active: 40, recovery: 30, damage: 26, hits: 12, hitEvery: 3, hitstun: 40, blockstun: 20, push: 0.4, launch: 5, knockdown: true,
    box: box(2.6, 1.3, 2.4, 1.1), pose: 'scream', linear: false, dizzy: 90, input: '↓↘→↓↘→ + P',
  });
  m['xray'] = xrayMove('xray', 'Mic Drop Skull Crack', { pose: 'swingV' });
  return {
    id: 'anchor', name: 'CHIKHTA ANCHOR', title: 'Prime-Time Screamer', party: 'Trolling Rating Point (TRP) Network',
    bio: 'Has asked 40,000 questions and waited for zero answers.', slogan: 'Nation wants to know!',
    stats: stats({ hp: 970, walk: 0.044, width: 0.34, height: 1.8 }), moves: m,
    specials: [sp('DP', 'P', s2), sp('QCF', 'P', s1), sp('QCB', 'K', s3)],
    supers: [{ motion: 'QCF2', btn: 'P', move: 'super1' }], xray: 'xray',
    finishers: commonFinishers('aF1', 'aF2', 'aC', 'Endless Debate', 'Mic Impalement', 'Breaking Bones News'),
    assist: assist({ name: 'Scream', pose: 'scream', projectile: proj('scream', { damage: 30, speed: 0.14, life: 40, y: 1.4, box: box(0, 0, 0.6, 0.6), stunOnHit: 40 }), activeFrom: 16, activeTo: 17 }),
  };
}

// 9. SUPREMO — boss. Big, armored, beam and teleports.
function supremo(): CharDef {
  const m = baseNormals();
  for (const k of Object.keys(m)) if (m[k].kind === 'normal') m[k] = { ...m[k], damage: Math.round(m[k].damage * 1.1) };
  const s1 = tri(m as never, 'sKursi', 'Kursi Smash', {
    startup: 14, active: 5, recovery: 20, damage: 120, height: 'overhead', hitstun: 28, blockstun: 18, push: 2, groundBounce: true, lunge: 1.2,
    box: box(1.0, 1.2, 0.7, 0.7), pose: 'swingV', limb: 'weapon', armor: [0, 12], input: '↓↘→ + K',
  }, { damage: 145, lunge: 1.8 }, { damage: 170, armor: [0, 18], wallBreak: true });
  const s2 = tri(m as never, 'sBeam', 'Divine Glow Beam', {
    startup: 18, active: 1, recovery: 26, damage: 0, hitstun: 0, blockstun: 0, push: 0, box: box(0, 0, 0, 0), pose: 'cast2',
    projectile: proj('beam', { damage: 22, speed: 0.4, life: 30, y: 1.35, box: box(0, 0, 0.8, 0.3), hits: 5, hitEvery: 4, strength: 6 }), input: '↓↘→ + P',
  }, { projectile: proj('beam', { damage: 26, speed: 0.45, life: 34, y: 1.35, box: box(0, 0, 0.8, 0.3), hits: 6, hitEvery: 4, strength: 6 }) },
  { projectile: proj('beam', { damage: 25, speed: 0.5, life: 40, y: 1.3, box: box(0, 0, 1.0, 0.45), hits: 9, hitEvery: 3, strength: 9, knockdown: true, launch: 6 }) });
  const s3 = tri(m as never, 'sWarp', 'Omnipresence', {
    startup: 10, active: 1, recovery: 10, damage: 0, hitstun: 0, blockstun: 0, push: 0, box: box(0, 0, 0, 0), pose: 'teleport', teleport: -1.1, invuln: [0, 14], input: '→↓↘ + K',
  }, { teleport: 1.4 }, { teleport: -1.1, startup: 5 });
  m['super1'] = superMove('super1', 'Kursi Quake', {
    startup: 12, active: 16, recovery: 30, damage: 50, hits: 6, hitEvery: 3, hitstun: 50, blockstun: 22, push: 1, launch: 9, knockdown: true, height: 'low',
    box: box(1.5, 0.5, 2.5, 0.6), pose: 'slam', linear: false, input: '↓↘→↓↘→ + P',
  });
  m['xray'] = xrayMove('xray', 'Supreme Judgement', { damage: 380 });
  return {
    id: 'supremo', name: 'SUPREMO', title: 'The Eternal Kursi', party: 'Sarvashaktimaan Sangh', boss: true,
    bio: 'Has not left the throne in 40 years. The throne has not left him either.', slogan: 'Kursi meri, desh mera!',
    stats: stats({ hp: 1250, walk: 0.04, dash: 0.16, power: 1.12, width: 0.5, height: 2.1, jumpV: 0.17 }), moves: m,
    specials: [sp('DP', 'K', s3), sp('QCF', 'K', s1), sp('QCF', 'P', s2)],
    supers: [{ motion: 'QCF2', btn: 'P', move: 'super1' }], xray: 'xray',
    finishers: commonFinishers('sF1', 'sF2', 'sC', 'Eternal Oath Ceremony', 'Throne Crush', 'Divine Decree'),
    assist: assist({ name: 'Kursi Toss', pose: 'lob', projectile: proj('kursi', { damage: 70, speed: 0.12, vy: 0.17, gravity: 0.008, knockdown: true, launch: 5, height: 'overhead' }), activeFrom: 18, activeTo: 19 }),
  };
}

export const ROSTER: CharDef[] = [jumla(), ghotala(), bulldozer(), votechor(), didi(), bahubali(), tolltax(), anchor(), supremo()];
export const CHARS: Record<string, CharDef> = Object.fromEntries(ROSTER.map((c) => [c.id, c]));
export const PLAYABLE = ROSTER.filter((c) => !c.boss).map((c) => c.id);

export function getMove(charId: string, id: string): MoveDef {
  const m = CHARS[charId]?.moves[id];
  if (!m) throw new Error(`unknown move ${charId}:${id}`);
  return m;
}

/** Register a custom (creator-made) fighter built on an archetype at runtime. */
export function registerChar(def: CharDef) {
  CHARS[def.id] = def;
  const i = ROSTER.findIndex((c) => c.id === def.id);
  if (i >= 0) ROSTER[i] = def;
  else ROSTER.push(def);
}
