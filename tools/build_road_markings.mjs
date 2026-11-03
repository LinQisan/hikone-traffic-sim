#!/usr/bin/env node
// Writes the road-marking layer and repacks transport, without Blender and without touching
// any other model. The layer is paint at road level, so collision needs no rebuild.
import fs from 'node:fs';
import { roadMarkingCommands } from '../src/world/generators/road-markings.ts';
import { packModels } from './pack_models.mjs';

const name = 'ART_RoadMarkings';
const directory = new URL('../models/', import.meta.url);
const fixtures = new URL('../data/models/impressionist/', import.meta.url);
const started = Date.now();

// The offline reference tests and the editor atlas read; the browser uses the program above.
// glTF mirrors map X, which turns each triangle over unless its winding is reversed too.
function referenceGlb(faces) {
  const materials = [...new Set(faces.map(face => face[1]))], floats = new Float32Array(faces.length * 18), indices = new Uint32Array(faces.length * 3);
  const accessors = [], primitives = [];
  let at = 0;
  materials.forEach((material, m) => {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], start = at;
    for (const [, name, [a, b, c], pigment] of faces) if (name === material) for (const [x, y, z] of [a, c, b]) {
      const position = [-x, y, z];
      floats.set(position, at); floats.set(pigment, at + 3); at += 6;
      position.forEach((n, i) => { min[i] = Math.min(min[i], n); max[i] = Math.max(max[i], n); });
    }
    const count = (at - start) / 6;
    for (let i = 0; i < count; i++) indices[start / 6 + i] = i;
    const accessor = (offset, extra) => ({ bufferView: 0, byteOffset: start * 4 + offset, componentType: 5126, count, type: 'VEC3', ...extra });
    accessors.push(accessor(0, { min, max }), accessor(12), { bufferView: 1, byteOffset: start / 6 * 4, componentType: 5125, count, type: 'SCALAR' });
    primitives.push({ attributes: { POSITION: m * 3, COLOR_0: m * 3 + 1 }, indices: m * 3 + 2, material: m });
  });
  const json = { asset: { version: '2.0', generator: 'tools/build_road_markings.mjs' }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ name, mesh: 0 }], meshes: [{ name, primitives }], materials: materials.map(material => ({ name: material })), accessors,
    bufferViews: [{ buffer: 0, byteLength: floats.byteLength, byteStride: 24 }, { buffer: 0, byteOffset: floats.byteLength, byteLength: indices.byteLength }],
    buffers: [{ byteLength: floats.byteLength + indices.byteLength }] };
  const text = Buffer.from(JSON.stringify(json)), head = Buffer.alloc(text.length + 3 & ~3, ' ');
  text.copy(head);
  const file = Buffer.alloc(28 + head.length + floats.byteLength + indices.byteLength);
  file.writeUInt32LE(0x46546c67, 0); file.writeUInt32LE(2, 4); file.writeUInt32LE(file.length, 8);
  file.writeUInt32LE(head.length, 12); file.writeUInt32LE(0x4e4f534a, 16); head.copy(file, 20);
  file.writeUInt32LE(floats.byteLength + indices.byteLength, 20 + head.length); file.writeUInt32LE(0x004e4942, 24 + head.length);
  Buffer.from(floats.buffer).copy(file, 28 + head.length);
  Buffer.from(indices.buffer).copy(file, 28 + head.length + floats.byteLength);
  return file;
}

const commands = roadMarkingCommands();
const body = JSON.stringify({ format: 'hikone-native-model', version: 1, name, commands });
const glb = referenceGlb(commands);
for (const suffix of ['', '.lod']) {
  fs.writeFileSync(new URL(`${name}${suffix}.json`, directory), body);
  fs.writeFileSync(new URL(`${name}${suffix}.glb`, fixtures), glb);
}

const manifestFile = new URL('manifest.json', fixtures), manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
manifest.models[name] = { triangles: commands.length, strokes: 0, bytes: glb.length, remodeled: false, lod: { triangles: commands.length, bytes: glb.length } };
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');

const indexFile = new URL('index.json', directory), index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
if (!index.models.includes(name)) {
  index.models.push(name);
  fs.writeFileSync(indexFile, JSON.stringify(index));
}
await packModels();
console.log(`${name}: ${commands.length} faces, ${(body.length / 1e6).toFixed(2)} MB, ${((Date.now() - started) / 1000).toFixed(1)} s`);
