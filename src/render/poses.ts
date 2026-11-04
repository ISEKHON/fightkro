// Hand-authored key poses (degrees). Conventions for limbs hanging down (-y):
//  x < 0 swings a limb forward/up, x > 0 swings it back. Shin / forearm x > 0 bends knee, x < 0 bends elbow.
//  spine/chest x > 0 leans forward. L limbs sit on the fighter's lead (far) side.
import type { Joint } from './rig';

export type JRot = [number, number, number];
export interface Pose {
  j: Partial<Record<Joint, JRot>>;
  /** body rotation x (deg), extra yaw, body y offset, hips y offset */
  rx?: number;
  ry?: number;
  rz?: number;
  y?: number;
  hy?: number;
}

const P = (j: Partial<Record<Joint, JRot>>, extra: Omit<Pose, 'j'> = {}): Pose => ({ j, ...extra });
export const merge = (a: Pose, b: Partial<Pose>): Pose => ({ ...a, ...b, j: { ...a.j, ...(b.j ?? {}) } });

const LEGS_STANCE: Partial<Record<Joint, JRot>> = {
  thL: [-22, 0, 4],
  shL: [22, 0, 0],
  ftL: [0, 0, 0],
  thR: [16, 0, -6],
  shR: [16, 0, 0],
  ftR: [-10, 0, 0],
};

const LEGS_CROUCH: Partial<Record<Joint, JRot>> = {
  thL: [-80, 0, 8],
  shL: [110, 0, 0],
  ftL: [-25, 0, 0],
  thR: [-45, 0, -10],
  shR: [120, 0, 0],
  ftR: [-60, 0, 0],
};

export const GUARD = P(
  {
    hips: [0, -28, 0],
    spine: [6, -6, 0],
    chest: [4, -6, 0],
    neck: [0, 18, 0],
    head: [-4, 10, 0],
    uaL: [-62, 0, 14],
    faL: [-100, 0, 0],
    uaR: [-38, 0, -18],
    faR: [-125, 0, 0],
    handL: [0, 0, 0],
    handR: [0, 0, 0],
    ...LEGS_STANCE,
  },
  { hy: -0.05 },
);

export const CROUCH = merge(GUARD, P({ ...LEGS_CROUCH, spine: [22, -8, 0], head: [-14, 10, 0] }, { hy: -0.42 }));
export const BLOCK = merge(GUARD, P({ uaL: [-78, 0, -8], faL: [-135, 0, 0], uaR: [-70, 0, 8], faR: [-140, 0, 0], head: [12, 10, 0], spine: [12, -6, 0] }));
export const BLOCK_LOW = merge(CROUCH, P({ uaL: [-55, 0, -8], faL: [-130, 0, 0], uaR: [-50, 0, 8], faR: [-135, 0, 0], head: [10, 10, 0] }));

const TUCK = P({ thL: [-80, 0, 6], shL: [100, 0, 0], thR: [-55, 0, -6], shR: [95, 0, 0] });

export const POSES: Record<string, Pose> = {
  guard: GUARD,
  crouch: CROUCH,
  block: BLOCK,
  blockLow: BLOCK_LOW,
  jump: merge(GUARD, P({ ...TUCK.j, uaL: [-80, 0, 30], uaR: [-60, 0, -30] })),
  prejump: merge(GUARD, P({ ...LEGS_CROUCH, spine: [18, -6, 0] }, { hy: -0.22 })),
  land: merge(GUARD, P({ ...LEGS_CROUCH }, { hy: -0.3 })),
  dash: merge(GUARD, P({ spine: [28, -8, 0], thL: [-60, 0, 0], shL: [70, 0, 0], thR: [30, 0, 0], shR: [40, 0, 0] })),
  backdash: merge(GUARD, P({ spine: [-14, -8, 0], thL: [-30, 0, 0], thR: [-10, 0, 0], shR: [60, 0, 0] }, { hy: -0.08 })),
  run: merge(GUARD, P({ spine: [30, -4, 0], uaL: [-40, 0, 10], uaR: [30, 0, -10] })),
  airdash: merge(GUARD, P({ spine: [40, 0, 0], ...TUCK.j, uaL: [30, 0, 30], uaR: [30, 0, -30] })),
  sidestep: merge(GUARD, P({ spine: [10, 0, 15], thL: [-30, 0, 20], thR: [10, 0, -20] }, { hy: -0.12 })),

  // ---- reactions
  hitHigh: merge(GUARD, P({ spine: [-22, 0, 0], chest: [-14, 0, 0], head: [-35, 0, 10], neck: [-10, 0, 0], uaL: [10, 0, 50], faL: [-30, 0, 0], uaR: [20, 0, -50], faR: [-30, 0, 0] })),
  hitLow: merge(GUARD, P({ spine: [40, 0, 0], chest: [20, 0, 0], head: [25, 0, 0], uaL: [-20, 0, 30], faL: [-60, 0, 0], uaR: [-20, 0, -30], faR: [-60, 0, 0] }, { hy: -0.1 })),
  air: P({ hips: [0, 0, 0], spine: [-20, 0, 0], chest: [-10, 0, 0], head: [-30, 0, 0], uaL: [-150, 0, 40], faL: [-20, 0, 0], uaR: [-140, 0, -40], faR: [-30, 0, 0], thL: [-50, 0, 15], shL: [40, 0, 0], thR: [-20, 0, -15], shR: [60, 0, 0] }, { rx: -55 }),
  knockdown: P({ spine: [0, 0, 0], head: [-15, 0, 0], uaL: [-160, 0, 50], faL: [-20, 0, 0], uaR: [-170, 0, -40], faR: [-10, 0, 0], thL: [-10, 0, 12], shL: [10, 0, 0], thR: [0, 0, -10], shR: [20, 0, 0] }, { rx: -90, y: 0.14 }),
  getup: merge(GUARD, P({ ...LEGS_CROUCH, spine: [35, 0, 0], uaL: [-20, 0, 30], uaR: [-20, 0, -30] }, { hy: -0.4 })),
  wallsplat: P({ spine: [-10, 0, 0], head: [-20, 0, 0], uaL: [-120, 0, 70], faL: [-20, 0, 0], uaR: [-120, 0, -70], faR: [-20, 0, 0], thL: [-10, 0, 25], shL: [10, 0, 0], thR: [-10, 0, -25], shR: [10, 0, 0] }, { rx: 8 }),
  crumple: merge(GUARD, P({ ...LEGS_CROUCH, spine: [60, 0, 0], head: [30, 0, 0], uaL: [10, 0, 10], faL: [0, 0, 0], uaR: [10, 0, -10], faR: [0, 0, 0] }, { hy: -0.5 })),
  dizzy: merge(GUARD, P({ spine: [18, 0, 8], head: [20, 0, 15], uaL: [10, 0, 15], faL: [-10, 0, 0], uaR: [10, 0, -15], faR: [-10, 0, 0], thL: [-5, 0, 6], shL: [10, 0, 0], thR: [-5, 0, -6], shR: [10, 0, 0] }, { hy: -0.06 })),
  guardcrush: merge(GUARD, P({ spine: [-25, 0, 0], head: [-30, 0, 0], uaL: [-140, 0, 60], faL: [-30, 0, 0], uaR: [-130, 0, -60], faR: [-30, 0, 0] })),
  grabbed: P({ spine: [-10, 0, 0], head: [-20, 0, 0], uaL: [-60, 0, 50], faL: [-60, 0, 0], uaR: [-50, 0, -50], faR: [-70, 0, 0], thL: [-30, 0, 10], shL: [60, 0, 0], thR: [10, 0, -10], shR: [50, 0, 0] }, { rx: -25 }),
  win: merge(GUARD, P({ hips: [0, -10, 0], spine: [-8, 0, 0], head: [-20, -10, 0], uaL: [-170, 0, 20], faL: [-20, 0, 0], uaR: [-165, 0, -25], faR: [-30, 0, 0], thL: [-5, 0, 8], shL: [5, 0, 0], thR: [-5, 0, -8], shR: [5, 0, 0] }, { hy: 0 })),
  lose: merge(GUARD, P({ ...LEGS_CROUCH, thL: [-90, 0, 10], shL: [150, 0, 0], thR: [-10, 0, -10], shR: [160, 0, 0], spine: [50, 0, 0], head: [35, 0, 0], uaL: [10, 0, 5], faL: [0, 0, 0], uaR: [10, 0, -5], faR: [0, 0, 0] }, { hy: -0.62 })),
  taunt: merge(GUARD, P({ hips: [0, -10, 0], spine: [-12, 10, 0], head: [-18, -15, 0], uaL: [10, 0, 40], faL: [-110, 30, 0], uaR: [-90, 30, -20], faR: [0, 0, 0], thL: [-5, 0, 10], shL: [5, 0, 0], thR: [5, 0, -10], shR: [5, 0, 0] }, { hy: 0 })),
  intro: merge(GUARD, P({ hips: [0, 0, 0], spine: [-6, 0, 0], head: [-10, -20, 0], uaL: [10, 0, 35], faL: [-120, 0, 0], uaR: [10, 0, -35], faR: [-120, 0, 0], thL: [-5, 0, 8], shL: [5, 0, 0], thR: [-5, 0, -8], shR: [5, 0, 0] }, { hy: 0 })),
  parry: merge(GUARD, P({ uaL: [-100, 40, 20], faL: [-50, 0, 0], spine: [-6, -20, 0] })),
  pickup: merge(CROUCH, P({ uaR: [-60, 0, -10], faR: [-10, 0, 0], spine: [40, 0, 0] })),
  burst: merge(GUARD, P({ spine: [-15, 0, 0], head: [-25, 0, 0], uaL: [-150, 0, 70], faL: [0, 0, 0], uaR: [-150, 0, -70], faR: [0, 0, 0], thL: [-20, 0, 20], thR: [10, 0, -20] }, { hy: 0 })),
  finisher: merge(GUARD, P({ uaR: [-160, 0, -20], faR: [-30, 0, 0], spine: [-10, 10, 0] })),
};

/** Attack poses: windup ("w") and strike ("h"). */
export const ATTACKS: Record<string, { w: Pose; h: Pose }> = {
  jab: {
    w: merge(GUARD, P({ uaL: [-70, 0, 10], faL: [-90, 0, 0] })),
    h: merge(GUARD, P({ hips: [0, -40, 0], chest: [6, -20, 0], uaL: [-90, 8, 4], faL: [-4, 0, 0] })),
  },
  straight: {
    w: merge(GUARD, P({ hips: [0, -45, 0], uaR: [-20, 0, -20], faR: [-130, 0, 0] })),
    h: merge(GUARD, P({ hips: [0, 25, 0], spine: [16, 15, 0], chest: [6, 20, 0], uaR: [-90, -8, -4], faR: [-2, 0, 0], uaL: [-40, 0, 30], faL: [-120, 0, 0], thR: [30, 0, -6], shR: [10, 0, 0] })),
  },
  slap: {
    w: merge(GUARD, P({ hips: [0, -50, 0], uaR: [-60, 0, -80], faR: [-40, 0, 0] })),
    h: merge(GUARD, P({ hips: [0, 30, 0], chest: [6, 30, 0], uaR: [-90, 40, -10], faR: [-10, 0, 0] })),
  },
  lkick: {
    w: merge(GUARD, P({ thL: [-70, 0, 4], shL: [100, 0, 0], spine: [-6, -6, 0] })),
    h: merge(GUARD, P({ thL: [-75, 0, 4], shL: [8, 0, 0], ftL: [20, 0, 0], spine: [-14, -6, 0], thR: [8, 0, -6], shR: [10, 0, 0] })),
  },
  roundhouse: {
    w: merge(GUARD, P({ hips: [0, 10, 0], thR: [-40, 0, -30], shR: [90, 0, 0] })),
    h: merge(GUARD, P({ hips: [0, 75, 0], spine: [-18, 20, 20], chest: [0, 10, 0], head: [0, -60, 0], thR: [-85, 0, -55], shR: [5, 0, 0], ftR: [20, 0, 0], thL: [5, 0, 10], shL: [10, 0, 0], uaL: [-20, 0, 40], uaR: [-10, 0, -60] })),
  },
  sidekick: {
    w: merge(GUARD, P({ hips: [0, 60, 0], thR: [-90, 0, -10], shR: [120, 0, 0], spine: [-10, 0, 0] })),
    h: merge(GUARD, P({ hips: [0, 85, 0], spine: [-30, 0, 15], head: [10, -70, 0], thR: [-95, 0, -20], shR: [0, 0, 0], ftR: [30, 0, 0], thL: [5, 0, 15], shL: [10, 0, 0] })),
  },
  lowjab: {
    w: merge(CROUCH, P({ uaL: [-70, 0, 10], faL: [-90, 0, 0] })),
    h: merge(CROUCH, P({ hips: [0, -40, 0], uaL: [-80, 8, 4], faL: [-4, 0, 0] })),
  },
  uppercut: {
    w: merge(CROUCH, P({ hips: [0, -40, 0], uaR: [-10, 0, -15], faR: [-120, 0, 0] }, { hy: -0.3 })),
    h: merge(GUARD, P({ hips: [0, 30, 0], spine: [-10, 20, 0], head: [-25, -10, 0], uaR: [-165, -10, -8], faR: [-35, 0, 0], thL: [-10, 0, 4], shL: [5, 0, 0], thR: [20, 0, -6], shR: [20, 0, 0] }, { hy: 0.02 })),
  },
  lowkick: {
    w: merge(CROUCH, P({ thL: [-60, 0, 10], shL: [110, 0, 0] })),
    h: merge(CROUCH, P({ thL: [-80, 0, 10], shL: [5, 0, 0], ftL: [25, 0, 0], spine: [10, -10, 0] }, { hy: -0.45 })),
  },
  sweep: {
    w: merge(CROUCH, P({ hips: [0, 30, 0] }, { hy: -0.5 })),
    h: merge(CROUCH, P({ hips: [0, 100, 0], spine: [30, 20, 0], thR: [-85, 0, -10], shR: [0, 0, 0], ftR: [20, 0, 0], thL: [-80, 0, 20], shL: [130, 0, 0], uaL: [-30, 0, 60], uaR: [-30, 0, -60] }, { hy: -0.6 })),
  },
  overhead: {
    w: merge(GUARD, P({ spine: [-14, 10, 0], uaR: [-185, 0, -10], faR: [-60, 0, 0], uaL: [-175, 0, 10], faL: [-60, 0, 0] }, { hy: 0.02 })),
    h: merge(GUARD, P({ spine: [38, 10, 0], head: [10, 0, 0], uaR: [-60, 0, -6], faR: [-20, 0, 0], uaL: [-60, 0, 6], faL: [-20, 0, 0], thL: [-40, 0, 4], shL: [40, 0, 0] }, { hy: -0.12 })),
  },
  stomp: {
    w: merge(GUARD, P({ thR: [-80, 0, -5], shR: [100, 0, 0], spine: [-6, 0, 0] })),
    h: merge(GUARD, P({ thR: [-40, 0, -5], shR: [30, 0, 0], ftR: [20, 0, 0], spine: [30, 0, 0], head: [20, 0, 0] }, { hy: -0.1 })),
  },
  airpunch: {
    w: merge(POSES.jump, P({ uaR: [-20, 0, -10], faR: [-120, 0, 0] })),
    h: merge(POSES.jump, P({ hips: [0, 25, 0], uaR: [-55, 0, -4], faR: [-4, 0, 0], spine: [20, 0, 0] })),
  },
  airhpunch: {
    w: merge(POSES.jump, P({ uaR: [-180, 0, -10], faR: [-60, 0, 0], uaL: [-175, 0, 10], faL: [-60, 0, 0], spine: [-15, 0, 0] })),
    h: merge(POSES.jump, P({ uaR: [-40, 0, -6], faR: [-15, 0, 0], uaL: [-40, 0, 6], faL: [-15, 0, 0], spine: [35, 0, 0] })),
  },
  airkick: {
    w: merge(POSES.jump, P({ thL: [-60, 0, 5], shL: [120, 0, 0] })),
    h: merge(POSES.jump, P({ thL: [-110, 0, 5], shL: [100, 0, 0], spine: [-10, 0, 0] })),
  },
  airhkick: {
    w: merge(POSES.jump, P({ thR: [-50, 0, -5], shR: [110, 0, 0] })),
    h: merge(POSES.jump, P({ hips: [0, 40, 0], thR: [-60, 0, -10], shR: [0, 0, 0], ftR: [30, 0, 0], thL: [-60, 0, 10], shL: [110, 0, 0], spine: [-15, 0, 0] })),
  },
  grab: {
    w: merge(GUARD, P({ uaL: [-60, 0, 40], faL: [-40, 0, 0], uaR: [-60, 0, -40], faR: [-40, 0, 0], spine: [16, 0, 0] })),
    h: merge(GUARD, P({ hips: [0, 0, 0], uaL: [-85, 0, -15], faL: [-30, 0, 0], uaR: [-85, 0, 15], faR: [-30, 0, 0], spine: [20, 0, 0] })),
  },
  throwing: {
    w: merge(GUARD, P({ hips: [0, 0, 0], uaL: [-120, 0, -15], faL: [-40, 0, 0], uaR: [-120, 0, 15], faR: [-40, 0, 0], spine: [-20, 0, 0] })),
    h: merge(GUARD, P({ hips: [0, 0, 0], uaL: [-30, 0, -15], faL: [-20, 0, 0], uaR: [-30, 0, 15], faR: [-20, 0, 0], spine: [50, 0, 0] }, { hy: -0.15 })),
  },
  swingH: {
    w: merge(GUARD, P({ hips: [0, -70, 0], chest: [0, -30, 0], uaR: [-70, 0, -70], faR: [-30, 0, 0] })),
    h: merge(GUARD, P({ hips: [0, 50, 0], chest: [6, 40, 0], uaR: [-90, 30, -10], faR: [-5, 0, 0], uaL: [-30, 0, 50] })),
  },
  swingV: {
    w: merge(GUARD, P({ spine: [-20, 0, 0], uaR: [-190, 0, -5], faR: [-40, 0, 0], uaL: [-180, 0, 5], faL: [-40, 0, 0] }, { hy: 0.02 })),
    h: merge(GUARD, P({ spine: [45, 0, 0], uaR: [-50, 0, -5], faR: [-5, 0, 0], uaL: [-50, 0, 5], faL: [-5, 0, 0], thL: [-45, 0, 4], shL: [45, 0, 0] }, { hy: -0.15 })),
  },
  cast: {
    w: merge(GUARD, P({ hips: [0, -50, 0], uaR: [-30, 0, -40], faR: [-110, 0, 0], uaL: [-30, 0, 40], faL: [-110, 0, 0], spine: [-6, -20, 0] })),
    h: merge(GUARD, P({ hips: [0, 10, 0], spine: [18, 10, 0], uaR: [-88, 0, 8], faR: [-5, 0, 0], uaL: [-88, 0, -8], faL: [-5, 0, 0], thR: [25, 0, -6] })),
  },
  cast2: {
    w: merge(GUARD, P({ uaR: [-180, 0, -40], faR: [-10, 0, 0], uaL: [-180, 0, 40], faL: [-10, 0, 0], spine: [-20, 0, 0], head: [-30, 0, 0] }, { hy: 0.03 })),
    h: merge(GUARD, P({ hips: [0, 0, 0], spine: [25, 0, 0], uaR: [-90, 0, 10], faR: [0, 0, 0], uaL: [-90, 0, -10], faL: [0, 0, 0], thL: [-40, 0, 10], shL: [30, 0, 0], thR: [30, 0, -10] }, { hy: -0.1 })),
  },
  lob: {
    w: merge(GUARD, P({ hips: [0, -60, 0], uaR: [-170, 0, -20], faR: [-80, 0, 0], spine: [-15, 0, 0] })),
    h: merge(GUARD, P({ hips: [0, 30, 0], uaR: [-120, 0, -5], faR: [-10, 0, 0], spine: [25, 0, 0] })),
  },
  dragonpunch: {
    w: merge(CROUCH, P({ hips: [0, -40, 0], uaR: [-30, 0, -10], faR: [-130, 0, 0] }, { hy: -0.35 })),
    h: merge(GUARD, P({ hips: [0, 40, 0], spine: [-15, 25, 0], head: [-30, 0, 0], uaR: [-178, 0, -4], faR: [-5, 0, 0], uaL: [-20, 0, 40], faL: [-90, 0, 0], ...TUCK.j })),
  },
  flyingkick: {
    w: merge(GUARD, P({ ...TUCK.j, spine: [10, 0, 0] }, { hy: 0.05 })),
    h: merge(GUARD, P({ hips: [0, 60, 0], spine: [-20, 0, 10], thR: [-92, 0, -10], shR: [0, 0, 0], ftR: [30, 0, 0], thL: [-30, 0, 10], shL: [110, 0, 0], uaL: [-60, 0, 60], uaR: [0, 0, -40] }, { hy: 0.1 })),
  },
  rush: {
    w: merge(GUARD, P({ hips: [0, -60, 0], spine: [30, -30, 0], uaL: [-50, 0, 0], faL: [-120, 0, 0] }, { hy: -0.15 })),
    h: merge(GUARD, P({ hips: [0, -75, 0], spine: [42, -35, 0], chest: [10, -20, 0], uaL: [-60, 0, -10], faL: [-130, 0, 0], uaR: [10, 0, -20], thL: [-60, 0, 0], shL: [60, 0, 0], thR: [35, 0, 0], shR: [30, 0, 0] }, { hy: -0.12 })),
  },
  slam: {
    w: merge(POSES.jump, P({ uaR: [-190, 0, -20], uaL: [-190, 0, 20], faR: [-20, 0, 0], faL: [-20, 0, 0], spine: [-20, 0, 0] })),
    h: merge(CROUCH, P({ uaR: [-40, 0, -10], uaL: [-40, 0, 10], faR: [0, 0, 0], faL: [0, 0, 0], spine: [50, 0, 0] }, { hy: -0.35 })),
  },
  slide: {
    w: merge(CROUCH, P({}, { hy: -0.4 })),
    h: P({ spine: [10, 0, 0], head: [30, 0, 0], uaL: [-10, 0, 20], uaR: [-10, 0, -20], thL: [-90, 0, 4], shL: [0, 0, 0], ftL: [30, 0, 0], thR: [-60, 0, -4], shR: [80, 0, 0] }, { rx: -60, y: 0.25 }),
  },
  spin: {
    w: merge(GUARD, P({ uaL: [-20, 0, 80], uaR: [-20, 0, -80], faL: [0, 0, 0], faR: [0, 0, 0] })),
    h: merge(GUARD, P({ hips: [0, 0, 0], spine: [-5, 0, 0], uaL: [-10, 0, 95], faL: [0, 0, 0], uaR: [-10, 0, -95], faR: [0, 0, 0], ...TUCK.j }, { hy: 0.15 })),
  },
  roll: {
    w: merge(CROUCH, P({}, { hy: -0.4 })),
    h: merge(CROUCH, P({ spine: [70, 0, 0], head: [50, 0, 0], ...TUCK.j }, { hy: -0.45 })),
  },
  teleport: {
    w: merge(CROUCH, P({ uaL: [-150, 0, 40], uaR: [-150, 0, -40] }, { hy: -0.3 })),
    h: merge(GUARD, P({ uaL: [-10, 0, 40], uaR: [-10, 0, -40] })),
  },
  stance: {
    w: merge(GUARD, P({ uaL: [-80, -20, -30], faL: [-95, 0, 0], uaR: [-80, 20, 30], faR: [-95, 0, 0], spine: [-6, 0, 0] })),
    h: merge(GUARD, P({ uaL: [-85, -20, -35], faL: [-100, 0, 0], uaR: [-85, 20, 35], faR: [-100, 0, 0], spine: [-10, 0, 0], head: [-10, 0, 0] })),
  },
  scream: {
    w: merge(GUARD, P({ spine: [-20, 0, 0], head: [-30, 0, 0], uaL: [20, 0, 30], uaR: [20, 0, -30] })),
    h: merge(GUARD, P({ spine: [30, 0, 0], head: [-15, 0, 0], neck: [10, 0, 0], uaL: [45, 0, 35], faL: [-20, 0, 0], uaR: [45, 0, -35], faR: [-20, 0, 0] })),
  },
  lariat: {
    w: merge(GUARD, P({ hips: [0, -60, 0], uaR: [-30, 0, -80], faR: [-10, 0, 0] })),
    h: merge(GUARD, P({ hips: [0, 50, 0], chest: [0, 30, 0], uaR: [-85, 10, -60], faR: [-5, 0, 0], uaL: [-20, 0, 40] })),
  },
  powerup: {
    w: merge(CROUCH, P({ uaL: [-20, 0, 70], faL: [0, 0, 80], uaR: [-20, 0, -70], faR: [0, 0, -80] }, { hy: -0.25 })),
    h: merge(GUARD, P({ hips: [0, 0, 0], spine: [-15, 0, 0], head: [-35, 0, 0], uaL: [-10, 0, 85], faL: [0, 0, 100], uaR: [-10, 0, -85], faR: [0, 0, -100], thL: [-10, 0, 20], shL: [10, 0, 0], thR: [-10, 0, -20], shR: [10, 0, 0] }, { hy: 0 })),
  },
  taunt: { w: POSES.taunt, h: POSES.taunt },
};

export function attackPose(key: string) {
  return ATTACKS[key] ?? ATTACKS.straight;
}
