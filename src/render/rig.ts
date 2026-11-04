import * as THREE from 'three';
import type { Look } from './looks';

export type Joint =
  | 'hips'
  | 'spine'
  | 'chest'
  | 'neck'
  | 'head'
  | 'uaL'
  | 'faL'
  | 'handL'
  | 'uaR'
  | 'faR'
  | 'handR'
  | 'thL'
  | 'shL'
  | 'ftL'
  | 'thR'
  | 'shR'
  | 'ftR';

export const JOINTS: Joint[] = ['hips', 'spine', 'chest', 'neck', 'head', 'uaL', 'faL', 'handL', 'uaR', 'faR', 'handR', 'thL', 'shL', 'ftL', 'thR', 'shR', 'ftR'];

export interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  j: Record<Joint, THREE.Object3D>;
  mats: THREE.Material[];
  skinMats: THREE.MeshToonMaterial[];
  bones: THREE.Group[];
  weaponSlot: THREE.Group;
  wounds: THREE.Group;
  jacketMeshes: THREE.Mesh[];
  eyeL: THREE.Mesh;
  eyeR: THREE.Mesh;
  lenses: THREE.Mesh[];
  hipsY: number;
  scale: number;
  look: Look;
  outlines: THREE.Mesh[];
  detached: Set<Joint>;
}

let gradient: THREE.DataTexture | null = null;
function toonGradient() {
  if (gradient) return gradient;
  const data = new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

const matCache = new Map<string, THREE.MeshToonMaterial>();
export function toon(color: number, opts: { emissive?: number; key?: string } = {}) {
  const key = (opts.key ?? '') + color + ':' + (opts.emissive ?? 0);
  // materials are shared per fighter only (fighters get their own key) so damage tinting is per-rig
  const m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() });
  if (opts.emissive) m.emissive = new THREE.Color(opts.emissive);
  matCache.set(key, m);
  return m;
}

const outlineMat = new THREE.MeshBasicMaterial({ color: 0x0a0604, side: THREE.BackSide });

const geoCache = new Map<string, THREE.BufferGeometry>();
function capsule(r: number, len: number) {
  const k = `c${r.toFixed(3)}:${len.toFixed(3)}`;
  let g = geoCache.get(k);
  if (!g) {
    g = new THREE.CapsuleGeometry(r, Math.max(0.001, len), 4, 10);
    g.translate(0, -len / 2, 0);
    geoCache.set(k, g);
  }
  return g;
}
function sphere(r: number, w = 14, h = 10) {
  const k = `s${r.toFixed(3)}:${w}`;
  let g = geoCache.get(k);
  if (!g) {
    g = new THREE.SphereGeometry(r, w, h);
    geoCache.set(k, g);
  }
  return g;
}
function boxG(x: number, y: number, z: number) {
  const k = `b${x}:${y}:${z}`;
  let g = geoCache.get(k);
  if (!g) {
    g = new THREE.BoxGeometry(x, y, z);
    geoCache.set(k, g);
  }
  return g;
}

export function buildRig(look: Look, heightM: number, opts: { outlines: boolean; shadows: boolean }): Rig {
  const s = heightM / 1.8;
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(s);
  root.add(body);
  const mats: THREE.Material[] = [];
  const outlines: THREE.Mesh[] = [];
  const skinMats: THREE.MeshToonMaterial[] = [];
  const M = (c: number, em?: number) => {
    const m = toon(c, { emissive: em });
    mats.push(m);
    return m;
  };
  const skin = M(look.skin);
  skinMats.push(skin);
  const topM = M(look.top);
  const jacketM = look.jacket !== null ? M(look.jacket) : topM;
  const bottomM = M(look.bottom);
  const shoeM = M(look.shoes);
  const hairM = M(look.hair);
  const browM = M(look.brows);
  const accentM = M(look.accent);
  const gold = M(0xffcc33, 0x332200);
  const white = M(0xffffff);
  const black = M(0x111111);
  const red = M(0xd01020);
  const jacketMeshes: THREE.Mesh[] = [];

  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, pos?: [number, number, number], scl?: [number, number, number], rot?: [number, number, number], outline = true) => {
    const mesh = new THREE.Mesh(geo, mat);
    if (pos) mesh.position.set(...pos);
    if (scl) mesh.scale.set(...scl);
    if (rot) mesh.rotation.set(...rot);
    mesh.castShadow = opts.shadows;
    parent.add(mesh);
    if (opts.outlines && outline) {
      const o = new THREE.Mesh(geo, outlineMat);
      o.position.copy(mesh.position);
      o.rotation.copy(mesh.rotation);
      o.scale.copy(mesh.scale).multiplyScalar(1.07);
      parent.add(o);
      outlines.push(o);
    }
    return mesh;
  };
  const joint = (parent: THREE.Object3D, pos: [number, number, number]) => {
    const g = new THREE.Group();
    g.position.set(...pos);
    parent.add(g);
    return g;
  };

  const b = look.build;
  const legLen = 0.46;
  const hipsY = legLen * 2 + 0.04;
  const hips = joint(body, [0, hipsY, 0]);
  const spine = joint(hips, [0, 0.06, 0]);
  const chest = joint(spine, [0, 0.24, 0]);
  const neck = joint(chest, [0, 0.27, 0]);
  const head = joint(neck, [0, 0.08, 0]);

  // --- legs
  const sleeveLegs = look.bottomStyle === 'dhoti' ? 1.25 : 1;
  const mkLeg = (side: 1 | -1) => {
    const th = joint(hips, [side * 0.11 * b, -0.02, 0]);
    add(th, capsule(0.085 * b * sleeveLegs, legLen - 0.1), bottomM, [0, -0.04, 0]);
    const sh = joint(th, [0, -legLen, 0]);
    add(sh, capsule(0.07 * b * (look.bottomStyle === 'dhoti' ? 1.1 : 1), legLen - 0.12), look.bottomStyle === 'dhoti' ? skin : bottomM, [0, -0.04, 0]);
    const ft = joint(sh, [0, -legLen + 0.02, 0]);
    add(ft, boxG(0.11, 0.07, 0.24), shoeM, [0, -0.03, 0.05]);
    return { th, sh, ft };
  };
  const L = mkLeg(1);
  const R = mkLeg(-1);

  // --- torso
  const belly = look.belly;
  add(spine, sphere(0.2, 16, 12), look.topStyle === 'singlet' ? topM : topM, [0, 0.08, 0.02 * belly], [1.05 * b, 1.0, 0.85 * belly]);
  add(chest, capsule(0.17 * b, 0.12), topM, [0, 0.22, 0], [1.25, 1, 0.8]);
  if (look.topStyle === 'kurta' || look.topStyle === 'robe' || look.topStyle === 'saree') {
    // long tunic / robe / saree drape falling from the waist
    const len = look.topStyle === 'robe' ? 0.85 : look.topStyle === 'saree' ? 0.9 : 0.42;
    const g = new THREE.CylinderGeometry(0.2 * b * belly, (look.topStyle === 'kurta' ? 0.26 : 0.3) * b, len, 14, 1, true);
    g.translate(0, -len / 2, 0);
    const m = add(hips, g, look.topStyle === 'saree' ? M(look.top) : topM, [0, 0.08, 0]);
    m.material = (m.material as THREE.MeshToonMaterial).clone();
    (m.material as THREE.MeshToonMaterial).side = THREE.DoubleSide;
    mats.push(m.material as THREE.Material);
    if (look.topStyle === 'saree') {
      const border = new THREE.CylinderGeometry(0.305 * b, 0.305 * b, 0.07, 14, 1, true);
      add(hips, border, accentM, [0, 0.08 - len + 0.035, 0], undefined, undefined, false);
      // pallu over the shoulder
      add(chest, boxG(0.12, 0.5, 0.04), accentM, [0.12 * b, 0.12, 0.1], undefined, [0.1, 0, -0.5]);
    }
  }
  if (look.jacket !== null && look.topStyle !== 'singlet') {
    // nehru-style vest / suit jacket
    const vest = add(chest, capsule(0.18 * b, 0.1), jacketM, [0, 0.21, 0], [1.28, 1.05, 0.86]);
    const vest2 = add(spine, sphere(0.205, 16, 12), jacketM, [0, 0.1, 0.02 * belly], [1.06 * b, 0.95, 0.87 * belly]);
    vest.userData.s = vest.scale.clone();
    vest2.userData.s = vest2.scale.clone();
    jacketMeshes.push(vest, vest2);
  }
  if (look.topStyle === 'singlet' && look.jacket !== null) {
    // hi-vis stripes
    add(chest, boxG(0.42 * b, 0.04, 0.3), M(look.jacket), [0, 0.12, 0.02], undefined, undefined, false);
    add(spine, boxG(0.44 * b, 0.04, 0.38 * belly), M(look.jacket), [0, 0.06, 0.02], undefined, undefined, false);
  }

  // --- arms
  const sleeves = look.topStyle === 'singlet' ? skin : look.topStyle === 'suit' ? jacketM : look.topStyle === 'saree' ? M(look.accent) : topM;
  const foreSleeve = look.topStyle === 'singlet' || look.topStyle === 'saree' ? skin : sleeves;
  const mkArm = (side: 1 | -1) => {
    const ua = joint(chest, [side * 0.22 * b, 0.26, 0]);
    add(ua, capsule(0.065 * b, 0.22), sleeves, [0, -0.02, 0]);
    const fa = joint(ua, [0, -0.29, 0]);
    add(fa, capsule(0.055 * b, 0.2), foreSleeve, [0, -0.02, 0]);
    const hand = joint(fa, [0, -0.28, 0]);
    add(hand, sphere(0.06 * b), skin, [0, -0.03, 0]);
    return { ua, fa, hand };
  };
  const AL = mkArm(1);
  const AR = mkArm(-1);

  // --- head (big caricature head)
  const hs = look.headScale;
  const headR = 0.135 * hs;
  add(neck, capsule(0.06, 0.06), skin, [0, 0.04, 0]);
  add(head, sphere(headR, 20, 16), skin, [0, headR * 0.95, 0.01], [0.95, 1.08, 0.98]);
  const hy = headR * 0.95;
  // ears
  add(head, sphere(0.035 * hs), skin, [headR * 0.95, hy, 0], [0.5, 1, 0.8]);
  add(head, sphere(0.035 * hs), skin, [-headR * 0.95, hy, 0], [0.5, 1, 0.8]);
  // nose (comically large)
  add(head, sphere(0.04 * hs), skin, [0, hy - 0.01, headR * 0.98], [0.85, 1.1, 1.2]);
  // eyes
  const eyeL = add(head, sphere(0.03 * hs, 10, 8), white, [0.05 * hs, hy + 0.035, headR * 0.86], [1, 1.1, 0.6], undefined, false);
  const eyeR = add(head, sphere(0.03 * hs, 10, 8), white, [-0.05 * hs, hy + 0.035, headR * 0.86], [1, 1.1, 0.6], undefined, false);
  add(head, sphere(0.014 * hs, 8, 6), black, [0.05 * hs, hy + 0.035, headR * 0.86 + 0.02], undefined, undefined, false);
  add(head, sphere(0.014 * hs, 8, 6), black, [-0.05 * hs, hy + 0.035, headR * 0.86 + 0.02], undefined, undefined, false);
  // brows (angry)
  add(head, boxG(0.065 * hs, 0.016 * hs, 0.02), browM, [0.05 * hs, hy + 0.075, headR * 0.88], undefined, [0, 0, -0.25], false);
  add(head, boxG(0.065 * hs, 0.016 * hs, 0.02), browM, [-0.05 * hs, hy + 0.075, headR * 0.88], undefined, [0, 0, 0.25], false);
  // mouth
  add(head, boxG(0.07 * hs, 0.014 * hs, 0.02), M(0x5a1010), [0, hy - 0.07 * hs, headR * 0.9], undefined, undefined, false);

  // hair
  const hairOn = (pos: [number, number, number], scl: [number, number, number]) => add(head, sphere(headR, 16, 12), hairM, pos, scl);
  switch (look.hairStyle) {
    case 'bald':
      add(head, sphere(headR * 1.01, 16, 12), hairM, [0, hy - 0.02, -0.02], [1.02, 0.6, 0.95]);
      break;
    case 'side':
      hairOn([0, hy + 0.03, -0.01], [1.05, 0.9, 1.04]);
      break;
    case 'combover':
      hairOn([0.01, hy + 0.06, -0.02], [1.04, 0.62, 1.0]);
      add(head, boxG(headR * 1.6, 0.03, headR * 1.2), hairM, [0, hy + headR * 0.8, 0.02], undefined, [0.1, 0, -0.15]);
      break;
    case 'puff':
      hairOn([0, hy + 0.08, -0.01], [1.12, 0.95, 1.08]);
      add(head, sphere(headR * 0.6), hairM, [0, hy + headR * 0.95, 0.04]);
      break;
    case 'bun':
      hairOn([0, hy + 0.04, -0.02], [1.04, 0.85, 1.02]);
      add(head, sphere(headR * 0.45), hairM, [0, hy + headR * 0.5, -headR * 1.0]);
      break;
    case 'spiky':
      hairOn([0, hy + 0.04, -0.01], [1.03, 0.75, 1.02]);
      for (let i = 0; i < 6; i++) add(head, new THREE.ConeGeometry(0.03, 0.09, 5), hairM, [(i - 2.5) * 0.04 * hs, hy + headR * 0.9, 0], undefined, [0, 0, (i - 2.5) * 0.15]);
      break;
    case 'slick':
      hairOn([0, hy + 0.03, -0.03], [1.04, 0.82, 1.06]);
      break;
    case 'mullet':
      hairOn([0, hy + 0.04, -0.02], [1.06, 0.88, 1.04]);
      add(head, boxG(headR * 1.6, headR * 1.1, 0.06), hairM, [0, hy - headR * 0.5, -headR * 0.9]);
      break;
  }
  // facial hair
  const mY = hy - 0.045 * hs;
  const mZ = headR * 0.95;
  switch (look.mustache) {
    case 'thick':
      add(head, boxG(0.12 * hs, 0.03 * hs, 0.04), hairM, [0, mY, mZ]);
      break;
    case 'pencil':
      add(head, boxG(0.1 * hs, 0.012 * hs, 0.02), hairM, [0, mY, mZ], undefined, undefined, false);
      break;
    case 'handlebar': {
      const t = new THREE.TorusGeometry(0.05 * hs, 0.014 * hs, 6, 12, Math.PI);
      add(head, t, hairM, [0.045 * hs, mY + 0.005, mZ], undefined, [0, 0, Math.PI]);
      add(head, t, hairM, [-0.045 * hs, mY + 0.005, mZ], undefined, [0, Math.PI, Math.PI]);
      break;
    }
    case 'walrus':
      add(head, sphere(0.07 * hs), hairM, [0, mY - 0.01, mZ - 0.01], [1.5, 0.55, 0.6]);
      break;
  }
  switch (look.beard) {
    case 'full':
      add(head, sphere(headR * 0.95, 16, 12), hairM, [0, hy - 0.05 * hs, 0.02], [1.0, 0.8, 1.0]);
      break;
    case 'goatee':
      add(head, new THREE.ConeGeometry(0.035 * hs, 0.08 * hs, 8), hairM, [0, hy - 0.12 * hs, headR * 0.8], undefined, [Math.PI, 0, 0]);
      break;
    case 'stubble': {
      const st = M(look.hair);
      (st as THREE.MeshToonMaterial).transparent = true;
      (st as THREE.MeshToonMaterial).opacity = 0.35;
      add(head, sphere(headR * 0.97, 16, 12), st, [0, hy - 0.035 * hs, 0.01], [1.0, 0.75, 1.0], undefined, false);
      break;
    }
  }
  const lenses: THREE.Mesh[] = [];
  switch (look.glasses) {
    case 'round':
    case 'square': {
      const g = look.glasses === 'round' ? new THREE.TorusGeometry(0.03 * hs, 0.006, 6, 14) : new THREE.TorusGeometry(0.032 * hs, 0.006, 4, 4);
      add(head, g, black, [0.05 * hs, hy + 0.035, headR * 0.95], undefined, [0, 0, look.glasses === 'square' ? Math.PI / 4 : 0], false);
      add(head, g, black, [-0.05 * hs, hy + 0.035, headR * 0.95], undefined, [0, 0, look.glasses === 'square' ? Math.PI / 4 : 0], false);
      add(head, boxG(0.04 * hs, 0.006, 0.006), black, [0, hy + 0.04, headR * 0.97], undefined, undefined, false);
      const lm = M(0xaaddff);
      (lm as THREE.MeshToonMaterial).transparent = true;
      (lm as THREE.MeshToonMaterial).opacity = 0.35;
      lenses.push(add(head, new THREE.CircleGeometry(0.03 * hs, 12), lm, [0.05 * hs, hy + 0.035, headR * 0.96], undefined, undefined, false));
      lenses.push(add(head, new THREE.CircleGeometry(0.03 * hs, 12), lm, [-0.05 * hs, hy + 0.035, headR * 0.96], undefined, undefined, false));
      break;
    }
    case 'shades':
      lenses.push(add(head, boxG(0.075 * hs, 0.04 * hs, 0.02), black, [0.048 * hs, hy + 0.035, headR * 0.92], undefined, undefined, false));
      lenses.push(add(head, boxG(0.075 * hs, 0.04 * hs, 0.02), black, [-0.048 * hs, hy + 0.035, headR * 0.92], undefined, undefined, false));
      break;
  }

  // accessories
  for (const a of look.accessory) {
    switch (a) {
      case 'garland': {
        const t = new THREE.TorusGeometry(0.2 * b, 0.035, 8, 20);
        add(chest, t, M(0xff9a1a), [0, 0.2, 0.06], [1, 1.3, 1], [Math.PI / 2 - 0.5, 0, 0], false);
        const t2 = new THREE.TorusGeometry(0.17 * b, 0.025, 8, 20);
        add(chest, t2, M(0xffe14a), [0, 0.18, 0.08], [1, 1.4, 1], [Math.PI / 2 - 0.6, 0, 0], false);
        break;
      }
      case 'goldchain':
        add(chest, new THREE.TorusGeometry(0.16 * b, 0.014, 6, 20), gold, [0, 0.2, 0.08], [1, 1.35, 1], [Math.PI / 2 - 0.55, 0, 0], false);
        add(chest, sphere(0.04), gold, [0, 0.03, 0.17], undefined, undefined, false);
        break;
      case 'hardhat':
        add(head, new THREE.SphereGeometry(headR * 1.08, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), accentM, [0, hy + 0.02, 0]);
        add(head, new THREE.CylinderGeometry(headR * 1.3, headR * 1.3, 0.015, 16), accentM, [0, hy + 0.02, 0.03]);
        break;
      case 'crown':
        add(head, new THREE.CylinderGeometry(headR * 0.75, headR * 0.65, 0.12, 8, 1, true), gold, [0, hy + headR * 1.0, 0]);
        for (let i = 0; i < 5; i++) add(head, sphere(0.02), M(0xff2050), [Math.cos(i * 1.25) * headR * 0.7, hy + headR * 1.08, Math.sin(i * 1.25) * headR * 0.7], undefined, undefined, false);
        break;
      case 'pagdi': {
        for (let i = 0; i < 3; i++) add(head, new THREE.TorusGeometry(headR * (0.95 - i * 0.12), 0.045, 8, 18), accentM, [0, hy + headR * (0.45 + i * 0.22), -0.01], undefined, [Math.PI / 2, 0, 0]);
        add(head, sphere(headR * 0.7), accentM, [0, hy + headR * 0.75, -0.01], [1, 0.6, 1]);
        break;
      }
      case 'bindi':
        add(head, sphere(0.014 * hs, 8, 6), red, [0, hy + 0.085 * hs, headR * 0.93], undefined, undefined, false);
        break;
      case 'shawl':
        add(chest, boxG(0.5 * b, 0.06, 0.3), accentM, [0, 0.33, -0.02], undefined, [0.15, 0, 0]);
        add(chest, boxG(0.1, 0.45, 0.04), accentM, [0.14 * b, 0.1, 0.13], undefined, [0.2, 0, 0.15]);
        add(chest, boxG(0.1, 0.45, 0.04), accentM, [-0.14 * b, 0.1, 0.13], undefined, [0.2, 0, -0.15]);
        break;
      case 'sash':
        add(chest, boxG(0.08, 0.7, 0.04), M(look.partyColor), [0, 0.08, 0.15], undefined, [0, 0, 0.7], false);
        break;
      case 'mic':
        add(AL.hand, new THREE.CylinderGeometry(0.018, 0.024, 0.18, 8), black, [0, -0.04, 0.05], undefined, [Math.PI / 2, 0, 0]);
        add(AL.hand, sphere(0.04), M(0x444444), [0, -0.04, 0.15]);
        add(AL.hand, boxG(0.05, 0.05, 0.03), red, [0, -0.04, 0.09], undefined, undefined, false);
        break;
      case 'moneybag':
        add(hips, sphere(0.11), M(0xc9a36a), [-0.24 * b, -0.05, 0.05], [1, 1.1, 1]);
        add(hips, boxG(0.06, 0.06, 0.02), gold, [-0.24 * b, -0.04, 0.16], undefined, undefined, false);
        break;
      case 'lathi':
        add(chest, new THREE.CylinderGeometry(0.018, 0.018, 1.2, 6), M(0x7a4a1a), [0, 0.1, -0.2], undefined, [0, 0, 0.6]);
        break;
      case 'watch':
        add(AR.fa, new THREE.TorusGeometry(0.055 * b, 0.015, 6, 12), gold, [0, -0.22, 0], undefined, [Math.PI / 2, 0, 0], false);
        break;
      case 'pen':
        add(chest, new THREE.CylinderGeometry(0.008, 0.008, 0.1, 6), gold, [0.12 * b, 0.2, 0.16], undefined, undefined, false);
        break;
      case 'bluetooth':
        add(head, boxG(0.02, 0.05, 0.03), M(0x3a3aff, 0x1010aa), [-headR * 1.0, hy, 0.02], undefined, undefined, false);
        break;
      case 'cap':
        add(head, boxG(headR * 1.6, 0.08, headR * 1.8), white, [0, hy + headR * 0.8, 0]);
        break;
    }
  }

  // --- x-ray skeleton (hidden until an X-Ray Breaker lands)
  const boneMat = new THREE.MeshBasicMaterial({ color: 0xf2efe6, depthTest: false, transparent: true, opacity: 0.95 });
  const bones: THREE.Group[] = [];
  const bone = (parent: THREE.Object3D, len: number, r = 0.022) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(capsule(r, len), boneMat);
    m.renderOrder = 10;
    g.add(m);
    g.visible = false;
    parent.add(g);
    bones.push(g);
    return g;
  };
  bone(L.th, legLen - 0.04, 0.028);
  bone(R.th, legLen - 0.04, 0.028);
  bone(L.sh, legLen - 0.06);
  bone(R.sh, legLen - 0.06);
  bone(AL.ua, 0.26);
  bone(AR.ua, 0.26);
  bone(AL.fa, 0.24, 0.018);
  bone(AR.fa, 0.24, 0.018);
  const skullG = new THREE.Group();
  const skull = new THREE.Mesh(sphere(headR * 0.85), boneMat);
  skull.position.set(0, hy, 0);
  skull.renderOrder = 10;
  skullG.add(skull);
  skullG.visible = false;
  head.add(skullG);
  bones.push(skullG);
  const ribs = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.13 * b - i * 0.008, 0.012, 4, 14), boneMat);
    r.rotation.x = Math.PI / 2;
    r.position.y = 0.32 - i * 0.06;
    r.renderOrder = 10;
    ribs.add(r);
  }
  const spineBone = new THREE.Mesh(capsule(0.02, 0.5), boneMat);
  spineBone.position.y = 0.4;
  spineBone.renderOrder = 10;
  ribs.add(spineBone);
  ribs.visible = false;
  chest.add(ribs);
  bones.push(ribs);

  const weaponSlot = new THREE.Group();
  AR.hand.add(weaponSlot);
  const wounds = new THREE.Group();
  head.add(wounds);

  const j: Record<Joint, THREE.Object3D> = {
    hips,
    spine,
    chest,
    neck,
    head,
    uaL: AL.ua,
    faL: AL.fa,
    handL: AL.hand,
    uaR: AR.ua,
    faR: AR.fa,
    handR: AR.hand,
    thL: L.th,
    shL: L.sh,
    ftL: L.ft,
    thR: R.th,
    shR: R.sh,
    ftR: R.ft,
  };
  return { root, body, j, mats, skinMats, bones, weaponSlot, wounds, jacketMeshes, eyeL, eyeR, lenses, hipsY, scale: s, look, outlines, detached: new Set() };
}

export function setXray(rig: Rig, on: boolean) {
  for (const b of rig.bones) b.visible = on;
  for (const m of rig.mats) {
    const mm = m as THREE.MeshToonMaterial;
    if (on) {
      mm.userData.op = mm.userData.op ?? mm.opacity;
      mm.userData.tr = mm.userData.tr ?? mm.transparent;
      mm.transparent = true;
      mm.opacity = 0.18;
      mm.depthWrite = false;
    } else if (mm.userData.op !== undefined) {
      mm.opacity = mm.userData.op;
      mm.transparent = mm.userData.tr;
      mm.depthWrite = true;
    }
    mm.needsUpdate = true;
  }
  for (const o of rig.outlines) o.visible = !on;
}

/** Visual damage: bruises, black eye, cracked glasses, torn vest, bloody face. */
export function applyDamageLook(rig: Rig, ratio: number, gore: boolean) {
  const stage = ratio > 0.66 ? 0 : ratio > 0.4 ? 1 : ratio > 0.2 ? 2 : 3;
  const cur = (rig.wounds.userData.stage as number) ?? 0;
  if (stage <= cur) return;
  rig.wounds.userData.stage = stage;
  const hs = rig.look.headScale;
  const hy = 0.135 * hs * 0.95;
  const bruise = new THREE.MeshBasicMaterial({ color: gore ? 0x6a1a3a : 0x5a3a6a, transparent: true, opacity: 0.55 });
  const blood = new THREE.MeshBasicMaterial({ color: gore ? 0x8a0008 : 0x4a4a4a });
  const r = 0.135 * hs;
  if (stage >= 1) {
    const m = new THREE.Mesh(sphere(0.035 * hs, 8, 6), bruise);
    m.position.set(0.07 * hs, hy - 0.01, r * 0.85);
    m.scale.set(1, 0.8, 0.3);
    rig.wounds.add(m);
  }
  if (stage >= 2) {
    const m = new THREE.Mesh(sphere(0.045 * hs, 8, 6), bruise);
    m.position.set(-0.05 * hs, hy + 0.03, r * 0.84);
    m.scale.set(1, 0.9, 0.35);
    rig.wounds.add(m);
    rig.eyeR.scale.set(1, 0.4, 0.6);
    if (gore) {
      const n = new THREE.Mesh(boxG(0.012, 0.06, 0.01), blood);
      n.position.set(0.01, hy - 0.06 * hs, r * 1.0);
      rig.wounds.add(n);
    }
    for (const l of rig.lenses) l.rotation.z = 0.4;
  }
  if (stage >= 3) {
    for (const j of rig.jacketMeshes) j.scale.multiplyScalar(0.82);
    if (gore) {
      const n = new THREE.Mesh(boxG(0.012, 0.09, 0.01), blood);
      n.position.set(-0.03, hy - 0.02, r * 0.97);
      rig.wounds.add(n);
      const c = new THREE.Mesh(boxG(0.05, 0.012, 0.01), blood);
      c.position.set(0.04 * hs, hy + 0.09 * hs, r * 0.9);
      c.rotation.z = 0.3;
      rig.wounds.add(c);
    }
    for (const l of rig.lenses) l.visible = false;
  }
}

export function resetDamageLook(rig: Rig) {
  rig.wounds.clear();
  rig.wounds.userData.stage = 0;
  rig.eyeR.scale.set(1, 1.1, 0.6);
  for (const l of rig.lenses) {
    l.visible = true;
    l.rotation.z = 0;
  }
  for (const j of rig.jacketMeshes) if (j.userData.s) j.scale.copy(j.userData.s);
}

export function disposeRig(rig: Rig) {
  rig.root.removeFromParent();
  for (const m of rig.mats) m.dispose();
}
