import * as THREE from 'three';
import { disposeObject } from './kit';

export interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * The Stage owns the renderer, camera, lights and the "world" root that a level view fills.
 * The camera always looks at the garden from the front at a fixed toy-diorama angle and
 * auto-fits whatever bounds it is given into the space between the HUD and the seed tray.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  readonly world = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;

  width = 1;
  height = 1;
  insets: Insets = { top: 0, bottom: 0, left: 0, right: 0 };

  private fitPoints: THREE.Vector3[] = [];
  private target = new THREE.Vector3();
  private dist = 12;
  private wantTarget = new THREE.Vector3();
  private wantDist = 12;
  private elevation = 0.92; // radians above the horizon
  private yaw = 0;
  private orbit = 0;
  private shakeAmp = 0;
  private shakeT = 0;
  private time = 0;
  private bg = new THREE.Color('#dff0cf');

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene.background = this.bg;
    this.scene.fog = new THREE.Fog(this.bg, 18, 42);

    this.hemi = new THREE.HemisphereLight('#fff6e6', '#9cc77f', 1.55);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight('#fff0d4', 2.6);
    this.sun.position.set(-4.5, 10, 6.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.radius = 5;
    const sc = this.sun.shadow.camera;
    sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 30;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    const fill = new THREE.DirectionalLight('#d8e8ff', 0.55);
    fill.position.set(6, 4, -3);
    this.scene.add(fill);

    this.scene.add(this.world);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  setBackground(color: string) {
    this.bg.set(color);
    (this.scene.fog as THREE.Fog).color.set(color);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.applyFit(true);
  }

  /** Points (world space) that must stay visible inside the safe rect. */
  setFit(points: THREE.Vector3[], snap = false) {
    this.fitPoints = points;
    this.applyFit(snap);
  }

  setInsets(i: Partial<Insets>, snap = false) {
    this.insets = { ...this.insets, ...i };
    this.applyFit(snap);
  }

  /** slow orbit for the title screen */
  setOrbit(speed: number) {
    this.orbit = speed;
    if (!speed) this.yaw = 0;
  }

  shake(amount: number) {
    this.shakeAmp = Math.max(this.shakeAmp, amount);
  }

  private applyFit(snap: boolean) {
    if (!this.fitPoints.length) return;
    const box = new THREE.Box3().setFromPoints(this.fitPoints);
    const c = box.getCenter(new THREE.Vector3());
    this.wantTarget.set(c.x, 0, c.z);
    // tall phone screens: look down more steeply so the garden fills the height instead of floating in lawn
    const { top, bottom, left, right } = this.insets;
    const safeW = Math.max(1, this.width - left - right);
    const safeH = Math.max(1, this.height - top - bottom);
    const tall = Math.min(1, Math.max(0, (safeH / safeW - 0.9) / 0.5));
    this.elevation = 0.92 + tall * 0.26;
    this.configureView();
    // binary search the camera distance that fits every point inside the safe rect
    let lo = 2;
    let hi = 80;
    for (let k = 0; k < 22; k++) {
      const mid = (lo + hi) / 2;
      if (this.fits(this.wantTarget, mid)) hi = mid;
      else lo = mid;
    }
    this.wantDist = hi;
    this.centerVertically();
    if (snap) {
      this.target.copy(this.wantTarget);
      this.dist = this.wantDist;
    }
  }

  /** width-bound fits leave vertical slack: slide the target so the garden sits mid-way in the safe rect */
  private centerVertically() {
    const { top, bottom } = this.insets;
    const want = top + (this.height - bottom - top) * 0.54; // a touch low: trees fill the top, bare lawn the bottom
    const cx = this.width / 2;
    for (let k = 0; k < 4; k++) {
      this.placeCamera(this.wantTarget, this.wantDist);
      let minY = Infinity;
      let maxY = -Infinity;
      for (const p of this.fitPoints) {
        this.tmp.copy(p).project(this.camera);
        const sy = (-this.tmp.y * 0.5 + 0.5) * this.height;
        minY = Math.min(minY, sy);
        maxY = Math.max(maxY, sy);
      }
      const mid = (minY + maxY) / 2;
      if (Math.abs(mid - want) < 1) break;
      const a = this.groundAt(cx, mid, 0);
      const b = this.groundAt(cx, want, 0);
      if (!a || !b) break;
      this.wantTarget.z += a.z - b.z;
    }
  }

  private configureView() {
    const w = this.width;
    const h = this.height;
    const { top, bottom, left, right } = this.insets;
    const dx = (left - right) / 2;
    const dy = (top - bottom) / 2;
    const fw = w + Math.abs(dx) * 2;
    const fh = h + Math.abs(dy) * 2;
    this.camera.aspect = fw / fh;
    this.camera.setViewOffset(fw, fh, Math.abs(dx) - dx, Math.abs(dy) - dy, w, h);
    this.camera.updateProjectionMatrix();
  }

  private placeCamera(target: THREE.Vector3, dist: number, yaw = 0) {
    const el = this.elevation;
    this.camera.position.set(
      target.x + Math.sin(yaw) * Math.cos(el) * dist,
      target.y + Math.sin(el) * dist,
      target.z + Math.cos(yaw) * Math.cos(el) * dist,
    );
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld();
  }

  private tmp = new THREE.Vector3();

  private fits(target: THREE.Vector3, dist: number): boolean {
    this.placeCamera(target, dist);
    const { top, bottom, left, right } = this.insets;
    const pad = Math.min(this.width, this.height) * 0.03;
    for (const p of this.fitPoints) {
      this.tmp.copy(p).project(this.camera);
      const sx = (this.tmp.x * 0.5 + 0.5) * this.width;
      const sy = (-this.tmp.y * 0.5 + 0.5) * this.height;
      if (sx < left + pad || sx > this.width - right - pad || sy < top + pad || sy > this.height - bottom - pad || this.tmp.z > 1) return false;
    }
    return true;
  }

  /** world → CSS pixel coordinates */
  project(p: THREE.Vector3, out = { x: 0, y: 0, visible: true }) {
    this.tmp.copy(p).project(this.camera);
    out.x = (this.tmp.x * 0.5 + 0.5) * this.width;
    out.y = (-this.tmp.y * 0.5 + 0.5) * this.height;
    out.visible = this.tmp.z < 1;
    return out;
  }

  /** pixels per world unit at a world position (for pick radii) */
  pixelScale(p: THREE.Vector3): number {
    const a = this.project(p, { x: 0, y: 0, visible: true });
    const b = this.project(this.tmp.copy(p).add(new THREE.Vector3(0.5, 0, 0)), { x: 0, y: 0, visible: true });
    return Math.hypot(a.x - b.x, a.y - b.y) * 2;
  }

  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  /** screen → point on the horizontal plane y = h */
  groundAt(sx: number, sy: number, h: number): THREE.Vector3 | null {
    const ndc = new THREE.Vector2((sx / this.width) * 2 - 1, -(sy / this.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    this.plane.constant = -h;
    const out = new THREE.Vector3();
    return this.ray.ray.intersectPlane(this.plane, out);
  }

  render(dt: number) {
    this.time += dt;
    const k = 1 - Math.exp(-dt * 5);
    this.target.lerp(this.wantTarget, k);
    this.dist += (this.wantDist - this.dist) * k;
    if (this.orbit) this.yaw = Math.sin(this.time * this.orbit) * 0.32;

    this.configureView();
    const breathe = Math.sin(this.time * 0.35) * 0.006;
    this.placeCamera(this.target, this.dist * (1 + breathe), this.yaw);
    // keep the haze behind the garden no matter how far a tall screen pushes the camera
    const fog = this.scene.fog as THREE.Fog;
    fog.near = this.dist + 6;
    fog.far = this.dist + 30;

    if (this.shakeAmp > 0.001) {
      this.shakeT += dt * 60;
      const a = this.shakeAmp;
      this.camera.position.x += Math.sin(this.shakeT * 1.7) * a;
      this.camera.position.y += Math.cos(this.shakeT * 2.3) * a * 0.6;
      this.shakeAmp *= Math.exp(-dt * 9);
    }

    // keep the shadow frustum hugging the garden
    this.sun.target.position.copy(this.target);
    this.sun.position.set(this.target.x - 4.5, 10, this.target.z + 6.5);

    this.renderer.render(this.scene, this.camera);
  }

  clearWorld() {
    for (const c of [...this.world.children]) {
      this.world.remove(c);
      disposeObject(c);
    }
  }
}
