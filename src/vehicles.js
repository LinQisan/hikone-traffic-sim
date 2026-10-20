// Newly lofted abstract bodies: sedan, two kei cars and two box trucks.
// Keep the experiment's dimensions and per-car paint mechanism.
import * as THREE from 'three';
import { loadedModel, material } from './world.js';
import { painted } from './style.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { withBlobShadow } from './blob-shadow.js';

export const BODY_MODEL = { sedan: 'WEB_Sedan', 'kei-tall': 'ART_KeiBox', 'kei-hatch': 'HK_Kei_Hatch' };
// pearl white, silver, black, ivory, pale pink, sky blue, mint, red (VehicleBodies.asset)
export const PAINTS = [[0.93, 0.93, 0.91], [0.72, 0.73, 0.75], [0.08, 0.08, 0.09], [0.86, 0.81, 0.7],
  [0.9, 0.74, 0.76], [0.58, 0.72, 0.82], [0.65, 0.8, 0.72], [0.62, 0.1, 0.12]];
const paints = new WeakMap();
function coloredMaterial(base, color) {
  if (!paints.has(base)) paints.set(base, new Map());
  const palette = paints.get(base), key = color.join(',');
  if (!palette.has(key)) palette.set(key, painted(Object.assign(base.clone(), {
    color: new THREE.Color().setRGB(...color, THREE.SRGBColorSpace),
  })));
  return palette.get(key);
}

/**
 * A standalone mesh group of a preloaded model (cars, parked trucks, signals, replay copies).
 * `steerable`: the front wheels (tyre and hub) become their own meshes on pivots at the wheel
 * centres; group.userData.steer(degrees, + = right) turns them. `moving`: a car that drives (live
 * traffic, replay copies) — a shadow pool instead of casting into the town's shadow map
 * (blob-shadow.js); parked vehicles keep real shadows.
 */
export function instance(name, materials, { paint = null, shadow = true, steerable = false, moving = false } = {}) {
  const group = new THREE.Group();
  const split = steerable ? frontWheels(name) : null;
  const parts = split?.body ?? loadedModel(name);
  let paintMaterial = null;
  if (split) {
    const pivots = split.wheels.map(w => {
      const pivot = new THREE.Group();
      pivot.position.copy(w.center);
      const mesh = new THREE.Mesh(w.geometry, material(materials, w.material));
      mesh.castShadow = shadow; mesh.receiveShadow = true;
      pivot.add(mesh);
      group.add(pivot);
      return pivot;
    });
    // three.js turns anticlockwise about +y; Unity's steer (like its yaw) is clockwise
    group.userData.steer = degrees => { for (const p of pivots) p.rotation.y = -degrees * Math.PI / 180; };
  }
  for (const part of parts) {
    let m = material(materials, part.material);
    if (paint && m.name === 'HK_KeiPaint') {
      paintMaterial ??= coloredMaterial(m, paint);
      m = paintMaterial;
    }
    const mesh = new THREE.Mesh(part.geometry, m);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(part.matrix);
    mesh.castShadow = shadow && !m.transparent;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  group.name = name;
  if (moving) {
    const box = footprint(name);
    withBlobShadow(group, box.x + 0.9, box.z + 1.0, box.y * 0.45);
  }
  return group;
}

const footprints = new Map();
/** Width (x) and length (z) of a model, measured once. */
function footprint(name) {
  if (!footprints.has(name)) {
    const box = new THREE.Box3(), part = new THREE.Box3();
    for (const p of loadedModel(name)) {
      p.geometry.computeBoundingBox();
      box.union(part.copy(p.geometry.boundingBox).applyMatrix4(p.matrix));
    }
    footprints.set(name, box.getSize(new THREE.Vector3()));
  }
  return footprints.get(name);
}

// ------------------------------------------------------------------ front wheels
// The models carry all four wheels in their tyre (HK_Rubber) and hub (ART_FrameLight) meshes. The
// two front wheels are cut out once per model: the tyre triangles ahead of the centre give each
// wheel's centre and radius, and every tyre or hub triangle inside that wheel goes with it.
const WHEEL_MATERIALS = new Set(['HK_Rubber', 'ART_FrameLight']);
const splits = new Map();

function triangles(part) {
  const g = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
  g.applyMatrix4(part.matrix);
  return g;
}

/** Copy of `geometry` (non-indexed) with only the triangles whose index passes `keep`. */
function subset(geometry, keep, offset = null) {
  const count = geometry.getAttribute('position').count / 3;
  const chosen = [];
  for (let t = 0; t < count; t++) if (keep(t)) chosen.push(t);
  const out = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const size = attribute.itemSize, array = new attribute.array.constructor(chosen.length * 3 * size);
    chosen.forEach((t, i) => array.set(attribute.array.subarray(t * 3 * size, (t + 1) * 3 * size), i * 3 * size));
    out.setAttribute(name, new THREE.BufferAttribute(array, size, attribute.normalized));
  }
  if (offset) out.translate(-offset.x, -offset.y, -offset.z);
  out.computeBoundingSphere();
  return out;
}

export function frontWheels(name) {
  if (splits.has(name)) return splits.get(name);
  const parts = loadedModel(name).map(part => ({ part, geometry: triangles(part) }));
  const centroid = (g, t, out = new THREE.Vector3()) => {
    const p = g.getAttribute('position');
    return out.set((p.getX(3 * t) + p.getX(3 * t + 1) + p.getX(3 * t + 2)) / 3,
      (p.getY(3 * t) + p.getY(3 * t + 1) + p.getY(3 * t + 2)) / 3, (p.getZ(3 * t) + p.getZ(3 * t + 1) + p.getZ(3 * t + 2)) / 3);
  };
  // the front tyres' extents, one per side (models face +z)
  const boxes = [new THREE.Box3(), new THREE.Box3()], c = new THREE.Vector3(), v = new THREE.Vector3();
  for (const { part, geometry } of parts) {
    if (part.material.name !== 'HK_Rubber') continue;
    const pos = geometry.getAttribute('position');
    for (let t = 0; t < pos.count / 3; t++) {
      if (centroid(geometry, t, c).z <= 0.3) continue;
      for (let k = 0; k < 3; k++) boxes[c.x > 0 ? 1 : 0].expandByPoint(v.fromBufferAttribute(pos, 3 * t + k));
    }
  }
  const wheels = boxes.filter(b => !b.isEmpty()).map(box => ({ box, center: box.getCenter(new THREE.Vector3()),
    radius: (box.max.y - box.min.y) / 2, inner: Math.min(Math.abs(box.min.x), Math.abs(box.max.x)) }));
  const which = (g, t) => {
    centroid(g, t, c);
    return wheels.findIndex(w => Math.sign(c.x) === Math.sign(w.center.x) && Math.abs(c.x) >= w.inner - 0.02
      && Math.hypot(c.y - w.center.y, c.z - w.center.z) <= w.radius + 0.03);
  };
  const body = [], pieces = wheels.map(() => []);
  for (const { part, geometry } of parts) {
    if (!WHEEL_MATERIALS.has(part.material.name)) { body.push(part); continue; }
    const owner = Array.from({ length: geometry.getAttribute('position').count / 3 }, (_, t) => which(geometry, t));
    body.push({ ...part, geometry: subset(geometry, t => owner[t] < 0), matrix: new THREE.Matrix4() });
    wheels.forEach((w, k) => pieces[k].push({ geometry: subset(geometry, t => owner[t] === k, w.center), material: part.material }));
  }
  // one mesh per wheel: tyre and hub keep their own pigment (vertex colours) under the tyre's material
  const tyre = pieces.map(list => list.find(p => p.material.name === 'HK_Rubber')?.material);
  const result = {
    body,
    wheels: wheels.map((w, k) => ({ center: w.center, radius: w.radius, material: tyre[k],
      geometry: mergeGeometries(pieces[k].map(p => p.geometry)) })),
  };
  splits.set(name, result);
  return result;
}

export function paintFor(seed) {
  return PAINTS[Math.abs(seed) % PAINTS.length];
}
