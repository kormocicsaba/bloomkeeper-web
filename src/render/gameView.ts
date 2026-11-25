import * as THREE from 'three';
import type { CropId } from '../data/crops';
import { Rng } from '../sim/rng';
import type { Sim } from '../sim/sim';
import { PITCH, type ComboKey, type SimEvent, type Tile } from '../sim/types';
import { Fx } from './fx';
import { G, basic, clamp01, disposeObject, easeOutBack, easeOutElastic, group, lerp, mat, mesh, smooth } from './kit';
import {
  C, PLOT_TOP, buildCan, buildCart, buildClockFlower, buildCrow, buildDroplet, buildGranny, buildPlant, buildRabbit, buildRock,
  buildTortoise, buildVeggie, buildWeed, type CritterModel, type PlantModel,
} from './models';
import type { Stage } from './scene';

const Y_OFF = 0.14;
const LANE_TOP = 0.15;

const SOIL_COLORS: Record<string, [string, string]> = {
  loam: ['#b48558', '#6a4428'],
  sandy: ['#ecd29c', '#c49a5e'],
  clay: ['#d79062', '#a3563a'],
};

const LINK_COLORS: Record<ComboKey, string> = {
  radishCarrot: '#ffb36b',
  coolLettuce: '#8ee6ff',
  pumpkinMulch: '#ffcf6b',
  trellis: '#a6f07a',
  rootCellar: '#d9a6ff',
};

export type Pick =
  | { kind: 'veggie'; id: number }
  | { kind: 'critter'; id: number }
  | { kind: 'boss' }
  | { kind: 'tile'; i: number }
  | null;

interface PlotView {
  root: THREE.Group;
  m: THREE.MeshStandardMaterial;
  bump: number;
  shake: number;
  dry: THREE.Color;
  wet: THREE.Color;
}

interface PlantView {
  id: number;
  crop: CropId;
  tile: number;
  pm: PlantModel;
  pop: number;
  squash: number;
  droop: number;
  tint: number;
  phase: number;
  ripeT: number;
}

interface VeggieView {
  id: number;
  g: THREE.Group;
  inner: THREE.Group;
  roll: number;
  lastZ: number;
  golden: boolean;
  clock: boolean;
  sparkT: number;
  land: number;
}

interface Flyer {
  g: THREE.Group;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  kind: 'cart' | 'up' | 'die';
  crop?: CropId;
  golden?: boolean;
}

interface CritterView {
  id: number;
  type: 'crow' | 'rabbit';
  cm: CritterModel;
  last: THREE.Vector3;
  face: number;
  squash: number;
  t: number;
}

interface CanAnim {
  g: THREE.Group;
  x: number;
  z: number;
  t: number;
}

export class GameView {
  readonly root = new THREE.Group();
  readonly fx = new Fx();
  private stage: Stage;
  sim: Sim;

  private plots: (PlotView | null)[] = [];
  private plants = new Map<number, PlantView>();
  private veggies = new Map<number, VeggieView>();
  private critters = new Map<number, CritterView>();
  private weeds = new Map<number, { root: THREE.Group; flower: THREE.Object3D; shown: number; shake: number }>();
  private rocks = new Map<number, { g: THREE.Group; shake: number }>();
  private droplets = new Map<number, THREE.Group>();
  private flyers: Flyer[] = [];
  private cans: CanAnim[] = [];
  private linksGroup = new THREE.Group();
  private linksKey = '';
  private bossView: CritterModel | null = null;
  private bossRing: THREE.Mesh | null = null;
  private bossFace = 0;
  private butterflies: { g: THREE.Group; wl: THREE.Object3D; wr: THREE.Object3D; seed: number; cx: number; cz: number }[] = [];
  private swayers: { o: THREE.Object3D; ph: number; amp: number }[] = [];

  readonly cart: THREE.Group;
  readonly granny: THREE.Group;
  readonly tortoise: THREE.Group | null;
  private cartPile: THREE.Group;
  private pileCount = 0;
  private cartBounce = 0;
  private grannyHop = 0;
  private grannyCheer = 0;
  private grannySad = 0;
  private tortoiseDash = -1;
  private time = 0;

  readonly cartPos: THREE.Vector3;
  readonly grannyPos: THREE.Vector3;

  constructor(stage: Stage, sim: Sim) {
    this.stage = stage;
    this.sim = sim;
    const { halfW, frontZ, backZ, laneZ } = sim;

    this.root.add(this.fx.root, this.linksGroup);
    this.buildGround();
    this.buildBed();
    this.buildLane();
    this.buildDecor();

    this.cart = buildCart();
    this.cart.scale.setScalar(0.82);
    this.cartPos = new THREE.Vector3(halfW + 0.95, 0, laneZ + 0.02);
    this.cart.position.copy(this.cartPos);
    this.cart.rotation.y = 0.12;
    this.cartPile = this.cart.userData.pile;
    this.root.add(this.cart);

    this.granny = buildGranny();
    this.grannyPos = new THREE.Vector3(halfW + 1.05, 0, laneZ - 0.92);
    this.granny.position.copy(this.grannyPos);
    this.granny.rotation.y = -0.55;
    this.root.add(this.granny);

    if (sim.companions.includes('tortoise')) {
      this.tortoise = buildTortoise();
      this.tortoise.scale.setScalar(0.85);
      this.tortoise.position.set(-halfW - 0.55, LANE_TOP - 0.02, laneZ);
      this.tortoise.rotation.y = Math.PI / 2 - 0.25;
      this.root.add(this.tortoise);
    } else this.tortoise = null;

    void frontZ;
    void backZ;
    this.syncAll(0);
  }

  /** World-space points the camera must keep in view. */
  fitPoints(): THREE.Vector3[] {
    const { halfW, backZ, laneZ } = this.sim;
    const left = -halfW - (this.tortoise ? 0.95 : 0.35);
    const right = halfW + 1.45;
    return [
      new THREE.Vector3(left, 0, backZ - 0.35),
      new THREE.Vector3(right, 0, backZ - 0.35),
      new THREE.Vector3(left, 0, laneZ + 0.45),
      new THREE.Vector3(right, 0, laneZ + 0.5),
      new THREE.Vector3(0, 1.0, backZ),
      new THREE.Vector3(this.grannyPos.x, 1.15, this.grannyPos.z),
    ];
  }

  // ───────────────────────── environment ─────────────────────────

  private buildGround() {
    const ground = mesh(new THREE.CircleGeometry(40, 64), mat('#a9d77f', { rough: 0.95 }), { r: [-Math.PI / 2, 0, 0], shadow: false, receive: true });
    this.root.add(ground);
    // softer, lighter lawn patch under the garden
    const patch = mesh(G.disc, mat('#b6df8a', { rough: 0.95 }), { p: [0, 0.004, 0], r: [-Math.PI / 2, 0, 0], shadow: false, receive: true });
    const { halfW, frontZ, laneZ } = this.sim;
    patch.scale.set(halfW + 3.2, frontZ + 2.8, 1);
    patch.position.z = (laneZ - frontZ) * 0.5;
    this.root.add(patch);
  }

  private buildBed() {
    const s = this.sim;
    const { halfW, frontZ, backZ } = s;
    const frameM = mat(C.wood, { rough: 0.7 });
    const frameL = mat(C.woodLight, { rough: 0.7 });
    const t = 0.2;
    const W = halfW * 2 + t * 2 + 0.06;
    const D = frontZ - backZ + t * 2 + 0.06;
    // soil base under the plots
    this.root.add(mesh(G.rbox, mat('#5e3f27', { rough: 1 }), { p: [0, 0.06, 0], s: [halfW * 2 + 0.1, 0.12, frontZ - backZ + 0.1], shadow: false, receive: true }));
    this.root.add(mesh(G.rbox, frameM, { p: [0, 0.15, backZ - t / 2 - 0.03], s: [W, 0.3, t], receive: true }));
    this.root.add(mesh(G.rbox, frameL, { p: [0, 0.1, frontZ + t / 2 + 0.03], s: [W, 0.2, t], receive: true }));
    this.root.add(mesh(G.rbox, frameM, { p: [-halfW - t / 2 - 0.03, 0.14, 0], s: [t, 0.28, D], receive: true }));
    this.root.add(mesh(G.rbox, frameM, { p: [halfW + t / 2 + 0.03, 0.14, 0], s: [t, 0.28, D], receive: true }));
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      this.root.add(mesh(G.rbox, frameL, { p: [x * (halfW + t / 2 + 0.03), z < 0 ? 0.2 : 0.14, z * ((frontZ - backZ) / 2 + t / 2 + 0.03)], s: [t + 0.06, z < 0 ? 0.4 : 0.28, t + 0.06], receive: true }));
    }

    for (const tile of s.tiles) {
      if (tile.rock < 0) {
        this.plots.push(null);
        // grassy hole in the bed
        this.root.add(mesh(G.rboxSoft, mat('#9ccf72'), { p: [tile.x, 0.12, tile.z], s: [PITCH * 0.92, 0.12, PITCH * 0.92], receive: true, shadow: false }));
        continue;
      }
      const [dry, wet] = SOIL_COLORS[tile.soil];
      const m = new THREE.MeshStandardMaterial({ color: dry, roughness: 0.95 });
      const g = new THREE.Group();
      g.position.set(tile.x, 0, tile.z);
      g.add(mesh(G.rboxSoft, m, { p: [0, 0.1, 0], s: [PITCH * 0.9, 0.2, PITCH * 0.9], receive: true, shadow: false }));
      for (let k = -1; k <= 1; k++) {
        g.add(mesh(G.capsule, m, { p: [0, PLOT_TOP - 0.005, k * PITCH * 0.25], s: [0.09, PITCH * 0.62, 0.07], r: [0, 0, Math.PI / 2], receive: true, shadow: false }));
      }
      if (tile.soil === 'sandy') {
        const peb = mat('#f7e6c0');
        for (let k = 0; k < 3; k++) g.add(mesh(G.sphereLo, peb, { p: [(Math.random() - 0.5) * 0.7, PLOT_TOP, (Math.random() - 0.5) * 0.7], s: [0.04, 0.02, 0.035], shadow: false }));
      }
      this.root.add(g);
      this.plots.push({ root: g, m, bump: 0, shake: 0, dry: new THREE.Color(dry), wet: new THREE.Color(wet) });
    }
  }

  private buildLane() {
    const { halfW, laneZ } = this.sim;
    const x0 = -halfW - (this.sim.companions.includes('tortoise') ? 0.95 : 0.3);
    const x1 = halfW + 0.45;
    const n = Math.max(6, Math.round((x1 - x0) / 0.32));
    const w = (x1 - x0) / n;
    const tones = [mat('#e2b88a', { rough: 0.75 }), mat('#d6a979', { rough: 0.75 }), mat('#e9c597', { rough: 0.75 })];
    for (let i = 0; i < n; i++) {
      const x = x0 + w * (i + 0.5);
      this.root.add(mesh(G.rbox, tones[i % 3], { p: [x, LANE_TOP / 2, laneZ + (i % 2 ? 0.015 : -0.015)], s: [w - 0.025, LANE_TOP, 0.66], receive: true }));
    }
    const rail = mat(C.woodDark, { rough: 0.8 });
    this.root.add(mesh(G.rbox, rail, { p: [(x0 + x1) / 2, 0.05, laneZ + 0.36], s: [x1 - x0 + 0.06, 0.1, 0.07], receive: true }));
  }

  private buildDecor() {
    const { halfW, backZ, laneZ, frontZ } = this.sim;
    const rng = new Rng(this.sim.level.id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
    const dec = new THREE.Group();
    this.root.add(dec);

    // fence behind the bed
    const fenceZ = backZ - 0.85;
    const fx0 = -halfW - 1.6;
    const fx1 = halfW + 1.6;
    const post = mat('#f3e3c4', { rough: 0.7 });
    const nPosts = Math.round((fx1 - fx0) / 0.55);
    for (let i = 0; i <= nPosts; i++) {
      const x = fx0 + ((fx1 - fx0) * i) / nPosts;
      dec.add(mesh(G.rbox, post, { p: [x, 0.32, fenceZ], s: [0.11, 0.64, 0.06] }));
      dec.add(mesh(G.coneLo, post, { p: [x, 0.68, fenceZ], s: [0.08, 0.1, 0.04], r: [0, Math.PI / 4, 0] }));
    }
    dec.add(mesh(G.rbox, post, { p: [(fx0 + fx1) / 2, 0.44, fenceZ - 0.04], s: [fx1 - fx0, 0.07, 0.04] }));
    dec.add(mesh(G.rbox, post, { p: [(fx0 + fx1) / 2, 0.2, fenceZ - 0.04], s: [fx1 - fx0, 0.07, 0.04] }));

    // trees
    const trunk = mat('#9a6a45');
    const greens = ['#6fbf5a', '#86cc63', '#5dad55', '#97d46c'].map((c) => mat(c, { rough: 0.85 }));
    const tree = (x: number, z: number, s: number) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.add(mesh(G.cyl, trunk, { p: [0, 0.5 * s, 0], s: [0.1 * s, 1.0 * s, 0.1 * s] }));
      const top = new THREE.Group();
      top.position.y = 1.1 * s;
      const gm = greens[rng.int(greens.length)];
      top.add(mesh(G.sphere, gm, { s: [0.62 * s, 0.55 * s, 0.62 * s] }));
      top.add(mesh(G.sphere, gm, { p: [0.36 * s, -0.15 * s, 0.1 * s], s: 0.4 * s }));
      top.add(mesh(G.sphere, gm, { p: [-0.34 * s, -0.12 * s, -0.05 * s], s: 0.42 * s }));
      top.add(mesh(G.sphere, gm, { p: [0.05 * s, 0.38 * s, 0], s: 0.38 * s }));
      if (rng.chance(0.6)) {
        const fruit = mat(rng.chance(0.5) ? '#ff7f7f' : '#ffd36b', { rough: 0.4 });
        for (let k = 0; k < 5; k++) {
          const a = rng.range(0, Math.PI * 2);
          top.add(mesh(G.sphereLo, fruit, { p: [Math.cos(a) * 0.55 * s, rng.range(-0.2, 0.25) * s, Math.sin(a) * 0.55 * s], s: 0.07 * s }));
        }
      }
      g.add(top);
      this.swayers.push({ o: top, ph: rng.range(0, 6), amp: 0.025 });
      dec.add(g);
    };
    tree(-halfW - 2.2, fenceZ - 0.9, 1.25);
    tree(halfW + 2.4, fenceZ - 0.5, 1.05);
    tree(-halfW - 0.6, fenceZ - 2.1, 1.5);
    tree(halfW + 0.4, fenceZ - 2.4, 1.6);
    tree(-halfW - 3.6, laneZ - 1.2, 1.1);
    tree(halfW + 3.8, laneZ - 2.0, 1.25);
    tree(1.2, fenceZ - 3.6, 1.7);

    // bushes
    const bush = (x: number, z: number, s: number, flowers = true) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const gm = greens[rng.int(greens.length)];
      g.add(mesh(G.sphere, gm, { p: [0, 0.2 * s, 0], s: [0.35 * s, 0.28 * s, 0.32 * s] }));
      g.add(mesh(G.sphere, gm, { p: [0.25 * s, 0.14 * s, 0.05 * s], s: 0.22 * s }));
      g.add(mesh(G.sphere, gm, { p: [-0.22 * s, 0.13 * s, 0.04 * s], s: 0.2 * s }));
      if (flowers) {
        const fc = mat(['#ffffff', '#ffd1e0', '#fff1a6', '#d4c4ff'][rng.int(4)], { rough: 0.5 });
        for (let k = 0; k < 6; k++) {
          const a = rng.range(0, Math.PI * 2);
          g.add(mesh(G.sphereLo, fc, { p: [Math.cos(a) * 0.3 * s, 0.2 * s + rng.range(0, 0.15) * s, Math.sin(a) * 0.28 * s], s: 0.045 * s, shadow: false }));
        }
      }
      dec.add(g);
    };
    bush(-halfW - 1.2, fenceZ + 0.3, 1.1);
    bush(halfW + 1.3, fenceZ + 0.35, 1.0);
    bush(-halfW - 1.0, 0.2, 0.9);
    bush(-halfW - 1.9, frontZ - 0.3, 1.2, false);
    bush(halfW + 2.2, 0.0, 1.1);
    bush(halfW + 2.6, laneZ + 0.2, 0.9, false);
    bush(-halfW - 2.6, laneZ + 0.6, 1.0);

    // flowers & tufts scattered on the lawn (avoid the bed, lane, cart)
    const flowerCols = ['#ff8fa8', '#ffd166', '#ffffff', '#c7a6ff', '#ff9e6b', '#8fd3ff'];
    const stem = mat('#5aa548');
    const tuftM = [mat('#8cc96a'), mat('#7dbd5d'), mat('#9ad677')];
    const blocked = (x: number, z: number) =>
      (Math.abs(x) < halfW + 0.6 && z > fenceZ - 0.2 && z < laneZ + 0.6) ||
      (x > halfW - 0.2 && x < halfW + 2.0 && z > laneZ - 1.6 && z < laneZ + 0.8);
    for (let k = 0; k < 70; k++) {
      const x = rng.range(-halfW - 5, halfW + 5);
      const z = rng.range(fenceZ - 3, laneZ + 3.2);
      if (blocked(x, z)) continue;
      if (rng.chance(0.45)) {
        const c = mat(flowerCols[rng.int(flowerCols.length)], { rough: 0.5 });
        const h = rng.range(0.12, 0.24);
        const g = group(
          mesh(G.cylLo, stem, { p: [0, h / 2, 0], s: [0.012, h, 0.012], shadow: false }),
          ...Array.from({ length: 5 }, (_, i) => {
            const a = (i / 5) * Math.PI * 2;
            return mesh(G.sphereLo, c, { p: [Math.cos(a) * 0.04, h, Math.sin(a) * 0.04], s: [0.035, 0.015, 0.035], shadow: false });
          }),
          mesh(G.sphereLo, mat('#ffe066'), { p: [0, h + 0.01, 0], s: 0.022, shadow: false }),
        );
        g.position.set(x, 0, z);
        dec.add(g);
        this.swayers.push({ o: g, ph: rng.range(0, 6), amp: 0.08 });
      } else {
        const g = new THREE.Group();
        g.position.set(x, 0, z);
        const m = tuftM[rng.int(3)];
        for (let i = 0; i < 4; i++) {
          const a = rng.range(0, Math.PI * 2);
          g.add(mesh(G.coneLo, m, { p: [Math.cos(a) * 0.04, 0.07, Math.sin(a) * 0.04], s: [0.03, 0.16, 0.015], r: [Math.sin(a) * 0.3, a, -Math.cos(a) * 0.3], shadow: false }));
        }
        dec.add(g);
      }
    }

    // stepping stones from the lane to Granny
    const stone = mat('#d9d4c8', { rough: 0.9 });
    for (let k = 0; k < 4; k++) {
      dec.add(mesh(G.disc, stone, { p: [halfW + 0.3 + k * 0.42 + rng.range(-0.05, 0.05), 0.012, laneZ + 0.75 + rng.range(-0.08, 0.08)], s: [0.16, 0.12, 1], r: [-Math.PI / 2, 0, rng.range(0, 3)], shadow: false, receive: true }));
    }

    // butterflies
    for (let k = 0; k < 3; k++) {
      const wm = basic(['#ffd6e7', '#fff3b0', '#cfe8ff'][k], false);
      const wl = mesh(G.disc, wm, { p: [0.06, 0, 0], s: [0.07, 0.05, 1], r: [-Math.PI / 2, 0, 0], shadow: false });
      const wr = mesh(G.disc, wm, { p: [-0.06, 0, 0], s: [0.07, 0.05, 1], r: [-Math.PI / 2, 0, 0], shadow: false });
      (wl.material as THREE.Material).side = THREE.DoubleSide;
      const pl = group(wl);
      const pr = group(wr);
      const body = mesh(G.capsule, mat('#5a4a3a'), { s: [0.02, 0.06, 0.02], r: [Math.PI / 2, 0, 0], shadow: false });
      const g = group(pl, pr, body);
      dec.add(g);
      this.butterflies.push({ g, wl: pl, wr: pr, seed: rng.range(0, 100), cx: rng.range(-halfW, halfW), cz: rng.range(backZ, frontZ) });
    }
  }

  // ───────────────────────── sync ─────────────────────────

  private tileHasView(t: Tile) {
    return !!t.plant;
  }

  private syncAll(dt: number) {
    const s = this.sim;
    // plants
    const seen = new Set<number>();
    for (const t of s.tiles) {
      if (!this.tileHasView(t)) continue;
      const p = t.plant!;
      seen.add(p.id);
      if (!this.plants.has(p.id)) {
        const pm = buildPlant(p.crop);
        pm.root.position.set(t.x, PLOT_TOP, t.z);
        pm.root.rotation.y = (Math.random() - 0.5) * 0.6;
        this.root.add(pm.root);
        this.plants.set(p.id, { id: p.id, crop: p.crop, tile: t.i, pm, pop: dt === 0 ? 1 : 0, squash: 0, droop: 0, tint: 0, phase: Math.random() * 6, ripeT: 0 });
      }
    }
    for (const [id, v] of this.plants) {
      if (!seen.has(id)) {
        this.root.remove(v.pm.root);
        disposeObject(v.pm.root);
        this.plants.delete(id);
      }
    }

    // weeds
    for (const t of s.tiles) {
      const w = this.weeds.get(t.i);
      if (t.weed && !w) {
        const b = buildWeed();
        b.root.position.set(t.x, PLOT_TOP, t.z);
        b.root.scale.setScalar(0.01);
        b.flower.visible = false;
        this.root.add(b.root);
        this.weeds.set(t.i, { root: b.root, flower: b.flower, shown: 0, shake: 0 });
      } else if (!t.weed && w) {
        this.root.remove(w.root);
        this.weeds.delete(t.i);
      }
      const r = this.rocks.get(t.i);
      if (t.rock > 0 && !r) {
        const g = buildRock();
        g.position.set(t.x, PLOT_TOP - 0.04, t.z);
        g.rotation.y = Math.random() * 6;
        this.root.add(g);
        this.rocks.set(t.i, { g, shake: 0 });
      } else if (t.rock <= 0 && r) {
        this.root.remove(r.g);
        this.rocks.delete(t.i);
      }
    }

    // veggies
    const vseen = new Set<number>();
    for (const v of s.veggies) {
      vseen.add(v.id);
      if (!this.veggies.has(v.id)) {
        const inner = v.kind === 'clock' ? buildClockFlower() : buildVeggie(v.crop, v.golden);
        const g = group(inner);
        g.position.set(v.x, v.y + Y_OFF, v.z);
        this.root.add(g);
        this.veggies.set(v.id, { id: v.id, g, inner, roll: 0, lastZ: v.z, golden: v.golden, clock: v.kind === 'clock', sparkT: 0, land: 0 });
      }
    }
    for (const [id, vv] of this.veggies) {
      if (!vseen.has(id)) {
        // removed without an event we handled: just drop it
        this.root.remove(vv.g);
        this.veggies.delete(id);
      }
    }

    // critters
    const cseen = new Set<number>();
    for (const c of s.critters) {
      cseen.add(c.id);
      if (!this.critters.has(c.id)) {
        const cm = c.type === 'crow' ? buildCrow() : buildRabbit();
        cm.root.position.set(c.x, c.y, c.z);
        this.root.add(cm.root);
        this.critters.set(c.id, { id: c.id, type: c.type, cm, last: new THREE.Vector3(c.x, c.y, c.z), face: c.x > 0 ? -Math.PI / 2 : Math.PI / 2, squash: 0, t: Math.random() * 3 });
      }
    }
    for (const [id, cv] of this.critters) {
      if (!cseen.has(id)) {
        this.root.remove(cv.cm.root);
        disposeObject(cv.cm.root);
        this.critters.delete(id);
      }
    }

    // boss
    if (s.boss && !this.bossView) {
      this.bossView = buildCrow(true);
      this.root.add(this.bossView.root);
      this.bossRing = mesh(G.ring, basic('#ffd34d', true, 0.85), { r: [-Math.PI / 2, 0, 0], shadow: false });
      this.bossRing.visible = false;
      this.root.add(this.bossRing);
    }

    // combo links
    const key = s.links.map((l) => `${l.a}-${l.b}-${l.key}`).join('|');
    if (key !== this.linksKey) {
      this.linksKey = key;
      for (const c of [...this.linksGroup.children]) this.linksGroup.remove(c);
      for (const l of s.links) {
        const a = s.tiles[l.a];
        const b = s.tiles[l.b];
        const m = basic(LINK_COLORS[l.key], true, 0.9);
        for (let k = 1; k <= 4; k++) {
          const u = k / 5;
          const dot = mesh(G.sphereLo, m, { p: [lerp(a.x, b.x, u), PLOT_TOP + 0.05, lerp(a.z, b.z, u)], s: 0.035, shadow: false });
          dot.userData.u = u + l.a * 0.13;
          this.linksGroup.add(dot);
        }
      }
    }
  }

  // ───────────────────────── events ─────────────────────────

  private tilePos(i: number, y = PLOT_TOP): THREE.Vector3 {
    const t = this.sim.tiles[i];
    return new THREE.Vector3(t.x, y, t.z);
  }

  bumpTile(i: number, shake = false) {
    const p = this.plots[i];
    if (!p) return;
    if (shake) p.shake = 1;
    else p.bump = 1;
  }

  handle(events: SimEvent[]) {
    const s = this.sim;
    for (const e of events) {
      switch (e.type) {
        case 'plant': {
          const p = this.tilePos(e.tile);
          this.fx.dirt(p.x, p.y + 0.05, p.z, 12, SOIL_COLORS[s.tiles[e.tile].soil][1]);
          this.fx.leaves(p.x, p.y + 0.15, p.z, 4, '#9ee07a');
          this.bumpTile(e.tile);
          break;
        }
        case 'water': {
          const p = this.tilePos(e.tile);
          const can = buildCan();
          can.position.set(p.x - 0.32, 0.95, p.z + 0.05);
          can.scale.setScalar(0.01);
          this.root.add(can);
          this.cans.push({ g: can, x: p.x, z: p.z, t: 0 });
          this.bumpTile(e.tile);
          break;
        }
        case 'pop': {
          const t = s.tiles[e.tile];
          const pv = t.plant ? this.plants.get(t.plant.id) : undefined;
          if (pv) pv.squash = 1;
          this.fx.leaves(t.x, PLOT_TOP + 0.2, t.z, 5);
          this.fx.dirt(t.x, PLOT_TOP + 0.05, t.z, 6, SOIL_COLORS[t.soil][1]);
          break;
        }
        case 'ripe': {
          const t = s.tiles[e.tile];
          this.fx.sparkle(t.x, PLOT_TOP + 0.4, t.z, 6);
          break;
        }
        case 'catch': {
          const vv = this.veggies.get(e.id);
          if (vv) {
            this.veggies.delete(e.id);
            if (e.kind === 'clock') {
              this.flyers.push({ g: vv.g, from: vv.g.position.clone(), to: vv.g.position.clone().add(new THREE.Vector3(0, 2.5, 0)), t: 0, dur: 0.6, kind: 'up' });
              this.fx.sparkle(e.x, e.y + Y_OFF, e.z, 16, '#bfe8ff');
            } else {
              const to = this.cartPile.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.1, (Math.random() - 0.5) * 0.25));
              this.flyers.push({ g: vv.g, from: vv.g.position.clone(), to, t: 0, dur: e.by === 'tortoise' ? 0.4 : 0.5, kind: 'cart', crop: e.crop, golden: e.golden });
              this.fx.sparkle(e.x, e.y + Y_OFF, e.z, e.perfect ? 12 : 6, e.golden ? '#ffe27a' : e.perfect ? '#fff7c2' : '#ffffff');
              if (e.perfect) this.fx.poof(e.x, e.y + Y_OFF, e.z, 5, '#fffbe6');
            }
          }
          break;
        }
        case 'miss': {
          const vv = this.veggies.get(e.id);
          if (vv) {
            this.veggies.delete(e.id);
            this.flyers.push({ g: vv.g, from: vv.g.position.clone(), to: vv.g.position.clone(), t: 0, dur: 0.35, kind: 'die' });
            this.fx.poof(e.x, LANE_TOP + 0.2, e.z, 10, '#f2efe6');
          }
          break;
        }
        case 'plantDone': {
          const p = this.tilePos(e.tile);
          this.fx.leaves(p.x, p.y + 0.15, p.z, 8, '#a8d96f');
          this.bumpTile(e.tile);
          break;
        }
        case 'plantLost': {
          const p = this.tilePos(e.tile);
          this.fx.leaves(p.x, p.y + 0.2, p.z, 10, e.cause === 'rot' ? '#9c7b46' : '#6cc25a');
          this.fx.poof(p.x, p.y + 0.2, p.z, 6, e.cause === 'rot' ? '#c8b48a' : '#ffffff');
          this.bumpTile(e.tile, true);
          this.stage.shake(0.05);
          this.grannySad = 1;
          break;
        }
        case 'critterHit': {
          const cv = this.critters.get(e.id);
          if (cv) {
            cv.squash = 1;
            if (cv.type === 'crow') this.fx.feathers(e.x, e.y + 0.2, e.z, 5);
            else this.fx.fur(e.x, e.y + 0.2, e.z, 5);
          }
          this.fx.sparkle(e.x, e.y + 0.3, e.z, 5, '#ffffff');
          break;
        }
        case 'critterFlee': {
          const cv = this.critters.get(e.id);
          if (cv && e.shooed) {
            const p = cv.cm.root.position;
            if (cv.type === 'crow') this.fx.feathers(p.x, p.y + 0.2, p.z, 9);
            else this.fx.fur(p.x, p.y + 0.2, p.z, 9);
            this.fx.poof(p.x, p.y + 0.2, p.z, 8);
            cv.squash = 1;
          }
          break;
        }
        case 'weedSprout': {
          const p = this.tilePos(e.tile);
          this.fx.dirt(p.x, p.y + 0.05, p.z, 6, '#6b5a2a');
          break;
        }
        case 'weedGrown': {
          const w = this.weeds.get(e.tile);
          if (w) w.shake = 1;
          const p = this.tilePos(e.tile);
          this.fx.petals(p.x, p.y + 0.4, p.z, 4);
          break;
        }
        case 'weedTap': {
          const w = this.weeds.get(e.tile);
          if (w) w.shake = 1;
          const p = this.tilePos(e.tile);
          this.fx.leaves(p.x, p.y + 0.2, p.z, 5, '#5f7f2c');
          break;
        }
        case 'weedPulled': {
          const p = this.tilePos(e.tile);
          this.fx.leaves(p.x, p.y + 0.2, p.z, 9, '#5f7f2c');
          this.fx.dirt(p.x, p.y + 0.05, p.z, 8);
          this.bumpTile(e.tile);
          break;
        }
        case 'rockHit': {
          const r = this.rocks.get(e.tile);
          if (r) r.shake = 1;
          const p = this.tilePos(e.tile);
          this.fx.dirt(p.x, p.y + 0.15, p.z, 6, '#9a99a3');
          this.fx.dust(p.x, p.y + 0.2, p.z, 6);
          if (e.left === 0) {
            this.fx.poof(p.x, p.y + 0.2, p.z, 12, '#e8e4dc');
            this.bumpTile(e.tile);
          }
          this.stage.shake(0.025);
          break;
        }
        case 'pay':
          this.grannyCheer = 1;
          this.fx.coins(this.grannyPos.x, 1.0, this.grannyPos.z, 6);
          break;
        case 'combo':
          for (const ti of e.tiles) {
            const p = this.tilePos(ti);
            this.fx.sparkle(p.x, p.y + 0.35, p.z, 8, '#d7ffb0');
          }
          break;
        case 'bossHit': {
          const b = s.boss;
          if (b && this.bossView) {
            this.fx.feathers(b.x, b.y + 0.5, b.z, 10, '#3e2f63');
            this.fx.sparkle(b.x, b.y + 0.8, b.z, 8, '#ffe27a');
          }
          this.stage.shake(0.07);
          break;
        }
        case 'bossPhase':
          if (e.phase === 'perch' && s.boss) {
            this.fx.dust(s.boss.x, 0.3, s.boss.z, 10);
            this.stage.shake(0.06);
          }
          if (e.phase === 'defeated' && s.boss) {
            this.fx.feathers(s.boss.x, s.boss.y + 0.5, s.boss.z, 20, '#3e2f63');
            this.fx.confetti(0, 1, 0, 40);
          }
          break;
        case 'won':
          this.grannyCheer = 2.5;
          this.fx.confetti(0, 1.2, 0, 90);
          break;
        case 'lost':
          this.grannySad = 2;
          break;
        case 'dash':
          this.tortoiseDash = 0;
          break;
        case 'fail':
          if (e.tile !== undefined) this.bumpTile(e.tile, true);
          break;
        default:
          break;
      }
    }
  }

  // ───────────────────────── frame ─────────────────────────

  update(dt: number) {
    this.time += dt;
    const T = this.time;
    const s = this.sim;
    this.syncAll(dt);

    // plots
    for (let i = 0; i < this.plots.length; i++) {
      const p = this.plots[i];
      if (!p) continue;
      const t = s.tiles[i];
      const target = new THREE.Color().lerpColors(p.dry, p.wet, smooth(t.moisture * 1.15));
      if (t.smothered) target.lerp(new THREE.Color('#7d5a7e'), 0.35);
      p.m.color.lerp(target, 1 - Math.exp(-dt * 6));
      p.bump = Math.max(0, p.bump - dt * 3.2);
      p.shake = Math.max(0, p.shake - dt * 3);
      const b = Math.sin(p.bump * Math.PI) * 0.12;
      p.root.scale.set(1 + b * 0.4, 1 - b, 1 + b * 0.4);
      p.root.position.x = t.x + Math.sin(p.shake * 40) * p.shake * 0.05;
    }

    // plants
    for (const pv of this.plants.values()) {
      const t = s.tiles[pv.tile];
      const p = t.plant;
      if (!p) continue;
      const pm = pv.pm;
      pv.pop = Math.min(1, pv.pop + dt * 2.2);
      pv.squash = Math.max(0, pv.squash - dt * 3.5);
      const g = p.growth;
      const foliage = p.fruited ? 1 : 0.22 + 0.78 * smooth(g / 0.6);
      const popS = easeOutElastic(pv.pop);
      const sq = Math.sin(pv.squash * Math.PI) * 0.25;
      const ripe = g >= 1;
      if (ripe) pv.ripeT += dt;
      else pv.ripeT = 0;
      const ripeWiggle = ripe ? Math.sin(pv.ripeT * 28) * 0.06 * Math.min(1, pv.ripeT * 4) : 0;
      pm.body.scale.set(popS * (1 + sq * 0.6), popS * (1 - sq) * (pv.droop > 0.4 ? 0.92 : 1), popS * (1 + sq * 0.6));
      pm.foliage.scale.setScalar(Math.max(0.01, foliage));
      const eaten = p.eatenBy ? Math.sin(T * 38) * 0.07 : 0;
      pm.body.rotation.z = Math.sin(T * 1.7 + pv.phase) * 0.035 + ripeWiggle + eaten;
      pm.body.rotation.x = Math.sin(T * 1.3 + pv.phase * 1.7) * 0.025;

      const fr = smooth((g - 0.5) / 0.5);
      for (const f of pm.fruits) f.scale.setScalar(Math.max(0.001, fr));
      const ripeCol = smooth((g - 0.72) / 0.28);
      for (const fm of pm.fruitMats) fm.m.color.lerpColors(fm.unripe, fm.ripe, ripeCol);
      for (const pr of pm.props) pr.scale.y = pr.scale.y; // props stay full size

      const mood = p.mood;
      const wantDroop = mood === 'yellow' ? 0.9 : mood === 'wilt' ? 0.6 : mood === 'thirsty' ? 0.22 : 0;
      const wantTint = mood === 'yellow' ? 0.85 : mood === 'wilt' ? 0.35 : mood === 'thirsty' ? 0.12 : 0;
      const k = 1 - Math.exp(-dt * 3);
      pv.droop += (wantDroop - pv.droop) * k;
      pv.tint += (wantTint - pv.tint) * k;
      for (const l of pm.leaves) {
        const tilt = l.userData.tilt as THREE.Object3D;
        const base = l.userData.baseTilt as number;
        tilt.rotation.x = base + (1.6 - base) * pv.droop + Math.sin(T * 2.1 + pv.phase + l.rotation.y) * 0.04;
      }
      const yellow = new THREE.Color('#d8c05a');
      for (const lm of pm.leafMats) lm.m.color.copy(lm.base).lerp(yellow, pv.tint);
    }

    // thirsty droplets
    for (const t of s.tiles) {
      const want = !!t.plant && t.plant.mood !== 'ok' && !s.level.noThirst;
      let d = this.droplets.get(t.i);
      if (want && !d) {
        d = buildDroplet();
        d.scale.setScalar(0.01);
        d.userData.t = 0;
        this.root.add(d);
        this.droplets.set(t.i, d);
      }
      if (!d) continue;
      if (!want) {
        d.scale.multiplyScalar(Math.exp(-dt * 14));
        if (d.scale.x < 0.02) {
          this.root.remove(d);
          this.droplets.delete(t.i);
        }
        continue;
      }
      d.userData.t += dt;
      const urgent = t.plant!.mood !== 'thirsty';
      const tall = t.plant!.crop === 'tomato' || t.plant!.crop === 'pea' ? 0.45 : 0;
      const sc = easeOutBack(Math.min(1, d.userData.t * 3)) * (1 + (urgent ? Math.sin(T * 10) * 0.12 : 0));
      d.scale.setScalar(sc * 1.15);
      d.position.set(t.x + 0.22, PLOT_TOP + 0.62 + tall + Math.sin(T * 3 + t.i) * 0.05, t.z - 0.1);
      const m = d.userData.mat as THREE.MeshStandardMaterial;
      m.color.set(t.plant!.mood === 'yellow' ? '#ff8a6a' : '#5ab8ff');
      m.emissive.set(t.plant!.mood === 'yellow' ? '#d84a2a' : '#2a7ad8');
    }

    // weeds
    for (const [i, w] of this.weeds) {
      const t = s.tiles[i];
      if (!t.weed) continue;
      w.shake = Math.max(0, w.shake - dt * 3);
      const g = t.weed.growth;
      w.shown += (g - w.shown) * (1 - Math.exp(-dt * 8));
      const sc = 0.3 + 0.75 * w.shown;
      w.root.scale.set(sc, sc * (1 + Math.sin(w.shake * Math.PI) * 0.25), sc);
      w.root.rotation.z = Math.sin(w.shake * 30) * w.shake * 0.25 + Math.sin(T * 1.5 + i) * 0.04;
      w.flower.visible = g >= 1;
      if (g >= 1) w.flower.scale.setScalar(easeOutBack(Math.min(1, (w.shown - 0.97) * 30)));
    }

    // rocks
    for (const [i, r] of this.rocks) {
      const t = s.tiles[i];
      r.shake = Math.max(0, r.shake - dt * 4);
      const sc = 0.65 + 0.12 * t.rock;
      r.g.scale.setScalar(sc * (1 - Math.sin(r.shake * Math.PI) * 0.1));
      r.g.position.x = t.x + Math.sin(r.shake * 50) * r.shake * 0.05;
    }

    // veggies
    for (const v of s.veggies) {
      const vv = this.veggies.get(v.id);
      if (!vv) continue;
      const g = vv.g;
      const y = v.y + Y_OFF + (v.phase === 'lane' ? 0.04 : 0);
      g.position.set(v.x, y, v.z);
      const dz = v.z - vv.lastZ;
      vv.lastZ = v.z;
      if (vv.clock) {
        vv.inner.rotation.y += dt * 2.5;
        g.position.y = Math.max(y, 0.55) + Math.sin(T * 4) * 0.06;
        g.scale.setScalar(1 + Math.sin(T * 6) * 0.06);
        vv.sparkT += dt;
        if (vv.sparkT > 0.2) {
          vv.sparkT = 0;
          this.fx.sparkle(v.x, g.position.y, v.z, 1, '#bfe8ff');
        }
        continue;
      }
      if (v.phase === 'pop') {
        vv.inner.rotation.x += dt * 9 * (v.spin > 0 ? 1 : -1);
        vv.inner.rotation.z += dt * 4 * v.spin;
        const u = v.t / v.popDur;
        const st = 1 + Math.sin(u * Math.PI) * 0.15;
        g.scale.set(1 / Math.sqrt(st), st, 1 / Math.sqrt(st));
      } else if (v.phase === 'roll') {
        vv.inner.rotation.x += dz / 0.16;
        vv.inner.rotation.y += dt * v.spin * 1.5;
        g.scale.setScalar(1);
        if (v.t < 0.05) this.fx.dust(v.x, PLOT_TOP + 0.05, v.z, 2);
      } else {
        if (vv.land === 0) {
          vv.land = 1;
          this.fx.dust(v.x, LANE_TOP + 0.05, v.z, 3);
        }
        vv.land = Math.max(0.001, vv.land - dt * 3);
        // settle upright-ish and wobble
        vv.inner.rotation.x *= Math.exp(-dt * 6);
        vv.inner.rotation.z = Math.sin(T * 5 + v.id) * 0.08;
        const sq = Math.sin(vv.land * Math.PI) * 0.2;
        let sc = 1;
        if (Number.isFinite(v.laneLeft) && v.laneLeft < 1.6) {
          const blink = Math.sin(T * (10 + (1.6 - v.laneLeft) * 14));
          sc = 1 + blink * 0.08;
          g.visible = blink > -0.55;
        } else g.visible = true;
        g.scale.set(sc * (1 + sq), sc * (1 - sq), sc * (1 + sq));
      }
      if (vv.golden) {
        vv.sparkT += dt;
        if (vv.sparkT > 0.15) {
          vv.sparkT = 0;
          this.fx.sparkle(v.x, y + 0.1, v.z, 1, '#ffe27a');
        }
      }
    }

    // flyers (caught / missed veggies)
    for (let k = this.flyers.length - 1; k >= 0; k--) {
      const f = this.flyers[k];
      f.t += dt;
      const u = Math.min(1, f.t / f.dur);
      if (f.kind === 'cart') {
        const e = smooth(u);
        f.g.position.lerpVectors(f.from, f.to, e);
        f.g.position.y += Math.sin(u * Math.PI) * 1.2;
        f.g.scale.setScalar(lerp(1.15, 0.62, e));
        f.g.rotation.y += dt * 10;
        f.g.visible = true;
      } else if (f.kind === 'up') {
        f.g.position.lerpVectors(f.from, f.to, smooth(u));
        f.g.scale.setScalar(1 + u * 0.8);
      } else {
        f.g.scale.setScalar(Math.max(0.001, 1 - u));
        f.g.rotation.y += dt * 8;
      }
      if (u >= 1) {
        this.flyers.splice(k, 1);
        this.root.remove(f.g);
        if (f.kind === 'cart' && f.crop) this.addToPile(f.crop, !!f.golden);
      }
    }

    // watering cans
    for (let k = this.cans.length - 1; k >= 0; k--) {
      const c = this.cans[k];
      c.t += dt;
      const t = c.t;
      const appear = easeOutBack(Math.min(1, t / 0.18));
      const leave = t > 0.75 ? 1 - Math.min(1, (t - 0.75) / 0.2) : 1;
      c.g.scale.setScalar(Math.max(0.001, appear * leave * 0.95));
      c.g.rotation.z = -Math.min(1, t / 0.25) * 0.7 * (t > 0.75 ? leave : 1);
      if (t > 0.18 && t < 0.78) {
        const spout = new THREE.Vector3(0.36, 0.15, 0).applyMatrix4(c.g.matrixWorld);
        this.fx.pour(spout.x, spout.y, spout.z);
        if (Math.random() < 0.25) this.fx.water(c.x + (Math.random() - 0.5) * 0.3, PLOT_TOP + 0.05, c.z + (Math.random() - 0.5) * 0.3, 2);
      }
      if (t > 0.95) {
        this.root.remove(c.g);
        this.cans.splice(k, 1);
      }
    }

    // critters
    for (const c of s.critters) {
      const cv = this.critters.get(c.id);
      if (!cv) continue;
      cv.t += dt;
      const r = cv.cm.root;
      r.position.set(c.x, c.y, c.z);
      const dx = c.x - cv.last.x;
      const dz = c.z - cv.last.z;
      cv.last.set(c.x, c.y, c.z);
      if (Math.hypot(dx, dz) > 0.0005) {
        const want = Math.atan2(dx, dz);
        let d = want - cv.face;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        cv.face += d * (1 - Math.exp(-dt * 10));
      } else if (c.phase === 'eat') {
        // face the camera-ish while munching
        let d = 0.25 * Math.sign(c.x || 1) * -1 - cv.face;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        cv.face += d * (1 - Math.exp(-dt * 4));
      }
      r.rotation.y = cv.face;
      cv.squash = Math.max(0, cv.squash - dt * 4);
      const sq = Math.sin(cv.squash * Math.PI) * 0.3;
      for (const m of cv.cm.flashMats) m.emissiveIntensity = c.hitFlash * 0.9;
      const body = cv.cm.body;
      if (cv.type === 'crow') {
        const flying = c.phase !== 'eat';
        const flap = flying ? Math.sin(cv.t * 24) * 0.9 : 0.1 + Math.sin(cv.t * 3) * 0.05;
        if (cv.cm.wingL) cv.cm.wingL.rotation.z = flap;
        if (cv.cm.wingR) cv.cm.wingR.rotation.z = -flap;
        cv.cm.head.rotation.x = c.phase === 'eat' ? Math.max(0, Math.sin(cv.t * 13)) * 0.7 : 0;
        body.rotation.x = flying ? 0.15 : 0.35;
        body.scale.set(1 + sq, 1 - sq, 1 + sq);
      } else {
        const hop = c.phase !== 'eat' ? Math.max(0, (c.y - 0.18) / 0.45) : 0;
        const st = c.phase !== 'eat' ? 1 + hop * 0.18 - (hop < 0.08 ? 0.12 : 0) : 1 + Math.sin(cv.t * 12) * 0.03;
        body.scale.set((1 + sq) / Math.sqrt(st), (1 - sq) * st, (1 + sq) / Math.sqrt(st));
        cv.cm.head.rotation.x = c.phase === 'eat' ? 0.35 + Math.sin(cv.t * 16) * 0.12 : 0;
        if (cv.cm.earL) cv.cm.earL.rotation.x = Math.sin(cv.t * 7) * 0.15 - hop * 0.6;
        if (cv.cm.earR) cv.cm.earR.rotation.x = Math.sin(cv.t * 7 + 1) * 0.15 - hop * 0.6;
        r.position.y = c.phase === 'eat' ? PLOT_TOP - 0.02 : c.y;
      }
    }

    // boss
    const b = s.boss;
    if (b && this.bossView) {
      const bv = this.bossView;
      bv.root.position.set(b.x, b.y, b.z);
      const flying = b.phase !== 'perch';
      const flap = flying ? Math.sin(T * (b.phase === 'swoop' ? 8 : 14)) * 0.9 : 0.15;
      if (bv.wingL) bv.wingL.rotation.z = b.phase === 'swoop' ? 1.1 : flap;
      if (bv.wingR) bv.wingR.rotation.z = b.phase === 'swoop' ? -1.1 : -flap;
      for (const m of bv.flashMats) m.emissiveIntensity = b.hitFlash * 0.9;
      let face = 0;
      if (b.phase === 'high') face = b.angle + Math.PI;
      else if (b.phase === 'perch') face = Math.sin(T * 1.3) * 0.4;
      let d = face - this.bossFace;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.bossFace += d * (1 - Math.exp(-dt * 5));
      bv.root.rotation.y = this.bossFace;
      bv.body.rotation.x = b.phase === 'swoop' ? 0.6 : b.phase === 'perch' ? 0.1 : 0.15;
      bv.head.rotation.x = b.phase === 'perch' ? Math.sin(T * 2) * 0.12 : 0;
      if (b.phase === 'defeated') {
        bv.root.rotation.z += dt * 10;
        bv.root.scale.setScalar(2.3 * Math.max(0.05, 1 - b.t / b.dur));
      }
      const sq = Math.sin(b.hitFlash * Math.PI) * 0.18;
      bv.body.scale.set(1 + sq, 1 - sq, 1 + sq);
      if (this.bossRing) {
        this.bossRing.visible = b.phase === 'perch';
        this.bossRing.position.set(b.x, LANE_TOP + 0.03, b.z);
        this.bossRing.scale.setScalar(2.2 + Math.sin(T * 8) * 0.2);
      }
    }

    // cart, granny, tortoise
    this.cartBounce = Math.max(0, this.cartBounce - dt * 3);
    const cb = Math.sin(this.cartBounce * Math.PI) * 0.08;
    this.cart.scale.set(0.82 * (1 + cb), 0.82 * (1 - cb), 0.82 * (1 + cb));

    const gr = this.granny;
    this.grannyHop = Math.max(0, this.grannyHop - dt * 3);
    this.grannyCheer = Math.max(0, this.grannyCheer - dt);
    this.grannySad = Math.max(0, this.grannySad - dt * 0.8);
    const hop = Math.sin(this.grannyHop * Math.PI) * 0.12 + (this.grannyCheer > 0 ? Math.abs(Math.sin(T * 9)) * 0.1 : 0);
    gr.position.y = hop;
    const head = gr.userData.head as THREE.Object3D;
    head.rotation.z = Math.sin(T * 1.2) * 0.06;
    head.rotation.x = this.grannySad > 0 ? 0.3 * Math.min(1, this.grannySad) : Math.sin(T * 0.9) * 0.04;
    const armL = gr.userData.armL as THREE.Object3D;
    const armR = gr.userData.armR as THREE.Object3D;
    const cheer = Math.min(1, this.grannyCheer * 2);
    armL.rotation.z = lerp(0.35 + Math.sin(T * 1.1) * 0.04, 2.6 + Math.sin(T * 12) * 0.25, cheer);
    armR.rotation.z = lerp(-0.35 - Math.sin(T * 1.1) * 0.04, -2.6 - Math.sin(T * 12 + 1) * 0.25, cheer);
    gr.scale.set(1, 1 + Math.sin(T * 2) * 0.012, 1);

    if (this.tortoise) {
      const tt = this.tortoise;
      const th = tt.userData.head as THREE.Object3D;
      th.position.z = 0.36 + Math.sin(T * 1.4) * 0.02;
      th.rotation.y = Math.sin(T * 0.7) * 0.3;
      const home = -s.halfW - 0.55;
      if (this.tortoiseDash >= 0) {
        this.tortoiseDash += dt;
        const u = this.tortoiseDash / 1.3;
        const far = s.halfW + 0.2;
        const x = u < 0.5 ? lerp(home, far, smooth(u * 2)) : lerp(far, home, smooth((u - 0.5) * 2));
        tt.position.x = x;
        tt.rotation.y = u < 0.5 ? Math.PI / 2 : -Math.PI / 2;
        tt.position.y = LANE_TOP - 0.02 + Math.abs(Math.sin(u * 40)) * 0.03;
        if (Math.random() < 0.5) this.fx.dust(x, LANE_TOP + 0.05, s.laneZ, 1);
        if (u >= 1) {
          this.tortoiseDash = -1;
          tt.rotation.y = Math.PI / 2 - 0.25;
          tt.position.x = home;
        }
      }
    }

    // links shimmer
    for (const d of this.linksGroup.children) {
      const u = d.userData.u as number;
      d.scale.setScalar(0.03 + Math.max(0, Math.sin(T * 4 - u * 9)) * 0.03);
      d.position.y = PLOT_TOP + 0.06 + Math.sin(T * 3 + u * 6) * 0.02;
    }

    // ambient life
    for (const sw of this.swayers) sw.o.rotation.z = Math.sin(T * 1.2 + sw.ph) * sw.amp;
    for (const bf of this.butterflies) {
      const tt = T * 0.5 + bf.seed;
      const x = bf.cx + Math.sin(tt * 0.9) * 1.8 + Math.sin(tt * 2.3) * 0.3;
      const z = bf.cz + Math.cos(tt * 0.7) * 1.2;
      const y = 0.8 + Math.sin(tt * 3.1) * 0.25;
      const prev = bf.g.position.clone();
      bf.g.position.set(x, y, z);
      bf.g.rotation.y = Math.atan2(x - prev.x, z - prev.z);
      const flap = Math.sin(T * 26 + bf.seed) * 1.1;
      bf.wl.rotation.z = flap;
      bf.wr.rotation.z = -flap;
    }

    this.fx.update(dt);
  }

  private addToPile(crop: CropId, golden: boolean) {
    this.cartBounce = 1;
    this.grannyHop = 1;
    if (this.pileCount >= 16) {
      // recycle the oldest so the pile keeps "growing" visually without exploding
      const first = this.cartPile.children[0];
      if (first) this.cartPile.remove(first);
    } else this.pileCount++;
    const v = buildVeggie(crop, golden);
    const n = this.cartPile.children.length;
    const layer = Math.floor(n / 6);
    v.position.set((Math.random() - 0.5) * 0.7, 0.05 + layer * 0.14 + Math.random() * 0.04, (Math.random() - 0.5) * 0.38);
    v.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    v.scale.setScalar(0.62);
    this.cartPile.add(v);
  }

  // ───────────────────────── picking & anchors ─────────────────────────

  veggieWorld(id: number): THREE.Vector3 | null {
    const vv = this.veggies.get(id);
    return vv ? vv.g.position.clone() : null;
  }

  critterWorld(id: number): THREE.Vector3 | null {
    const cv = this.critters.get(id);
    return cv ? cv.cm.root.position.clone().add(new THREE.Vector3(0, 0.25, 0)) : null;
  }

  bossWorld(): THREE.Vector3 | null {
    return this.bossView ? this.bossView.root.position.clone().add(new THREE.Vector3(0, 0.6, 0)) : null;
  }

  tileWorld(i: number, y = PLOT_TOP): THREE.Vector3 {
    return this.tilePos(i, y);
  }

  private pp = { x: 0, y: 0, visible: true };

  /** veggies under a screen point (for swipe catching) */
  veggiesNear(sx: number, sy: number, radius: number): number[] {
    const out: number[] = [];
    for (const v of this.sim.veggies) {
      const vv = this.veggies.get(v.id);
      if (!vv) continue;
      const p = this.stage.project(vv.g.position, this.pp);
      if (Math.hypot(p.x - sx, p.y - sy) < radius) out.push(v.id);
    }
    return out;
  }

  pick(sx: number, sy: number): Pick {
    const s = this.sim;
    const unit = this.stage.pixelScale(new THREE.Vector3(0, 0, 0));
    if (s.boss && s.boss.phase !== 'defeated' && this.bossView) {
      const p = this.stage.project(this.bossWorld()!, this.pp);
      if (Math.hypot(p.x - sx, p.y - sy) < Math.max(56, unit * 0.75)) return { kind: 'boss' };
    }
    let best: Pick = null;
    let bd = Infinity;
    for (const c of s.critters) {
      if (c.phase === 'flee') continue;
      const w = this.critterWorld(c.id);
      if (!w) continue;
      const p = this.stage.project(w, this.pp);
      const d = Math.hypot(p.x - sx, p.y - sy);
      if (d < Math.max(44, unit * 0.48) && d < bd) {
        bd = d;
        best = { kind: 'critter', id: c.id };
      }
    }
    if (best) return best;
    for (const v of s.veggies) {
      const vv = this.veggies.get(v.id);
      if (!vv) continue;
      const p = this.stage.project(vv.g.position, this.pp);
      const d = Math.hypot(p.x - sx, p.y - sy);
      if (d < Math.max(48, unit * 0.5) && d < bd) {
        bd = d;
        best = { kind: 'veggie', id: v.id };
      }
    }
    if (best) return best;
    // tiles: raycast onto the plot tops, then fall back to the nearest projected plot centre
    const hit = this.stage.groundAt(sx, sy, PLOT_TOP);
    if (hit) {
      for (const t of s.tiles) {
        if (t.rock < 0) continue;
        if (Math.abs(hit.x - t.x) <= PITCH / 2 && Math.abs(hit.z - t.z) <= PITCH / 2) return { kind: 'tile', i: t.i };
      }
    }
    for (const t of s.tiles) {
      if (t.rock < 0) continue;
      const p = this.stage.project(new THREE.Vector3(t.x, PLOT_TOP + 0.3, t.z), this.pp);
      const d = Math.hypot(p.x - sx, p.y - sy);
      if (d < unit * 0.45 && d < bd) {
        bd = d;
        best = { kind: 'tile', i: t.i };
      }
    }
    return best;
  }

  dispose() {
    this.fx.clear();
    disposeObject(this.root);
  }
}

void clamp01;
