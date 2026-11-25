import * as THREE from 'three';
import { G, basic, mat } from './kit';

type Kind = 'water' | 'dirt' | 'leaf' | 'sparkle' | 'feather' | 'coin' | 'confetti' | 'poof' | 'petal' | 'dust';

interface P {
  mesh: THREE.Mesh;
  alive: boolean;
  t: number;
  life: number;
  vx: number;
  vy: number;
  vz: number;
  grav: number;
  drag: number;
  spin: THREE.Vector3;
  s0: number;
  s1: number;
  floor: number;
  kind: Kind;
}

const CONFETTI = ['#ff7a8a', '#ffd166', '#7bd389', '#6ec6ff', '#c99cff', '#ffa45b'];

/** Pooled little meshes. Cheap enough for a few hundred at a time on phones. */
export class Fx {
  readonly root = new THREE.Group();
  private pool: P[] = [];
  private free: P[] = [];
  private live: P[] = [];

  constructor(size = 360) {
    for (let i = 0; i < size; i++) {
      const m = new THREE.Mesh(G.sphereLo, basic('#ffffff'));
      m.visible = false;
      m.castShadow = false;
      m.frustumCulled = false;
      this.root.add(m);
      const p: P = { mesh: m, alive: false, t: 0, life: 1, vx: 0, vy: 0, vz: 0, grav: 0, drag: 0, spin: new THREE.Vector3(), s0: 1, s1: 0, floor: -99, kind: 'dust' };
      this.pool.push(p);
      this.free.push(p);
    }
  }

  private take(): P | null {
    const p = this.free.pop() ?? this.live.shift() ?? null;
    if (!p) return null;
    p.alive = true;
    p.t = 0;
    p.mesh.visible = true;
    p.mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    p.spin.set(0, 0, 0);
    p.floor = -99;
    this.live.push(p);
    return p;
  }

  private emit(kind: Kind, x: number, y: number, z: number, o: {
    geo: THREE.BufferGeometry; m: THREE.Material; life: number; speed: number; up: number; grav: number; drag?: number;
    s0: number; s1?: number; spread?: number; spin?: number; floor?: number; sx?: number; sy?: number; sz?: number;
  }) {
    const p = this.take();
    if (!p) return;
    p.kind = kind;
    p.mesh.geometry = o.geo;
    p.mesh.material = o.m;
    p.mesh.position.set(x + (Math.random() - 0.5) * (o.spread ?? 0), y, z + (Math.random() - 0.5) * (o.spread ?? 0));
    const a = Math.random() * Math.PI * 2;
    const sp = o.speed * (0.5 + Math.random() * 0.7);
    p.vx = Math.cos(a) * sp;
    p.vz = Math.sin(a) * sp;
    p.vy = o.up * (0.6 + Math.random() * 0.6);
    p.grav = o.grav;
    p.drag = o.drag ?? 1.2;
    p.life = o.life * (0.75 + Math.random() * 0.5);
    p.s0 = o.s0;
    p.s1 = o.s1 ?? 0;
    p.floor = o.floor ?? -99;
    const sr = o.spin ?? 0;
    p.spin.set((Math.random() - 0.5) * sr, (Math.random() - 0.5) * sr, (Math.random() - 0.5) * sr);
    p.mesh.scale.set(o.s0 * (o.sx ?? 1), o.s0 * (o.sy ?? 1), o.s0 * (o.sz ?? 1));
    p.mesh.userData.shape = [o.sx ?? 1, o.sy ?? 1, o.sz ?? 1];
  }

  water(x: number, y: number, z: number, n = 16) {
    const m = basic('#7cc9ff', true, 0.9);
    for (let i = 0; i < n; i++) this.emit('water', x, y, z, { geo: G.sphereLo, m, life: 0.6, speed: 0.9, up: 1.4, grav: 9, s0: 0.045, s1: 0.02, spread: 0.25, floor: 0.2 });
  }

  pour(x: number, y: number, z: number) {
    const m = basic('#8fd3ff', true, 0.85);
    for (let i = 0; i < 2; i++) this.emit('water', x, y, z, { geo: G.sphereLo, m, life: 0.45, speed: 0.15, up: -0.5, grav: 7, s0: 0.035, s1: 0.025, spread: 0.06, floor: 0.2 });
  }

  dirt(x: number, y: number, z: number, n = 10, color = '#7a5232') {
    const m = mat(color, { rough: 1 });
    for (let i = 0; i < n; i++) this.emit('dirt', x, y, z, { geo: G.sphereLo, m, life: 0.55, speed: 1.2, up: 2.2, grav: 10, s0: 0.05, s1: 0.03, spread: 0.2, floor: 0.2 });
  }

  leaves(x: number, y: number, z: number, n = 8, color = '#6cc25a') {
    const m = mat(color, { rough: 0.7 });
    for (let i = 0; i < n; i++) this.emit('leaf', x, y, z, { geo: G.sphereLo, m, life: 1.0, speed: 1.1, up: 2.0, grav: 4, drag: 2.2, s0: 0.06, s1: 0.04, spread: 0.2, spin: 10, sy: 0.25, sx: 1.4, floor: 0.2 });
  }

  sparkle(x: number, y: number, z: number, n = 10, color = '#fff2a8') {
    const m = basic(color, true, 0.95);
    for (let i = 0; i < n; i++) this.emit('sparkle', x, y, z, { geo: G.box, m, life: 0.7, speed: 1.4, up: 1.6, grav: 1, drag: 3, s0: 0.07, s1: 0, spread: 0.15, spin: 8 });
  }

  feathers(x: number, y: number, z: number, n = 7, color = '#2f3450') {
    const m = mat(color, { rough: 0.8 });
    for (let i = 0; i < n; i++) this.emit('feather', x, y, z, { geo: G.sphereLo, m, life: 1.3, speed: 1.4, up: 1.4, grav: 1.2, drag: 2.5, s0: 0.08, s1: 0.05, spread: 0.15, spin: 6, sx: 0.4, sy: 0.12, sz: 1.2, floor: 0.2 });
  }

  fur(x: number, y: number, z: number, n = 7) {
    const m = mat('#f3ebe0', { rough: 1 });
    for (let i = 0; i < n; i++) this.emit('poof', x, y, z, { geo: G.sphereLo, m, life: 0.7, speed: 1.2, up: 1.2, grav: 0.8, drag: 3, s0: 0.07, s1: 0.0, spread: 0.2 });
  }

  coins(x: number, y: number, z: number, n = 5) {
    const m = mat('#ffcf3e', { rough: 0.25, metal: 0.6, emissive: '#ffb000', ei: 0.4 });
    for (let i = 0; i < n; i++) this.emit('coin', x, y, z, { geo: G.cyl, m, life: 0.7, speed: 1.0, up: 3.2, grav: 11, drag: 0.6, s0: 0.07, s1: 0.06, spread: 0.1, spin: 14, sy: 0.25, floor: 0.2 });
  }

  poof(x: number, y: number, z: number, n = 10, color = '#ffffff') {
    const m = basic(color, true, 0.8);
    for (let i = 0; i < n; i++) this.emit('poof', x, y, z, { geo: G.sphereLo, m, life: 0.55, speed: 1.3, up: 0.6, grav: -0.4, drag: 4, s0: 0.12, s1: 0.0, spread: 0.12 });
  }

  dust(x: number, y: number, z: number, n = 4) {
    const m = basic('#efe2c8', true, 0.7);
    for (let i = 0; i < n; i++) this.emit('dust', x, y, z, { geo: G.sphereLo, m, life: 0.45, speed: 0.5, up: 0.4, grav: -0.2, drag: 3, s0: 0.06, s1: 0.0, spread: 0.08 });
  }

  confetti(x: number, y: number, z: number, n = 60) {
    for (let i = 0; i < n; i++) {
      const m = basic(CONFETTI[i % CONFETTI.length]);
      this.emit('confetti', x, y, z, { geo: G.box, m, life: 2.4, speed: 3.2, up: 6, grav: 6, drag: 1.6, s0: 0.09, s1: 0.07, spread: 1.5, spin: 12, sy: 0.15, sz: 0.6, floor: 0.05 });
    }
  }

  petals(x: number, y: number, z: number, n = 10) {
    for (let i = 0; i < n; i++) {
      const m = basic(['#ffd1dc', '#fff2b0', '#ffffff'][i % 3]);
      this.emit('petal', x, y, z, { geo: G.sphereLo, m, life: 1.4, speed: 1.6, up: 2.4, grav: 2, drag: 2, s0: 0.06, s1: 0.04, spread: 0.3, spin: 8, sy: 0.2, floor: 0.2 });
    }
  }

  update(dt: number) {
    for (let k = this.live.length - 1; k >= 0; k--) {
      const p = this.live[k];
      p.t += dt;
      const u = p.t / p.life;
      if (u >= 1) {
        p.alive = false;
        p.mesh.visible = false;
        this.live.splice(k, 1);
        this.free.push(p);
        continue;
      }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vz *= d;
      if (p.kind === 'leaf' || p.kind === 'feather' || p.kind === 'confetti' || p.kind === 'petal') {
        p.vx += Math.sin(p.t * 5 + p.s0 * 100) * dt * 1.5;
      }
      p.vy -= p.grav * dt;
      const pos = p.mesh.position;
      pos.x += p.vx * dt;
      pos.y += p.vy * dt;
      pos.z += p.vz * dt;
      if (pos.y < p.floor) {
        pos.y = p.floor;
        p.vy = Math.abs(p.vy) * 0.25;
        p.vx *= 0.5;
        p.vz *= 0.5;
        p.spin.multiplyScalar(0.6);
      }
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.rotation.z += p.spin.z * dt;
      const sh = p.mesh.userData.shape as number[];
      const pop = p.kind === 'sparkle' || p.kind === 'poof' ? Math.sin(Math.min(1, u * 3) * Math.PI * 0.5) : 1;
      const s = (p.s0 + (p.s1 - p.s0) * u) * pop;
      p.mesh.scale.set(s * sh[0], s * sh[1], s * sh[2]);
    }
  }

  clear() {
    for (const p of this.live) {
      p.alive = false;
      p.mesh.visible = false;
      this.free.push(p);
    }
    this.live = [];
  }
}
