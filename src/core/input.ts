// Input sources: keyboard (2 local layouts), gamepads (hot-plug, per-player), touch controller.
// Everything produces the same 13-bit mask the simulation consumes.
import { B, type ButtonName } from '../sim/input';
import { load, save } from './store';

export type Binding = Partial<Record<ButtonName, string[]>>;

export const DEFAULT_KEYS: [Binding, Binding] = [
  {
    U: ['KeyW'],
    D: ['KeyS'],
    L: ['KeyA'],
    R: ['KeyD'],
    LP: ['KeyU'],
    HP: ['KeyI'],
    LK: ['KeyJ'],
    HK: ['KeyK'],
    RAGE: ['KeyO'],
    DODGE: ['KeyL'],
    ASSIST: ['KeyH'],
    TAUNT: ['KeyP'],
    BLOCK: ['ShiftLeft'],
  },
  {
    U: ['ArrowUp'],
    D: ['ArrowDown'],
    L: ['ArrowLeft'],
    R: ['ArrowRight'],
    LP: ['Numpad4', 'Comma'],
    HP: ['Numpad5', 'Period'],
    LK: ['Numpad1', 'KeyM'],
    HK: ['Numpad2', 'KeyN'],
    RAGE: ['Numpad6', 'Slash'],
    DODGE: ['Numpad3', 'KeyB'],
    ASSIST: ['Numpad0'],
    TAUNT: ['Numpad7'],
    BLOCK: ['ShiftRight', 'NumpadEnter'],
  },
];

export let keyBindings: [Binding, Binding] = load('keys', DEFAULT_KEYS);
export function saveKeys() {
  save('keys', keyBindings);
}
export function resetKeys() {
  keyBindings = structuredClone(DEFAULT_KEYS);
  saveKeys();
}

/** Gamepad button index -> action (standard mapping). Remappable. */
export const DEFAULT_PAD: Record<number, ButtonName> = {
  2: 'LP', // X / Square
  3: 'HP', // Y / Triangle
  0: 'LK', // A / Cross
  1: 'HK', // B / Circle
  5: 'RAGE', // RB
  4: 'DODGE', // LB
  6: 'ASSIST', // LT
  7: 'BLOCK', // RT
  8: 'TAUNT', // Select
};
export let padBindings: Record<number, ButtonName> = load('pad', DEFAULT_PAD);
export function savePad() {
  save('pad', padBindings);
}

const held = new Set<string>();
let anyKeyListeners: ((code: string) => void)[] = [];

export function initKeyboard() {
  window.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    held.add(e.code);
    for (const l of anyKeyListeners) l(e.code);
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', () => held.clear());
}

export function onAnyKey(fn: (code: string) => void) {
  anyKeyListeners.push(fn);
  return () => (anyKeyListeners = anyKeyListeners.filter((x) => x !== fn));
}

export function keyboardMask(player: 0 | 1, merged = false): number {
  let m = 0;
  const sets = merged ? [keyBindings[0], keyBindings[1]] : [keyBindings[player]];
  for (const b of sets)
    for (const [btn, codes] of Object.entries(b) as [ButtonName, string[]][]) {
      for (const c of codes) if (held.has(c)) m |= B[btn];
    }
  return m;
}

// ---------------------------------------------------------------- gamepads
export function connectedPads(): Gamepad[] {
  const out: Gamepad[] = [];
  try {
    for (const p of navigator.getGamepads?.() ?? []) if (p && p.connected) out.push(p);
  } catch {
    /* not allowed */
  }
  return out;
}

export function padMask(pad: Gamepad | undefined): number {
  if (!pad) return 0;
  let m = 0;
  const b = pad.buttons;
  const pressed = (i: number) => !!b[i] && (b[i].pressed || b[i].value > 0.5);
  for (const [i, act] of Object.entries(padBindings)) if (pressed(+i)) m |= B[act];
  if (pressed(12)) m |= B.U;
  if (pressed(13)) m |= B.D;
  if (pressed(14)) m |= B.L;
  if (pressed(15)) m |= B.R;
  const ax = pad.axes[0] ?? 0;
  const ay = pad.axes[1] ?? 0;
  const mag = Math.hypot(ax, ay);
  if (mag > 0.38) {
    const ang = Math.atan2(-ay, ax); // 0 = right, pi/2 = up
    const oct = Math.round(ang / (Math.PI / 4));
    const dirs = [B.R, B.R | B.U, B.U, B.U | B.L, B.L, B.L | B.D, B.D, B.D | B.R];
    m |= dirs[(oct + 8) % 8];
  }
  return m;
}

export function rumble(pad: Gamepad | undefined, strength: number, ms: number) {
  try {
    const a = (pad as unknown as { vibrationActuator?: { playEffect: (t: string, o: object) => void } })?.vibrationActuator;
    a?.playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 });
  } catch {
    /* unsupported */
  }
}

// ---------------------------------------------------------------- menu navigation from pads
export type NavDir = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'start';
let navListeners: ((d: NavDir, player: number) => void)[] = [];
const padPrev = new Map<number, number>();
export function onNav(fn: (d: NavDir, player: number) => void) {
  navListeners.push(fn);
  return () => (navListeners = navListeners.filter((x) => x !== fn));
}
const NAV_BITS: [number, NavDir][] = [
  [1 << 0, 'up'],
  [1 << 1, 'down'],
  [1 << 2, 'left'],
  [1 << 3, 'right'],
  [1 << 4, 'ok'],
  [1 << 5, 'back'],
  [1 << 6, 'start'],
];
const repeatAt = new Map<string, number>();
export function pollPadNav(now: number) {
  const pads = connectedPads();
  pads.forEach((p, pi) => {
    const b = p.buttons;
    const pr = (i: number) => !!b[i]?.pressed;
    const ax = p.axes[0] ?? 0;
    const ay = p.axes[1] ?? 0;
    let m = 0;
    if (pr(12) || ay < -0.6) m |= 1;
    if (pr(13) || ay > 0.6) m |= 2;
    if (pr(14) || ax < -0.6) m |= 4;
    if (pr(15) || ax > 0.6) m |= 8;
    if (pr(0)) m |= 16;
    if (pr(1)) m |= 32;
    if (pr(9)) m |= 64;
    const prev = padPrev.get(p.index) ?? 0;
    for (const [bit, d] of NAV_BITS) {
      const k = p.index + d;
      if (m & bit && !(prev & bit)) {
        repeatAt.set(k, now + 380);
        navListeners.forEach((l) => l(d, pi));
      } else if (m & bit && bit <= 8 && now > (repeatAt.get(k) ?? Infinity)) {
        repeatAt.set(k, now + 110);
        navListeners.forEach((l) => l(d, pi));
      }
    }
    padPrev.set(p.index, m);
  });
}

export function isTouchDevice() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}
