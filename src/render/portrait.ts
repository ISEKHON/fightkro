// Renders character head portraits to data URLs with a small offscreen renderer (cached).
import * as THREE from 'three';
import { CHARS } from '../sim/roster';
import { lookFor, hex } from './looks';
import { buildRig } from './rig';

const cache = new Map<string, string>();
let renderer: THREE.WebGLRenderer | null = null;

export function portrait(id: string, kind: 'head' | 'full' = 'head'): string {
  const key = id + ':' + kind;
  const c = cache.get(key);
  if (c) return c;
  try {
    const W = kind === 'head' ? 192 : 256;
    const H = kind === 'head' ? 192 : 384;
    if (!renderer) {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    renderer.setSize(W, H, false);
    renderer.setPixelRatio(1);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 1.6));
    const d = new THREE.DirectionalLight(0xffffff, 1.6);
    d.position.set(1.5, 2, 3);
    scene.add(d);
    const ch = CHARS[id];
    const look = lookFor(id);
    const rig = buildRig(look, ch?.stats.height ?? 1.8, { outlines: true, shadows: false });
    scene.add(rig.root);
    // relaxed pose
    rig.j.uaL.rotation.set(-0.3, 0, 0.25);
    rig.j.uaR.rotation.set(-0.2, 0, -0.25);
    rig.j.faL.rotation.set(-1.4, 0, 0);
    rig.j.faR.rotation.set(-1.6, 0, 0);
    rig.body.rotation.y = 0.35;
    rig.root.updateMatrixWorld(true);
    const head = new THREE.Vector3();
    rig.j.head.getWorldPosition(head);
    const cam = new THREE.PerspectiveCamera(kind === 'head' ? 26 : 30, W / H, 0.05, 50);
    if (kind === 'head') {
      cam.position.set(head.x + 0.25, head.y + 0.22, head.z + 1.45);
      cam.lookAt(head.x, head.y + 0.12, head.z);
    } else {
      const h = ch?.stats.height ?? 1.8;
      cam.position.set(0.6, h * 0.62, 4.6);
      cam.lookAt(0, h * 0.55, 0);
    }
    renderer.setClearColor(0x000000, 0);
    renderer.render(scene, cam);
    const url = renderer.domElement.toDataURL('image/png');
    cache.set(key, url);
    rig.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry?.dispose?.();
    });
    return url;
  } catch {
    // fallback: coloured badge
    const look = lookFor(id);
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d')!;
    g.fillStyle = hex(look.partyColor);
    g.fillRect(0, 0, 128, 128);
    g.font = '64px serif';
    g.textAlign = 'center';
    g.fillText(look.partySymbol, 64, 88);
    const url = cv.toDataURL();
    cache.set(key, url);
    return url;
  }
}

export function clearPortrait(id: string) {
  cache.delete(id + ':head');
  cache.delete(id + ':full');
}
