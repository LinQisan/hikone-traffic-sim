import * as THREE from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {buildNativeModel} from '../three/geometry/model-builder.js';
import {readNativeProgram} from '../three/assets/model-format.ts';
import type {NativePart, ModelDetail} from '../types/assets.ts';
/** Independent, user-invoked asset export. Never reparents or disposes live engine resources. */
export async function exportNativeAsset(name: string, detail: ModelDetail, base: URL, signal?: AbortSignal): Promise<ArrayBuffer> {
  if (!/^[A-Za-z0-9_]+$/.test(name) || !['high', 'low'].includes(detail)) throw new Error('Invalid native asset identifier or detail');
  const response = await fetch(new URL(`models/${name}${detail === 'low' ? '.lod' : ''}.json`, base), {signal});
  if (!response.ok) throw new Error(`${name}: ${response.status}`);
  const {program} = await readNativeProgram(response);
  signal?.throwIfAborted();
  const parts: NativePart[] = buildNativeModel(program), root = new THREE.Group();
  root.name = name;
  root.userData = {assetId: name, detail, source: 'hikone-native-model', coordinates: 'glTF right-handed; mirror X to map coordinates'};
  const materials: THREE.Material[] = [];
  try {
    for (const part of parts) {
      // glTF supports vertex pigments and PBR materials, not the browser's custom brush shader.
      const source = part.material;
      // Native normals use compact integer storage. glTF requires unit normals; expand only
      // this independent export copy, leaving runtime geometry and its memory budget intact.
      const normal = part.geometry.getAttribute('normal');
      if (normal) {
        const values = new Float32Array(normal.count * 3), vector = new THREE.Vector3();
        for (let index = 0; index < normal.count; index++) {
          vector.fromBufferAttribute(normal, index);
          if (vector.lengthSq() === 0) vector.set(0, 1, 0); else vector.normalize();
          vector.toArray(values, index * 3);
        }
        part.geometry.setAttribute('normal', new THREE.Float32BufferAttribute(values, 3));
      }
      const material = new THREE.MeshStandardMaterial({name: source.name, color: source.color,
        vertexColors: source.vertexColors, emissive: source.emissive, emissiveIntensity: source.emissiveIntensity,
        transparent: source.transparent, opacity: source.opacity, side: source.side, roughness: 0.85, metalness: 0});
      materials.push(material);
      const mesh = new THREE.Mesh(part.geometry, material); mesh.applyMatrix4(part.matrix); root.add(mesh);
    }
    const result = await new GLTFExporter().parseAsync(root, {binary: true, onlyVisible: false});
    signal?.throwIfAborted();
    if (!(result instanceof ArrayBuffer)) throw new Error('Expected a binary glTF export');
    return result;
  } finally {
    for (const part of parts) {part.geometry.dispose(); part.material.dispose();}
    for (const material of materials) material.dispose();
    root.clear();
  }
}
