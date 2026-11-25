import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Shared geometries & material cache so hundreds of little meshes stay cheap. */
export const G = {
  sphere: new THREE.SphereGeometry(1, 22, 16),
  sphereLo: new THREE.SphereGeometry(1, 12, 9),
  hemi: new THREE.SphereGeometry(1, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 18),
  cylLo: new THREE.CylinderGeometry(1, 1, 1, 8),
  cone: new THREE.ConeGeometry(1, 1, 18),
  coneLo: new THREE.ConeGeometry(1, 1, 7),
  capsule: new THREE.CapsuleGeometry(0.5, 1, 6, 14),
  torus: new THREE.TorusGeometry(1, 0.12, 8, 28),
  box: new THREE.BoxGeometry(1, 1, 1),
  rbox: new RoundedBoxGeometry(1, 1, 1, 3, 0.14),
  rboxSoft: new RoundedBoxGeometry(1, 1, 1, 4, 0.3),
  rock: new THREE.IcosahedronGeometry(1, 1),
  ring: new THREE.RingGeometry(0.42, 0.5, 40),
  disc: new THREE.CircleGeometry(1, 28),
};

const cache = new Map<string, THREE.Material>();

export function mat(color: string | number, opts: { rough?: number; emissive?: string; ei?: number; flat?: boolean; metal?: number } = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${opts.rough ?? 0.78}|${opts.emissive ?? ''}|${opts.ei ?? 0}|${opts.flat ? 1 : 0}|${opts.metal ?? 0}`;
  let m = cache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.rough ?? 0.78,
      metalness: opts.metal ?? 0,
      flatShading: !!opts.flat,
    });
    if (opts.emissive) {
      m.emissive = new THREE.Color(opts.emissive);
      m.emissiveIntensity = opts.ei ?? 0.4;
    }
    m.userData.shared = true;
    cache.set(key, m);
  }
  return m;
}

export function basic(color: string | number, transparent = false, opacity = 1): THREE.MeshBasicMaterial {
  const key = `basic|${color}|${transparent}|${opacity}`;
  let m = cache.get(key) as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent, opacity, depthWrite: !transparent });
    m.userData.shared = true;
    cache.set(key, m);
  }
  return m;
}

export interface MeshOpts {
  p?: [number, number, number];
  s?: [number, number, number] | number;
  r?: [number, number, number];
  shadow?: boolean;
  receive?: boolean;
}

export function mesh(geo: THREE.BufferGeometry, material: THREE.Material, o: MeshOpts = {}): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  if (o.p) m.position.set(o.p[0], o.p[1], o.p[2]);
  if (o.s !== undefined) {
    if (typeof o.s === 'number') m.scale.setScalar(o.s);
    else m.scale.set(o.s[0], o.s[1], o.s[2]);
  }
  if (o.r) m.rotation.set(o.r[0], o.r[1], o.r[2]);
  m.castShadow = o.shadow ?? true;
  m.receiveShadow = o.receive ?? false;
  return m;
}

export function group(...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  for (const c of children) g.add(c);
  return g;
}

/** a soft leaf: flattened sphere, pivoted at its base, pointing up/out */
export function leaf(material: THREE.Material, len: number, wid: number, tiltOut: number, yaw: number, y = 0): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.y = y;
  pivot.rotation.y = yaw;
  const tilt = new THREE.Group();
  tilt.rotation.x = tiltOut;
  const l = mesh(G.sphere, material, { p: [0, len, 0], s: [wid, len, wid * 0.32] });
  tilt.add(l);
  pivot.add(tilt);
  pivot.userData.tilt = tilt;
  pivot.userData.baseTilt = tiltOut;
  return pivot;
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
export const easeOutBack = (x: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
export const easeOutElastic = (x: number) => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
};

/** dispose per-object materials (shared geometries & cached materials are kept) */
export function disposeObject(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const x of mats) if (!x.userData?.shared) x.dispose();
  });
}
