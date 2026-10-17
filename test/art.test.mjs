// Export invariants: the artistic meshes must carry their own paint, while the
// road and vehicle silhouettes still agree with the unchanged simulation data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { signalPlacements, signalRigs, POLE, ARM_ABOVE_HEAD } from '../src/signal-layout.js';
import { webLayout, WEB_HIDDEN, isHidden } from '../src/web-layout.js';
import { Ground } from '../src/ground.js';

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
  const required = new Set([...webLayout(layout).items.map(x => x.a), 'WEB_Sedan', 'HK_Kei_Tall', 'HK_Kei_Hatch', 'HK_Truck_Large', 'HK_Truck_Medium', 'ART_Signal_Car', 'ART_Signal_Pedestrian', 'ART_Signal_Support']);
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
  const layout = webLayout(JSON.parse(fs.readFileSync(new URL('../data/layout.json', import.meta.url))));
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
function triangles(name, materialName, painted = true) {
  const file = glb(name, painted), result = [];
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
  for (const [name, housing, hood] of [['ART_Signal_Car', 'ART_SignalHousing', 'ART_SignalHood'],
    ['ART_Signal_Pedestrian', 'ART_SignalHousingDark', 'ART_SignalHoodDark']]) {
    for (const material of [housing, hood, 'ART_Frame', 'ART_SignalRed', 'ART_SignalGreen']) closed(name, material);
  }
  closed('ART_Signal_Car', 'ART_SignalYellow');
  closed('ART_Signal_Support', 'ART_Frame');
  for (const [name, materials] of [
    ['ART_PathLamp', ['ART_LampBase', 'ART_LampGlow', 'ART_Frame']],
    ['ART_UtilityPole', ['HK_MetalLight', 'HK_WhitePaint', 'ART_Frame']],
  ]) for (const m of materials) closed(name, m);
});

test('all five vehicles have closed hulls, sealed tyres and match the geometry ported to Unity', () => {
  for (const name of ['WEB_Sedan', 'HK_Kei_Tall', 'HK_Kei_Hatch', 'HK_Truck_Large', 'HK_Truck_Medium']) {
    closed(name, 'HK_KeiPaint');
    closed(name, 'HK_Rubber');
    if (name.startsWith('HK_Truck')) closed(name, 'ART_Cargo');
    assert.equal(manifest.models[name].design, 'abstract-closed-solids-v2');
    // VRLearn now generates these same hulls; its sedan uses the HK_Sedan asset name.
    const original = glb(name === 'WEB_Sedan' ? 'HK_Sedan' : name, false).json;
    assert.equal(manifest.models[name].triangles,
      original.meshes.flatMap(m => m.primitives).reduce((n, p) => n + original.accessors[p.indices].count / 3, 0),
      `${name}: the Unity source retains the same authored geometry`);
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

test('real-size vehicle heads face the four approaches and hang over the carriageway', () => {
  const rigs = signalRigs(), heads = signalPlacements().filter(h => h.asset === 'ART_Signal_Car');
  const ground = new Ground(JSON.parse(fs.readFileSync(new URL('../data/road_tiles.json', import.meta.url))));
  assert.equal(heads.length, 4);
  assert.equal(new Set(rigs.filter(r => r.head).map(r => r.facing.join(','))).size, 4, 'one vehicle head per approach');
  for (const head of heads) {
    const rig = rigs.find(r => r.id === head.group);
    const y = ground.roadHeightAt(rig.head.x, rig.head.z);
    assert.ok(y != null && y < 0.05, `${rig.id}: vehicle head hangs above the road, including its raised paint`);
    assert.deepEqual(head.matrix.slice(12, 15), [-rig.head.x, rig.head.y, rig.head.z]);
    assert.deepEqual([head.matrix[8], -head.matrix[10]], rig.facing, 'lenses face the approaching driver');
    for (const offset of [0, 4, 8]) assert.equal(Math.hypot(...head.matrix.slice(offset, offset + 3)), 1,
      'a real-size housing is not scaled twice');
  }
  for (const [name, material] of [['ART_Signal_Car', 'ART_SignalHousing'], ['ART_Signal_Pedestrian', 'ART_SignalHousingDark']]) {
    const housing = triangles(name, material).flat();
    const red = triangles(name, 'ART_SignalRed').flat();
    assert.ok(Math.min(...red.map(p => p[2])) < Math.min(...housing.map(p => p[2])),
      'actual exported lenses protrude on the original negative-Z observer side');
  }
});

test('signal heads share the geometry ported to Unity at millimetre precision', () => {
  for (const kind of ['Car', 'Pedestrian']) {
    const web = `ART_Signal_${kind}`, unity = `HK_Signal_${kind}`;
    const materials = [...new Set(glb(web).json.materials.map(m => m.name))];
    const points = faces => [...new Set(faces.flat().map(p => p.map(v => Math.round(v * 1000)).join(',')))].sort();
    for (const material of materials)
      assert.deepEqual(points(triangles(unity, material, false)), points(triangles(web, material)), `${kind}/${material}`);
  }
});

test('all five signal poles stand on pavement, and vehicle lamps read green, yellow, red from the left', () => {
  const ground = new Ground(JSON.parse(fs.readFileSync(new URL('../data/road_tiles.json', import.meta.url))));
  const rigs = signalRigs();
  assert.equal(rigs.length, 5);
  for (const r of rigs) {
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4, radius = POLE[r.kind].base + 0.05;
      const y = ground.roadHeightAt(r.pole.x + Math.cos(angle) * radius, r.pole.z + Math.sin(angle) * radius);
      assert.ok(y != null && Math.abs(y - 0.16) < 1e-6, `${r.id}: the entire post footprint stays on pavement`);
    }
    if (r.head) assert.ok(r.head.y + ARM_ABOVE_HEAD < r.height, 'the arm meets the pole below its top');
  }
  // Japanese order seen from the front (from local -Z looking +Z, right is local -X): green, yellow, red
  const mean = material => { const p = triangles('ART_Signal_Car', material).flat(); return p.reduce((s, q) => s + q[0], 0) / p.length; };
  assert.ok(mean('ART_SignalGreen') > mean('ART_SignalYellow') && mean('ART_SignalYellow') > mean('ART_SignalRed'), 'green left, red right');
});

test('five installations serve three crossings; only town-west has two pedestrian heads', () => {
  const rigs = signalRigs(), heads = signalPlacements();
  assert.equal(heads.length, 10, 'four vehicle heads and six pedestrian heads');
  assert.equal(rigs.filter(r => r.head).length, 4);
  const standalone = rigs.filter(r => !r.head);
  assert.equal(standalone.length, 1, 'the east crossing has a separate walk-only pole');
  assert.equal(standalone[0].id, 'town-east-walk');
  assert.ok(standalone[0].pole.z > rigs.find(r => r.id === 'town-east').pole.z + 4,
    'the independent crossing pole stays north of the Castle Road vehicle pole');
  assert.deepEqual(rigs.filter(r => r.pedestrians.length === 2).map(r => r.id), ['town-west']);
  const crossings = new Map();
  for (const r of rigs) {
    for (const [i, walk] of r.pedestrians.entries()) {
      assert.ok(Math.hypot(walk.head.x - r.pole.x, walk.head.z - r.pole.z) < 0.8, 'a short bracket reaches its pole');
      const placed = heads.find(h => h.group === r.id && h.name === `TrafficLight_Walk_${i}`);
      assert.deepEqual(placed.matrix.slice(12, 15), [-walk.head.x, walk.head.y, walk.head.z]);
      assert.deepEqual([placed.matrix[8], -placed.matrix[10]], walk.facing, 'lens faces across the crossing');
      for (const offset of [0, 4, 8]) assert.equal(Math.hypot(...placed.matrix.slice(offset, offset + 3)), 1, 'unscaled housing');
      if (!crossings.has(walk.crossing)) crossings.set(walk.crossing, []);
      crossings.get(walk.crossing).push(walk);
    }
  }
  assert.deepEqual([...crossings.keys()].sort(), ['east', 'south', 'west']);
  for (const [id, pair] of crossings) {
    assert.equal(pair.length, 2, `${id}: one pedestrian head at either end`);
    const [a, b] = pair, across = [b.head.x - a.head.x, b.head.z - a.head.z];
    assert.equal(dot(a.facing, b.facing), -1, `${id}: the pair faces opposite directions`);
    assert.ok(dot(across, a.facing) > 0 && dot(across, b.facing) < 0, `${id}: faces its opposite crossing end`);
  }
});

test('no crosswalk signs or guide post at the signalised corners, and 40 on Route 25', () => {
  const layout = JSON.parse(fs.readFileSync(new URL('../data/layout.json', import.meta.url)));
  const shown = webLayout(layout);
  for (const h of WEB_HIDDEN) assert.equal(layout.items.filter(i => i.a === h.a
    && Math.hypot(i.p[0] - h.x, i.p[2] - h.z) < 0.5).length, 1, 'the explicit hidden entry matches exactly one item');
  assert.ok(!shown.items.some(i => i.a === 'HK_Sign_Crosswalk' || i.a === 'HK_GuidePost'));
  assert.ok(shown.items.some(i => i.a === 'HK_Sign_Speed30') && shown.items.some(i => i.a === 'HK_Sign_Stop'));
  // Route 25 along the moat shows 40 km/h (both of its speed signs), Castle Road keeps 30
  const forty = shown.items.filter(i => i.a === 'HK_Sign_Speed40');
  assert.equal(forty.length, 2);
  assert.ok(forty.every(i => i.p[2] > 20 && i.p[2] < 32), 'on Route 25');
  for (const name of new Set(shown.items.map(i => i.a))) assert.ok(manifest.models[name], `${name}: built`);
  for (const name of ['HK_Sign_Speed30', 'HK_Sign_Speed40']) {
    for (const material of ['HK_SignRed', 'HK_WhitePaint', 'HK_SignBlue', 'HK_MetalLight']) closed(name, material);
    assert.equal(manifest.models[name].design, 'abstract-closed-solids-v2', `${name}: authored, digits read from the front`);
  }
});

test('street furniture overrides are idempotent and preserve unrelated generated props', () => {
  const layout = JSON.parse(fs.readFileSync(new URL('../data/layout.json', import.meta.url)));
  const original = JSON.stringify(layout), shown = webLayout(layout);
  assert.equal(JSON.stringify(layout), original, 'never mutates the generated source');
  assert.deepEqual(webLayout(shown), shown, 'reapplying the browser layout does not duplicate poles or lamps');
  for (const item of layout.items.filter(i => !isHidden(i))) assert.ok(shown.items.includes(item), 'unrelated source prop survives');
});

test('the bridge abutments stay under the deck: no stone sliver across the road at the bridge ends', () => {
  const top = material => Math.max(...triangles('HK_Kyobashi', material).flat().map(p => p[1]));
  const deck = Math.min(...triangles('HK_Kyobashi', 'HK_Asphalt').flat().map(p => p[1]));
  assert.ok(top('HK_StoneDark') < deck - 0.02, `abutment top ${top('HK_StoneDark').toFixed(3)} below the deck ${deck.toFixed(3)}`);
});
