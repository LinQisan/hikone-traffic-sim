// Export invariants: the artistic meshes must carry their own paint, while the
// road and vehicle silhouettes still agree with the unchanged simulation data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { signalPlacements } from '../src/signal-layout.js';

const modelRoot = new URL('../data/models/', import.meta.url);
const glb = (name, painted = true) => {
  const bytes = fs.readFileSync(new URL(`${painted ? 'impressionist/' : ''}${name}.glb`, modelRoot));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, name);
  assert.equal(bytes.readUInt32LE(4), 2, name);
  assert.equal(bytes.readUInt32LE(8), bytes.length, `${name}: complete GLB`);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  return { bytes, json, binaryOffset: 28 + bytes.readUInt32LE(12) };
};
const manifest = JSON.parse(fs.readFileSync(new URL('impressionist/manifest.json', modelRoot)));
const bounds = json => {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of json.meshes) for (const p of mesh.primitives) {
    const a = json.accessors[p.attributes.POSITION];
    for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], a.min[i]); max[i] = Math.max(max[i], a.max[i]); }
  }
  return { min, max };
};

test('every scene and vehicle asset has self-contained pigment geometry', () => {
  const layout = JSON.parse(fs.readFileSync(new URL('../data/layout.json', import.meta.url)));
  const required = new Set([...layout.items.map(x => x.a), 'WEB_Sedan', 'HK_Kei_Tall', 'HK_Kei_Hatch', 'HK_Truck_Large', 'HK_Truck_Medium', 'ART_Signal_Car', 'ART_Signal_Pedestrian', 'ART_Signal_Support']);
  for (const name of required) {
    assert.ok(manifest.models[name], `${name}: listed in the art set`);
    const { bytes, json } = glb(name);
    assert.equal(bytes.length, manifest.models[name].bytes);
    assert.ok(!json.textures?.length && !json.images?.length, `${name}: pigment is not an old image texture`);
    assert.ok(json.nodes.every(n => !n.matrix && !n.translation && !n.rotation && !n.scale), `${name}: coordinates baked into the mesh`);
    for (const mesh of json.meshes) for (const p of mesh.primitives) {
      const position = json.accessors[p.attributes.POSITION];
      assert.ok(p.attributes.COLOR_0 != null, `${name}: colour attribute on every primitive`);
      assert.equal(json.accessors[p.attributes.COLOR_0].count, position.count);
      assert.ok(position.count > 0 && [...position.min, ...position.max].every(Number.isFinite));
    }
  }
  const bytes = Object.values(manifest.models).reduce((sum, m) => sum + m.bytes, 0);
  assert.ok(bytes < 80 * 1024 * 1024, 'distant ground must not inflate the art set past 80 MiB');
});

test('the houses and tree silhouettes were rebuilt, including when the shader finish is off', () => {
  for (const name of ['HK_Machiya_A', 'HK_Machiya_B', 'HK_Machiya_C', 'HK_Kura', 'HK_Tree_Round', 'HK_Tree_Cedar', 'HK_Tree_Sakura']) {
    const original = glb(name, false).json, art = glb(name).json;
    assert.ok(manifest.models[name].remodeled, name);
    assert.ok(manifest.models[name].strokes > 100, `${name}: mesh strokes`);
    assert.notDeepEqual(bounds(art), bounds(original), `${name}: a new silhouette, not a material-only copy`);
  }
});

test('distant meshes retain pigment, silhouettes and road heights with a smaller triangle budget', () => {
  const layout = JSON.parse(fs.readFileSync(new URL('../data/layout.json', import.meta.url)));
  let highTriangles = 0, lowTriangles = 0;
  for (const name of new Set(layout.items.map(x => x.a))) {
    const high = glb(name), low = glb(name + '.lod'), entry = manifest.models[name];
    const count = file => file.json.meshes.flatMap(m => m.primitives)
      .reduce((sum, p) => sum + file.json.accessors[p.indices].count / 3, 0);
    assert.equal(count(low), entry.lod.triangles, name);
    assert.equal(low.bytes.length, entry.lod.bytes, name);
    assert.ok(!low.json.images?.length, 'LOD keeps vertex pigment');
    for (const mesh of low.json.meshes) for (const p of mesh.primitives) assert.ok(p.attributes.COLOR_0 != null);
    const a = bounds(high.json), b = bounds(low.json);
    for (const end of ['min', 'max']) for (let axis = 0; axis < 3; axis++)
      assert.ok(Math.abs(a[end][axis] - b[end][axis]) < 0.04, `${name}: LOD silhouette stays within 4 cm`);
    const instances = layout.items.filter(x => x.a === name).length;
    highTriangles += count(high) * instances;
    lowTriangles += count(low) * instances;
  }
  assert.ok(lowTriangles < highTriangles * 0.3, 'city-wide LOD saves at least 70% of geometry');
});

test('art models preserve road elevations and vehicle collision outlines within 8 mm', () => {
  for (const name of ['HK_RoadRaised', 'HK_RoadRaised_Honmachi', 'HK_RoadSurf_Straight', 'HK_RoadSurf_Cross', 'HK_Kyobashi', 'WEB_Sedan', 'HK_Kei_Tall', 'HK_Kei_Hatch', 'HK_Truck_Large', 'HK_Truck_Medium']) {
    const before = bounds(glb(name, false).json), after = bounds(glb(name).json);
    for (const end of ['min', 'max']) for (let axis = 0; axis < 3; axis++) {
      assert.ok(Math.abs(before[end][axis] - after[end][axis]) < 0.008,
        `${name}: ${end}[${axis}] remains aligned with the collider`);
    }
  }
});

// Audit the exported triangles, welding vertex splits made by flat normals and colours.
function accessor(file, index) {
  const a = file.json.accessors[index], v = file.json.bufferViews[a.bufferView];
  const components = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type];
  const [size, read] = { 5121: [1, 'readUInt8'], 5123: [2, 'readUInt16LE'],
    5125: [4, 'readUInt32LE'], 5126: [4, 'readFloatLE'] }[a.componentType];
  const offset = file.binaryOffset + (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  return Array.from({ length: a.count }, (_, i) => Array.from({ length: components }, (_, c) =>
    file.bytes[read](offset + i * (v.byteStride ?? components * size) + c * size)));
}
function triangles(name, materialName) {
  const file = glb(name), result = [];
  for (const mesh of file.json.meshes) for (const primitive of mesh.primitives) {
    if (file.json.materials[primitive.material].name !== materialName) continue;
    const positions = accessor(file, primitive.attributes.POSITION);
    const indices = accessor(file, primitive.indices).flat();
    for (let i = 0; i < indices.length; i += 3) result.push(indices.slice(i, i + 3).map(index => positions[index]));
  }
  assert.ok(result.length > 0, `${name}/${materialName}: exported geometry exists`);
  return result;
}
const subtract = (a, b) => a.map((v, i) => v - b[i]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
function closed(name, materialName) {
  const faces = triangles(name, materialName), edges = new Map();
  let volume = 0;
  const key = p => p.map(v => Math.round(v * 100000)).join(',');
  for (const [a, b, c] of faces) {
    volume += dot(a, cross(b, c)) / 6;
    const n = cross(subtract(b, a), subtract(c, a));
    assert.ok(dot(n, n) > 1e-17, `${name}/${materialName}: no degenerate triangles`);
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      const ka = key(p), kb = key(q), id = [ka, kb].sort().join('|');
      const edge = edges.get(id) ?? { count: 0, direction: 0 };
      edge.count++;
      edge.direction += ka < kb ? 1 : -1;
      edges.set(id, edge);
    }
  }
  const bad = [...edges.values()].filter(e => e.count !== 2 || e.direction !== 0);
  assert.equal(bad.length, 0, `${name}/${materialName}: closed solid with consistent outward winding`);
  assert.ok(volume > 0, `${name}/${materialName}: outward, not inside-out`);
}

test('the lamp has an outward-facing bottom; lamp, signal shells and supports are closed', () => {
  for (const material of ['ART_LampGlow', 'ART_LampBase', 'ART_Frame']) closed('HK_StreetLamp', material);
  const glow = triangles('HK_StreetLamp', 'ART_LampGlow');
  const bottom = Math.min(...glow.flat().map(p => p[1]));
  const caps = glow.filter(t => t.every(p => Math.abs(p[1] - bottom) < 1e-5));
  assert.ok(caps.length >= 6, 'the eight-sided lantern has a triangulated bottom cap');
  for (const [a, b, c] of caps) assert.ok(cross(subtract(b, a), subtract(c, a))[1] < 0,
    'bottom cap faces the viewer below the lamp with normal front-face culling');
  for (const name of ['ART_Signal_Car', 'ART_Signal_Pedestrian']) {
    for (const material of ['ART_SignalHousing', 'ART_Frame', 'ART_SignalRed', 'ART_SignalGreen']) closed(name, material);
  }
  closed('ART_Signal_Car', 'ART_SignalYellow');
  closed('ART_Signal_Support', 'ART_Frame');
});

test('all five vehicles have new closed hulls, sealed tyres and unchanged collision extents', () => {
  for (const name of ['WEB_Sedan', 'HK_Kei_Tall', 'HK_Kei_Hatch', 'HK_Truck_Large', 'HK_Truck_Medium']) {
    closed(name, 'HK_KeiPaint');
    closed(name, 'HK_Rubber');
    if (name.startsWith('HK_Truck')) closed(name, 'ART_Cargo');
    assert.equal(manifest.models[name].design, 'abstract-closed-solids-v2');
    const original = glb(name, false).json;
    assert.notEqual(manifest.models[name].triangles,
      original.meshes.flatMap(m => m.primitives).reduce((n, p) => n + original.accessors[p.indices].count / 3, 0),
      `${name}: geometry was rebuilt`);
  }
});

function rayDistance(faces, origin, direction) {
  let nearest = Infinity;
  for (const [a, b, c] of faces) {
    const e1 = subtract(b, a), e2 = subtract(c, a);
    const p = cross(direction, e2), det = dot(e1, p);
    if (Math.abs(det) < 1e-9) continue;
    const t = subtract(origin, a), u = dot(t, p) / det;
    const q = cross(t, e1), v = dot(direction, q) / det;
    if (u < 0 || v < 0 || u + v > 1) continue;
    const distance = dot(e2, q) / det;
    if (distance > 0) nearest = Math.min(nearest, distance);
  }
  return nearest;
}
test('front windscreens are outside the vehicle hull and visible from the front', () => {
  for (const [name, eye] of [['WEB_Sedan', 1.2], ['HK_Kei_Tall', 1.48], ['HK_Kei_Hatch', 1.25],
    ['HK_Truck_Large', 2.15], ['HK_Truck_Medium', 2.15]]) {
    const truck = name.startsWith('HK_Truck');
    const origin = truck ? [9, eye, 0] : [0, eye, 5];
    const direction = truck ? [-1, 0, 0] : [0, 0, -1];
    const glass = rayDistance(triangles(name, 'ART_Glass'), origin, direction);
    const body = rayDistance(triangles(name, 'HK_KeiPaint'), origin, direction);
    assert.ok(Number.isFinite(glass) && glass < body, `${name}: windscreen is not buried inside the roof or front cap`);
  }
});

test('new signal heads retain the six original anchors, facing directions and twelve supports', () => {
  const data = JSON.parse(fs.readFileSync(new URL('../data/signals.json', import.meta.url)));
  const placements = signalPlacements(data);
  const heads = placements.filter(p => p.asset !== 'ART_Signal_Support');
  assert.equal(heads.length, 6);
  assert.equal(placements.length - heads.length, 12);
  for (const head of heads) {
    const original = data.parts.find(p => p.group === head.group && p.name === head.name);
    assert.deepEqual(head.matrix.slice(12, 15), [-original.matrix[12], original.matrix[13], original.matrix[14]]);
    // The original lens mesh sits on the cube's local -Z side.
    const front = head.matrix.slice(8, 11).map(v => -v);
    const expected = [original.matrix[8], -original.matrix[9], -original.matrix[10]];
    assert.ok(dot(front, expected) > 0, 'new lens points toward the original observer side');
    for (const offset of [0, 4, 8]) assert.ok(Math.abs(Math.hypot(...head.matrix.slice(offset, offset + 3)) - 1) < 1e-5,
      'a real-size housing is not scaled twice');
  }
  for (const name of ['ART_Signal_Car', 'ART_Signal_Pedestrian']) {
    const housing = triangles(name, 'ART_SignalHousing').flat();
    const red = triangles(name, 'ART_SignalRed').flat();
    assert.ok(Math.min(...red.map(p => p[2])) < Math.min(...housing.map(p => p[2])),
      'actual exported lenses protrude on the original negative-Z observer side');
  }
});
