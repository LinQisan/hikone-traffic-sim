import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { addSkirts, openEdges, SKIRT_DEPTH, BANK_DEPTH } from '../src/three/geometry/model-closure.js';

const part = (name, positions, index) => {
  const geometry = new THREE.BufferGeometry(), count = positions.length / 3;
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(count * 3), 3, true));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(count * 3).fill(200), 3, true));
  geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(index), 1));
  return { geometry, material: { name } };
};
// Counter-clockwise from above in three.js axes, the winding the renderer draws.
const sheet = (name, y = 0.15) => part(name, [0, y, 0, 0, y, 2, 2, y, 2, 2, y, 0], [0, 1, 2, 0, 2, 3]);
const faceNormal = (p, a, b, c) => {
  const at = i => new THREE.Vector3().fromArray(p, i * 3);
  return at(b).sub(at(a)).cross(at(c).sub(at(a))).normalize();
};

test('an open pavement sheet gets a riser on every edge, each facing away from the sheet', () => {
  const parts = [sheet('HK_Sidewalk')];
  assert.equal(addSkirts(parts), 8);
  const { geometry } = parts[0], p = geometry.attributes.position.array, index = geometry.index.array;
  for (let t = 6; t < index.length; t += 3) {
    const n = faceNormal(p, index[t], index[t + 1], index[t + 2]);
    const cx = (p[index[t] * 3] + p[index[t + 1] * 3] + p[index[t + 2] * 3]) / 3, cz = (p[index[t] * 3 + 2] + p[index[t + 1] * 3 + 2] + p[index[t + 2] * 3 + 2]) / 3;
    assert.ok(n.x * (cx - 1) + n.z * (cz - 1) > 0, 'single-sided pigments must show the riser from outside');
    assert.ok(Math.abs(n.y) < 1e-9);
  }
  assert.ok(Math.abs(Math.min(...p.filter((_, i) => i % 3 === 1)) - (0.15 - SKIRT_DEPTH)) < 1e-6);
});

test('a bank drops past moat level while a raised deck keeps a short edge', () => {
  const lowest = name => { const parts = [sheet(name)]; addSkirts(parts); return Math.min(...parts[0].geometry.attributes.position.array.filter((_, i) => i % 3 === 1)); };
  assert.ok(lowest('HK_Grass') < -1.35 && Math.abs(lowest('HK_Grass') - (0.15 - BANK_DEPTH)) < 1e-6);
  assert.ok(lowest('HK_Asphalt') > -0.5, 'a bridge deck must not grow a curtain over the water');
});

test('roofs, shared edges and edges closed by a wall gain nothing', () => {
  assert.equal(addSkirts([sheet('HK_RoofTile', 6)]), 0, 'an eave is an open edge on purpose');
  const shared = [part('HK_Sidewalk', [0, 0, 0, 0, 0, 2, 2, 0, 2], [0, 1, 2]), part('HK_Asphalt', [0, 0, 0, 2, 0, 2, 2, 0, 0], [0, 1, 2])];
  assert.equal(openEdges(shared).length, 4, 'the diagonal the two materials share is not open');
  const walled = [sheet('HK_Sidewalk'), part('HK_Stone', [0, 0.15, 0, 2, 0.15, 0, 2, -1, 0], [0, 1, 2])];
  assert.equal(openEdges(walled).length, 3, 'a wall of any material closes the edge it meets');
});

test('a brush stroke lying on a sheet gains no riser', () => {
  const stroke = part('HK_Asphalt', [0, 0.02, 0, 0, 0.02, 0.5, 0.5, 0.02, 0.5, 0.5, 0.02, 0], [0, 1, 2, 0, 2, 3]);
  assert.equal(addSkirts([stroke]), 0);
});
