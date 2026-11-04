import * as THREE from 'three';
import { toon } from './rig';

export function textTexture(text: string, opts: { w?: number; h?: number; bg?: string; fg?: string; font?: string; border?: string } = {}) {
  const w = opts.w ?? 256;
  const h = opts.h ?? 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  if (opts.bg) {
    g.fillStyle = opts.bg;
    g.fillRect(0, 0, w, h);
  }
  if (opts.border) {
    g.strokeStyle = opts.border;
    g.lineWidth = Math.max(4, h * 0.06);
    g.strokeRect(4, 4, w - 8, h - 8);
  }
  g.fillStyle = opts.fg ?? '#111';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const lines = text.split('\n');
  let size = Math.floor(h / (lines.length * 1.25));
  g.font = `bold ${size}px ${opts.font ?? 'Teko, Impact, sans-serif'}`;
  const widest = Math.max(...lines.map((l) => g.measureText(l).width));
  if (widest > w * 0.92) size = Math.floor((size * w * 0.92) / widest);
  g.font = `bold ${size}px ${opts.font ?? 'Teko, Impact, sans-serif'}`;
  lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 1.1));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const M = (c: number, em?: number) => toon(c, { emissive: em });
const box = (x: number, y: number, z: number, c: number) => new THREE.Mesh(new THREE.BoxGeometry(x, y, z), M(c));
const cyl = (r1: number, r2: number, h: number, c: number, seg = 10) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), M(c));

/** Hand weapons / stage props. Built pointing along +z from the grip at the origin when held. */
export function makeWeapon(kind: string, held: boolean): THREE.Group {
  const g = new THREE.Group();
  switch (kind) {
    case 'chair': {
      const seat = box(0.42, 0.05, 0.42, 0x8a1a1a);
      seat.position.y = 0.45;
      g.add(seat);
      const back = box(0.42, 0.45, 0.05, 0x8a1a1a);
      back.position.set(0, 0.7, -0.2);
      g.add(back);
      for (const [x, z] of [
        [-0.18, -0.18],
        [0.18, -0.18],
        [-0.18, 0.18],
        [0.18, 0.18],
      ]) {
        const l = cyl(0.02, 0.02, 0.45, 0x444444, 6);
        l.position.set(x, 0.225, z);
        g.add(l);
      }
      if (held) {
        g.rotation.set(Math.PI / 2, 0, 0);
        g.position.set(0, -0.05, -0.45);
        g.scale.setScalar(0.9);
      }
      break;
    }
    case 'mic': {
      const pole = cyl(0.015, 0.015, 1.4, 0x222222, 6);
      pole.position.y = 0.7;
      g.add(pole);
      const base = cyl(0.15, 0.15, 0.03, 0x222222, 12);
      g.add(base);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), M(0x555555));
      head.position.y = 1.42;
      g.add(head);
      if (held) {
        g.rotation.set(Math.PI / 2, 0, 0);
        g.position.set(0, -0.05, -0.35);
      }
      break;
    }
    case 'placard': {
      const pole = cyl(0.02, 0.02, 1.2, 0x7a4a1a, 6);
      pole.position.y = 0.6;
      g.add(pole);
      const t = textTexture('HAMARI\nMAANGEIN\nPOORI KARO', { bg: '#fff3d0', fg: '#b01010', border: '#b01010' });
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.02), [M(0xfff3d0), M(0xfff3d0), M(0xfff3d0), M(0xfff3d0), new THREE.MeshBasicMaterial({ map: t }), new THREE.MeshBasicMaterial({ map: t })]);
      board.position.y = 1.25;
      g.add(board);
      if (held) {
        g.rotation.set(Math.PI / 2, 0, 0);
        g.position.set(0, -0.05, -0.3);
      }
      break;
    }
    case 'lathi': {
      const s = cyl(0.022, 0.022, 1.5, 0x7a4a1a, 6);
      s.position.y = 0.75;
      g.add(s);
      const band = cyl(0.026, 0.026, 0.08, 0xc0a040, 6);
      band.position.y = 1.4;
      g.add(band);
      if (held) {
        g.rotation.set(Math.PI / 2, 0, 0);
        g.position.set(0, -0.05, -0.4);
      } else g.rotation.z = Math.PI / 2 - 0.05;
      break;
    }
    case 'cone': {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.55, 12), M(0xff6a00));
      c.position.y = 0.3;
      g.add(c);
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.135, 0.08, 12), M(0xffffff));
      s.position.y = 0.3;
      g.add(s);
      const b = box(0.4, 0.04, 0.4, 0x222222);
      g.add(b);
      if (held) {
        g.rotation.set(Math.PI / 2, 0, 0);
        g.position.set(0, -0.05, -0.25);
      }
      break;
    }
    default: {
      const s = cyl(0.03, 0.03, 0.8, 0x888888, 6);
      s.position.y = 0.4;
      g.add(s);
    }
  }
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}

/** Projectile visuals. Returned group is centred on the projectile and faces +x. */
export function makeProjectile(kind: string): THREE.Object3D {
  const g = new THREE.Group();
  switch (kind) {
    case 'promise':
    case 'megaPromise': {
      const big = kind === 'megaPromise';
      const tex = textTexture(big ? '₹15 LAKH\nPROMISE' : '₹15L', { bg: '#ffe9a8', fg: '#0a6a2a', border: '#c08a00', w: 256, h: 128 });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(big ? 1.5 : 0.7, big ? 0.75 : 0.35), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
      g.add(m);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(big ? 0.8 : 0.35, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
      g.add(glow);
      g.userData.spin = 'z';
      break;
    }
    case 'moneybag':
    case 'coins': {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10), M(0xc9a36a));
      b.scale.set(1, 1.15, 1);
      g.add(b);
      const knot = cyl(0.06, 0.1, 0.12, 0x8a6a3a);
      knot.position.y = 0.28;
      g.add(knot);
      const t = textTexture('₹', { fg: '#0a5a2a', w: 64, h: 64 });
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshBasicMaterial({ map: t, transparent: true }));
      s.position.z = 0.26;
      g.add(s);
      g.userData.spin = 'z';
      break;
    }
    case 'ballots': {
      for (let i = 0; i < 9; i++) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.22), new THREE.MeshBasicMaterial({ color: i % 3 ? 0xffffff : 0xffe0f0, side: THREE.DoubleSide }));
        p.position.set((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.4);
        p.rotation.set(Math.random() * 3, Math.random() * 3, 0);
        g.add(p);
      }
      g.userData.spin = 'y';
      break;
    }
    case 'chappal':
    case 'chappalStorm': {
      const n = kind === 'chappalStorm' ? 7 : 1;
      for (let i = 0; i < n; i++) {
        const c = new THREE.Group();
        const sole = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.16, 4, 8), M(0x2a6ad8));
        sole.scale.set(1, 1, 0.25);
        sole.rotation.z = Math.PI / 2;
        c.add(sole);
        const strap = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 4, 10, Math.PI), M(0xffffff));
        strap.position.z = 0.02;
        c.add(strap);
        if (n > 1) c.position.set((Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.5);
        g.add(c);
      }
      g.userData.spin = 'z';
      break;
    }
    case 'zap': {
      const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.5, 4, 8), new THREE.MeshBasicMaterial({ color: 0x40d0ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
      b.rotation.z = Math.PI / 2;
      g.add(b);
      const t = textTexture('FASTag', { bg: '#1a3aaa', fg: '#fff', w: 128, h: 48 });
      const card = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.12), new THREE.MeshBasicMaterial({ map: t }));
      card.position.z = 0.05;
      g.add(card);
      break;
    }
    case 'barrier': {
      for (let i = 0; i < 2; i++) {
        const p = cyl(0.05, 0.05, 1.0, 0x333333);
        p.position.set(0, -0.3, i ? 0.6 : -0.6);
        g.add(p);
      }
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 1.6), [M(0xffffff), M(0xffffff), M(0xffffff), M(0xffffff), new THREE.MeshBasicMaterial({ map: stripes() }), new THREE.MeshBasicMaterial({ map: stripes() })]);
      arm.position.y = 0.2;
      g.add(arm);
      const arm2 = arm.clone();
      arm2.position.y = -0.3;
      g.add(arm2);
      g.rotation.y = 0;
      break;
    }
    case 'pothole': {
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16), new THREE.MeshBasicMaterial({ color: 0x0a0a0a }));
      d.rotation.x = -Math.PI / 2;
      d.position.y = -0.03;
      d.scale.set(1.4, 0.7, 1);
      g.add(d);
      for (let i = 0; i < 6; i++) {
        const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.06), M(0x555555));
        r.position.set(Math.cos(i) * 0.65, 0, Math.sin(i) * 0.35);
        g.add(r);
      }
      break;
    }
    case 'scream': {
      for (let i = 0; i < 3; i++) {
        const r = new THREE.Mesh(new THREE.TorusGeometry(0.25 + i * 0.18, 0.03, 6, 20), new THREE.MeshBasicMaterial({ color: 0xff5050, transparent: true, opacity: 0.7 - i * 0.18, blending: THREE.AdditiveBlending }));
        r.rotation.y = Math.PI / 2;
        r.position.x = -i * 0.15;
        g.add(r);
      }
      const t = textTexture('CHUP!!', { fg: '#ff2020', w: 256, h: 96 });
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.3), new THREE.MeshBasicMaterial({ map: t, transparent: true }));
      s.position.y = 0.55;
      g.add(s);
      g.userData.pulse = true;
      break;
    }
    case 'beam': {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.8, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe68a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      b.rotation.z = Math.PI / 2;
      g.add(b);
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      core.rotation.z = Math.PI / 2;
      g.add(core);
      break;
    }
    case 'truck': {
      const body = box(2.4, 1.2, 1.2, 0xff9a10);
      body.position.y = 0.1;
      g.add(body);
      const cab = box(0.8, 0.9, 1.15, 0x2a6ad8);
      cab.position.set(1.5, -0.05, 0);
      g.add(cab);
      const t = textTexture('HORN OK\nPLEASE', { bg: '#ff9a10', fg: '#0a3a8a', w: 256, h: 128 });
      const s = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.9), new THREE.MeshBasicMaterial({ map: t }));
      s.position.set(0, 0.1, 0.61);
      g.add(s);
      for (const x of [-0.8, 0.9, 1.5]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.3, 14), M(0x111111));
        w.rotation.x = Math.PI / 2;
        w.position.set(x, -0.55, 0);
        g.add(w);
      }
      break;
    }
    case 'kursi':
    case 'weapon': {
      g.add(makeWeapon('chair', false));
      g.children[0].position.y = -0.5;
      g.userData.spin = 'z';
      break;
    }
    default: {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffaa00 }));
      g.add(b);
    }
  }
  return g;
}

let stripeTex: THREE.Texture | null = null;
function stripes() {
  if (stripeTex) return stripeTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 32;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#ffffff' : '#e01010';
    g.fillRect(i * 32, 0, 32, 32);
  }
  stripeTex = new THREE.CanvasTexture(c);
  stripeTex.colorSpace = THREE.SRGBColorSpace;
  return stripeTex;
}
export { stripes };

/** Stage hazards running across the arena. */
export function makeHazard(kind: string): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'bull') {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 4, 10), M(0xe8e0d0));
    body.rotation.z = Math.PI / 2;
    body.position.y = 0.95;
    g.add(body);
    const hump = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), M(0xe0d6c4));
    hump.position.set(0.35, 1.25, 0);
    g.add(hump);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.32, 0.3), M(0xe8e0d0));
    head.position.set(0.95, 1.05, 0);
    g.add(head);
    for (const z of [-0.12, 0.12]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.3, 6), M(0x3a2a1a));
      horn.position.set(0.9, 1.3, z);
      horn.rotation.z = -0.4;
      g.add(horn);
    }
    const legs: THREE.Mesh[] = [];
    for (const [x, z] of [
      [-0.45, -0.18],
      [-0.45, 0.18],
      [0.45, -0.18],
      [0.45, 0.18],
    ]) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.7, 6), M(0xd8cfbf));
      l.geometry.translate(0, -0.35, 0);
      l.position.set(x, 0.75, z);
      g.add(l);
      legs.push(l);
    }
    g.userData.legs = legs;
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.32), M(0xff6a00));
    tl.position.set(-0.1, 1.3, 0);
    g.add(tl);
  } else if (kind === 'convoy') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 1.2), M(0xf2f2f2));
    body.position.y = 0.65;
    g.add(body);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.55, 1.1), M(0x223344));
    top.position.set(-0.2, 1.3, 0);
    g.add(top);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    beacon.position.set(0, 1.65, 0);
    g.add(beacon);
    g.userData.beacon = beacon;
    for (const x of [-0.7, 0.7]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.25, 12), M(0x111111));
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 0.3, 0);
      g.add(w);
    }
    const t = textTexture('VIP', { bg: '#ffffff', fg: '#d01010', w: 128, h: 64 });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), new THREE.MeshBasicMaterial({ map: t }));
    s.position.set(0, 0.7, 0.61);
    g.add(s);
  } else if (kind === 'chappal') {
    g.add(makeProjectile('chappal'));
  }
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}
