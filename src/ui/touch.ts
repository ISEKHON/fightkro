// On-screen controller for phones/tablets: floating joystick + Pro / Gesture / Smart layouts,
// multi-touch chords, gesture recogniser (swipes, circles, long-press charge, flicks),
// macro injection for motion inputs, haptics and a drag-to-edit layout editor.
import { B } from '../sim/input';
import { CHARS } from '../sim/roster';
import type { MotionName } from '../sim/motion';
import { load, save, settings } from '../core/store';

export interface TouchCtx {
  facing: number;
  dist: number;
  oppAir: boolean;
  char: string;
  meter: number;
  rage: number;
  hasWeapon: boolean;
}

interface BtnDef {
  id: string;
  label: string;
  mask: number;
  x: number; // % from right edge (or left when mirrored)
  y: number; // % from bottom
  size: number; // vmin
  cls?: string;
  layouts: ('pro' | 'gesture' | 'smart')[];
  special?: 'smartSpecial' | 'smartSuper' | 'pause';
}

const BTNS: BtnDef[] = [
  { id: 'LP', label: 'LP', mask: B.LP, x: 22, y: 34, size: 15, cls: 'p', layouts: ['pro', 'gesture', 'smart'] },
  { id: 'HP', label: 'HP', mask: B.HP, x: 9, y: 44, size: 15, cls: 'p', layouts: ['pro', 'gesture', 'smart'] },
  { id: 'LK', label: 'LK', mask: B.LK, x: 22, y: 12, size: 15, cls: 'k', layouts: ['pro', 'gesture', 'smart'] },
  { id: 'HK', label: 'HK', mask: B.HK, x: 9, y: 22, size: 15, cls: 'k', layouts: ['pro', 'gesture', 'smart'] },
  { id: 'RAGE', label: 'RAGE', mask: B.RAGE, x: 35, y: 26, size: 11, cls: 'rage', layouts: ['pro', 'smart'] },
  { id: 'DODGE', label: 'DODGE', mask: B.DODGE, x: 35, y: 6, size: 11, cls: 'dodge', layouts: ['pro', 'gesture', 'smart'] },
  { id: 'ASSIST', label: 'TAG', mask: B.ASSIST, x: 3, y: 64, size: 10, cls: 'assist', layouts: ['pro', 'gesture', 'smart'] },
  { id: 'BLOCK', label: 'BLOCK', mask: B.BLOCK, x: 3, y: 4, size: 11, cls: 'block', layouts: ['pro', 'gesture', 'smart'] },
  { id: 'TAUNT', label: '😜', mask: B.TAUNT, x: 16, y: 64, size: 8, cls: 'taunt', layouts: ['pro'] },
  { id: 'SPECIAL', label: 'SPECIAL', mask: 0, x: 35, y: 44, size: 12, cls: 'special', layouts: ['smart'], special: 'smartSpecial' },
  { id: 'SUPER', label: 'SUPER', mask: 0, x: 26, y: 58, size: 11, cls: 'super', layouts: ['smart'], special: 'smartSuper' },
];

// chord zones sit between two buttons so one thumb can press both (EX moves, throws)
const CHORDS: { a: string; b: string; mask: number }[] = [
  { a: 'LP', b: 'HP', mask: B.LP | B.HP },
  { a: 'LK', b: 'HK', mask: B.LK | B.HK },
  { a: 'LP', b: 'LK', mask: B.LP | B.LK },
];

const MOTION_SEQ: Record<string, number[]> = {
  QCF: [2, 3, 6],
  QCB: [2, 1, 4],
  DP: [6, 2, 3],
  HCF: [4, 1, 2, 3, 6],
  HCB: [6, 3, 2, 1, 4],
  QCF2: [2, 3, 6, 2, 3, 6],
  SPD: [6, 3, 2, 1, 4, 7, 8, 9, 6],
  BFD: [4, 6, 2],
  FBF: [6, 4, 6],
  DDOWN: [2, 5, 2],
};

function dirMask(d: number, facing: number): number {
  let m = 0;
  const fwd = facing > 0 ? B.R : B.L;
  const back = facing > 0 ? B.L : B.R;
  if ([7, 8, 9].includes(d)) m |= B.U;
  if ([1, 2, 3].includes(d)) m |= B.D;
  if ([3, 6, 9].includes(d)) m |= fwd;
  if ([1, 4, 7].includes(d)) m |= back;
  return m;
}

export function motionMacro(motion: MotionName, btn: number, facing: number): number[] {
  const out: number[] = [];
  if (motion === 'CHARGE_BF') {
    for (let i = 0; i < 34; i++) out.push(dirMask(4, facing));
    out.push(dirMask(6, facing), dirMask(6, facing) | btn);
  } else if (motion === 'CHARGE_DU') {
    for (let i = 0; i < 34; i++) out.push(dirMask(2, facing));
    out.push(dirMask(8, facing), dirMask(8, facing) | btn);
  } else {
    const seq = MOTION_SEQ[motion] ?? [];
    for (const d of seq) out.push(dirMask(d, facing), dirMask(d, facing));
    out.push(dirMask(seq[seq.length - 1] ?? 5, facing) | btn);
  }
  out.push(btn, 0);
  return out;
}

export class TouchController {
  el: HTMLDivElement;
  stickBase: HTMLDivElement;
  stickKnob: HTMLDivElement;
  btnEls = new Map<string, HTMLDivElement>();
  pointers = new Map<number, { kind: 'stick' | 'btn' | 'gesture'; ids: string[]; x0: number; y0: number; t0: number; path: { x: number; y: number; t: number }[]; mask: number }>();
  stickVec = { x: 0, y: 0 };
  stickOrigin = { x: 0, y: 0 };
  macro: number[] = [];
  pendingMotion: { m: MotionName; until: number } | null = null;
  chargeHold = false;
  visible = false;
  editing = false;
  ctx: () => TouchCtx = () => ({ facing: 1, dist: 3, oppAir: false, char: 'jumla', meter: 0, rage: 0, hasWeapon: false });
  onPause: () => void = () => {};
  positions: Record<string, { x: number; y: number; size: number }>;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'touch';
    this.el.className = 'hidden';
    parent.appendChild(this.el);
    this.stickBase = document.createElement('div');
    this.stickBase.className = 'stick-base';
    this.stickKnob = document.createElement('div');
    this.stickKnob.className = 'stick-knob';
    this.stickBase.appendChild(this.stickKnob);
    this.el.appendChild(this.stickBase);
    this.positions = load('touchPos', {} as Record<string, { x: number; y: number; size: number }>);
    for (const b of BTNS) {
      const d = document.createElement('div');
      d.className = 'tbtn ' + (b.cls ?? '');
      d.textContent = b.label;
      d.dataset.id = b.id;
      this.el.appendChild(d);
      this.btnEls.set(b.id, d);
    }
    const pause = document.createElement('div');
    pause.className = 'tbtn pausebtn';
    pause.textContent = 'II';
    pause.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.onPause();
    });
    this.el.appendChild(pause);
    this.layout();
    this.el.addEventListener('pointerdown', (e) => this.down(e));
    this.el.addEventListener('pointermove', (e) => this.move(e));
    this.el.addEventListener('pointerup', (e) => this.up(e));
    this.el.addEventListener('pointercancel', (e) => this.up(e));
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('resize', () => this.layout());
  }

  show(on: boolean) {
    this.visible = on;
    this.el.classList.toggle('hidden', !on);
    document.body.classList.toggle('touch-on', on);
    if (!on) this.releaseAll();
    this.layout();
  }

  releaseAll() {
    this.pointers.clear();
    this.stickVec = { x: 0, y: 0 };
    this.macro = [];
    this.stickBase.classList.remove('active');
    for (const e of this.btnEls.values()) e.classList.remove('down');
  }

  layout() {
    const lay = settings.touchLayout;
    const sc = settings.touchScale;
    const mirror = settings.leftHanded;
    this.el.style.setProperty('--tops', String(settings.touchOpacity));
    for (const b of BTNS) {
      const el = this.btnEls.get(b.id)!;
      const show = b.layouts.includes(lay) && !(settings.oneHand && (b.id === 'TAUNT' || b.id === 'ASSIST'));
      el.style.display = show ? 'flex' : 'none';
      const p = this.positions[lay + ':' + b.id] ?? { x: b.x, y: b.y, size: b.size };
      const size = p.size * sc;
      el.style.width = el.style.height = size + 'vmin';
      el.style.fontSize = size * 0.26 + 'vmin';
      el.style.bottom = `calc(${p.y}% + env(safe-area-inset-bottom))`;
      if (mirror) {
        el.style.left = `calc(${p.x}% + env(safe-area-inset-left))`;
        el.style.right = '';
      } else {
        el.style.right = `calc(${p.x}% + env(safe-area-inset-right))`;
        el.style.left = '';
      }
    }
    this.stickBase.style.width = this.stickBase.style.height = 30 * sc + 'vmin';
  }

  private btnAt(x: number, y: number): string[] {
    const hits: string[] = [];
    for (const [id, el] of this.btnEls) {
      if (el.style.display === 'none') continue;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const rad = r.width * 0.62;
      if (Math.hypot(x - cx, y - cy) < rad) hits.push(id);
    }
    if (hits.length === 0) {
      // chord zones between paired buttons
      for (const c of CHORDS) {
        const a = this.btnEls.get(c.a)!.getBoundingClientRect();
        const b = this.btnEls.get(c.b)!.getBoundingClientRect();
        if (this.btnEls.get(c.a)!.style.display === 'none') continue;
        const mx = (a.left + a.right + b.left + b.right) / 4;
        const my = (a.top + a.bottom + b.top + b.bottom) / 4;
        if (Math.hypot(x - mx, y - my) < a.width * 0.32) return [c.a, c.b];
      }
    }
    return hits.slice(0, 1);
  }

  private isStickSide(x: number) {
    const w = window.innerWidth;
    return settings.leftHanded ? x > w * 0.5 : x < w * 0.45;
  }

  private down(e: PointerEvent) {
    e.preventDefault();
    this.el.setPointerCapture?.(e.pointerId);
    const now = performance.now();
    if (this.editing) return this.editDown(e);
    const ids = this.btnAt(e.clientX, e.clientY);
    if (ids.length) {
      this.pointers.set(e.pointerId, { kind: 'btn', ids, x0: e.clientX, y0: e.clientY, t0: now, path: [], mask: 0 });
      this.pressed(ids);
      return;
    }
    if (this.isStickSide(e.clientX)) {
      if ([...this.pointers.values()].some((p) => p.kind === 'stick')) return;
      this.stickOrigin = { x: e.clientX, y: e.clientY };
      this.stickBase.style.left = e.clientX + 'px';
      this.stickBase.style.top = e.clientY + 'px';
      this.stickBase.classList.add('active');
      this.pointers.set(e.pointerId, { kind: 'stick', ids: [], x0: e.clientX, y0: e.clientY, t0: now, path: [], mask: 0 });
      this.updateStick(e.clientX, e.clientY);
      return;
    }
    // empty area on the button side: gestures
    const gestures = [...this.pointers.values()].filter((p) => p.kind === 'gesture');
    if (gestures.length >= 1 && now - gestures[0].t0 < 200) {
      // two-finger tap = Rage Cancel
      this.macro.push(B.RAGE, 0);
      this.haptic(25);
      return;
    }
    this.pointers.set(e.pointerId, { kind: 'gesture', ids: [], x0: e.clientX, y0: e.clientY, t0: now, path: [{ x: e.clientX, y: e.clientY, t: now }], mask: 0 });
  }

  private move(e: PointerEvent) {
    const p = this.pointers.get(e.pointerId);
    if (this.editing) return this.editMove(e);
    if (!p) return;
    if (p.kind === 'stick') this.updateStick(e.clientX, e.clientY);
    else if (p.kind === 'btn') {
      // sliding between buttons (piano-ing)
      const ids = this.btnAt(e.clientX, e.clientY);
      if (ids.length && ids.join() !== p.ids.join()) {
        for (const id of p.ids) this.btnEls.get(id)?.classList.remove('down');
        p.ids = ids;
        this.pressed(ids);
      }
    } else if (p.kind === 'gesture') {
      p.path.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      if (!this.chargeHold && performance.now() - p.t0 > 450 && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 20) this.chargeHold = true;
    }
  }

  private up(e: PointerEvent) {
    if (this.editing) return this.editUp();
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (p.kind === 'stick') {
      this.stickVec = { x: 0, y: 0 };
      this.stickBase.classList.remove('active');
      this.stickKnob.style.transform = '';
    } else if (p.kind === 'btn') {
      for (const id of p.ids) this.btnEls.get(id)?.classList.remove('down');
    } else if (p.kind === 'gesture') {
      p.path.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      this.recognise(p.path, p.t0);
    }
  }

  private updateStick(x: number, y: number) {
    let dx = x - this.stickOrigin.x;
    let dy = y - this.stickOrigin.y;
    const max = this.stickBase.getBoundingClientRect().width * 0.42 || 60;
    const m = Math.hypot(dx, dy);
    if (m > max) {
      // drag the base along (floating stick)
      const k = (m - max) / m;
      this.stickOrigin.x += dx * k;
      this.stickOrigin.y += dy * k;
      this.stickBase.style.left = this.stickOrigin.x + 'px';
      this.stickBase.style.top = this.stickOrigin.y + 'px';
      dx = x - this.stickOrigin.x;
      dy = y - this.stickOrigin.y;
    }
    this.stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.stickVec = { x: dx / max, y: dy / max };
  }

  private pressed(ids: string[]) {
    let mask = 0;
    for (const id of ids) {
      const def = BTNS.find((b) => b.id === id);
      this.btnEls.get(id)?.classList.add('down');
      if (!def) continue;
      if (def.special === 'smartSpecial') {
        this.smartSpecial();
        continue;
      }
      if (def.special === 'smartSuper') {
        this.smartSuper();
        continue;
      }
      mask |= def.mask;
    }
    if (mask & (B.LP | B.HP | B.LK | B.HK) && this.pendingMotion && performance.now() < this.pendingMotion.until) {
      const ctx = this.ctx();
      this.macro.push(...motionMacro(this.pendingMotion.m, mask, ctx.facing));
      this.pendingMotion = null;
    }
    this.haptic(8);
  }

  private haptic(ms: number) {
    if (settings.haptics) navigator.vibrate?.(ms);
  }

  private recognise(path: { x: number; y: number; t: number }[], t0: number) {
    const ctx = this.ctx();
    const now = performance.now();
    if (this.chargeHold) {
      this.chargeHold = false;
      this.pendingMotion = { m: 'CHARGE_BF', until: now + 600 };
      this.haptic(15);
      return;
    }
    if (path.length < 2) return;
    const a = path[0];
    const b = path[path.length - 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    const dur = now - t0;
    if (dist < 25) return;
    // total turning angle -> circle detection
    let turn = 0;
    for (let i = 2; i < path.length; i++) {
      const a1 = Math.atan2(path[i - 1].y - path[i - 2].y, path[i - 1].x - path[i - 2].x);
      const a2 = Math.atan2(path[i].y - path[i - 1].y, path[i].x - path[i - 1].x);
      let d = a2 - a1;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      turn += d;
    }
    const fwdSign = ctx.facing;
    if (Math.abs(turn) > Math.PI * 1.5) {
      this.pendingMotion = { m: 'SPD', until: now + 700 };
      this.haptic(15);
      return;
    }
    // L-shaped swipe (down then sideways) = quarter circle
    const mid = path[Math.floor(path.length / 2)];
    const firstDown = mid.y - a.y > 20;
    const sideways = (b.x - mid.x) * fwdSign;
    if (firstDown && Math.abs(b.x - mid.x) > 25) {
      this.pendingMotion = { m: sideways > 0 ? 'QCF' : 'QCB', until: now + 600 };
      this.haptic(12);
      return;
    }
    // sideways then down-sideways: dragon punch (→↓↘)
    if ((mid.x - a.x) * fwdSign > 20 && b.y - mid.y > 25) {
      this.pendingMotion = { m: 'DP', until: now + 600 };
      this.haptic(12);
      return;
    }
    if (Math.abs(dx) > Math.abs(dy) * 1.5 && dur < 350) {
      // quick horizontal swipe = dash / backdash
      const toward = dx * fwdSign > 0 ? 6 : 4;
      const m = dirMask(toward, fwdSign);
      this.macro.push(m, m, 0, 0, m, m, m);
      this.haptic(10);
      return;
    }
    if (dy < -40 && Math.abs(dy) > Math.abs(dx) && dur < 300) {
      // flick up = launcher (crouching HP)
      this.macro.push(B.D, B.D | B.HP, B.D, 0);
      this.haptic(12);
      return;
    }
    if (dy > 40 && Math.abs(dy) > Math.abs(dx)) {
      // flick down = sidestep
      this.macro.push(B.DODGE | B.D, B.D, 0);
    }
  }

  private smartSpecial() {
    const ctx = this.ctx();
    const c = CHARS[ctx.char];
    if (!c) return;
    const pick = (pred: (id: string) => boolean) => c.specials.find((s) => pred(s.l));
    const m = (id: string) => c.moves[id];
    let sp = c.specials[0];
    if (ctx.oppAir && ctx.dist < 2.2) sp = pick((id) => !!m(id).vy || !!m(id).invuln) ?? sp;
    else if (ctx.dist > 3.2) sp = pick((id) => !!m(id).projectile || !!m(id).travel || !!m(id).teleport) ?? sp;
    else if (ctx.dist < 1.4) sp = pick((id) => !!m(id).grab) ?? pick((id) => !!m(id).travel) ?? sp;
    else sp = pick((id) => !!m(id).travel || !!m(id).lunge) ?? sp;
    const btn = sp.btn === 'P' ? B.LP : B.LK;
    this.macro.push(...motionMacro(sp.motion, btn, ctx.facing));
  }

  private smartSuper() {
    const ctx = this.ctx();
    const c = CHARS[ctx.char];
    if (!c) return;
    if (ctx.meter >= 300) this.macro.push(...motionMacro('QCF2', B.HP | B.HK, ctx.facing));
    else {
      const s = c.supers[0];
      this.macro.push(...motionMacro(s.motion, s.btn === 'P' ? B.LP : B.LK, ctx.facing));
    }
  }

  /** Current input mask. Call once per sim frame. */
  read(): number {
    if (!this.visible) return 0;
    if (this.macro.length) return this.macro.shift()!;
    let m = 0;
    const { x, y } = this.stickVec;
    const mag = Math.hypot(x, y);
    if (mag > 0.32) {
      const ang = Math.atan2(-y, x);
      const oct = Math.round(ang / (Math.PI / 4));
      const dirs = [B.R, B.R | B.U, B.U, B.U | B.L, B.L, B.L | B.D, B.D, B.D | B.R];
      m |= dirs[(oct + 8) % 8];
    }
    if (this.chargeHold) m = dirMask(4, this.ctx().facing);
    for (const p of this.pointers.values()) {
      if (p.kind !== 'btn') continue;
      for (const id of p.ids) m |= BTNS.find((b) => b.id === id)?.mask ?? 0;
    }
    return m;
  }

  // ---------------------------------------------------------------- layout editor
  private dragId: string | null = null;
  startEdit() {
    this.editing = true;
    this.show(true);
    this.el.classList.add('editing');
  }
  stopEdit() {
    this.editing = false;
    this.el.classList.remove('editing');
    save('touchPos', this.positions);
  }
  resetLayout() {
    this.positions = {};
    save('touchPos', this.positions);
    this.layout();
  }
  private editDown(e: PointerEvent) {
    const ids = this.btnAt(e.clientX, e.clientY);
    this.dragId = ids[0] ?? null;
  }
  private editMove(e: PointerEvent) {
    if (!this.dragId) return;
    const lay = settings.touchLayout;
    const def = BTNS.find((b) => b.id === this.dragId)!;
    const key = lay + ':' + def.id;
    const cur = this.positions[key] ?? { x: def.x, y: def.y, size: def.size };
    const w = window.innerWidth;
    const h = window.innerHeight;
    const el = this.btnEls.get(def.id)!;
    const r = el.getBoundingClientRect();
    const xFromRight = ((w - e.clientX - r.width / 2) / w) * 100;
    const xFromLeft = ((e.clientX - r.width / 2) / w) * 100;
    cur.x = Math.max(0, Math.min(90, settings.leftHanded ? xFromLeft : xFromRight));
    cur.y = Math.max(0, Math.min(85, ((h - e.clientY - r.height / 2) / h) * 100));
    this.positions[key] = cur;
    this.layout();
  }
  private editUp() {
    this.dragId = null;
  }
  resizeButton(id: string, delta: number) {
    const lay = settings.touchLayout;
    const def = BTNS.find((b) => b.id === id)!;
    const key = lay + ':' + id;
    const cur = this.positions[key] ?? { x: def.x, y: def.y, size: def.size };
    cur.size = Math.max(6, Math.min(24, cur.size + delta));
    this.positions[key] = cur;
    this.layout();
  }
}
