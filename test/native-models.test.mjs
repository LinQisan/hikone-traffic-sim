import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildNativeModel } from '../src/three/assets/models.js';
import { webLayout } from '../src/world/generators/web-layout.js';
import { indexNativeGeometry } from '../src/three/geometry/model-index.js';

const read = file => JSON.parse(fs.readFileSync(new URL('../' + file, import.meta.url)));

test('native indexing preserves pigment seams, normal seams and every triangle exactly', () => {
  const source = new THREE.BufferGeometry();
  source.setAttribute('position', new THREE.Float32BufferAttribute(Array.from({ length: 4 }, () =>
    [0, 0, 0, 1, 0, 0, 0, 0, 1]).flat(), 3));
  source.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(Array.from({ length: 4 }, (_, i) =>
    Array.from({ length: 3 }, () => [0, i === 2 ? -127 : 127, 0]).flat()).flat()), 3, true));
  source.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(Array.from({ length: 4 }, (_, i) =>
    Array.from({ length: 3 }, () => i === 3 ? [255, 0, 0] : [255, 255, 255]).flat()).flat()), 3, true));
  const indexed = indexNativeGeometry(source), restored = indexed.toNonIndexed();
  assert.equal(indexed.getAttribute('position').count, 9, 'identical triangles share vertices; seams remain separate');
  assert.equal(indexed.index.count, 12);
  for (const [name, attribute] of Object.entries(source.attributes)) {
    assert.deepEqual(restored.getAttribute(name).array, attribute.array, name);
    assert.equal(restored.getAttribute(name).normalized, attribute.normalized, name);
  }
});

test('every runtime native model and LOD retains its reference envelope and finite geometry', async () => {
  const manifest = read('models/index.json');
  const required = new Set(webLayout(read('data/layout.json')).items.map(item => item.a));
  for (const name of ['WEB_Sedan', 'ART_KeiBox', 'HK_Kei_Hatch', 'HK_Truck_Large', 'HK_Truck_Medium',
    'ART_Signal_Car', 'ART_Signal_Pedestrian']) required.add(name);
  for (const name of required) assert.ok(manifest.models.includes(name), name);
  const loader = new GLTFLoader();
  for (const name of manifest.models) for (const low of [false, true]) {
    const suffix = low ? '.lod' : '';
    const program = read(`models/${name}${suffix}.json`);
    const parts = buildNativeModel(program), bounds = new THREE.Box3();
    assert.ok(parts.length, name);
    for (const { geometry, material } of parts) {
      assert.ok(geometry.getAttribute('color'), `${name}: pigment remains vertex-attached`);
      assert.ok(geometry.index.count > 0 && geometry.index.count % 3 === 0, name + '/' + material.name);
      assert.ok(geometry.getAttribute('position').array.every(Number.isFinite), name);
      assert.ok(geometry.getAttribute('normal').array.every(Number.isFinite), name + ' normal');
      bounds.union(geometry.boundingBox);
    }
    // Historical GLBs are offline comparison fixtures only; the browser never loads them.
    const bytes = fs.readFileSync(new URL(`../data/models/impressionist/${name}${suffix}.glb`, import.meta.url));
    const reference = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const old = new THREE.Box3().setFromObject(reference.scene);
    assert.ok(['x', 'y', 'z'].every(axis => Math.abs(bounds.min[axis] - old.min[axis]) < 0.008 && Math.abs(bounds.max[axis] - old.max[axis]) < 0.008),
      `${name}${suffix}: reference bounds ${old.min.toArray()}/${old.max.toArray()}, native ${bounds.min.toArray()}/${bounds.max.toArray()}`);
    for (const { geometry, material } of parts) { geometry.dispose(); material.dispose(); }
    reference.scene.traverse(o => { o.geometry?.dispose(); if (o.isMesh) o.material.dispose(); });
  }
});

test('native road geometry faces up at the authoritative carriageway height', () => {
  const parts = buildNativeModel(read('models/ART_KyobashiRoads.json'));
  const asphalt = parts.filter(part => part.material.name === 'HK_Asphalt');
  assert.ok(asphalt.length);
  for (const { geometry } of asphalt) {
    const p = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
    let flat = 0;
    for (let i = 0; i < p.count; i++) if (Math.abs(p.getY(i) - 0.01) < 1e-6) {
      assert.ok(normal.getY(i) > 0.9, 'walkable road faces up after handedness conversion'); flat++;
    }
    assert.ok(flat > 100);
  }
});
