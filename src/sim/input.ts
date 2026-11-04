// Input bitmask shared by every input source (keyboard, gamepad, touch, network, CPU).
export const B = {
  U: 1,
  D: 2,
  L: 4,
  R: 8,
  LP: 16,
  HP: 32,
  LK: 64,
  HK: 128,
  RAGE: 256,
  DODGE: 512,
  ASSIST: 1024,
  TAUNT: 2048,
  BLOCK: 4096,
} as const;

export type ButtonName = keyof typeof B;
export const DIR_MASK = B.U | B.D | B.L | B.R;
export const ATK_MASK = B.LP | B.HP | B.LK | B.HK;
export const ALL_BUTTONS: ButtonName[] = ['U', 'D', 'L', 'R', 'LP', 'HP', 'LK', 'HK', 'RAGE', 'DODGE', 'ASSIST', 'TAUNT', 'BLOCK'];

/** Resolve opposite directions (SOCD): left+right = neutral, up+down = up. */
export function cleanSocd(m: number): number {
  if (m & B.L && m & B.R) m &= ~(B.L | B.R);
  if (m & B.U && m & B.D) m &= ~B.D;
  return m;
}

/** Numpad notation (1-9, 5 = neutral) relative to the fighter's facing. */
export function numpad(m: number, facing: number): number {
  const fwd = facing > 0 ? B.R : B.L;
  const back = facing > 0 ? B.L : B.R;
  let x = 0;
  if (m & fwd) x = 1;
  else if (m & back) x = -1;
  let y = 0;
  if (m & B.U) y = 1;
  else if (m & B.D) y = -1;
  return 5 + x + y * 3;
}

export const isDown = (d: number) => d <= 3;
export const isUp = (d: number) => d >= 7;
export const isBack = (d: number) => d === 1 || d === 4 || d === 7;
export const isFwd = (d: number) => d === 3 || d === 6 || d === 9;
