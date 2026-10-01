// Car and parked-vehicle meshes. Bodies: the web sedan, the two kei cars and the two box trucks
// (the same Blender models as the Unity project). Paint is tinted per car like VehicleBody does.
import * as THREE from 'three';
import { loadedModel, material } from './world.js';

export const BODY_MODEL = { sedan: 'WEB_Sedan', 'kei-tall': 'HK_Kei_Tall', 'kei-hatch': 'HK_Kei_Hatch' };
// pearl white, silver, black, ivory, pale pink, sky blue, mint, red (VehicleBodies.asset)
export const PAINTS = [[0.93, 0.93, 0.91], [0.72, 0.73, 0.75], [0.08, 0.08, 0.09], [0.86, 0.81, 0.7],
  [0.9, 0.74, 0.76], [0.58, 0.72, 0.82], [0.65, 0.8, 0.72], [0.62, 0.1, 0.12]];

/** A standalone mesh group of a preloaded model (cars, parked trucks, signals, replay copies). */
export function instance(name, materials, { paint = null, shadow = true } = {}) {
  const group = new THREE.Group();
  const parts = loadedModel(name);
  let paintMaterial = null;
  for (const part of parts) {
    let m = material(materials, part.material);
    if (paint && m.name === 'HK_KeiPaint') {
      paintMaterial ??= Object.assign(m.clone(), { color: new THREE.Color().setRGB(...paint, THREE.SRGBColorSpace) });
      m = paintMaterial;
    }
    const mesh = new THREE.Mesh(part.geometry, m);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(part.matrix);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  group.name = name;
  return group;
}

export function paintFor(seed) {
  return PAINTS[Math.abs(seed) % PAINTS.length];
}
