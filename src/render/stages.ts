import * as THREE from 'three';
import { toon } from './rig';
import { makeProjectile, stripes, textTexture } from './props';

export interface ZoneBuild {
  group: THREE.Group;
  sky: number;
  fog: [number, number, number];
  ambient: number;
  sun: number;
  sunPos: [number, number, number];
  weather: 'none' | 'rain' | 'smog' | 'fireworks' | 'confetti';
  crowd: { z: number; count: number; colors: number[] } | null;
  animate?: (t: number, dt: number) => void;
  wallColor: number;
}

const M = (c: number, em?: number) => toon(c, { emissive: em });

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  t.anisotropy = 8;
  return t;
}

function floor(tex: THREE.Texture, w = 44, d = 18, rough = true) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), rough ? new THREE.MeshLambertMaterial({ map: tex }) : new THREE.MeshPhongMaterial({ map: tex, shininess: 80, specular: 0x444444 }));
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  return m;
}

function noise(g: CanvasRenderingContext2D, w: number, h: number, base: string, dots: string[], n = 2000, size = 3) {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    g.fillStyle = dots[i % dots.length];
    g.globalAlpha = 0.15 + Math.random() * 0.3;
    g.fillRect(Math.random() * w, Math.random() * h, size * Math.random() + 1, size * Math.random() + 1);
  }
  g.globalAlpha = 1;
}

function sideWalls(group: THREE.Group, color: number, h = 6, tex?: THREE.Texture) {
  for (const s of [-1, 1]) {
    const mat = tex ? new THREE.MeshLambertMaterial({ map: tex }) : M(color);
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.6, h, 10), mat);
    w.position.set(s * 8.1, h / 2, -1);
    w.receiveShadow = true;
    group.add(w);
  }
}

function banner(text: string, w: number, h: number, bg: string, fg: string) {
  const t = textTexture(text, { bg, fg, w: 512, h: Math.round((512 * h) / w), border: fg });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
  return m;
}

// ------------------------------------------------------------------ ASSEMBLY
function assembly(zone: number): ZoneBuild {
  const g = new THREE.Group();
  if (zone === 0) {
    const carpet = canvasTex(512, 512, (c) => {
      noise(c, 512, 512, '#2f6b3a', ['#1f4a28', '#3f8a4a'], 4000);
      c.strokeStyle = '#c9a34a';
      c.lineWidth = 6;
      for (let i = 0; i < 4; i++) c.strokeRect(20 + i * 120, 20, 100, 472);
    }, [6, 2]);
    g.add(floor(carpet));
    // tiered green benches in a semicircle
    const benchM = M(0x2d7a45);
    const woodM = M(0x6a3a1a);
    for (let row = 0; row < 6; row++) {
      const r = 7 + row * 1.3;
      for (let i = -9; i <= 9; i++) {
        const a = (i / 9) * 1.15;
        const bench = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.6), benchM);
        bench.position.set(Math.sin(a) * r, 0.25 + row * 0.55, -Math.cos(a) * r + 1);
        bench.rotation.y = -a;
        g.add(bench);
        const desk = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.15), woodM);
        desk.position.set(Math.sin(a) * (r - 0.45), 0.35 + row * 0.55, -Math.cos(a) * (r - 0.45) + 1);
        desk.rotation.y = -a;
        g.add(desk);
      }
    }
    // speaker's dais
    const dais = new THREE.Mesh(new THREE.BoxGeometry(4, 1.2, 1.2), woodM);
    dais.position.set(0, 0.6, -5.5);
    g.add(dais);
    const throne = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.6, 0.4), M(0x8a1a1a));
    throne.position.set(0, 2.2, -6.2);
    g.add(throne);
    const emblem = banner('LOKTANTRA BHAVAN\nSATYAMEV JUMLATE', 5, 1.1, '#3a1a0a', '#ffcf5a');
    emblem.position.set(0, 4.6, -6.6);
    g.add(emblem);
    const wallTex = canvasTex(256, 256, (c) => {
      noise(c, 256, 256, '#7a4a28', ['#5a3418', '#8a5a34'], 600);
      c.strokeStyle = '#3a2010';
      c.lineWidth = 4;
      for (let i = 0; i < 4; i++) c.strokeRect(8 + i * 62, 8, 52, 240);
    }, [2, 1]);
    sideWalls(g, 0x6a3a1a, 6, wallTex);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(40, 14), new THREE.MeshLambertMaterial({ map: wallTex }));
    back.position.set(0, 6, -16);
    g.add(back);
    return { group: g, sky: 0x1a0d06, fog: [0x1a0d06, 16, 40], ambient: 0.75, sun: 1.6, sunPos: [3, 10, 6], weather: 'none', crowd: { z: -7.5, count: 160, colors: [0xffffff, 0xff9a1a, 0x2d7a45, 0xf2e8d0, 0x1f6fd1] }, wallColor: 0x6a3a1a };
  }
  if (zone === 1) {
    const marble = canvasTex(512, 512, (c) => {
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          c.fillStyle = (x + y) % 2 ? '#e9e2d4' : '#5a1a1a';
          c.fillRect(x * 64, y * 64, 64, 64);
        }
      c.globalAlpha = 0.15;
      for (let i = 0; i < 60; i++) {
        c.strokeStyle = '#888';
        c.beginPath();
        c.moveTo(Math.random() * 512, Math.random() * 512);
        c.lineTo(Math.random() * 512, Math.random() * 512);
        c.stroke();
      }
    }, [8, 3]);
    g.add(floor(marble, 44, 18, false));
    for (let i = -6; i <= 6; i++) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 8, 16), M(0xe8dcc0));
      col.position.set(i * 3.2, 4, -6);
      col.castShadow = true;
      g.add(col);
    }
    for (let i = -3; i <= 3; i++) {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 0.1), M(0xc9a34a));
      frame.position.set(i * 4.5 + 1.6, 3.2, -8.9);
      g.add(frame);
      const pic = banner(['NETA OF\nTHE YEAR', 'KURSI\nKA SAATHI', 'VIKAS\nAAYEGA', 'NO\nCOMMENTS', 'SCAM\nFREE*', 'TERMS\nAPPLY', 'JAI\nJUMLA'][i + 3], 1.2, 1.6, '#24304a', '#ffe9a8');
      pic.position.set(i * 4.5 + 1.6, 3.2, -8.84);
      g.add(pic);
    }
    const back = new THREE.Mesh(new THREE.PlaneGeometry(44, 12), M(0xd9c8a8));
    back.position.set(0, 6, -9);
    g.add(back);
    sideWalls(g, 0xd9c8a8);
    return { group: g, sky: 0x2a1a10, fog: [0x2a1a10, 18, 42], ambient: 0.9, sun: 1.4, sunPos: [-4, 9, 5], weather: 'none', crowd: { z: -4.5, count: 40, colors: [0x111111, 0xffffff, 0x333355] }, wallColor: 0xd9c8a8 };
  }
  // zone 2: lawns at night with fireworks
  const grass = canvasTex(256, 256, (c) => noise(c, 256, 256, '#2a5a1a', ['#1a4a10', '#3a7a2a', '#4a8a2a'], 5000, 2), [10, 4]);
  g.add(floor(grass, 60, 30));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M(0xd8b88a));
  dome.position.set(0, 7, -30);
  g.add(dome);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 7, 32, 1, true, Math.PI, Math.PI), M(0xc8a070));
  base.position.set(0, 3.5, -30);
  g.add(base);
  for (let i = -8; i <= 8; i++) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 6), M(0x222222));
    lamp.position.set(i * 3, 1.5, -5);
    g.add(lamp);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe28a }));
    bulb.position.set(i * 3, 3.05, -5);
    g.add(bulb);
  }
  return { group: g, sky: 0x0a1030, fog: [0x0a1030, 20, 60], ambient: 0.6, sun: 1.0, sunPos: [2, 10, 4], weather: 'fireworks', crowd: { z: -8, count: 120, colors: [0xffffff, 0xff9a1a, 0x17a35c] }, wallColor: 0x2a5a1a };
}

// ------------------------------------------------------------------ MAIDAN
function maidan(zone: number): ZoneBuild {
  const g = new THREE.Group();
  const dirt = canvasTex(256, 256, (c) => noise(c, 256, 256, '#a8845a', ['#8a6a44', '#c8a478', '#6a4a2a'], 4000, 3), [10, 4]);
  g.add(floor(dirt, 60, 24));
  if (zone === 0) {
    // protest stage with loudspeakers
    const stage = new THREE.Mesh(new THREE.BoxGeometry(10, 1.2, 3), M(0x7a3a1a));
    stage.position.set(0, 0.6, -9);
    g.add(stage);
    const back = banner('ANDOLAN JAARI RAHEGA!\nKURSI KHAALI KARO', 10, 3, '#b01010', '#ffffff');
    back.position.set(0, 3.8, -10.4);
    g.add(back);
    for (const x of [-5.5, 5.5]) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.9, 10, 1, true), M(0x333333));
      sp.rotation.z = x > 0 ? Math.PI / 2 : -Math.PI / 2;
      sp.position.set(x, 5.2, -9);
      g.add(sp);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5, 6), M(0x444444));
      pole.position.set(x, 2.5, -9);
      g.add(pole);
    }
    // tents and placards
    const colors = [0xff6a00, 0x1f6fd1, 0xffffff, 0x17a35c, 0xe8173b];
    for (let i = 0; i < 9; i++) {
      const tent = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.8, 4), M(colors[i % colors.length]));
      tent.position.set(-16 + i * 4, 0.9, -13 - (i % 2) * 2);
      tent.rotation.y = Math.PI / 4;
      g.add(tent);
    }
    const slogans = ['ROTI\nKAPDA\nWIFI', 'NO\nVAADA\nNO VOTE', 'PETROL\nSASTA\nKARO', 'JUMLA\nWAPAS\nLO', 'HUM\nDEKHENGE'];
    for (let i = 0; i < 10; i++) {
      const p = banner(slogans[i % slogans.length], 0.9, 0.7, '#fff3d0', '#b01010');
      p.position.set(-14 + i * 3.1, 2.4 + (i % 3) * 0.2, -6.4);
      p.rotation.z = (i % 2 ? 1 : -1) * 0.08;
      g.add(p);
    }
    sideWalls(g, 0x8a8a8a);
    return { group: g, sky: 0xc89a6a, fog: [0xb8946a, 10, 38], ambient: 1.0, sun: 1.5, sunPos: [6, 12, 4], weather: 'smog', crowd: { z: -6.8, count: 220, colors: [0xffffff, 0xff6a00, 0xe8173b, 0x1f6fd1, 0xf2e8d0, 0x17a35c] }, wallColor: 0x8a8a8a };
  }
  // barricade line
  for (let i = -10; i <= 10; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 0.1), [M(0xffffff), M(0xffffff), M(0xffffff), M(0xffffff), new THREE.MeshBasicMaterial({ map: stripes() }), new THREE.MeshBasicMaterial({ map: stripes() })]);
    bar.position.set(i * 2, 0.55, -5);
    g.add(bar);
  }
  const truck = new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 2.4), M(0x2a3a5a));
  truck.position.set(-5, 1.6, -9);
  g.add(truck);
  const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2, 8), M(0x111111));
  cannon.rotation.z = Math.PI / 2.5;
  cannon.position.set(-4, 3.4, -9);
  g.add(cannon);
  const sign = banner('SECTION 144\nLAGU HAI', 4, 1.6, '#ffe000', '#111111');
  sign.position.set(5, 2.5, -8);
  g.add(sign);
  sideWalls(g, 0x6a6a6a);
  return { group: g, sky: 0x8a6a5a, fog: [0x7a6a5a, 8, 32], ambient: 0.9, sun: 1.2, sunPos: [-5, 10, 5], weather: 'smog', crowd: { z: -6.2, count: 90, colors: [0x2a3a5a, 0x5a4a2a, 0xffffff] }, wallColor: 0x6a6a6a };
}

// ------------------------------------------------------------------ TOLL PLAZA
function tollplaza(zone: number): ZoneBuild {
  const g = new THREE.Group();
  const asphalt = canvasTex(512, 256, (c) => {
    noise(c, 512, 256, '#2a2a2e', ['#3a3a40', '#1a1a1e', '#444'], 5000, 2);
    c.fillStyle = '#e8e8e8';
    for (let i = 0; i < 8; i++) c.fillRect(i * 64 + 10, 124, 36, 8);
  }, [6, 2]);
  g.add(floor(asphalt, 80, 24, false));
  const anim: ((t: number, dt: number) => void)[] = [];
  if (zone === 0) {
    for (let i = -3; i <= 3; i++) {
      const booth = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 1.4), M(0xf0f0f0));
      booth.position.set(i * 4.2, 1.2, -6);
      g.add(booth);
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.7), new THREE.MeshBasicMaterial({ color: 0x9adfff }));
      win.position.set(i * 4.2, 1.6, -5.29);
      g.add(win);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: i % 2 ? 0x00ff40 : 0xff2020 }));
      lamp.position.set(i * 4.2, 2.6, -5.3);
      g.add(lamp);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(32, 0.6, 5), M(0x1f6fd1));
    roof.position.set(0, 5.2, -6);
    g.add(roof);
    const sign = banner('NH-420 TOLL PLAZA  •  CAR ₹999  •  NETA FREE', 18, 0.6, '#1f6fd1', '#ffffff');
    sign.position.set(0, 5.2, -3.48);
    g.add(sign);
    for (let i = -8; i <= 8; i++) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 5, 8), M(0xcccccc));
      pillar.position.set(i * 2 + 1, 2.5, -8.2);
      g.add(pillar);
    }
    sideWalls(g, 0x9a9a9a);
    return { group: g, sky: 0x1a2030, fog: [0x1a2030, 12, 40], ambient: 0.7, sun: 1.3, sunPos: [4, 10, 6], weather: 'rain', crowd: null, wallColor: 0x9a9a9a };
  }
  if (zone === 1) {
    for (const z of [-4, 4.5]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(80, 0.3, 0.1), M(0xb0b0b0));
      rail.position.set(0, 0.7, z);
      g.add(rail);
    }
    const trucks: THREE.Object3D[] = [];
    for (let i = 0; i < 3; i++) {
      const t = makeProjectile('truck');
      t.position.set(-30 + i * 22, 1.4, -10);
      t.scale.setScalar(1.5);
      g.add(t);
      trucks.push(t);
    }
    anim.push((_, dt) => {
      for (const t of trucks) {
        t.position.x += dt * 9;
        if (t.position.x > 35) t.position.x = -35;
      }
    });
    const hoarding = banner('VIKAS ROAD — 2047 TAK POORA HOGA', 14, 2, '#ffe000', '#111111');
    hoarding.position.set(0, 6, -16);
    g.add(hoarding);
    sideWalls(g, 0x7a7a7a);
    return { group: g, sky: 0x1a2030, fog: [0x1a2030, 12, 45], ambient: 0.7, sun: 1.2, sunPos: [4, 10, 6], weather: 'rain', crowd: null, animate: (t, dt) => anim.forEach((a) => a(t, dt)), wallColor: 0x7a7a7a };
  }
  // zone 2: on top of a moving rally truck — road scrolls past
  g.children.length = 0;
  const road = floor(asphalt, 120, 40, false);
  road.position.y = -2.2;
  g.add(road);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(17, 0.4, 5), M(0xff9a10));
  deck.position.set(0, -0.2, 0);
  deck.receiveShadow = true;
  g.add(deck);
  const deckTop = new THREE.Mesh(new THREE.PlaneGeometry(17, 5), new THREE.MeshLambertMaterial({ map: canvasTex(256, 128, (c) => noise(c, 256, 128, '#7a5a3a', ['#5a3a1a', '#9a7a5a'], 1500, 3)) }));
  deckTop.rotation.x = -Math.PI / 2;
  deckTop.position.y = 0.01;
  deckTop.receiveShadow = true;
  g.add(deckTop);
  const flags: THREE.Mesh[] = [];
  for (let i = -4; i <= 4; i++) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 6), M(0x333333));
    pole.position.set(i * 2, 1.2, -2.4);
    g.add(pole);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5, 6, 1), M([0xff6a00, 0x17a35c, 0x1f6fd1, 0xe8173b][(i + 4) % 4]));
    (f.material as THREE.Material).side = THREE.DoubleSide;
    f.position.set(i * 2 + 0.4, 2.15, -2.4);
    g.add(f);
    flags.push(f);
  }
  const posts: THREE.Object3D[] = [];
  for (let i = 0; i < 14; i++) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6, 6), M(0x888888));
    lamp.position.set(-60 + i * 9, 0.8, -6);
    g.add(lamp);
    posts.push(lamp);
  }
  anim.push((t, dt) => {
    for (const p of posts) {
      p.position.x -= dt * 22;
      if (p.position.x < -62) p.position.x += 126;
    }
    flags.forEach((f, i) => (f.rotation.y = Math.sin(t * 8 + i) * 0.25));
  });
  return { group: g, sky: 0x0a0a1a, fog: [0x0a0a1a, 14, 50], ambient: 0.6, sun: 1.1, sunPos: [3, 10, 5], weather: 'rain', crowd: null, animate: (t, dt) => anim.forEach((a) => a(t, dt)), wallColor: 0xff9a10 };
}

// ------------------------------------------------------------------ STUDIO
function studio(zone: number): ZoneBuild {
  const g = new THREE.Group();
  const gloss = canvasTex(512, 512, (c) => {
    const grd = c.createRadialGradient(256, 256, 20, 256, 256, 360);
    grd.addColorStop(0, '#2a1a4a');
    grd.addColorStop(1, '#08060f');
    c.fillStyle = grd;
    c.fillRect(0, 0, 512, 512);
    c.strokeStyle = '#ff2a2a';
    c.lineWidth = 4;
    c.beginPath();
    c.arc(256, 256, 180, 0, Math.PI * 2);
    c.stroke();
  }, [2, 1]);
  g.add(floor(gloss, 44, 18, false));
  const anim: ((t: number) => void)[] = [];
  if (zone === 0) {
    // giant video wall of screaming panelists
    const tiles: THREE.Mesh[] = [];
    const heads = ['EXPERT #1', 'EXPERT #2', 'SPOKESPERSON', 'ASTROLOGER', 'RETD. GENERAL', 'COMEDIAN', 'YOUR UNCLE', 'ANCHOR'];
    for (let r = 0; r < 2; r++)
      for (let c = 0; c < 4; c++) {
        const tile = banner(heads[r * 4 + c] + '\n😡', 3.4, 1.9, ['#1a2a6a', '#6a1a1a', '#1a5a2a', '#5a1a5a'][(r + c) % 4], '#ffffff');
        tile.position.set(-5.4 + c * 3.6, 2.2 + r * 2.05, -7);
        g.add(tile);
        tiles.push(tile);
      }
    const ticker = banner('BREAKING: NETA PUNCHES NETA • NATION WANTS TO KNOW • TRP UP 400% • ', 16, 0.6, '#d01010', '#ffffff');
    ticker.position.set(0, 0.7, -6.95);
    g.add(ticker);
    anim.push((t) => tiles.forEach((tl, i) => (tl.scale.y = 1 + Math.sin(t * 9 + i) * 0.03)));
    const desk = new THREE.Mesh(new THREE.BoxGeometry(5, 1, 1.2), M(0x1a1a2a));
    desk.position.set(0, 0.5, -4.6);
    g.add(desk);
    for (const x of [-6, -3, 3, 6]) {
      const spot = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 10), M(0x222222));
      spot.position.set(x, 6.5, -2);
      spot.rotation.x = Math.PI;
      g.add(spot);
    }
    sideWalls(g, 0x1a1a2a);
    return { group: g, sky: 0x06040c, fog: [0x06040c, 14, 34], ambient: 0.6, sun: 1.6, sunPos: [0, 10, 6], weather: 'confetti', crowd: { z: -5.6, count: 30, colors: [0x111111, 0x333333] }, animate: (t) => anim.forEach((a) => a(t)), wallColor: 0x1a1a2a };
  }
  // control room
  for (let i = -6; i <= 6; i++) {
    const mon = banner(['ON AIR', 'TRP 9000', 'CUT TO AD', 'MORE DRAMA', 'ZOOM FACE', 'SLOW MO!'][(i + 6) % 6], 1.6, 0.9, '#0a2a1a', '#40ff80');
    mon.position.set(i * 1.8, 2.4 + (i % 2) * 1.0, -5);
    g.add(mon);
  }
  const console_ = new THREE.Mesh(new THREE.BoxGeometry(18, 1, 1.4), M(0x2a2a3a));
  console_.position.set(0, 0.5, -3.6);
  g.add(console_);
  sideWalls(g, 0x2a2a3a);
  return { group: g, sky: 0x020208, fog: [0x020208, 12, 30], ambient: 0.5, sun: 1.4, sunPos: [2, 8, 6], weather: 'none', crowd: null, wallColor: 0x2a2a3a };
}

export function buildZone(stage: string, zone: number): ZoneBuild {
  switch (stage) {
    case 'maidan':
      return maidan(zone);
    case 'tollplaza':
      return tollplaza(zone);
    case 'studio':
      return studio(zone);
    default:
      return assembly(zone);
  }
}

export const STAGE_LIST = [
  { id: 'assembly', name: 'LOKTANTRA BHAVAN', blurb: 'Parliament of punches. 3 zones.' },
  { id: 'maidan', name: 'ANDOLAN MAIDAN', blurb: 'Protest ground. Smog & barricades.' },
  { id: 'tollplaza', name: 'NH-420 TOLL PLAZA', blurb: 'Monsoon highway. Ends on a rally truck.' },
  { id: 'studio', name: 'PRIME TIME STUDIO', blurb: 'Debate floor. TRP above all.' },
];
