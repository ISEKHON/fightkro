import * as THREE from 'three';
import { getMove } from '../sim/roster';
import { CHARS } from '../sim/roster';
import { B, isDown, numpad } from '../sim/input';
import type { FighterState, MatchState } from '../sim/types';
import { lookFor } from './looks';
import { ATTACKS, GUARD, POSES, attackPose, merge, type Pose } from './poses';
import { JOINTS, buildRig, applyDamageLook, resetDamageLook, type Joint, type Rig } from './rig';
import { makeWeapon } from './props';

const D2R = Math.PI / 180;
const at0 = (f: FighterState) => f.hist[f.hi];

export class FighterView {
  rig: Rig;
  cur: Record<string, [number, number, number]> = {};
  root = { rx: 0, ry: 0, rz: 0, y: 0, hy: 0 };
  weapon: string | null = null;
  weaponObj: THREE.Object3D | null = null;
  shadow: THREE.Mesh;
  walkPhase = 0;
  lastX = 0;
  spin = 0;
  glowT = 0;
  /** extra rotation added by cinematics (finishers) */
  override: Pose | null = null;
  hidden = false;
  charId: string;
  aura: THREE.Mesh;
  gore = true;

  constructor(scene: THREE.Scene, charId: string, quality: number) {
    this.charId = charId;
    const c = CHARS[charId];
    this.rig = buildRig(lookFor(charId), c.stats.height, { outlines: quality >= 1, shadows: quality >= 2 });
    scene.add(this.rig.root);
    for (const j of JOINTS) this.cur[j] = [0, 0, 0];
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.015;
    scene.add(this.shadow);
    this.aura = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xff2a00, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide }),
    );
    this.aura.scale.set(0.6, 1.1, 0.6);
    this.rig.root.add(this.aura);
  }

  dispose() {
    this.rig.root.removeFromParent();
    this.shadow.removeFromParent();
  }

  resetLook() {
    resetDamageLook(this.rig);
    for (const j of this.rig.detached) this.rig.j[j].visible = true;
    this.rig.detached.clear();
    for (const j of JOINTS) this.rig.j[j].scale.set(1, 1, 1);
    this.hidden = false;
    this.rig.root.visible = true;
  }

  targetPose(f: FighterState, s: MatchState, t: number): { pose: Pose; rate: number } {
    const o = s.f[1 - f.side];
    const input = at0(f);
    const d = numpad(input, f.facing);
    const heldBack = (input & (o.x >= f.x ? B.L : B.R)) !== 0 || (input & B.BLOCK) !== 0;
    const oThreat = o.st === 'attack' || s.projs.some((p) => p.owner === o.side);
    switch (f.st) {
      case 'intro':
        return { pose: POSES.intro, rate: 8 };
      case 'idle':
        if (heldBack && oThreat) return { pose: POSES.block, rate: 22 };
        return { pose: this.breathe(GUARD, t), rate: 12 };
      case 'walk': {
        const p = this.walk(GUARD, f, 1);
        return { pose: heldBack && oThreat ? merge(p, { j: { ...POSES.block.j, thL: p.j.thL, thR: p.j.thR, shL: p.j.shL, shR: p.j.shR } }) : p, rate: 16 };
      }
      case 'run':
        return { pose: this.walk(POSES.run, f, 1.8), rate: 16 };
      case 'crouch':
        return { pose: heldBack && oThreat ? POSES.blockLow : POSES.crouch, rate: 20 };
      case 'blockstun':
        return { pose: isDown(d) ? POSES.blockLow : POSES.block, rate: 30 };
      case 'prejump':
        return { pose: POSES.prejump, rate: 30 };
      case 'land':
        return { pose: POSES.land, rate: 25 };
      case 'jump': {
        const p = merge(POSES.jump, {});
        if (f.airJumps > 0 && f.vy > 0) p.rx = -((f.sf * 24) % 360);
        return { pose: p, rate: 14 };
      }
      case 'airdash':
        return { pose: POSES.airdash, rate: 22 };
      case 'dash':
        return { pose: POSES.dash, rate: 20 };
      case 'backdash':
        return { pose: POSES.backdash, rate: 20 };
      case 'sidestep':
        return { pose: POSES.sidestep, rate: 20 };
      case 'roll': {
        const p = merge(ATTACKS.roll.h, {});
        p.rx = (f.sf / 24) * 360 * (f.dodgeDir * f.facing > 0 ? 1 : -1);
        p.y = 0.35;
        return { pose: p, rate: 40 };
      }
      case 'attack':
        return { pose: this.attack(f), rate: 30 };
      case 'hitstun': {
        const m = f.lastHitBy && !f.lastHitBy.includes(':') ? safeMove(f.char, f.lastHitBy) : null;
        const low = m?.height === 'low' || (f.comboHits % 2 === 0 && m?.height !== 'high');
        return { pose: low ? POSES.hitLow : POSES.hitHigh, rate: 40 };
      }
      case 'air': {
        const p = merge(POSES.air, {});
        p.rx = -55 - Math.max(-40, Math.min(60, -f.vy * 300));
        if (f.juggle > 3) p.rx = -55 - ((f.sf * 9) % 360);
        return { pose: p, rate: 18 };
      }
      case 'knockdown':
        return { pose: POSES.knockdown, rate: 12 };
      case 'getup':
        return { pose: POSES.getup, rate: 12 };
      case 'wallsplat': {
        const p = merge(POSES.wallsplat, {});
        p.ry = 180;
        return { pose: p, rate: 30 };
      }
      case 'crumple':
        return { pose: POSES.crumple, rate: 6 };
      case 'dizzy': {
        const p = merge(POSES.dizzy, {});
        p.j = { ...p.j, spine: [18 + Math.sin(t * 3) * 8, Math.sin(t * 2) * 15, Math.cos(t * 3) * 10], head: [20 + Math.sin(t * 4) * 10, Math.cos(t * 3) * 20, 0] };
        return { pose: p, rate: 8 };
      }
      case 'guardcrush':
        return { pose: POSES.guardcrush, rate: 30 };
      case 'grabbed': {
        const p = merge(POSES.grabbed, {});
        p.rz = Math.sin(t * 20) * 6;
        return { pose: p, rate: 20 };
      }
      case 'throwing': {
        const g = f.throwMove ? safeMove(f.char, f.throwMove)?.grab : undefined;
        const k = g ? f.sf / g.frames : 0;
        return { pose: k < 0.6 ? ATTACKS.throwing.w : ATTACKS.throwing.h, rate: 14 };
      }
      case 'burst':
        return { pose: POSES.burst, rate: 30 };
      case 'taunt': {
        const p = merge(POSES.taunt, {});
        p.j = { ...p.j, spine: [-12 + Math.sin(t * 12) * 6, 10, 0] };
        return { pose: p, rate: 12 };
      }
      case 'pickup':
        return { pose: POSES.pickup, rate: 20 };
      case 'parry':
        return { pose: POSES.parry, rate: 40 };
      case 'win': {
        const p = merge(POSES.win, {});
        p.j = { ...p.j, uaL: [-170 + Math.sin(t * 6) * 10, 0, 20], uaR: [-165 + Math.cos(t * 6) * 10, 0, -25] };
        p.y = Math.max(0, Math.sin(t * 6)) * 0.08;
        return { pose: p, rate: 10 };
      }
      case 'lose':
        return { pose: POSES.lose, rate: 6 };
      case 'finisher':
      case 'finished':
        return { pose: this.override ?? (f.st === 'finisher' ? POSES.finisher : POSES.dizzy), rate: 14 };
    }
    return { pose: GUARD, rate: 12 };
  }

  breathe(p: Pose, t: number): Pose {
    const b = Math.sin(t * 2.4);
    return merge(p, { j: { chest: [4 + b * 2, -6, 0], head: [-4 - b * 2, 10, 0] }, hy: (p.hy ?? 0) + b * 0.01 });
  }

  walk(base: Pose, f: FighterState, amp: number): Pose {
    const ph = this.walkPhase;
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    const a = 26 * amp;
    return merge(base, {
      j: {
        thL: [-22 + s * a, 0, 4],
        shL: [22 + Math.max(0, -c) * a * 1.4, 0, 0],
        thR: [16 - s * a, 0, -6],
        shR: [16 + Math.max(0, c) * a * 1.4, 0, 0],
      },
      hy: (base.hy ?? 0) - Math.abs(c) * 0.03 * amp,
    });
    void f;
  }

  attack(f: FighterState): Pose {
    const m = safeMove(f.char, f.move!);
    if (!m) return GUARD;
    const key = m.pose || 'straight';
    const a = attackPose(key);
    const recEnd = m.startup + m.active + m.recovery * 0.45;
    let p: Pose;
    if (f.mf < m.startup) p = a.w;
    else if (f.mf < recEnd || m.recovery === 0) p = a.h;
    else p = m.air ? POSES.jump : GUARD;
    if (key === 'spin' && f.mf >= m.startup && f.mf < m.startup + m.active) {
      p = merge(p, {});
      p.ry = (f.mf * 40) % 360;
    }
    if (key === 'roll' && f.mf >= m.startup) {
      p = merge(p, {});
      p.rx = ((f.mf - m.startup) * 30) % 360;
      p.y = 0.4;
    }
    if ((key === 'dragonpunch' || key === 'flyingkick') && f.y > 0.1) {
      p = merge(p, {});
      p.ry = key === 'dragonpunch' ? (f.mf * 25) % 360 : 0;
    }
    return p;
  }

  update(f: FighterState, s: MatchState, dt: number, t: number) {
    const r = this.rig;
    // walk phase from actual movement
    const dx = f.x - this.lastX;
    this.lastX = f.x;
    this.walkPhase += dx * f.facing * 7.5 + (f.st === 'run' ? dt * 4 : 0);

    const { pose, rate } = this.targetPose(f, s, t);
    const k = 1 - Math.exp(-rate * dt);
    for (const j of JOINTS) {
      const tgt = pose.j[j as Joint] ?? [0, 0, 0];
      const c = this.cur[j];
      c[0] += (tgt[0] - c[0]) * k;
      c[1] += (tgt[1] - c[1]) * k;
      c[2] += (tgt[2] - c[2]) * k;
      r.j[j as Joint].rotation.set(c[0] * D2R, c[1] * D2R, c[2] * D2R);
    }
    const rr = this.root;
    const tgtRx = pose.rx ?? 0;
    // wrap-friendly lerp for spins
    rr.rx = Math.abs(tgtRx - rr.rx) > 180 && rate >= 40 ? tgtRx : rr.rx + (tgtRx - rr.rx) * k;
    rr.ry += ((pose.ry ?? 0) - rr.ry) * Math.min(1, k * 1.5);
    rr.rz += ((pose.rz ?? 0) - rr.rz) * k;
    rr.y += ((pose.y ?? 0) - rr.y) * k;
    rr.hy += ((pose.hy ?? 0) - rr.hy) * k;
    if (f.st === 'roll' || (f.st === 'attack' && (pose.rx ?? 0) !== 0)) rr.rx = tgtRx;
    if (f.st === 'jump' && f.airJumps > 0 && f.vy > 0) rr.rx = tgtRx;
    if (f.st === 'attack' && pose.ry) rr.ry = pose.ry;

    r.j.hips.position.y = r.hipsY + rr.hy;
    r.root.position.set(f.x, f.y + rr.y, f.z * 1.0);
    const yaw = f.facing * (90 - 22) * D2R;
    r.body.rotation.order = 'YXZ';
    r.body.rotation.set(rr.rx * D2R, yaw + rr.ry * D2R, rr.rz * D2R);

    // teleport fade
    let vis = !this.hidden;
    if (f.st === 'attack' && f.move) {
      const m = safeMove(f.char, f.move);
      if (m?.teleport && f.mf > m.startup - 6 && f.mf < m.startup + 4) vis = false;
    }
    r.root.visible = vis;

    // weapon
    if (f.weapon !== this.weapon) {
      this.weapon = f.weapon;
      if (this.weaponObj) this.weaponObj.removeFromParent();
      this.weaponObj = null;
      if (f.weapon) {
        this.weaponObj = makeWeapon(f.weapon, true);
        r.weaponSlot.add(this.weaponObj);
      }
    }

    // aura: rage / install
    const auraOn = f.install > 0 ? 0.35 + Math.sin(t * 20) * 0.1 : f.rage >= 50 ? 0.08 + Math.sin(t * 6) * 0.04 : 0;
    const am = this.aura.material as THREE.MeshBasicMaterial;
    am.opacity += (auraOn - am.opacity) * 0.2;
    am.color.set(f.install > 0 ? 0xff3000 : 0xff8a00);
    this.aura.position.y = 1.0;
    this.aura.visible = am.opacity > 0.01;

    // hit flash on materials
    if (this.glowT > 0) this.glowT = Math.max(0, this.glowT - dt * 6);
    for (const m of r.skinMats) m.emissive.setRGB(this.glowT, this.glowT * 0.2, this.glowT * 0.1);

    // damage looks
    applyDamageLook(r, f.hp / f.maxHp, this.gore);

    // shadow
    this.shadow.position.set(f.x, 0.015, f.z);
    const sh = Math.max(0.3, 1 - f.y * 0.25);
    this.shadow.scale.setScalar(sh * (f.st === 'knockdown' ? 1.6 : 1) * r.scale);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.35 * sh;
  }

  /** world position of a joint (for VFX) */
  jointPos(j: Joint, out = new THREE.Vector3()) {
    this.rig.j[j].getWorldPosition(out);
    return out;
  }
}

function safeMove(char: string, id: string) {
  try {
    return getMove(char, id);
  } catch {
    return null;
  }
}
