// Cinematic finishers. The sim only knows "finisher X is playing for N frames"; everything
// you see here is presentation, so it can be as over-the-top as we like without touching netcode.
import * as THREE from 'three';
import { CHARS } from '../sim/roster';
import { STAGE_SIM } from '../sim/stages';
import type { MatchState } from '../sim/types';
import type { GameRenderer } from './renderer';
import type { FighterView } from './fighterView';
import { ATTACKS, POSES, merge, type Pose } from './poses';
import type { Joint } from './rig';
import { makeHazard, makeProjectile, makeWeapon, textTexture } from './props';
import { setXray, toon } from './rig';

type Tpl = 'decap' | 'explode' | 'crush' | 'bury' | 'rip' | 'spine' | 'impale' | 'sink' | 'statue' | 'flag' | 'paperwork' | 'wedding' | 'throwFar' | 'trample' | 'videowall';

const TPL: Record<string, Tpl> = {
  jF1: 'decap', jF2: 'explode', jC: 'statue',
  gF1: 'crush', gF2: 'bury', gC: 'paperwork',
  bF1: 'crush', bF2: 'bury', bC: 'paperwork',
  vF1: 'crush', vF2: 'bury', vC: 'paperwork',
  dF1: 'rip', dF2: 'explode', dC: 'flag',
  hF1: 'spine', hF2: 'rip', hC: 'wedding',
  tF1: 'decap', tF2: 'sink', tC: 'paperwork',
  aF1: 'impale', aF2: 'spine', aC: 'statue',
  sF1: 'crush', sF2: 'explode', sC: 'statue',
};

const STAGE_TPL: Record<string, Tpl> = { assembly: 'throwFar', maidan: 'trample', tollplaza: 'decap', studio: 'videowall' };

interface Debris {
  obj: THREE.Object3D;
  v: THREE.Vector3;
  w: THREE.Vector3;
  stump?: { view: FighterView; joint: Joint };
  bleed: number;
}

export class FinisherDirector {
  tpl: Tpl;
  title: string;
  w: FighterView;
  v: FighterView;
  done = new Set<string>();
  debris: Debris[] = [];
  extras: THREE.Object3D[] = [];
  pf = 0;
  wx = 0;
  vx = 0;
  dir = 1;
  gore: boolean;
  stumps: { view: FighterView; joint: Joint; until: number }[] = [];

  constructor(private r: GameRenderer, s: MatchState, public id: string, public by: number) {
    this.w = r.views[by];
    this.v = r.views[1 - by];
    this.gore = r.settings.gore !== 'off';
    this.tpl = id === 'stage' ? STAGE_TPL[s.cfg.stage] ?? 'throwFar' : TPL[id] ?? 'decap';
    const fin = CHARS[s.f[by].char].finishers.find((f) => f.id === id);
    this.title = id === 'stage' ? (STAGE_SIM[s.cfg.stage]?.finisher ?? 'STAGE FATALITY').toUpperCase() : (fin?.name ?? 'FINISHER').toUpperCase();
    this.wx = s.f[by].x;
    this.vx = s.f[1 - by].x;
    this.dir = Math.sign(this.vx - this.wx) || 1;
    // comedy finishers never spill blood
    if (fin?.kind === 'comedy') this.gore = false;
  }

  get comedy() {
    return ['statue', 'flag', 'paperwork', 'wedding'].includes(this.tpl);
  }

  once(k: string, at: number, fn: () => void) {
    if (this.pf >= at && !this.done.has(k)) {
      this.done.add(k);
      fn();
    }
  }

  detach(view: FighterView, joint: Joint, v: THREE.Vector3, w = new THREE.Vector3(8, 4, 6), stump = true) {
    const o = view.rig.j[joint];
    if (view.rig.detached.has(joint)) return;
    this.r.scene.attach(o);
    view.rig.detached.add(joint);
    this.debris.push({ obj: o, v, w, bleed: stump && this.gore ? 2.5 : 0 });
    if (stump) this.stumps.push({ view, joint, until: this.pf + 150 });
  }

  add(o: THREE.Object3D) {
    this.r.scene.add(o);
    this.extras.push(o);
    return o;
  }

  vfxAt(view: FighterView, j: Joint) {
    return view.jointPos(j);
  }

  wPose(p: Pose) {
    this.w.override = p;
  }
  vPose(p: Pose) {
    this.v.override = p;
  }

  update(dt: number, s: MatchState) {
    this.pf = s.phase === 'finisher' ? s.pf : this.pf + 1;
    const vfx = this.r.vfx;
    const pf = this.pf;
    const dir = this.dir;
    const vpos = () => this.vfxAt(this.v, 'chest');
    this.once('title', 1, () => {
      this.r.shake(0.1);
    });
    switch (this.tpl) {
      case 'decap': {
        this.wPose(pf < 80 ? ATTACKS.uppercut.w : ATTACKS.uppercut.h);
        this.vPose(pf < 90 ? POSES.dizzy : pf < 160 ? POSES.hitHigh : POSES.knockdown);
        if (s.cfg.stage === 'tollplaza' && this.id === 'stage') {
          this.once('barrier', 40, () => {
            const b = makeProjectile('barrier');
            b.position.set(this.vx, 6, 0);
            b.rotation.y = Math.PI / 2;
            this.add(b);
          });
          const b = this.extras[0];
          if (b) b.position.y = Math.max(1.5, 6 - Math.max(0, pf - 40) * 0.12);
        }
        this.once('pop', 90, () => {
          const p = vpos();
          this.detach(this.v, 'head', new THREE.Vector3(dir * 1.5, 9, 1.2), new THREE.Vector3(12, 6, 3));
          vfx.bloodBurst(p.x, p.y + 0.4, p.z, dir, 6);
          vfx.flash(p.x, p.y + 0.4, 0.4, 2.5, 0.3, 0xffffff);
          this.r.shake(0.4);
          this.r.impactFrame();
        });
        break;
      }
      case 'explode': {
        this.wPose(pf < 60 ? ATTACKS.cast2.w : ATTACKS.cast2.h);
        this.vPose(POSES.dizzy);
        if (pf > 60 && pf < 120) {
          const k = 1 + (pf - 60) / 60;
          this.v.rig.body.scale.setScalar(this.v.rig.scale * k);
          this.v.glowT = (pf % 8) / 8;
        }
        this.once('boom', 120, () => {
          const p = vpos();
          this.v.hidden = true;
          vfx.debrisBurst(p.x, p.y, p.z, this.v.rig.look.top, 60, 1.6);
          vfx.debrisBurst(p.x, p.y, p.z, this.v.rig.look.skin, 30, 1.4);
          vfx.bloodBurst(p.x, p.y, p.z, 1, 8);
          vfx.bloodBurst(p.x, p.y, p.z, -1, 8);
          vfx.confettiBurst(p.x, p.y, p.z, 80);
          vfx.ring(p.x, p.y, 0.3, 0xffa000, 8, 0.6);
          vfx.flash(p.x, p.y, 0.5, 6, 0.5, 0xffa000);
          // the head always survives an explosion, for comedy
          const head = this.v.rig.j.head;
          this.r.scene.attach(head);
          head.visible = true;
          this.v.rig.root.visible = true;
          this.debris.push({ obj: head, v: new THREE.Vector3(-dir * 2, 10, 2), w: new THREE.Vector3(10, 8, 4), bleed: this.gore ? 1 : 0 });
          this.r.shake(0.8);
          this.r.impactFrame();
        });
        if (this.done.has('boom')) for (const j of ['hips', 'spine', 'chest'] as Joint[]) this.v.rig.j[j].visible = false;
        if (this.done.has('boom')) for (const j of ['thL', 'thR'] as Joint[]) this.v.rig.j[j].visible = false;
        break;
      }
      case 'crush': {
        this.vPose(pf < 50 ? POSES.dizzy : POSES.knockdown);
        this.wPose(pf < 70 ? POSES.jump : ATTACKS.slam.h);
        this.once('drop', 60, () => {
          const thing = this.id.startsWith('s') ? makeWeapon('chair', false) : this.id.startsWith('b') ? bulldozerMesh() : this.id.startsWith('v') ? stampMesh() : moneyMesh();
          thing.scale.setScalar(this.id.startsWith('b') ? 1 : 2.4);
          thing.position.set(this.vx, 12, 0);
          this.add(thing);
        });
        const thing = this.extras[0];
        if (thing) {
          const fall = Math.max(0, pf - 60);
          thing.position.y = Math.max(0.05, 12 - fall * fall * 0.02);
          if (this.id.startsWith('b') && thing.position.y <= 0.05) thing.position.x += dir * dt * 3;
        }
        this.once('splat', 85, () => {
          const p = vpos();
          this.v.rig.body.scale.set(this.v.rig.scale * 1.5, this.v.rig.scale * 0.12, this.v.rig.scale * 1.5);
          vfx.bloodBurst(p.x, 0.3, p.z, 1, 7);
          vfx.bloodBurst(p.x, 0.3, p.z, -1, 7);
          for (let i = 0; i < 6; i++) vfx.decals.add(p.x + (Math.random() - 0.5) * 2, 0.013, (Math.random() - 0.5) * 1.5, 0.8 + Math.random(), vfx.goreColor);
          vfx.dustPuff(p.x, 0, 0, 30, 0.6);
          this.r.shake(0.7);
          this.r.impactFrame();
        });
        break;
      }
      case 'bury': {
        this.vPose(pf < 60 ? POSES.dizzy : POSES.crumple);
        this.wPose(pf < 50 ? POSES.taunt : POSES.win);
        if (pf > 50 && pf % 3 === 0 && pf < 160) {
          const piece = this.id.startsWith('v') ? ballotBox() : this.id.startsWith('g') ? safeMesh() : rubble();
          piece.position.set(this.vx + (Math.random() - 0.5) * 1.4, 8, (Math.random() - 0.5) * 1.0);
          piece.rotation.set(Math.random() * 3, Math.random() * 3, 0);
          piece.userData.vy = 0;
          this.add(piece);
        }
        for (const e of this.extras) {
          if (e.userData.vy === undefined) continue;
          e.userData.vy -= dt * 18;
          e.position.y = Math.max(0.2 + (e.userData.rest ?? 0), e.position.y + e.userData.vy * dt);
          if (e.position.y <= 0.2 + (e.userData.rest ?? 0) && !e.userData.landed) {
            e.userData.landed = true;
            e.userData.rest = Math.random() * 1.6;
            vfx.dustPuff(e.position.x, 0, 0, 3, 0.3);
            if (this.gore && Math.random() < 0.4) vfx.bloodBurst(e.position.x, 0.4, 0, Math.random() < 0.5 ? 1 : -1, 1.5);
          }
        }
        break;
      }
      case 'rip': {
        this.wPose(pf < 60 ? ATTACKS.grab.h : ATTACKS.throwing.h);
        this.vPose(pf < 60 ? POSES.grabbed : POSES.hitHigh);
        this.once('armL', 70, () => {
          this.detach(this.v, 'uaL', new THREE.Vector3(-dir * 3, 6, -2));
          this.r.shake(0.35);
          this.r.impactFrame();
        });
        this.once('armR', 105, () => {
          this.detach(this.v, 'uaR', new THREE.Vector3(-dir * 2, 7, 2.5));
          this.r.shake(0.35);
        });
        this.once('kick', 150, () => {
          this.wPose(ATTACKS.sidekick.h);
          this.vPose(POSES.knockdown);
          this.v.rig.root.position.x += dir * 2;
          this.r.shake(0.4);
        });
        if (pf >= 150) this.wPose(ATTACKS.sidekick.h);
        break;
      }
      case 'spine': {
        this.wPose(pf < 60 ? ATTACKS.grab.h : ATTACKS.throwing.w);
        const bend = Math.min(1, Math.max(0, (pf - 70) / 30));
        this.vPose(merge(POSES.grabbed, { j: { spine: [-90 * bend, 0, 0], chest: [-60 * bend, 0, 0], head: [-50 * bend, 0, 0] }, rx: -10 }));
        this.once('xr', 70, () => {
          setXray(this.v.rig, true);
          this.r.impactFrame();
        });
        this.once('snap', 100, () => {
          const p = this.vfxAt(this.v, 'spine');
          vfx.flash(p.x, p.y, 0.4, 2, 0.3, 0xffffff);
          vfx.bloodBurst(p.x, p.y, p.z, 1, 5);
          this.r.shake(0.5);
        });
        this.once('xroff', 170, () => setXray(this.v.rig, false));
        break;
      }
      case 'impale': {
        this.wPose(pf < 60 ? ATTACKS.overhead.w : ATTACKS.overhead.h);
        this.vPose(pf < 70 ? POSES.dizzy : POSES.knockdown);
        this.once('spear', 70, () => {
          const m = makeWeapon('mic', false);
          m.scale.setScalar(1.6);
          m.position.set(this.vx, 0, 0);
          m.rotation.z = 0.2;
          this.add(m);
          const p = vpos();
          vfx.bloodBurst(p.x, 0.3, 0, 1, 6);
          vfx.bloodBurst(p.x, 0.3, 0, -1, 6);
          this.r.shake(0.5);
          this.r.impactFrame();
        });
        if (pf > 70 && pf < 200 && this.gore && pf % 4 === 0) vfx.fountain(this.vx, 0.3, 0.1, 0, 2, 2);
        break;
      }
      case 'sink': {
        this.wPose(pf < 40 ? ATTACKS.stomp.w : ATTACKS.stomp.h);
        this.vPose(POSES.grabbed);
        this.once('hole', 40, () => {
          const h = makeProjectile('pothole');
          h.position.set(this.vx, 0.02, 0);
          h.scale.setScalar(1.8);
          this.add(h);
        });
        if (pf > 50) this.v.rig.root.position.y = -Math.min(3, (pf - 50) * 0.03);
        if (pf > 50 && pf < 160 && pf % 5 === 0) vfx.dustPuff(this.vx, 0, 0, 3, 0.3);
        break;
      }
      case 'statue': {
        this.wPose(pf < 90 ? POSES.taunt : POSES.win);
        this.vPose(POSES.intro);
        this.once('gold', 60, () => {
          for (const m of this.v.rig.mats) {
            const mm = m as THREE.MeshToonMaterial;
            mm.color.set(0xffc830);
            mm.emissive?.set(0x3a2a00);
          }
          vfx.flash(this.vx, 1.2, 0.4, 4, 0.4, 0xffe080);
          vfx.confettiBurst(this.vx, 2, 0, 120);
        });
        this.once('base', 70, () => {
          const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 1.4), toon(0x8a8a8a));
          base.position.set(this.vx, 0.3, 0);
          this.add(base);
          const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.4), new THREE.MeshBasicMaterial({ map: textTexture('IN LOVING\nMEMORY', { bg: '#3a2a10', fg: '#ffd040', w: 256, h: 96 }) }));
          plaque.position.set(this.vx, 0.3, 0.71);
          this.add(plaque);
        });
        if (pf > 70) this.v.rig.root.position.y = 0.6;
        if (pf > 100 && pf % 30 === 0) vfx.flash(this.wx, 1.6, 0.6, 3, 0.15, 0xffffff);
        break;
      }
      case 'flag': {
        this.wPose(POSES.taunt);
        this.vPose(POSES.dizzy);
        if (pf > 60) {
          const k = Math.max(0.05, 1 - (pf - 60) / 50);
          this.v.rig.body.scale.setScalar(this.v.rig.scale * k);
        }
        this.once('flag', 110, () => {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3, 8), toon(0x888888));
          pole.position.set(this.vx, 1.5, 0);
          this.add(pole);
          const f = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9, 10, 1), new THREE.MeshBasicMaterial({ map: textTexture(CHARS[s.f[this.by].char].party.toUpperCase(), { bg: '#' + this.w.rig.look.partyColor.toString(16).padStart(6, '0'), fg: '#ffffff', w: 512, h: 320 }), side: THREE.DoubleSide }));
          f.position.set(this.vx + 0.72, 2.5, 0);
          f.userData.flag = true;
          this.add(f);
          vfx.confettiBurst(this.vx, 2.5, 0, 80);
        });
        for (const e of this.extras) if (e.userData.flag) e.rotation.y = Math.sin(this.r.time * 5) * 0.3;
        break;
      }
      case 'paperwork': {
        this.wPose(pf < 40 ? ATTACKS.cast.w : ATTACKS.cast.h);
        this.vPose(pf < 120 ? POSES.dizzy : POSES.crumple);
        if (pf > 40 && pf < 170 && pf % 2 === 0) {
          const pp = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.55), new THREE.MeshBasicMaterial({ map: paperTex(this.id), side: THREE.DoubleSide }));
          pp.position.set(this.vx + (Math.random() - 0.5) * 1.6, 7, (Math.random() - 0.5) * 1.2);
          pp.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
          pp.userData.vy = -1;
          this.add(pp);
        }
        for (const e of this.extras) {
          if (e.userData.vy === undefined) continue;
          if (e.userData.landed) continue;
          e.position.y += e.userData.vy * dt * 3;
          e.rotation.x += dt * 3;
          const restY = 0.05 + Math.random() * 0.02 + Math.min(1.8, this.extras.length * 0.012);
          if (e.position.y <= restY) {
            e.position.y = restY;
            e.rotation.set(-Math.PI / 2, 0, Math.random() * 6);
            e.userData.landed = true;
          }
        }
        break;
      }
      case 'wedding': {
        this.wPose(pf < 60 ? POSES.taunt : POSES.win);
        this.vPose(POSES.intro);
        this.once('garland', 40, () => {
          const t = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.06, 8, 24), toon(0xff9a1a));
          t.rotation.x = Math.PI / 2 - 0.4;
          t.position.set(this.vx, 1.45, 0.05);
          this.add(t);
          vfx.confettiBurst(this.vx, 2, 0, 150);
        });
        if (pf % 25 === 0) vfx.confettiBurst((this.vx + this.wx) / 2, 3, 0, 40);
        break;
      }
      case 'throwFar': {
        this.wPose(pf < 50 ? ATTACKS.grab.h : ATTACKS.lob.h);
        this.vPose(pf < 50 ? POSES.grabbed : POSES.air);
        if (pf > 50) {
          const t = (pf - 50) / 60;
          const root = this.v.rig.root;
          root.position.set(this.vx + dir * t * 6, Math.max(-3, 2 + t * 4 - t * t * 9), -t * 14);
          this.v.rig.body.rotation.x += dt * 10;
        }
        this.once('splash', 115, () => {
          vfx.dustPuff(this.vx + dir * 6, 0, -14, 40, 1);
          this.r.shake(0.5);
        });
        break;
      }
      case 'trample': {
        this.wPose(POSES.taunt);
        this.vPose(pf < 60 ? POSES.dizzy : POSES.knockdown);
        this.once('bulls', 40, () => {
          for (let i = 0; i < 4; i++) {
            const b = new THREE.Group();
            b.add(makeHazard('bull'));
            b.position.set(-dir * (12 + i * 3), 0, (i - 1.5) * 0.4);
            b.rotation.y = dir > 0 ? 0 : Math.PI;
            b.userData.run = true;
            this.add(b);
          }
        });
        for (const e of this.extras) if (e.userData.run) e.position.x += dir * dt * 14;
        if (pf > 60 && pf < 130 && pf % 6 === 0) {
          vfx.dustPuff(this.vx, 0, 0, 6, 0.5);
          if (this.gore) vfx.bloodBurst(this.vx, 0.3, 0, dir, 2);
          this.r.shake(0.15);
        }
        break;
      }
      case 'videowall': {
        this.wPose(pf < 50 ? ATTACKS.grab.h : ATTACKS.lob.h);
        this.vPose(pf < 50 ? POSES.grabbed : POSES.wallsplat);
        if (pf > 50) {
          const t = Math.min(1, (pf - 50) / 25);
          this.v.rig.root.position.set(this.vx + dir * 0.5 - 0 * t, 1 + t * 2.5, -t * 6.6);
        }
        this.once('smash', 76, () => {
          vfx.debrisBurst(this.vx, 3, -6.5, 0x3a6aff, 80, 1.2);
          vfx.flash(this.vx, 3, -6, 6, 0.4, 0x80c0ff);
          vfx.bloodBurst(this.vx, 3, -6.4, -1, 5);
          this.r.shake(0.6);
          this.r.impactFrame();
        });
        break;
      }
    }
    // physics for detached parts
    for (const d of this.debris) {
      d.v.y -= 18 * dt;
      d.obj.position.addScaledVector(d.v, dt);
      d.obj.rotation.x += d.w.x * dt;
      d.obj.rotation.y += d.w.y * dt;
      d.obj.rotation.z += d.w.z * dt;
      if (d.obj.position.y < 0.12) {
        d.obj.position.y = 0.12;
        d.v.y = Math.abs(d.v.y) * 0.35;
        d.v.x *= 0.6;
        d.v.z *= 0.6;
        d.w.multiplyScalar(0.6);
        if (this.gore && Math.abs(d.v.y) > 0.5) vfx.decals.add(d.obj.position.x, 0.013, d.obj.position.z, 0.6, vfx.goreColor);
      }
      if (d.bleed > 0 && this.gore) {
        d.bleed -= dt;
        if (Math.random() < 0.5) vfx.fountain(d.obj.position.x, d.obj.position.y, d.obj.position.z, 0, 0.5, 1);
      }
    }
    for (const st of this.stumps) {
      if (pf > st.until || !this.gore) continue;
      const parentJ: Joint = st.joint === 'head' ? 'neck' : st.joint === 'uaL' || st.joint === 'uaR' ? 'chest' : 'hips';
      const p = st.view.jointPos(parentJ);
      if (st.joint === 'head') p.y += 0.12;
      if (pf % 2 === 0) vfx.fountain(p.x, p.y, p.z + 0.05, (Math.random() - 0.5) * 1.5, 4 + Math.random() * 2, 3);
    }
  }

  camera(t: number): { pos: THREE.Vector3; look: THREE.Vector3; rate: number } {
    const mid = (this.wx + this.vx) / 2;
    const pf = this.pf;
    if (this.tpl === 'throwFar' && pf > 50) return { pos: new THREE.Vector3(this.vx - this.dir * 2, 3, 5), look: new THREE.Vector3(this.vx + this.dir * 4, 0.5, -10), rate: 3 };
    if (this.tpl === 'videowall' && pf > 50) return { pos: new THREE.Vector3(this.vx, 2.5, 4), look: new THREE.Vector3(this.vx, 3, -6), rate: 4 };
    if (this.tpl === 'sink' && pf > 50) return { pos: new THREE.Vector3(this.vx + 1.5, 2.6, 2.2), look: new THREE.Vector3(this.vx, 0, 0), rate: 4 };
    if (pf < 60) {
      return { pos: new THREE.Vector3(this.vx + this.dir * 1.2, 1.5, 2.3), look: new THREE.Vector3(this.vx, 1.4, 0), rate: 3 };
    }
    const ang = (t * 0.4) % (Math.PI * 2);
    const r = this.comedy ? 4 : 3.4;
    return { pos: new THREE.Vector3(mid + Math.sin(ang) * r, 1.7, Math.cos(ang) * r + 0.6), look: new THREE.Vector3(this.vx, 1.0, 0), rate: 2.5 };
  }

  dispose() {
    for (const e of this.extras) e.removeFromParent();
    for (const d of this.debris) d.obj.removeFromParent();
    this.w.override = null;
    this.v.override = null;
  }
}

function bulldozerMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 2), toon(0xffc21a));
  body.position.y = 1.3;
  g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.6), toon(0x333333));
  cab.position.set(-0.6, 2.6, 0);
  g.add(cab);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.4, 2.6), toon(0x777777));
  blade.position.set(1.9, 0.8, 0);
  g.add(blade);
  for (const z of [-1, 1]) {
    const tr = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.7, 0.5), toon(0x111111));
    tr.position.set(0, 0.35, z);
    g.add(tr);
  }
  return g;
}

function moneyMesh() {
  const g = new THREE.Group();
  const b = makeProjectile('moneybag');
  b.scale.setScalar(2.4);
  b.position.y = 0.6;
  g.add(b);
  return g;
}

function stampMesh() {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.8, 10), toon(0x5a2a1a));
  handle.position.y = 0.9;
  g.add(handle);
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 0.9), toon(0x8a5cff));
  base.position.y = 0.2;
  g.add(base);
  return g;
}

function safeMesh() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), toon(0x3a4a3a));
  g.add(b);
  const d = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.05, 12), toon(0xc0a040));
  d.rotation.x = Math.PI / 2;
  d.position.z = 0.36;
  g.add(d);
  return g;
}

function ballotBox() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.5), toon(0xd8d8d8));
  g.add(b);
  const s = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.05), toon(0x111111));
  s.position.y = 0.26;
  g.add(s);
  return g;
}

function rubble() {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25 + Math.random() * 0.25), toon([0x8a8a8a, 0xa08060, 0x6a6a6a][Math.floor(Math.random() * 3)]));
  return m;
}

const paperCache = new Map<string, THREE.Texture>();
function paperTex(id: string) {
  const key = id[0];
  let t = paperCache.get(key);
  if (!t) {
    const text = key === 't' ? 'CHALLAN\n₹∞' : key === 'v' ? 'RECOUNT\nFORM 17' : key === 'b' ? 'DEMOLITION\nNOTICE' : 'AUDIT\nNOTICE';
    t = textTexture(text, { bg: '#fffbe8', fg: '#a01010', border: '#a01010', w: 128, h: 176 });
    paperCache.set(key, t);
  }
  return t;
}
