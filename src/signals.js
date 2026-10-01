import * as THREE from 'three';
import { model, material } from './world.js';
import { signalPlacements } from './signal-layout.js';

/** Newly modeled solid housings, lenses, visors and capped support tubes. */
export async function buildSignals(scene, data, materials) {
  const root = new THREE.Group();
  root.name = 'AbstractTrafficSignals';
  const placements = signalPlacements(data);
  const byAsset = new Map();
  for (const placement of placements) {
    if (!byAsset.has(placement.asset)) byAsset.set(placement.asset, []);
    byAsset.get(placement.asset).push(placement);
  }
  for (const [asset, items] of byAsset) {
    const parts = await model(asset);
    for (const part of parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, material(materials, part.material), items.length);
      items.forEach((item, index) => {
        mesh.setMatrixAt(index, new THREE.Matrix4().fromArray(item.matrix).multiply(part.matrix));
      });
      mesh.name = `${asset}/${part.material.name}`;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      root.add(mesh);
    }
  }
  scene.add(root);
  return { root, placements, heads: placements.filter(p => p.asset !== 'ART_Signal_Support').length };
}
