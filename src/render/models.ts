import * as THREE from 'three';
import type { CropId } from '../data/crops';
import { G, group, leaf, mat, mesh } from './kit';

export const PLOT_TOP = 0.2;

// ───────────────────────── palette ─────────────────────────
export const C = {
  leaf: '#4fa84a',
  leafLight: '#7ccc5a',
  leafPale: '#a9e07c',
  stem: '#5b9a3c',
  wood: '#b9814f',
  woodLight: '#dcae7a',
  woodDark: '#8a5a35',
  cream: '#fbf1dc',
  gold: '#ffc93a',
};

const GOLD = () => mat('#ffcd3c', { rough: 0.28, metal: 0.55, emissive: '#ffae00', ei: 0.35 });

// ───────────────────────── plants ─────────────────────────

export interface PlantModel {
  root: THREE.Group;
  body: THREE.Group;
  foliage: THREE.Group;
  leaves: THREE.Group[];
  fruits: THREE.Object3D[];
  fruitMats: { m: THREE.MeshStandardMaterial; unripe: THREE.Color; ripe: THREE.Color }[];
  leafMats: { m: THREE.MeshStandardMaterial; base: THREE.Color }[];
  props: THREE.Object3D[];
}

function own(color: string, rough = 0.75): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough });
}

function newPlant(): PlantModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const foliage = new THREE.Group();
  body.add(foliage);
  root.add(body);
  return { root, body, foliage, leaves: [], fruits: [], fruitMats: [], leafMats: [], props: [] };
}

function leafMat(pm: PlantModel, color: string): THREE.MeshStandardMaterial {
  const m = own(color, 0.7);
  pm.leafMats.push({ m, base: new THREE.Color(color) });
  return m;
}

function ring(pm: PlantModel, m: THREE.Material, n: number, len: number, wid: number, tilt: number, y: number, jitter = 0.25, phase = 0) {
  for (let i = 0; i < n; i++) {
    const yaw = (i / n) * Math.PI * 2 + phase + (Math.random() - 0.5) * jitter;
    const l = leaf(m, len * (0.85 + Math.random() * 0.3), wid, tilt + (Math.random() - 0.5) * 0.2, yaw, y);
    pm.foliage.add(l);
    pm.leaves.push(l);
  }
}

function fruitGroup(pm: PlantModel, ...children: THREE.Object3D[]): THREE.Group {
  const g = group(...children);
  pm.body.add(g);
  pm.fruits.push(g);
  return g;
}

export function buildPlant(crop: CropId): PlantModel {
  const pm = newPlant();
  switch (crop) {
    case 'radish': {
      const lm = leafMat(pm, '#4aa548');
      ring(pm, lm, 6, 0.17, 0.075, 0.55, 0.06);
      fruitGroup(pm, mesh(G.sphere, mat('#ef4f6f', { rough: 0.45 }), { p: [0, 0.05, 0], s: [0.13, 0.12, 0.13] }));
      break;
    }
    case 'turnip': {
      const lm = leafMat(pm, '#62b552');
      ring(pm, lm, 6, 0.19, 0.085, 0.6, 0.08);
      fruitGroup(
        pm,
        mesh(G.sphere, mat('#f6efe4', { rough: 0.5 }), { p: [0, 0.04, 0], s: [0.15, 0.13, 0.15] }),
        mesh(G.hemi, mat('#a65fcf', { rough: 0.45 }), { p: [0, 0.05, 0], s: [0.155, 0.12, 0.155] }),
      );
      break;
    }
    case 'carrot': {
      const lm = leafMat(pm, '#5dbb45');
      ring(pm, lm, 7, 0.25, 0.035, 0.32, 0.04, 0.4);
      const lm2 = leafMat(pm, '#79cf5a');
      ring(pm, lm2, 5, 0.18, 0.05, 0.62, 0.05, 0.4, 0.4);
      fruitGroup(pm, mesh(G.cyl, mat('#ff8f2e', { rough: 0.5 }), { p: [0, 0.03, 0], s: [0.1, 0.07, 0.1] }));
      break;
    }
    case 'lettuce': {
      const lo = leafMat(pm, '#6fc252');
      ring(pm, lo, 7, 0.17, 0.14, 1.05, 0.03, 0.3);
      const li = leafMat(pm, '#98da6c');
      ring(pm, li, 5, 0.15, 0.12, 0.62, 0.04, 0.3, 0.5);
      const heart = own('#c3ee8d', 0.6);
      pm.fruitMats.push({ m: heart, unripe: new THREE.Color('#9edb72'), ripe: new THREE.Color('#c7f292') });
      fruitGroup(pm, mesh(G.sphere, heart, { p: [0, 0.12, 0], s: [0.13, 0.12, 0.13] }));
      break;
    }
    case 'tomato': {
      const stake = mesh(G.cylLo, mat(C.woodLight), { p: [0.14, 0.45, -0.06], s: [0.025, 0.95, 0.025] });
      pm.body.add(stake);
      pm.props.push(stake);
      const stem = mesh(G.cyl, mat(C.stem), { p: [0, 0.34, 0], s: [0.03, 0.68, 0.03] });
      pm.foliage.add(stem);
      const lm = leafMat(pm, '#4c9c43');
      for (let i = 0; i < 7; i++) {
        const l = leaf(lm, 0.13, 0.085, 1.15, i * 2.3, 0.14 + i * 0.075);
        pm.foliage.add(l);
        pm.leaves.push(l);
      }
      const spots: [number, number, number][] = [[-0.11, 0.42, 0.06], [0.08, 0.55, 0.08], [0.02, 0.3, 0.12]];
      for (const [x, y, z] of spots) {
        const fm = own('#f24c3f', 0.35);
        pm.fruitMats.push({ m: fm, unripe: new THREE.Color('#9bd05a'), ripe: new THREE.Color('#f24c3f') });
        fruitGroup(
          pm,
          mesh(G.sphere, fm, { p: [x, y, z], s: [0.085, 0.078, 0.085] }),
          mesh(G.coneLo, mat('#3f8a3a'), { p: [x, y + 0.075, z], s: [0.05, 0.03, 0.05] }),
        );
      }
      break;
    }
    case 'pea': {
      const wood = mat(C.woodLight);
      for (const x of [-0.2, 0.2]) {
        const post = mesh(G.cylLo, wood, { p: [x, 0.42, -0.08], s: [0.022, 0.84, 0.022] });
        pm.body.add(post);
        pm.props.push(post);
      }
      const bar = mesh(G.cylLo, wood, { p: [0, 0.8, -0.08], s: [0.018, 0.44, 0.018], r: [0, 0, Math.PI / 2] });
      pm.body.add(bar);
      pm.props.push(bar);
      const vineM = mat('#5fb04a');
      for (let i = 0; i < 4; i++) {
        const seg = mesh(G.cylLo, vineM, { p: [(i % 2 ? 0.05 : -0.05), 0.12 + i * 0.17, -0.05], s: [0.018, 0.2, 0.018], r: [0, 0, i % 2 ? 0.45 : -0.45] });
        pm.foliage.add(seg);
      }
      const lm = leafMat(pm, '#78c85a');
      for (let i = 0; i < 8; i++) {
        const l = leaf(lm, 0.075, 0.07, 1.25, i * 2.1, 0.1 + i * 0.085);
        pm.foliage.add(l);
        pm.leaves.push(l);
      }
      const pods: [number, number, number, number][] = [[-0.12, 0.45, 0.04, 0.4], [0.1, 0.58, 0.05, -0.3], [0.02, 0.3, 0.09, 0.2]];
      for (const [x, y, z, rz] of pods) {
        fruitGroup(pm, mesh(G.capsule, mat('#8fdc5c', { rough: 0.5 }), { p: [x, y, z], s: [0.065, 0.11, 0.05], r: [0, 0, rz] }));
      }
      break;
    }
    case 'pumpkin': {
      const lm = leafMat(pm, '#4f9f45');
      ring(pm, lm, 5, 0.22, 0.2, 1.32, 0.02, 0.4);
      const vine = mesh(G.torus, mat('#5fa944'), { p: [0.14, 0.03, 0.12], s: [0.12, 0.12, 0.5], r: [Math.PI / 2, 0, 0] });
      pm.foliage.add(vine);
      const fm = own('#ff8a2a', 0.5);
      pm.fruitMats.push({ m: fm, unripe: new THREE.Color('#9acb55'), ripe: new THREE.Color('#ff8a2a') });
      fruitGroup(pm, pumpkinBody(fm, 1));
      break;
    }
  }
  return pm;
}

function pumpkinBody(m: THREE.Material, s: number): THREE.Group {
  const g = new THREE.Group();
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    g.add(mesh(G.sphere, m, { p: [Math.cos(a) * 0.1 * s, 0.14 * s, Math.sin(a) * 0.1 * s], s: [0.12 * s, 0.14 * s, 0.12 * s], r: [0, -a, 0] }));
  }
  g.add(mesh(G.sphere, m, { p: [0, 0.14 * s, 0], s: [0.15 * s, 0.15 * s, 0.15 * s] }));
  g.add(mesh(G.cyl, mat('#7a5a2a'), { p: [0.01 * s, 0.3 * s, 0], s: [0.025 * s, 0.09 * s, 0.025 * s], r: [0, 0, -0.25] }));
  return g;
}

// ───────────────────────── veggies (the catchable items) ─────────────────────────

/** returns a group centred on the veggie's middle, ~0.32 units across */
export function buildVeggie(crop: CropId, golden = false): THREE.Group {
  const g = new THREE.Group();
  const body = (c: string, rough = 0.45) => (golden ? GOLD() : mat(c, { rough }));
  const green = (c: string) => mat(c, { rough: 0.7 });
  switch (crop) {
    case 'radish':
      g.add(mesh(G.sphere, body('#ef4f6f'), { s: [0.16, 0.15, 0.16] }));
      g.add(mesh(G.cone, mat('#fbeff0'), { p: [0, -0.17, 0], s: [0.04, 0.12, 0.04], r: [Math.PI, 0, 0] }));
      for (let i = 0; i < 3; i++) g.add(leaf(green('#4aa548'), 0.1, 0.05, 0.35, i * 2.1, 0.12));
      break;
    case 'turnip':
      g.add(mesh(G.sphere, body('#f6efe4'), { s: [0.17, 0.16, 0.17] }));
      g.add(mesh(G.hemi, golden ? GOLD() : mat('#a65fcf', { rough: 0.45 }), { p: [0, 0.01, 0], s: [0.175, 0.15, 0.175] }));
      g.add(mesh(G.cone, mat('#f6efe4'), { p: [0, -0.18, 0], s: [0.035, 0.1, 0.035], r: [Math.PI, 0, 0] }));
      for (let i = 0; i < 3; i++) g.add(leaf(green('#62b552'), 0.11, 0.055, 0.35, i * 2.1, 0.13));
      break;
    case 'carrot': {
      const c = mesh(G.cone, body('#ff8f2e', 0.5), { s: [0.11, 0.42, 0.11], r: [0, 0, Math.PI / 2] });
      g.add(c);
      for (let i = 0; i < 4; i++) {
        const l = leaf(green('#5dbb45'), 0.11, 0.035, 0.4, i * 1.6, 0);
        l.rotation.z = -Math.PI / 2;
        l.position.x = -0.2;
        g.add(l);
      }
      break;
    }
    case 'lettuce':
      g.add(mesh(G.sphere, body('#b7ea84', 0.6), { s: [0.17, 0.16, 0.17] }));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        g.add(mesh(G.sphere, golden ? GOLD() : green('#78c95a'), { p: [Math.cos(a) * 0.1, -0.02, Math.sin(a) * 0.1], s: [0.13, 0.12, 0.05], r: [0, -a + Math.PI / 2, 0.3] }));
      }
      break;
    case 'tomato':
      g.add(mesh(G.sphere, body('#f24c3f', 0.32), { s: [0.17, 0.15, 0.17] }));
      for (let i = 0; i < 5; i++) {
        const l = leaf(green('#3f8a3a'), 0.05, 0.025, 1.3, (i / 5) * Math.PI * 2, 0.12);
        g.add(l);
      }
      g.add(mesh(G.cylLo, green('#3f8a3a'), { p: [0, 0.17, 0], s: [0.015, 0.06, 0.015] }));
      break;
    case 'pea': {
      g.add(mesh(G.capsule, body('#8fdc5c', 0.5), { s: [0.11, 0.2, 0.09], r: [0, 0, Math.PI / 2] }));
      for (let i = -1; i <= 1; i++) g.add(mesh(G.sphere, golden ? GOLD() : mat('#b4ec7c', { rough: 0.5 }), { p: [i * 0.08, 0.035, 0.035], s: 0.045 }));
      break;
    }
    case 'pumpkin': {
      const pb = pumpkinBody(golden ? GOLD() : mat('#ff8a2a', { rough: 0.5 }), 1.25);
      pb.position.y = -0.18;
      g.add(pb);
      break;
    }
  }
  return g;
}

export function buildClockFlower(): THREE.Group {
  const g = new THREE.Group();
  const petalM = mat('#9fd8ff', { rough: 0.5 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.add(mesh(G.sphere, petalM, { p: [Math.cos(a) * 0.15, 0, Math.sin(a) * 0.15], s: [0.09, 0.03, 0.06], r: [0, -a, 0] }));
  }
  g.add(mesh(G.cyl, mat('#fffbe8', { rough: 0.4 }), { p: [0, 0.01, 0], s: [0.12, 0.04, 0.12] }));
  g.add(mesh(G.box, mat('#3b3a4a'), { p: [0, 0.035, -0.035], s: [0.015, 0.012, 0.08] }));
  g.add(mesh(G.box, mat('#3b3a4a'), { p: [0.025, 0.035, 0], s: [0.06, 0.012, 0.015] }));
  g.add(mesh(G.sphere, mat('#ff7a59'), { p: [0, 0.04, 0], s: 0.018 }));
  g.rotation.x = -0.9;
  return group(g);
}

// ───────────────────────── critters ─────────────────────────

export interface CritterModel {
  root: THREE.Group;
  body: THREE.Group;
  wingL?: THREE.Group;
  wingR?: THREE.Group;
  head: THREE.Group;
  earL?: THREE.Object3D;
  earR?: THREE.Object3D;
  flashMats: THREE.MeshStandardMaterial[];
}

function eye(x: number, y: number, z: number, s = 1): THREE.Group {
  return group(
    mesh(G.sphere, mat('#ffffff', { rough: 0.3 }), { p: [x, y, z], s: 0.045 * s, shadow: false }),
    mesh(G.sphere, mat('#1d1d26', { rough: 0.2 }), { p: [x + 0.004 * Math.sign(x), y + 0.004, z + 0.03 * s], s: 0.026 * s, shadow: false }),
    mesh(G.sphere, mat('#ffffff', { rough: 0.1 }), { p: [x + 0.012 * Math.sign(x), y + 0.016 * s, z + 0.045 * s], s: 0.009 * s, shadow: false }),
  );
}

export function buildCrow(king = false): CritterModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const featherM = new THREE.MeshStandardMaterial({ color: king ? '#3e2f63' : '#2c3048', roughness: 0.55, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0 });
  const bellyM = new THREE.MeshStandardMaterial({ color: king ? '#6a55a0' : '#4a5274', roughness: 0.6, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0 });
  body.add(mesh(G.sphere, featherM, { p: [0, 0.2, 0], s: [0.19, 0.18, 0.26] }));
  body.add(mesh(G.sphere, bellyM, { p: [0, 0.15, 0.07], s: [0.14, 0.12, 0.17] }));
  body.add(mesh(G.cone, featherM, { p: [0, 0.22, -0.3], s: [0.12, 0.2, 0.04], r: [-Math.PI / 2 - 0.3, 0, 0] }));
  const head = new THREE.Group();
  head.position.set(0, 0.36, 0.17);
  head.add(mesh(G.sphere, featherM, { s: 0.14 }));
  head.add(mesh(G.cone, mat('#ffb43a', { rough: 0.4 }), { p: [0, -0.02, 0.17], s: [0.05, 0.13, 0.04], r: [Math.PI / 2, 0, 0] }));
  head.add(eye(0.065, 0.035, 0.09), eye(-0.065, 0.035, 0.09));
  if (king) {
    const crownM = mat('#ffcf3a', { rough: 0.3, metal: 0.6, emissive: '#ffae00', ei: 0.3 });
    head.add(mesh(G.cyl, crownM, { p: [0, 0.15, -0.01], s: [0.085, 0.06, 0.085] }));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      head.add(mesh(G.coneLo, crownM, { p: [Math.cos(a) * 0.07, 0.21, Math.sin(a) * 0.07 - 0.01], s: [0.025, 0.07, 0.025] }));
    }
    head.add(mesh(G.sphere, mat('#ff4d6d', { rough: 0.2 }), { p: [0, 0.16, 0.08], s: 0.022 }));
  }
  body.add(head);
  const wing = (side: number) => {
    const w = new THREE.Group();
    w.position.set(side * 0.16, 0.25, 0);
    w.add(mesh(G.sphere, featherM, { p: [side * 0.1, 0, -0.02], s: [0.14, 0.04, 0.2] }));
    body.add(w);
    return w;
  };
  const wingL = wing(1);
  const wingR = wing(-1);
  const legM = mat('#ffb43a');
  body.add(mesh(G.cylLo, legM, { p: [0.06, 0.04, 0.02], s: [0.015, 0.08, 0.015] }));
  body.add(mesh(G.cylLo, legM, { p: [-0.06, 0.04, 0.02], s: [0.015, 0.08, 0.015] }));
  if (king) root.scale.setScalar(2.3);
  return { root, body, head, wingL, wingR, flashMats: [featherM, bellyM] };
}

export function buildRabbit(): CritterModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const furM = new THREE.MeshStandardMaterial({ color: '#efe6da', roughness: 0.85, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0 });
  const furD = new THREE.MeshStandardMaterial({ color: '#c9b39b', roughness: 0.85, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0 });
  const pink = mat('#ffaab8', { rough: 0.5 });
  body.add(mesh(G.sphere, furM, { p: [0, 0.17, -0.02], s: [0.19, 0.17, 0.23] }));
  body.add(mesh(G.sphere, furD, { p: [0, 0.2, -0.06], s: [0.16, 0.13, 0.17] }));
  body.add(mesh(G.sphere, mat('#ffffff'), { p: [0, 0.2, -0.25], s: 0.07 }));
  body.add(mesh(G.sphere, furM, { p: [0.09, 0.05, 0.12], s: [0.05, 0.04, 0.08] }));
  body.add(mesh(G.sphere, furM, { p: [-0.09, 0.05, 0.12], s: [0.05, 0.04, 0.08] }));
  const head = new THREE.Group();
  head.position.set(0, 0.32, 0.16);
  head.add(mesh(G.sphere, furM, { s: [0.13, 0.12, 0.13] }));
  head.add(mesh(G.sphere, pink, { p: [0, -0.01, 0.125], s: 0.022 }));
  head.add(mesh(G.sphere, mat('#ffffff'), { p: [0.035, -0.04, 0.1], s: [0.035, 0.03, 0.03] }));
  head.add(mesh(G.sphere, mat('#ffffff'), { p: [-0.035, -0.04, 0.1], s: [0.035, 0.03, 0.03] }));
  head.add(eye(0.06, 0.03, 0.07, 0.9), eye(-0.06, 0.03, 0.07, 0.9));
  const ear = (side: number) => {
    const e = new THREE.Group();
    e.position.set(side * 0.05, 0.09, -0.02);
    e.rotation.z = -side * 0.18;
    e.add(mesh(G.capsule, furM, { p: [0, 0.13, 0], s: [0.07, 0.17, 0.035] }));
    e.add(mesh(G.capsule, pink, { p: [0, 0.13, 0.012], s: [0.04, 0.13, 0.02], shadow: false }));
    head.add(e);
    return e;
  };
  const earL = ear(1);
  const earR = ear(-1);
  body.add(head);
  return { root, body, head, earL, earR, flashMats: [furM, furD] };
}

export function buildTortoise(): THREE.Group {
  const g = new THREE.Group();
  const shell = mat('#6ea24c', { rough: 0.6 });
  g.add(mesh(G.hemi, shell, { p: [0, 0.08, 0], s: [0.3, 0.24, 0.34] }));
  g.add(mesh(G.torus, mat('#c9a865'), { p: [0, 0.09, 0], s: [0.3, 0.34, 0.25], r: [Math.PI / 2, 0, 0] }));
  const plate = mat('#8cc265', { rough: 0.55 });
  g.add(mesh(G.sphere, plate, { p: [0, 0.3, 0], s: [0.1, 0.03, 0.11] }));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(mesh(G.sphere, plate, { p: [Math.cos(a) * 0.17, 0.24, Math.sin(a) * 0.19], s: [0.07, 0.025, 0.07], r: [Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6] }));
  }
  const skin = mat('#c9c27a', { rough: 0.7 });
  const head = new THREE.Group();
  head.position.set(0, 0.13, 0.36);
  head.add(mesh(G.sphere, skin, { s: [0.1, 0.09, 0.11] }));
  head.add(eye(0.05, 0.03, 0.06, 0.8), eye(-0.05, 0.03, 0.06, 0.8));
  head.add(mesh(G.sphere, mat('#ff9fb0'), { p: [0.06, -0.015, 0.06], s: 0.018, shadow: false }));
  head.add(mesh(G.sphere, mat('#ff9fb0'), { p: [-0.06, -0.015, 0.06], s: 0.018, shadow: false }));
  g.add(head);
  for (const [x, z] of [[0.2, 0.18], [-0.2, 0.18], [0.2, -0.18], [-0.2, -0.18]]) {
    g.add(mesh(G.cyl, skin, { p: [x, 0.04, z], s: [0.055, 0.08, 0.055] }));
  }
  g.userData.head = head;
  return g;
}

// ───────────────────────── Granny ─────────────────────────

export function buildGranny(): THREE.Group {
  const g = new THREE.Group();
  const dress = mat('#a88bdb', { rough: 0.8 });
  const skin = mat('#f7c9a6', { rough: 0.6 });
  const hair = mat('#f1eeea', { rough: 0.9 });
  g.add(mesh(G.cone, dress, { p: [0, 0.34, 0], s: [0.3, 0.68, 0.3] }));
  g.add(mesh(G.sphere, dress, { p: [0, 0.62, 0], s: [0.17, 0.16, 0.15] }));
  g.add(mesh(G.rbox, mat('#fff6ea'), { p: [0, 0.38, 0.15], s: [0.26, 0.42, 0.04], r: [0.32, 0, 0] }));
  g.add(mesh(G.sphere, mat('#ff8fa3'), { p: [0.06, 0.32, 0.22], s: [0.03, 0.03, 0.01], shadow: false }));
  const head = new THREE.Group();
  head.position.set(0, 0.86, 0.02);
  head.add(mesh(G.sphere, skin, { s: [0.16, 0.16, 0.15] }));
  head.add(mesh(G.sphere, hair, { p: [0, 0.05, -0.04], s: [0.17, 0.15, 0.15] }));
  head.add(mesh(G.sphere, hair, { p: [0, 0.18, -0.08], s: 0.085 }));
  head.add(mesh(G.sphere, skin, { p: [0, -0.01, 0.15], s: [0.03, 0.028, 0.03] }));
  const glass = mat('#5a4636', { rough: 0.4 });
  head.add(mesh(G.torus, glass, { p: [0.055, 0.025, 0.14], s: 0.04, shadow: false }));
  head.add(mesh(G.torus, glass, { p: [-0.055, 0.025, 0.14], s: 0.04, shadow: false }));
  head.add(mesh(G.sphere, mat('#2b2230'), { p: [0.055, 0.025, 0.135], s: 0.014, shadow: false }));
  head.add(mesh(G.sphere, mat('#2b2230'), { p: [-0.055, 0.025, 0.135], s: 0.014, shadow: false }));
  head.add(mesh(G.sphere, mat('#ffa4a4', { rough: 0.9 }), { p: [0.1, -0.04, 0.1], s: [0.03, 0.02, 0.01], shadow: false }));
  head.add(mesh(G.sphere, mat('#ffa4a4', { rough: 0.9 }), { p: [-0.1, -0.04, 0.1], s: [0.03, 0.02, 0.01], shadow: false }));
  head.add(mesh(G.torus, mat('#b4524f'), { p: [0, -0.065, 0.135], s: [0.03, 0.02, 0.02], r: [0, 0, Math.PI], shadow: false }));
  g.add(head);
  const arm = (side: number) => {
    const a = new THREE.Group();
    a.position.set(side * 0.16, 0.66, 0);
    a.rotation.z = side * 0.35;
    a.add(mesh(G.capsule, dress, { p: [0, -0.13, 0], s: [0.07, 0.2, 0.07] }));
    a.add(mesh(G.sphere, skin, { p: [0, -0.27, 0], s: 0.045 }));
    g.add(a);
    return a;
  };
  g.userData.armL = arm(1);
  g.userData.armR = arm(-1);
  g.userData.head = head;
  return g;
}

// ───────────────────────── props ─────────────────────────

export function buildCart(): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(C.wood);
  const light = mat(C.woodLight);
  g.add(mesh(G.rbox, wood, { p: [0, 0.38, 0], s: [0.95, 0.32, 0.62] }));
  g.add(mesh(G.rbox, light, { p: [0, 0.55, 0.31], s: [1.0, 0.07, 0.06] }));
  g.add(mesh(G.rbox, light, { p: [0, 0.55, -0.31], s: [1.0, 0.07, 0.06] }));
  g.add(mesh(G.rbox, light, { p: [0.49, 0.55, 0], s: [0.06, 0.07, 0.62] }));
  g.add(mesh(G.rbox, light, { p: [-0.49, 0.55, 0], s: [0.06, 0.07, 0.62] }));
  g.add(mesh(G.box, mat('#6b4528'), { p: [0, 0.5, 0], s: [0.86, 0.04, 0.52], shadow: false }));
  const wheel = (z: number) => {
    const w = new THREE.Group();
    w.position.set(0.05, 0.22, z);
    w.add(mesh(G.torus, mat('#7a4f2e'), { s: [0.2, 0.2, 0.5] }));
    w.add(mesh(G.cyl, mat('#d9a86e'), { s: [0.05, 0.08, 0.05], r: [Math.PI / 2, 0, 0] }));
    for (let i = 0; i < 4; i++) w.add(mesh(G.box, mat('#a8744a'), { s: [0.36, 0.025, 0.025], r: [0, 0, (i * Math.PI) / 4] }));
    g.add(w);
  };
  wheel(0.36);
  wheel(-0.36);
  g.add(mesh(G.cylLo, light, { p: [-0.72, 0.5, 0.2], s: [0.025, 0.55, 0.025], r: [0, 0, Math.PI / 2 - 0.3] }));
  g.add(mesh(G.cylLo, light, { p: [-0.72, 0.5, -0.2], s: [0.025, 0.55, 0.025], r: [0, 0, Math.PI / 2 - 0.3] }));
  const pile = new THREE.Group();
  pile.position.set(0, 0.52, 0);
  g.add(pile);
  g.userData.pile = pile;
  return g;
}

export function buildCan(): THREE.Group {
  const g = new THREE.Group();
  const m = mat('#5bb7cf', { rough: 0.35, metal: 0.2 });
  g.add(mesh(G.cyl, m, { p: [0, 0, 0], s: [0.16, 0.24, 0.16] }));
  g.add(mesh(G.cyl, mat('#4aa0b8', { rough: 0.35 }), { p: [0, 0.12, 0], s: [0.165, 0.03, 0.165] }));
  g.add(mesh(G.cyl, m, { p: [0.22, 0.05, 0], s: [0.025, 0.32, 0.025], r: [0, 0, -0.95] }));
  g.add(mesh(G.cone, m, { p: [0.36, 0.15, 0], s: [0.05, 0.06, 0.05], r: [0, 0, -0.95] }));
  g.add(mesh(G.torus, m, { p: [-0.1, 0.12, 0], s: [0.1, 0.1, 0.25], r: [0, 0, 0.4] }));
  return g;
}

export function buildWeed(): { root: THREE.Group; flower: THREE.Object3D } {
  const g = new THREE.Group();
  const m = mat('#5f7f2c', { rough: 0.8 });
  const m2 = mat('#4b6a22', { rough: 0.8 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + Math.random() * 0.4;
    const s = 0.7 + Math.random() * 0.5;
    g.add(mesh(G.coneLo, i % 2 ? m : m2, { p: [Math.cos(a) * 0.08, 0.13 * s, Math.sin(a) * 0.08], s: [0.05, 0.28 * s, 0.025], r: [Math.sin(a) * 0.5, a, -Math.cos(a) * 0.5] }));
  }
  const flower = group(
    mesh(G.cylLo, m2, { p: [0, 0.22, 0], s: [0.012, 0.3, 0.012] }),
    mesh(G.sphere, mat('#b07ad8', { rough: 0.6 }), { p: [0, 0.38, 0], s: 0.05 }),
    mesh(G.sphere, mat('#ffe066'), { p: [0, 0.4, 0.035], s: 0.02 }),
  );
  g.add(flower);
  return { root: g, flower };
}

export function buildRock(): THREE.Group {
  const g = new THREE.Group();
  const a = mat('#a4a3ab', { flat: true, rough: 0.9 });
  const b = mat('#8b8a94', { flat: true, rough: 0.9 });
  g.add(mesh(G.rock, a, { p: [0, 0.14, 0], s: [0.26, 0.2, 0.24], r: [0.3, 0.6, 0.1] }));
  g.add(mesh(G.rock, b, { p: [0.2, 0.08, 0.14], s: [0.13, 0.1, 0.12], r: [0.6, 0.2, 0.5] }));
  g.add(mesh(G.rock, b, { p: [-0.18, 0.07, 0.12], s: [0.11, 0.09, 0.1], r: [0.1, 1.2, 0.3] }));
  g.add(mesh(G.sphere, mat('#93c46a'), { p: [-0.05, 0.3, -0.05], s: [0.09, 0.03, 0.08], shadow: false }));
  return g;
}

export function buildDroplet(): THREE.Group {
  const m = new THREE.MeshStandardMaterial({ color: '#5ab8ff', roughness: 0.15, emissive: new THREE.Color('#2a7ad8'), emissiveIntensity: 0.35 });
  const g = group(
    mesh(G.sphere, m, { s: [0.09, 0.09, 0.09], shadow: false }),
    mesh(G.cone, m, { p: [0, 0.1, 0], s: [0.075, 0.13, 0.075], shadow: false }),
    mesh(G.sphere, mat('#ffffff', { rough: 0.1 }), { p: [-0.03, 0.03, 0.07], s: 0.022, shadow: false }),
  );
  g.userData.mat = m;
  return g;
}
