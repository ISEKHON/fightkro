import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CHARS } from '../sim/roster';
import { WALL } from '../sim/sim';
import type { GameEvent, MatchState } from '../sim/types';
import { FighterView } from './fighterView';
import { buildZone, type ZoneBuild } from './stages';
import { VFX } from './vfx';
import { makeHazard, makeProjectile, makeWeapon } from './props';
import { setXray } from './rig';
import { FinisherDirector } from './finishers';
import { attackPose } from './poses';

export interface RenderSettings {
  quality: number; // 0 low, 1 medium, 2 high
  gore: 'red' | 'green' | 'off';
  shake: number;
  flashes: boolean;
}

export class GameRenderer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer | null = null;
  bloom: UnrealBloomPass | null = null;
  vfx!: VFX;
  views: FighterView[] = [];
  assistViews: { view: FighterView; key: string }[] = [];
  zone: ZoneBuild | null = null;
  zoneIdx = -1;
  stageId = '';
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  rim: THREE.DirectionalLight;
  projViews = new Map<number, THREE.Object3D>();
  propViews = new Map<number, THREE.Object3D>();
  hazardViews: THREE.Object3D[] = [];
  crowd: THREE.InstancedMesh | null = null;
  crowdHeads: THREE.InstancedMesh | null = null;
  crowdBase: { x: number; y: number; z: number; p: number }[] = [];
  camPos = new THREE.Vector3(0, 1.8, 8);
  camLook = new THREE.Vector3(0, 1.1, 0);
  shakeAmt = 0;
  fovKick = 0;
  time = 0;
  koOrbit = 0;
  xrayT = 0;
  xrayVictim = -1;
  finisher: FinisherDirector | null = null;
  settings: RenderSettings;
  private fireworkT = 0;
  private lastPhase = '';
  private canvas: HTMLCanvasElement;
  dmgFlashT = [0, 0];
  private invertT = 0;

  constructor(canvas: HTMLCanvasElement, settings: RenderSettings) {
    this.canvas = canvas;
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: settings.quality >= 1, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = settings.quality >= 2;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 200);
    this.hemi = new THREE.HemisphereLight(0xfff2e0, 0x3a2a20, 1.0);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.5);
    this.sun.castShadow = settings.quality >= 2;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -10;
    sc.right = 10;
    sc.top = 8;
    sc.bottom = -4;
    sc.far = 40;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.rim = new THREE.DirectionalLight(0x88aaff, 0.9);
    this.rim.position.set(-4, 5, -8);
    this.scene.add(this.rim);
    this.vfx = new VFX(this.scene, settings.quality);
    this.vfx.setGore(settings.gore);
    this.vfx.intensity = settings.quality >= 2 ? 1 : settings.quality === 1 ? 0.7 : 0.45;
    this.setupPost();
    this.resize();
  }

  setupPost() {
    this.composer?.dispose();
    this.composer = null;
    if (this.settings.quality >= 2) {
      const size = this.renderer.getSize(new THREE.Vector2());
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.45, 0.6, 0.85);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
  }

  applySettings(s: RenderSettings) {
    const q = s.quality !== this.settings.quality;
    this.settings = s;
    this.vfx.setGore(s.gore);
    for (const v of this.views) v.gore = s.gore !== 'off';
    if (q) {
      this.renderer.shadowMap.enabled = s.quality >= 2;
      this.sun.castShadow = s.quality >= 2;
      this.vfx.intensity = s.quality >= 2 ? 1 : s.quality === 1 ? 0.7 : 0.45;
      this.setupPost();
      this.resize();
    }
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const dprCap = this.settings.quality >= 2 ? 2 : this.settings.quality === 1 ? 1.5 : 1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap) * (this.settings.quality === 0 ? 0.85 : 1));
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setMatch(s: MatchState) {
    for (const v of this.views) v.dispose();
    for (const a of this.assistViews) a.view.dispose();
    this.assistViews = [];
    this.views = s.f.map((f) => {
      const v = new FighterView(this.scene, f.char, this.settings.quality);
      v.gore = this.settings.gore !== 'off';
      v.lastX = f.x;
      return v;
    });
    this.stageId = s.cfg.stage;
    this.zoneIdx = -1;
    this.setZone(s.zone);
    this.vfx.clear();
    this.finisher = null;
    this.lastPhase = '';
    for (const p of this.projViews.values()) p.removeFromParent();
    this.projViews.clear();
    for (const p of this.propViews.values()) p.removeFromParent();
    this.propViews.clear();
  }

  setZone(z: number) {
    if (z === this.zoneIdx) return;
    this.zoneIdx = z;
    if (this.zone) this.zone.group.removeFromParent();
    this.zone = buildZone(this.stageId, z);
    this.scene.add(this.zone.group);
    this.zone.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && this.settings.quality >= 2) m.receiveShadow = true;
    });
    this.scene.background = new THREE.Color(this.zone.sky);
    this.scene.fog = new THREE.Fog(this.zone.fog[0], this.zone.fog[1] * (this.zone.weather === 'smog' ? 0.8 : 1), this.zone.fog[2]);
    this.hemi.intensity = this.zone.ambient;
    this.sun.intensity = this.zone.sun;
    this.sun.position.set(...this.zone.sunPos);
    this.vfx.setRain(this.zone.weather === 'rain');
    this.buildCrowd();
    this.vfx.decals.clear();
  }

  buildCrowd() {
    this.crowd?.removeFromParent();
    this.crowdHeads?.removeFromParent();
    this.crowd = this.crowdHeads = null;
    const c = this.zone?.crowd;
    if (!c) return;
    const n = Math.round(c.count * (this.settings.quality >= 2 ? 1 : this.settings.quality === 1 ? 0.6 : 0.35));
    const body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.22, 0.5, 3, 6), new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
    const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
    this.crowdBase = [];
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const row = i % 4;
      const x = (Math.random() - 0.5) * 26;
      const z = c.z - row * 0.9 - Math.random() * 0.3;
      const y = row * 0.25;
      this.crowdBase.push({ x, y, z, p: Math.random() * 6 });
      m.makeTranslation(x, y + 0.5, z);
      body.setMatrixAt(i, m);
      body.setColorAt(i, col.set(c.colors[i % c.colors.length]));
      m.makeTranslation(x, y + 1.02, z);
      heads.setMatrixAt(i, m);
      heads.setColorAt(i, col.set([0xc68a5a, 0xa86c40, 0xd6a06e, 0x8a5a3a][i % 4]));
    }
    this.scene.add(body);
    this.scene.add(heads);
    this.crowd = body;
    this.crowdHeads = heads;
  }

  animateCrowd(t: number, hype: number) {
    if (!this.crowd || !this.crowdHeads) return;
    const m = new THREE.Matrix4();
    for (let i = 0; i < this.crowdBase.length; i++) {
      const b = this.crowdBase[i];
      const j = Math.max(0, Math.sin(t * (6 + hype * 6) + b.p)) * (0.05 + hype * 0.25);
      m.makeTranslation(b.x, b.y + 0.5 + j, b.z);
      this.crowd.setMatrixAt(i, m);
      m.makeTranslation(b.x, b.y + 1.02 + j, b.z);
      this.crowdHeads.setMatrixAt(i, m);
    }
    this.crowd.instanceMatrix.needsUpdate = true;
    this.crowdHeads.instanceMatrix.needsUpdate = true;
  }

  shake(a: number) {
    this.shakeAmt = Math.max(this.shakeAmt, a * this.settings.shake);
  }

  impactFrame() {
    if (!this.settings.flashes) return;
    this.invertT = 0.06;
  }

  handleEvents(s: MatchState, events: GameEvent[]) {
    const gore = this.settings.gore !== 'off';
    for (const e of events) {
      const x = e.x ?? 0;
      const y = e.y ?? 1;
      switch (e.t) {
        case 'hit': {
          const victim: number = e.s === 0 ? 1 : e.s === 1 ? 0 : -1;
          const dir = e.s !== undefined && e.s >= 0 ? s.f[e.s].facing : 1;
          const power = Math.min(2.2, (e.v ?? 30) / 60);
          this.vfx.hit(x, y, s.f[victim === 1 ? 1 : 0].z + 0.1, dir, power, gore ? e.n ?? 1 : 0);
          this.shake(0.03 + power * 0.06);
          this.fovKick = Math.max(this.fovKick, power * 1.6);
          if (victim >= 0) {
            this.views[victim].glowT = 0.6;
            this.dmgFlashT[victim] = 1;
          }
          if ((e.v ?? 0) >= 90 || e.c === 1) this.impactFrame();
          if ((e.n ?? 0) >= 3) this.vfx.ring(x, y, 0.2, 0xffffff, 2.2, 0.25);
          break;
        }
        case 'block':
          this.vfx.flash(x, y, 0.3, 0.6, 0.1, 0x80c0ff);
          this.vfx.ring(x, y, 0.2, 0x80c0ff, 1.2, 0.2);
          this.shake(0.02);
          break;
        case 'parry':
          this.vfx.flash(x, y, 0.3, 1.6, 0.25, 0x40a0ff);
          this.vfx.ring(x, y, 0.2, 0x40c0ff, 3, 0.35);
          this.shake(0.05);
          break;
        case 'guardCrush':
          this.vfx.debrisBurst(x, y, 0.2, 0x80c0ff, 18, 0.8);
          this.vfx.ring(x, y, 0.2, 0x80c0ff, 3.5, 0.4);
          this.shake(0.12);
          this.impactFrame();
          break;
        case 'wallSplat':
          this.vfx.wallSplat(x, y);
          this.vfx.debrisBurst(Math.sign(x) * 7.7, y, 0, this.zone?.wallColor ?? 0x888888, 25, 1);
          this.shake(0.22);
          this.impactFrame();
          break;
        case 'wallBreak':
          this.vfx.debrisBurst(Math.sign(x) * 7.7, y, 0, this.zone?.wallColor ?? 0x888888, 80, 1.6);
          this.vfx.bloodBurst(x, y, 0, Math.sign(x), 4);
          this.shake(0.5);
          this.impactFrame();
          break;
        case 'zone':
          this.setZone(e.n ?? 0);
          this.vfx.dustPuff(0, 0, 0, 30, 0.6);
          this.shake(0.35);
          break;
        case 'groundBounce':
        case 'slam':
          this.vfx.dustPuff(x, 0, 0, 16, 0.4);
          this.vfx.ring(x, 0.05, 0, 0xffffff, 2.5, 0.35, false);
          this.shake(0.15);
          break;
        case 'knockdown':
          this.vfx.dustPuff(x, 0, 0, 10, 0.3);
          break;
        case 'land':
        case 'dash':
          this.vfx.dustPuff(x, 0, 0, 4, 0.18);
          break;
        case 'super':
          this.vfx.ring(x, y, 0.3, e.v ? 0xff2020 : 0xffd040, 4, 0.6);
          this.vfx.flash(x, y, 0.4, 3, 0.4, e.v ? 0xff4040 : 0xffd040);
          break;
        case 'xray':
          this.xrayT = 1.9;
          this.xrayVictim = e.s === 0 ? 1 : 0;
          setXray(this.views[this.xrayVictim].rig, true);
          this.impactFrame();
          break;
        case 'rageCancel':
          this.vfx.ring(x, y, 0.2, 0xff3000, 4, 0.5);
          this.vfx.flash(x, y, 0.3, 2.5, 0.25, 0xff3000);
          this.shake(0.08);
          break;
        case 'burst':
          this.vfx.ring(x, y, 0.2, 0xffffff, 5, 0.5);
          this.vfx.ring(x, y, 0.2, 0xff8000, 3.5, 0.4);
          this.shake(0.15);
          break;
        case 'ko':
          this.koOrbit = 2.8;
          this.vfx.bloodBurst(x, y, 0, 1, gore ? 5 : 0);
          this.shake(0.4);
          this.impactFrame();
          if (e.v === 1 || s.timeUp) break;
          break;
        case 'weaponBreak':
          this.vfx.debrisBurst(x, y, 0.2, 0x8a5a2a, 20, 0.8);
          break;
        case 'pickup':
          this.vfx.flash(x, 0.8, 0.2, 0.8, 0.2, 0xffe080);
          break;
        case 'clash':
          this.vfx.flash(x, y, 0.3, 1.5, 0.2, 0xffffff);
          this.vfx.ring(x, y, 0.2, 0xffffff, 2, 0.3);
          break;
        case 'projLand':
          this.vfx.dustPuff(x, 0, 0, 6, 0.2);
          break;
        case 'teleport':
          this.vfx.ring(x, 1, 0.1, 0x8a5cff, 2, 0.3);
          this.vfx.confettiBurst(x, 1, 0, 25);
          break;
        case 'tech':
          this.vfx.ring(x, y, 0.2, 0x40ff80, 1.5, 0.25);
          break;
        case 'finisher':
          this.finisher = new FinisherDirector(this, s, e.k ?? '', e.s ?? 0);
          break;
        case 'hazardWarn':
          break;
        case 'install':
          this.vfx.ring(x, 1, 0.2, 0xff3000, 4, 0.7);
          break;
        case 'firstBlood':
          if (gore) this.vfx.bloodBurst(x, y, 0.2, 1, 3);
          break;
        case 'round':
          for (const v of this.views) v.resetLook();
          this.vfx.clear();
          this.setZone(0);
          break;
      }
    }
  }

  syncDynamic(s: MatchState) {
    // projectiles
    const seen = new Set<number>();
    for (const p of s.projs) {
      seen.add(p.id);
      let o = this.projViews.get(p.id);
      if (!o) {
        o = makeProjectile(p.def.kind);
        this.scene.add(o);
        this.projViews.set(p.id, o);
      }
      o.position.set(p.x, p.y + (p.def.stationary ? 0 : 0), 0.1);
      o.scale.x = Math.abs(o.scale.x) * (p.vx < 0 || (p.vx === 0 && p.facing < 0) ? -1 : 1);
      if (o.userData.spin === 'z') o.rotation.z += 0.3 * Math.sign(-p.vx || 1);
      if (o.userData.spin === 'y') o.rotation.y += 0.15;
      if (o.userData.pulse) o.scale.setScalar(1 + Math.sin(this.time * 30) * 0.12);
    }
    for (const [id, o] of this.projViews) {
      if (!seen.has(id)) {
        o.removeFromParent();
        this.projViews.delete(id);
      }
    }
    // stage props lying around
    for (const p of s.props) {
      let o = this.propViews.get(p.id);
      if (!o) {
        o = makeWeapon(p.kind, false);
        o.position.set(p.x, 0, -0.6);
        this.scene.add(o);
        this.propViews.set(p.id, o);
      }
      o.visible = !p.taken;
      if (!p.taken) o.rotation.y = Math.sin(this.time + p.id) * 0.1;
    }
    // hazards
    while (this.hazardViews.length > s.hazards.length) this.hazardViews.pop()!.removeFromParent();
    s.hazards.forEach((h, i) => {
      let o = this.hazardViews[i];
      if (!o || o.userData.kind !== h.kind) {
        o?.removeFromParent();
        o = makeHazard(h.kind);
        o.userData.kind = h.kind;
        this.scene.add(o);
        this.hazardViews[i] = o;
      }
      o.visible = h.warn <= 0;
      o.position.set(h.x, h.kind === 'chappal' ? h.y : 0, 0);
      o.rotation.y = h.vx >= 0 ? 0 : Math.PI;
      if (h.kind === 'chappal') o.rotation.z += 0.3;
      const legs = o.userData.legs as THREE.Mesh[] | undefined;
      if (legs) legs.forEach((l, k) => (l.rotation.z = Math.sin(this.time * 20 + k * 1.6) * 0.6));
      const b = o.userData.beacon as THREE.Mesh | undefined;
      if (b) (b.material as THREE.MeshBasicMaterial).color.set(Math.sin(this.time * 20) > 0 ? 0xff0000 : 0x0040ff);
      if (h.kind !== 'chappal' && h.warn <= 0 && Math.random() < 0.5) this.vfx.dustPuff(h.x - Math.sign(h.vx), 0, 0, 1, 0.3);
    });
    // assists
    const keys = new Set<string>();
    for (const a of s.assists) {
      const key = a.owner + ':' + a.char;
      keys.add(key);
      let av = this.assistViews.find((x) => x.key === key);
      if (!av) {
        av = { view: new FighterView(this.scene, a.char, Math.min(1, this.settings.quality)), key };
        av.view.rig.root.scale.setScalar(0.92);
        for (const m of av.view.rig.mats) {
          const mm = m as THREE.MeshToonMaterial;
          mm.transparent = true;
          mm.opacity = 0.85;
        }
        this.assistViews.push(av);
        this.vfx.ring(a.x, 1, 0.1, 0xffffff, 2.5, 0.3);
      }
      const def = CHARS[a.char].assist;
      const fake = {
        ...s.f[a.owner],
        char: a.char,
        x: a.x,
        y: 0,
        z: -0.4,
        facing: a.facing as 1 | -1,
        st: 'attack' as const,
        move: null,
        hp: 1,
        maxHp: 1,
        install: 0,
        rage: 0,
        weapon: null,
      };
      const v = av.view;
      v.update({ ...fake, st: 'idle' }, s, 1 / 60, this.time);
      v.rig.root.position.set(a.x, 0, -0.5);
      applyAssistPose(v, def.pose, a.t < def.activeFrom ? 'w' : 'h');
    }
    this.assistViews = this.assistViews.filter((av) => {
      if (!keys.has(av.key)) {
        this.vfx.ring(av.view.rig.root.position.x, 1, -0.4, 0xffffff, 2, 0.3);
        av.view.dispose();
        return false;
      }
      return true;
    });
  }

  updateCamera(s: MatchState, dt: number) {
    const [a, b] = s.f;
    const mx = (a.x + b.x) / 2;
    const sep = Math.abs(a.x - b.x);
    const aspect = this.camera.aspect;
    const narrow = aspect < 1.5 ? 1.25 : 1;
    let d = Math.max(6.4, Math.min(10.5, 5.2 + sep * 0.6)) * narrow;
    const maxY = Math.max(a.y, b.y);
    let pos = new THREE.Vector3(Math.max(-WALL + 3.2, Math.min(WALL - 3.2, mx)), 1.45 + d * 0.06 + maxY * 0.3, d + maxY * 0.4);
    let look = new THREE.Vector3(pos.x, 1.05 + maxY * 0.4, 0);
    let rate = 5;

    if (s.phase === 'intro') {
      const f = s.pf < 85 ? a : b;
      pos = new THREE.Vector3(f.x + f.facing * 2.2, 1.55, 2.6);
      look = new THREE.Vector3(f.x, 1.45, 0);
      rate = s.pf === 1 || s.pf === 85 ? 1000 : 3;
    } else if (s.superFreeze > 0 && s.superOwner >= 0) {
      const f = s.f[s.superOwner];
      pos = new THREE.Vector3(f.x + f.facing * 1.9, 1.5, 2.4);
      look = new THREE.Vector3(f.x, 1.4, 0);
      rate = 10;
    } else if (this.xrayT > 0 && this.xrayVictim >= 0) {
      const f = s.f[this.xrayVictim];
      pos = new THREE.Vector3(f.x + 0.3, f.y + 1.3, 2.0);
      look = new THREE.Vector3(f.x, f.y + 1.0, 0);
      rate = 12;
    } else if (this.finisher) {
      const c = this.finisher.camera(this.time);
      pos = c.pos;
      look = c.look;
      rate = c.rate;
    } else if (s.phase === 'ko' || (this.koOrbit > 0 && s.phase !== 'roundIntro')) {
      const l = s.f.find((f) => f.dead) ?? b;
      const ang = (2.8 - this.koOrbit) * 0.5;
      pos = new THREE.Vector3(l.x + Math.sin(ang) * 4, 1.6, Math.cos(ang) * 4);
      look = new THREE.Vector3(l.x, 0.8 + l.y * 0.5, 0);
      rate = 4;
    } else if (s.phase === 'finishHim') {
      const l = s.f.find((f) => f.hp <= 0) ?? b;
      pos = new THREE.Vector3(mx, 1.4, d * 0.75);
      look = new THREE.Vector3(l.x, 1.3, 0);
      rate = 3;
    } else if (s.phase === 'matchOver') {
      const w = s.matchWinner >= 0 ? s.f[s.matchWinner] : a;
      const ang = this.time * 0.35;
      pos = new THREE.Vector3(w.x + Math.sin(ang) * 3.2, 1.6, Math.cos(ang) * 3.2 + 0.5);
      look = new THREE.Vector3(w.x, 1.3, 0);
      rate = 3;
    } else if (s.phase === 'transition') {
      rate = 2;
      pos.z += 2;
    }
    const k = 1 - Math.exp(-rate * dt);
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    this.camera.position.copy(this.camPos);
    if (this.shakeAmt > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeAmt;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt *= Math.exp(-dt * 9);
    }
    this.camera.lookAt(this.camLook);
    const fov = 40 - this.fovKick + (s.phase === 'finishHim' ? -4 : 0);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 12);
      this.camera.updateProjectionMatrix();
    }
    this.fovKick *= Math.exp(-dt * 8);
    this.sun.target.position.set(mx, 0, 0);
    this.sun.position.set(mx + (this.zone?.sunPos[0] ?? 3), this.zone?.sunPos[1] ?? 10, this.zone?.sunPos[2] ?? 6);
  }

  frame(s: MatchState, events: GameEvent[], dt: number) {
    this.time += dt;
    if (s.phase !== this.lastPhase) {
      if (s.phase === 'roundIntro' || s.phase === 'intro') {
        this.koOrbit = 0;
        this.finisher?.dispose();
        this.finisher = null;
      }
      this.lastPhase = s.phase;
    }
    this.handleEvents(s, events);
    if (s.zone !== this.zoneIdx && s.phase !== 'transition') this.setZone(s.zone);
    this.views.forEach((v, i) => v.update(s.f[i], s, dt, this.time));
    if (this.finisher) this.finisher.update(dt, s);
    this.syncDynamic(s);
    if (this.koOrbit > 0) this.koOrbit = Math.max(0, this.koOrbit - dt);
    if (this.xrayT > 0) {
      this.xrayT -= dt;
      if (this.xrayT <= 0 && this.xrayVictim >= 0) {
        setXray(this.views[this.xrayVictim].rig, false);
        this.xrayVictim = -1;
      }
    }
    // dripping blood at low hp
    if (this.settings.gore !== 'off')
      s.f.forEach((f, i) => {
        if (f.hp / f.maxHp < 0.3 && f.hp > 0 && Math.random() < dt * 4) {
          const p = this.views[i].jointPos('head');
          this.vfx.fountain(p.x, p.y + 0.05, p.z + 0.1, 0, -0.5, 1);
        }
      });
    this.zone?.animate?.(this.time, dt);
    const hype = Math.min(1, Math.abs(s.spin) / 60 + (s.phase === 'ko' || s.phase === 'finishHim' ? 0.8 : 0));
    this.animateCrowd(this.time, hype);
    if (this.zone?.weather === 'fireworks') {
      this.fireworkT -= dt;
      if (this.fireworkT <= 0) {
        this.fireworkT = 0.6 + Math.random() * 1.2;
        this.vfx.firework((Math.random() - 0.5) * 24 + this.camPos.x, 8 + Math.random() * 4, -14);
      }
    }
    if (this.zone?.weather === 'confetti' && Math.random() < dt * 2) this.vfx.confettiBurst((Math.random() - 0.5) * 12, 7, -2, 4);
    this.vfx.update(dt, this.camPos.x);
    this.updateCamera(s, dt);
    if (this.invertT > 0) {
      this.invertT -= dt;
      this.canvas.style.filter = this.invertT > 0 ? 'invert(1) contrast(1.4)' : '';
    }
    const xr = this.xrayT > 0;
    this.renderer.toneMappingExposure = xr ? 0.8 : 1.05;
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  /** Render a simple showcase scene (menus / character select) */
  showcase(dt: number, look: () => void) {
    this.time += dt;
    look();
    this.vfx.update(dt, 0);
    this.zone?.animate?.(this.time, dt);
    this.animateCrowd(this.time, 0.2);
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}

function applyAssistPose(v: FighterView, key: string, phase: 'w' | 'h') {
  const D2R = Math.PI / 180;
  const p = attackPose(key)[phase];
  for (const [j, r] of Object.entries(p.j)) {
    const o = v.rig.j[j as keyof typeof v.rig.j];
    if (o && r) o.rotation.set(r[0] * D2R, r[1] * D2R, r[2] * D2R);
  }
}
