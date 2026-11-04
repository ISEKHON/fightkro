import * as THREE from 'three';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpE = new THREE.Euler();
const tmpC = new THREE.Color();

interface PSpec {
  geo: THREE.BufferGeometry;
  additive?: boolean;
  gravity: number;
  drag: number;
  floor?: boolean;
  spin?: boolean;
  shrink?: boolean;
  basic?: boolean;
}

/** Pooled instanced particles. */
class Particles {
  mesh: THREE.InstancedMesh;
  n: number;
  pos: Float32Array;
  vel: Float32Array;
  rot: Float32Array;
  life: Float32Array;
  max: Float32Array;
  size: Float32Array;
  next = 0;
  onFloor?: (x: number, z: number, size: number, color: THREE.Color) => void;
  colors: THREE.Color[] = [];
  constructor(public spec: PSpec, cap: number, scene: THREE.Scene) {
    this.n = cap;
    const mat = spec.basic || spec.additive
      ? new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: !!spec.additive, blending: spec.additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !spec.additive })
      : new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(spec.geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.rot = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.max = new Float32Array(cap);
    this.size = new Float32Array(cap);
    for (let i = 0; i < cap; i++) {
      this.colors.push(new THREE.Color());
      tmpM.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, tmpM);
      this.mesh.setColorAt(i, tmpC.set(0xffffff));
    }
    scene.add(this.mesh);
  }
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: number) {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.rot.set([Math.random() * 6, Math.random() * 6, Math.random() * 6], i * 3);
    this.life[i] = life;
    this.max[i] = life;
    this.size[i] = size;
    this.colors[i].set(color);
    this.mesh.setColorAt(i, this.colors[i]);
  }
  update(dt: number) {
    const sp = this.spec;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const k = i * 3;
      this.vel[k + 1] -= sp.gravity * dt;
      const drag = Math.exp(-sp.drag * dt);
      this.vel[k] *= drag;
      this.vel[k + 1] *= drag;
      this.vel[k + 2] *= drag;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      if (sp.floor && this.pos[k + 1] < 0.01) {
        this.pos[k + 1] = 0.01;
        if (this.onFloor && this.life[i] > 0) this.onFloor(this.pos[k], this.pos[k + 2], this.size[i], this.colors[i]);
        this.life[i] = 0;
      }
      const t = Math.max(0, this.life[i] / this.max[i]);
      const s = this.life[i] <= 0 ? 0 : this.size[i] * (sp.shrink ? 0.3 + 0.7 * t : 1);
      if (sp.spin) {
        this.rot[k] += dt * 8;
        this.rot[k + 1] += dt * 6;
      }
      tmpE.set(this.rot[k], this.rot[k + 1], this.rot[k + 2]);
      tmpQ.setFromEuler(tmpE);
      tmpP.set(this.pos[k], this.pos[k + 1], this.pos[k + 2]);
      // streak along velocity for liquids
      tmpS.set(s, s, s);
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.mesh.setMatrixAt(i, tmpM);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  clear() {
    this.life.fill(0);
    for (let i = 0; i < this.n; i++) {
      tmpM.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, tmpM);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Persistent floor/wall decals (blood pools, scorch marks). */
class Decals {
  mesh: THREE.InstancedMesh;
  next = 0;
  constructor(scene: THREE.Scene, private cap: number) {
    const tex = blobTexture();
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, cap);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < cap; i++) {
      tmpM.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, tmpM);
      this.mesh.setColorAt(i, tmpC.set(0x880000));
    }
    scene.add(this.mesh);
  }
  add(x: number, y: number, z: number, size: number, color: THREE.Color | number, wall = 0) {
    const i = this.next;
    this.next = (this.next + 1) % this.cap;
    tmpE.set(wall ? 0 : -Math.PI / 2, wall ? (wall > 0 ? -Math.PI / 2 : Math.PI / 2) : 0, Math.random() * 6);
    tmpQ.setFromEuler(tmpE);
    tmpP.set(x, y, z);
    tmpS.set(size, size * (0.6 + Math.random() * 0.6), 1);
    tmpM.compose(tmpP, tmpQ, tmpS);
    this.mesh.setMatrixAt(i, tmpM);
    this.mesh.setColorAt(i, typeof color === 'number' ? tmpC.set(color) : color);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  clear() {
    for (let i = 0; i < this.cap; i++) {
      tmpM.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, tmpM);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

let blob: THREE.Texture | null = null;
function blobTexture() {
  if (blob) return blob;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  for (let i = 0; i < 14; i++) {
    const r = 10 + Math.random() * 26;
    const a = Math.random() * Math.PI * 2;
    const d = i === 0 ? 0 : Math.random() * 36;
    g.beginPath();
    g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, i === 0 ? 34 : r * 0.6, 0, Math.PI * 2);
    g.fill();
  }
  blob = new THREE.CanvasTexture(c);
  return blob;
}

let star: THREE.Texture | null = null;
function starTexture() {
  if (star) return star;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,240,180,0.9)');
  grd.addColorStop(1, 'rgba(255,120,0,0)');
  g.fillStyle = grd;
  g.beginPath();
  for (let i = 0; i < 16; i++) {
    const r = i % 2 ? 22 : 64;
    const a = (i / 16) * Math.PI * 2;
    g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  star = new THREE.CanvasTexture(c);
  return star;
}

interface Flash {
  mesh: THREE.Mesh;
  t: number;
  max: number;
  grow: number;
}

export class VFX {
  blood: Particles;
  sparks: Particles;
  dust: Particles;
  debris: Particles;
  confetti: Particles;
  decals: Decals;
  flashes: Flash[] = [];
  rings: Flash[] = [];
  rain: THREE.LineSegments | null = null;
  gore = true;
  goreColor = 0x9a0010;
  intensity = 1;
  constructor(private scene: THREE.Scene, quality: number) {
    const cap = quality >= 2 ? 1400 : quality === 1 ? 700 : 350;
    this.blood = new Particles({ geo: new THREE.SphereGeometry(0.5, 6, 4), gravity: 14, drag: 0.6, floor: true, basic: true }, cap, scene);
    this.sparks = new Particles({ geo: new THREE.BoxGeometry(0.3, 0.3, 1.6), additive: true, gravity: 4, drag: 3, shrink: true, spin: true }, Math.round(cap * 0.6), scene);
    this.dust = new Particles({ geo: new THREE.IcosahedronGeometry(0.5, 0), gravity: -0.6, drag: 2.5, shrink: true }, Math.round(cap * 0.4), scene);
    this.debris = new Particles({ geo: new THREE.BoxGeometry(1, 0.5, 0.7), gravity: 16, drag: 0.3, floor: true, spin: true }, Math.round(cap * 0.4), scene);
    this.confetti = new Particles({ geo: new THREE.PlaneGeometry(1, 0.6), gravity: 1.2, drag: 1.2, spin: true, basic: true }, Math.round(cap * 0.5), scene);
    (this.confetti.mesh.material as THREE.MeshBasicMaterial).side = THREE.DoubleSide;
    this.decals = new Decals(scene, quality >= 1 ? 220 : 90);
    this.blood.onFloor = (x, z, size, color) => {
      if (Math.random() < 0.45) this.decals.add(x, 0.012 + Math.random() * 0.004, z, size * (4 + Math.random() * 5), color);
    };
  }

  setGore(level: string) {
    this.gore = level !== 'off';
    this.goreColor = level === 'green' ? 0x1aa020 : level === 'off' ? 0xffffff : 0x9a0010;
  }

  hit(x: number, y: number, z: number, dir: number, power: number, gore: number) {
    const n = Math.round((6 + power * 10) * this.intensity);
    for (let i = 0; i < n; i++) {
      const a = (Math.random() - 0.5) * 2.2;
      const sp = 4 + Math.random() * 7 * power;
      this.sparks.emit(x, y, z, dir * Math.cos(a) * sp, Math.sin(a) * sp + 1, (Math.random() - 0.5) * 3, 0.15 + Math.random() * 0.15, 0.05 + Math.random() * 0.05, Math.random() < 0.5 ? 0xffe28a : 0xffffff);
    }
    if (this.gore && gore > 0) this.bloodBurst(x, y, z, dir, gore);
    this.flash(x, y, z, 0.6 + power * 0.7, 0.12);
  }

  bloodBurst(x: number, y: number, z: number, dir: number, gore: number) {
    if (!this.gore) return;
    const n = Math.round(gore * 9 * this.intensity);
    for (let i = 0; i < n; i++) {
      const sp = 2 + Math.random() * 4 * gore;
      this.blood.emit(x, y, z + (Math.random() - 0.5) * 0.2, dir * sp * (0.4 + Math.random()), 1 + Math.random() * 4 * Math.min(2, gore), (Math.random() - 0.5) * 2.5, 1.5, 0.025 + Math.random() * 0.035 * gore, this.goreColor);
    }
  }

  /** Steady stream (stumps, dripping noses). */
  fountain(x: number, y: number, z: number, vx: number, vy: number, n = 6) {
    if (!this.gore) {
      for (let i = 0; i < n; i++) this.confetti.emit(x, y, z, vx + (Math.random() - 0.5) * 2, vy + Math.random() * 2, (Math.random() - 0.5) * 2, 1.5, 0.06, [0xff6a00, 0xffffff, 0x17a35c, 0xffd23a][i % 4]);
      return;
    }
    for (let i = 0; i < n; i++) this.blood.emit(x, y, z, vx + (Math.random() - 0.5) * 1.2, vy + Math.random() * 1.5, (Math.random() - 0.5) * 1.2, 1.4, 0.03 + Math.random() * 0.03, this.goreColor);
  }

  wallSplat(x: number, y: number) {
    if (!this.gore) return;
    const wx = Math.sign(x) * 7.79;
    for (let i = 0; i < 3; i++) this.decals.add(wx, y + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, 0.5 + Math.random() * 0.8, this.goreColor, Math.sign(x));
  }

  dustPuff(x: number, y: number, z: number, n = 8, size = 0.25) {
    for (let i = 0; i < n * this.intensity; i++) {
      const a = Math.random() * Math.PI * 2;
      this.dust.emit(x, y + 0.05, z, Math.cos(a) * 2, Math.random() * 1.2, Math.sin(a) * 1.2, 0.5 + Math.random() * 0.4, size * (0.6 + Math.random()), 0xb8a890);
    }
  }

  debrisBurst(x: number, y: number, z: number, color: number, n = 20, power = 1) {
    for (let i = 0; i < n * this.intensity; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (2 + Math.random() * 6) * power;
      this.debris.emit(x, y, z, Math.cos(a) * sp, Math.random() * 7 * power, Math.sin(a) * sp * 0.6, 2.5, 0.06 + Math.random() * 0.12, color);
    }
  }

  confettiBurst(x: number, y: number, z: number, n = 60) {
    const cols = [0xff6a00, 0xffffff, 0x17a35c, 0xffd23a, 0xe8173b, 0x1f6fd1];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.confetti.emit(x, y, z, Math.cos(a) * 4, 3 + Math.random() * 6, Math.sin(a) * 2, 3, 0.08 + Math.random() * 0.06, cols[i % cols.length]);
    }
  }

  firework(x: number, y: number, z: number) {
    const col = [0xff4040, 0x40ff80, 0xffd040, 0x40a0ff, 0xff60ff][Math.floor(Math.random() * 5)];
    for (let i = 0; i < 50 * this.intensity; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI - Math.PI / 2;
      const sp = 4 + Math.random() * 2;
      this.sparks.emit(x, y, z, Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp, Math.sin(a) * Math.cos(b) * sp, 1.0 + Math.random() * 0.5, 0.06, col);
    }
  }

  flash(x: number, y: number, z: number, size: number, life: number, color = 0xffffff) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: starTexture(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    m.position.set(x, y, z + 0.3);
    m.renderOrder = 20;
    m.scale.setScalar(size);
    m.rotation.z = Math.random() * 6;
    this.scene.add(m);
    this.flashes.push({ mesh: m, t: 0, max: life, grow: 1.8 });
  }

  ring(x: number, y: number, z: number, color = 0xffffff, size = 3, life = 0.4, vertical = true) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.set(x, y, z);
    if (!vertical) m.rotation.x = -Math.PI / 2;
    m.scale.setScalar(0.2);
    this.scene.add(m);
    this.rings.push({ mesh: m, t: 0, max: life, grow: size });
  }

  setRain(on: boolean) {
    if (on && !this.rain) {
      const n = Math.round(900 * this.intensity);
      const pos = new Float32Array(n * 6);
      for (let i = 0; i < n; i++) {
        const x = (Math.random() - 0.5) * 30;
        const y = Math.random() * 12;
        const z = (Math.random() - 0.5) * 14 - 1;
        pos.set([x, y, z, x - 0.05, y - 0.4, z], i * 6);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x9ab8e8, transparent: true, opacity: 0.45 }));
      this.rain.frustumCulled = false;
      this.scene.add(this.rain);
    } else if (!on && this.rain) {
      this.rain.removeFromParent();
      this.rain.geometry.dispose();
      this.rain = null;
    }
  }

  update(dt: number, camX: number) {
    this.blood.update(dt);
    this.sparks.update(dt);
    this.dust.update(dt);
    this.debris.update(dt);
    this.confetti.update(dt);
    for (const f of this.flashes) {
      f.t += dt;
      const k = f.t / f.max;
      f.mesh.scale.multiplyScalar(1 + dt * f.grow);
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k);
    }
    this.flashes = this.flashes.filter((f) => {
      if (f.t >= f.max) {
        f.mesh.removeFromParent();
        f.mesh.geometry.dispose();
        (f.mesh.material as THREE.Material).dispose();
        return false;
      }
      return true;
    });
    for (const r of this.rings) {
      r.t += dt;
      const k = r.t / r.max;
      r.mesh.scale.setScalar(0.2 + k * r.grow);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k);
    }
    this.rings = this.rings.filter((r) => {
      if (r.t >= r.max) {
        r.mesh.removeFromParent();
        r.mesh.geometry.dispose();
        (r.mesh.material as THREE.Material).dispose();
        return false;
      }
      return true;
    });
    if (this.rain) {
      const p = this.rain.geometry.attributes.position as THREE.BufferAttribute;
      const a = p.array as Float32Array;
      for (let i = 0; i < a.length; i += 6) {
        a[i + 1] -= dt * 16;
        a[i + 4] -= dt * 16;
        if (a[i + 4] < 0) {
          const x = camX + (Math.random() - 0.5) * 30;
          const y = 10 + Math.random() * 3;
          a[i] = x;
          a[i + 1] = y;
          a[i + 3] = x - 0.05;
          a[i + 4] = y - 0.4;
          if (Math.random() < 0.02) this.dust.emit(x, 0.02, a[i + 2], 0, 0.6, 0, 0.2, 0.06, 0x9ab8e8);
        }
      }
      p.needsUpdate = true;
    }
  }

  clear() {
    this.blood.clear();
    this.sparks.clear();
    this.dust.clear();
    this.debris.clear();
    this.confetti.clear();
    this.decals.clear();
  }
}
