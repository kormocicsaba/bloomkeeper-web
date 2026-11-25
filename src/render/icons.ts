import * as THREE from 'three';
import { CROP_ORDER, type CropId } from '../data/crops';
import { buildCrow, buildGranny, buildRabbit, buildTortoise, buildVeggie } from './models';

/**
 * Renders the real 3D models into little PNG icons once at boot so the DOM UI
 * (seed tray, goals, coach portrait) matches the diorama exactly.
 */
const cache = new Map<string, string>();

export function icon(key: string): string {
  return cache.get(key) ?? '';
}

export function renderIcons(): void {
  const size = 160;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setSize(size, size, false);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.NeutralToneMapping;
  r.toneMappingExposure = 1.1;
  r.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fffaf0', '#b8d9a0', 2.0));
  const key = new THREE.DirectionalLight('#fff3dd', 2.4);
  key.position.set(-2, 3, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#dfeeff', 1.0);
  rim.position.set(3, 2, -2);
  scene.add(rim);
  const cam = new THREE.PerspectiveCamera(26, 1, 0.01, 50);

  const shoot = (name: string, obj: THREE.Object3D, opts: { yaw?: number; pitch?: number; pad?: number; lookY?: number } = {}) => {
    const holder = new THREE.Group();
    holder.add(obj);
    obj.rotation.y = opts.yaw ?? 0.5;
    scene.add(holder);
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3());
    const sz = box.getSize(new THREE.Vector3());
    const rad = Math.max(sz.x, sz.y, sz.z) * 0.5 * (opts.pad ?? 1.2);
    const d = rad / Math.sin(THREE.MathUtils.degToRad(13));
    const pitch = opts.pitch ?? 0.35;
    cam.position.set(c.x, c.y + Math.sin(pitch) * d, c.z + Math.cos(pitch) * d);
    cam.lookAt(c.x, c.y + (opts.lookY ?? 0), c.z);
    r.render(scene, cam);
    cache.set(name, canvas.toDataURL('image/png'));
    scene.remove(holder);
  };

  for (const crop of CROP_ORDER as CropId[]) shoot(`veg:${crop}`, buildVeggie(crop), { yaw: 0.6, pad: 1.05 });
  shoot('veg:golden', buildVeggie('carrot', true), { yaw: 0.6, pad: 1.05 });
  shoot('crow', buildCrow().root, { yaw: 0.9, pad: 1.1 });
  shoot('rabbit', buildRabbit().root, { yaw: 0.9, pad: 1.1 });
  shoot('crowKing', buildCrow(true).root, { yaw: 0.8, pad: 1.05 });
  shoot('tortoise', buildTortoise(), { yaw: 0.9, pad: 1.05 });

  // granny portrait: head & shoulders
  const granny = buildGranny();
  granny.updateMatrixWorld(true);
  const gb = new THREE.Box3().setFromObject(granny);
  const gh = gb.max.y;
  const holder = new THREE.Group();
  holder.add(granny);
  granny.rotation.y = 0.25;
  scene.add(holder);
  cam.position.set(0, gh * 0.8, gh * 1.25);
  cam.lookAt(0, gh * 0.74, 0);
  r.render(scene, cam);
  cache.set('granny', canvas.toDataURL('image/png'));
  scene.remove(holder);

  r.dispose();
  r.forceContextLoss();
}
