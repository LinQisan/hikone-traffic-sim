// Export invariants: the artistic meshes must carry their own paint, while the
// road and vehicle silhouettes still agree with the unchanged simulation data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { signalPlacements, signalRigs, signalNamePlate, signalWalkPlate, POLE, ARM_ABOVE_HEAD } from '../src/signal-layout.js';
import { webLayout, WEB_HIDDEN, isHidden } from '../src/web-layout.js';
import { Ground } from '../src/ground.js';
import { moatBend, moatPathEdge } from '../src/road-layout.js';
import { CASTLE_SITE } from '../src/castle-layout.js';
import { HIKONE_BOUNDS } from '../src/shared/scenario.js';

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
  const required = new Set([...webLayout(layout).items.map(x => x.a), 'WEB_Sedan', 'HK_Kei_Tall', 'ART_KeiBox', 'HK_Kei_Hatch', 'HK_Truck_Large', 'HK_Truck_Medium', 'ART_Signal_Car', 'ART_Signal_Pedestrian', 'ART_Signal_Support']);
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

test('the distant keep rests on its hill and does not replace the walkable Kyobashi background', () => {
  const layout = webLayout(JSON.parse(fs.readFileSync(new URL('../data/layout.json', import.meta.url))));
  const map = JSON.parse(fs.readFileSync(new URL('../data/map.json', import.meta.url)));
  const keep = layout.items.filter(i => i.a === 'ART_HikoneKeep');
  const hill = layout.items.filter(i => i.a === 'HK_Terrain_Hikone');
  assert.equal(keep.length, 1);
  assert.equal(hill.length, 1);
  const distance = Math.hypot(keep[0].p[0] - 32, keep[0].p[2] - 56.8);
  assert.ok(distance > 420 && distance < 500, 'the real hilltop is hundreds of metres beyond the bridge');
  const hillBounds = bounds(glb('HK_Terrain_Hikone').json);
  assert.deepEqual(map.practiceWorld, HIKONE_BOUNDS, 'the larger editor overview retains the original practice bounds');
  assert.ok(hill[0].p[2] + hillBounds.min[2] > HIKONE_BOUNDS.zMax, 'the background hill cannot fill or obstruct the practice map');
  const cap = triangles('HK_Terrain_Hikone', 'ART_StoneLight').map(triangle => triangle.flatMap(([x, y, z]) => [-x, y, z]));
  const surface = new Ground({ hill: cap });
  const base = keep[0].p[1] + bounds(glb('ART_HikoneKeep').json).min[1];
  for (const [x, z] of [[0, 0], [-10, -8], [10, -8], [-10, 8], [10, 8]])
    assert.ok(Math.abs(surface.heightAt(x, z) + hill[0].p[1] - base) < 0.001, 'stone footings meet the authored hilltop');
  assert.equal(keep[0].p[1], CASTLE_SITE.height);
});
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

test('broadleaf blades remain visible from below with the single-sided environment material', () => {
  // Coincident reversed faces are removed by the mesh weld. Thin closed blades
  // must survive export instead, including in the distant crown.
  for (const name of ['HK_Tree_Round', 'ART_MoatTree_Broad']) {
    for (const detail of [name, name + '.lod']) {
      closed(detail, 'HK_Leaf');
      const bark = glb(detail).json.materials.find(m => m.name === 'ART_TreeBark');
      assert.ok(bark && !bark.doubleSided,
        'the opaque tree batch must not inherit double-sided drawing from its new bark material');
    }
  }
});

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
  closed('HK_Kyobashi', 'ART_Patina');
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

test('both display-case LODs let sight lines pass through the front, back and sides', () => {
  for (const name of ['ART_DisplayKiosk', 'ART_DisplayKiosk.lod']) {
    const { json } = glb(name);
    const glass = json.materials.filter(m => m.alphaMode === 'BLEND');
    assert.equal(glass.length, 1, `${name}: dedicated glass material`);
    assert.ok(glass[0].pbrMetallicRoughness.baseColorFactor[3] < 0.25);
    assert.equal(glass[0].doubleSided, true, 'thin panes are visible from both sides');
    const clear = triangles(name, glass[0].name);
    const opaque = [...new Set(json.materials.filter(m => m.alphaMode !== 'BLEND').map(m => m.name))]
      .flatMap(material => triangles(name, material));
    for (const y of [0.9, 1.1, 1.3, 1.5, 1.7, 1.9])
      for (const [origin, direction] of [[[0.4, y, 5], [0, 0, -1]], [[5, y, -0.12], [-1, 0, 0]]]) {
        assert.ok(Number.isFinite(rayDistance(clear, origin, direction)), 'the opening contains a glass pane');
        assert.equal(rayDistance(opaque, origin, direction), Infinity, 'no opaque backing or lattice blocks the uninterrupted pane');
      }
  }
});

test('the photographed shop apron keeps a continuous plot surface across its finish boundaries', () => {
  const ground = new Ground(JSON.parse(fs.readFileSync(new URL('../data/road_tiles.json', import.meta.url))));
  for (const name of ['ART_KyobashiLand', 'ART_KyobashiLand.lod']) {
    const { json } = glb(name);
    const local = json.materials.flatMap(m => triangles(name, m.name))
      .filter(t => t.every(p => Math.abs(p[1] - 0.15) < 1e-6)
        && Math.min(...t.map(p => p[0])) <= -42 && Math.max(...t.map(p => p[0])) >= -52
        && Math.min(...t.map(p => p[2])) <= 19 && Math.max(...t.map(p => p[2])) >= 14);
    for (const material of ['ART_ApronAsphalt', 'ART_ShopStone']) {
      const faces = triangles(name, material);
      assert.ok(faces.every(t => t.every(p => Math.abs(p[1] - 0.15) < 1e-6)), 'finishes replace the actual plot instead of floating above it');
    }
    let checked = 0;
    for (let x = 42.837; x < 50.7; x += 0.271) for (let z = 15.037; z < 18.2; z += 0.233) {
      if (ground.roadHeightAt(x, z) != null) continue;
      assert.ok(Math.abs(rayDistance(local, [-x, 1, z], [0, -1, 0]) - 0.85) < 1e-6,
        `${name}: no hole or plot step at ${x}, ${z}`);
      checked++;
    }
    assert.ok(checked > 250, 'sample the apron and its seams, beyond one material triangle');
  }
});

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

test('real-size vehicle heads cover the four approaches from over the carriageway', () => {
  const rigs = signalRigs(), heads = signalPlacements().filter(h => h.asset === 'ART_Signal_Car');
  const ground = new Ground(JSON.parse(fs.readFileSync(new URL('../data/road_tiles.json', import.meta.url))));
  const specs = rigs.flatMap(r => [...(r.head ? [{ rig: r, head: r.head, facing: r.facing, name: 'TrafficLight_Car' }] : []),
    ...r.extraHeads.map((e, i) => ({ rig: r, ...e, name: `TrafficLight_Car_${i + 2}` }))]);
  assert.equal(heads.length, 6, 'the approach heads include both back-to-back pairs');
  const overRoad = s => { const y = ground.roadHeightAt(s.head.x, s.head.z); return y != null && y < 0.05; };
  assert.equal(new Set(specs.filter(overRoad).map(s => s.facing.join(','))).size, 4,
    'every approach has a head hanging over the carriageway');
  for (const spec of specs) {
    const { rig } = spec, head = heads.find(h => h.group === rig.id && h.name === spec.name);
    assert.ok(overRoad(spec), `${rig.id}: the vehicle head hangs over the carriageway`);
    assert.deepEqual(head.matrix.slice(12, 15), [-spec.head.x, spec.head.y, spec.head.z]);
    assert.deepEqual([head.matrix[8], -head.matrix[10]], spec.facing, 'lenses face the approaching driver');
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

test('unchanged pedestrian heads retain the geometry ported to Unity at millimetre precision', () => {
  for (const kind of ['Pedestrian']) {
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
      assert.ok(y != null && Math.abs(y - 0.01) < 1e-6, `${r.id}: the entire post footprint stays on pavement`);
    }
    if (r.head) assert.ok(r.head.y + ARM_ABOVE_HEAD < r.height, 'the arm meets the pole below its top');
  }
  // Japanese order seen from the front (from local -Z looking +Z, right is local -X): green, yellow, red
  const mean = material => { const p = triangles('ART_Signal_Car', material).flat(); return p.reduce((s, q) => s + q[0], 0) / p.length; };
  assert.ok(mean('ART_SignalGreen') > mean('ART_SignalYellow') && mean('ART_SignalYellow') > mean('ART_SignalRed'), 'green left, red right');
});

test('the coordinate-picked town-west mast has opposing heads on one arm-end frame', () => {
  const rigs = signalRigs(), distance = r => Math.hypot(r.pole.x - 25.34, r.pole.z - 19.31);
  const mast = rigs.reduce((a, b) => distance(a) < distance(b) ? a : b);
  assert.equal(mast.id, 'town-west');
  assert.ok(distance(mast) < 0.06, 'the selected coordinate identifies the photographed mast');
  assert.equal(mast.extraHeads.length, 1, 'both photographs show one head on either face of the arm-end frame');
  const reverse = mast.extraHeads[0], between = [reverse.head.x - mast.head.x, reverse.head.z - mast.head.z];
  assert.equal(dot(mast.facing, reverse.facing), -1,
    'the reverse head faces opposite traffic, rather than turning ninety degrees');
  assert.ok(dot(between, mast.facing) < 0 && Math.abs(between[0] * mast.facing[1] - between[1] * mast.facing[0]) < 0.05,
    'the two housings sit back to back along their viewing axis');
  assert.ok(Math.hypot(...between) > 0.25 && Math.hypot(...between) < 0.65
    && Math.abs(reverse.head.y - mast.head.y) < 0.05,
    'a compact shared frame holds separated housings at the same height');
  const arm = [mast.head.x - mast.pole.x, mast.head.z - mast.pole.z];
  assert.ok(dot(arm, mast.lampFacing) > 0 && Math.abs(arm[0] * mast.lampFacing[1] - arm[1] * mast.lampFacing[0]) < 0.05,
    'the upper street lamp reaches in the same direction as the lower signal arm');
  assert.ok(mast.lampReach < Math.hypot(...arm) && mast.height > mast.head.y + ARM_ABOVE_HEAD + 0.7,
    'the street lamp has a shorter, higher arm');
  assert.equal(mast.phase, 'above', 'only the primary face carries the upper phase plate');
  assert.equal(mast.nameHeight, undefined, 'there is no Kyobashi name plate on this mast');
  assert.deepEqual(mast.pedestrians.map(w => w.crossing).sort(), ['south', 'west'],
    'both adjacent pedestrian crossing heads remain on this installation');
  const south = mast.pedestrians.find(w => w.crossing === 'south');
  const otherEnd = rigs.find(r => r.id === 'town-east').pedestrians.find(w => w.crossing === 'south');
  assert.ok(south.head.z < mast.pole.z && Math.abs(south.head.z - otherEnd.head.z) < 0.05,
    'the photographed walk head is on the south side of the shaft, aligned with its crossing partner');
});

test('the coordinate-picked town-east mast reaches over Castle Road and retains its walk head', () => {
  const rigs = signalRigs(), distance = r => Math.hypot(r.pole.x - 38.70, r.pole.z - 19.29);
  const mast = rigs.reduce((a, b) => distance(a) < distance(b) ? a : b);
  assert.equal(mast.id, 'town-east');
  assert.ok(distance(mast) < 0.05, 'the selected map point identifies this physical installation');
  assert.equal(mast.style, 'mast');
  assert.ok(mast.head && mast.head.y > 5 && mast.height > mast.head.y + ARM_ABOVE_HEAD,
    'a tall mast supports a vehicle head above traffic clearance');
  assert.ok(mast.head.x < mast.pole.x - 3 && Math.abs(mast.head.z - mast.pole.z) < 0.1,
    'the long arm reaches west from the east pavement over Castle Road');
  const tiles = JSON.parse(fs.readFileSync(new URL('../data/road_tiles.json', import.meta.url)));
  const carriageway = new Ground({ roads: tiles['Kyobashi carriageway'] });
  assert.ok(carriageway.roadHeightAt(mast.head.x, mast.head.z) != null,
    'the head hangs over actual carriageway, not a flush-height footway');
  assert.deepEqual(mast.facing, [0, 1], 'the lenses face the junction and approaching southbound traffic');
  assert.equal(mast.phase, 'above', 'the photographed phase plate is above the three-lamp housing');
  assert.equal(mast.pedestrians.length, 1);
  assert.equal(mast.pedestrians[0].crossing, 'south');
  assert.deepEqual(mast.pedestrians[0].facing, [-1, 0]);
  assert.equal(mast.nameHeight, undefined, 'Kyobashi stays on the separate lamp post');
  assert.equal(mast.lampFacing, undefined, 'this photographed mast has no separate street lamp');
});

test('the coordinate-picked bridge-east name stands above its truss and serves both adjacent crossings', () => {
  const rigs = signalRigs(), distance = r => Math.hypot(r.pole.x - 42.00, r.pole.z - 33.30);
  const mast = rigs.reduce((a, b) => distance(a) < distance(b) ? a : b);
  assert.equal(mast.id, 'bridge-east');
  assert.ok(distance(mast) < 1.1, 'the selected map point identifies the northeast bridge corner');
  const name = signalNamePlate(mast), right = [-name.facing[1], name.facing[0]];
  const offset = [name.center.x - mast.pole.x, name.center.z - mast.pole.z];
  assert.ok(Math.abs(dot(offset, right)) < 0.01, 'the upper name is centred over its shaft');
  const trussTop = Math.max(mast.trussTieHeight ?? mast.height - 0.1, mast.head.y + ARM_ABOVE_HEAD + 0.82);
  assert.ok(name.center.y - name.size[1] / 2 > trussTop + 0.2,
    'the entire name is above the truss and its independently anchored tension cable');
  assert.ok(mast.height >= name.center.y + name.size[1] * 0.32,
    'the taller shaft physically supports both upper-name brackets');
  assert.ok(name.center.y > mast.pedestrians[0].head.y + 3, 'the Kyobashi plate remains on the upper mast');
  assert.deepEqual(mast.pedestrians.map(w => w.crossing).sort(), ['east', 'north']);
  const east = mast.pedestrians.find(w => w.crossing === 'east');
  const north = mast.pedestrians.find(w => w.crossing === 'north');
  assert.equal(dot(east.facing, north.facing), 0, 'the two heads serve perpendicular crosswalks');
  assert.ok(east.head.x > mast.pole.x && north.head.z < mast.pole.z,
    'the front head and the side head sit on opposite sides in the supplied southeast view');
  const partner = rigs.find(r => r.id === 'bridge-west').pedestrians.find(w => w.crossing === 'north');
  assert.ok(partner && dot(partner.facing, north.facing) === -1,
    'the bridge-entrance crossing also has its matching signal at the opposite end');
});

test('the bridge-east truss carries two opposed vehicle heads with separated housing backs', () => {
  const mast = signalRigs().find(r => r.id === 'bridge-east');
  assert.equal(mast.extraHeads.length, 1, 'the owner-confirmed reverse face has its own complete vehicle head');
  const reverse = mast.extraHeads[0], delta = [reverse.head.x - mast.head.x, reverse.head.z - mast.head.z];
  assert.equal(dot(mast.facing, reverse.facing), -1, 'the two faces look in opposite traffic directions');
  assert.ok(Math.abs(delta[0] * mast.facing[1] - delta[1] * mast.facing[0]) < 0.01
    && Math.abs(reverse.head.y - mast.head.y) < 0.01, 'both heads align on one horizontal mounting frame');
  const depth = bounds(glb('ART_Signal_Car').json).max[2], separation = -dot(delta, mast.facing);
  assert.ok(separation > depth * 2 + 0.03 && separation < 0.65,
    'the exported backs have a visible gap within the compact shared frame');
  assert.equal(signalPlacements([mast]).filter(p => p.asset === 'ART_Signal_Car').length, 2,
    'both complete heads are submitted to the runtime assembly');
});

test('pedestrian notices clear the exported hood fronts and keep space beside their housings', () => {
  const housing = bounds(glb('ART_Signal_Pedestrian').json);
  const hoodFront = -housing.min[2], halfWidth = Math.max(Math.abs(housing.min[0]), Math.abs(housing.max[0]));
  let count = 0;
  for (const rig of signalRigs()) for (const walk of rig.pedestrians) {
    const notice = signalWalkPlate(rig, walk);
    const fromHead = [notice.center.x - walk.head.x, notice.center.z - walk.head.z];
    assert.ok(dot(fromHead, walk.facing) > hoodFront + 0.03,
      `${rig.id}/${walk.crossing}: the readable notice is in front of the actual hood envelope`);
    assert.ok(Math.abs(dot(fromHead, walk.side)) > halfWidth + notice.size[0] / 2 + 0.015,
      `${rig.id}/${walk.crossing}: the notice and housing also have a lateral gap`);
    assert.equal(notice.center.y, walk.head.y);
    assert.deepEqual(notice.facing, walk.facing, 'the notice faces the same crossing as the lamps');
    count++;
  }
  assert.equal(count, 8, 'every pedestrian notice uses the clear mount');
});

test('the coordinate-picked Kyobashi installation matches the name, lamp and walk-head close-up', () => {
  const rigs = signalRigs(), heads = signalPlacements();
  const markers = JSON.parse(fs.readFileSync(new URL('../data/map.json', import.meta.url))).signals;
  assert.equal(markers.length, rigs.length, 'the editor shows the actual installations');
  for (const r of rigs) assert.ok(markers.some(m => Math.hypot(m.x - r.pole.x, m.z - r.pole.z) < 0.01),
    `${r.id}: the editor marker matches its rendered pole`);
  assert.equal(heads.length, 14, 'six vehicle heads and eight pedestrian heads');
  assert.equal(rigs.filter(r => r.head).length, 4);
  assert.deepEqual(new Set(heads.filter(h => h.asset === 'ART_Signal_Car')
    .map(h => `${h.matrix[8]},${-h.matrix[10]}`)), new Set(['0,-1', '-1,0', '1,0', '0,1']),
    'vehicle heads still cover all four approaches');
  const standalone = rigs.filter(r => !r.head);
  assert.deepEqual(standalone.map(r => r.id), ['town-east-walk']);
  const distance = r => Math.hypot(r.pole.x - 45.03, r.pole.z - 20.45);
  const shopPole = rigs.reduce((a, b) => distance(a) < distance(b) ? a : b);
  assert.equal(shopPole.id, 'town-east-walk', 'the owner-picked coordinate identifies the foreground name-board lamp');
  assert.ok(distance(shopPole) < 0.25);
  assert.equal(shopPole.head, null, 'the close-up has no vehicle housing or lower vehicle arm');
  assert.ok(shopPole.lampFacing && shopPole.nameHeight > shopPole.pedestrians[0].head.y + 2
    && shopPole.nameHeight + shopPole.nameSize[1] / 2 < shopPole.height - 0.25,
    'the name plate is on the shaft below the upper lamp and above the walk head');
  assert.ok(shopPole.nameOffset[1] - shopPole.nameSize[0] / 2 > 0
    && shopPole.nameOffset[1] + shopPole.nameSize[0] / 2 < shopPole.lampReach,
    'the plate extends beside the shaft, within the photographed lamp reach');
  const toPhoto = [52.8 - shopPole.pole.x, 21.8 - shopPole.pole.z];
  assert.ok(dot(toPhoto, shopPole.nameFacing) > 0, 'the supplied foreground viewpoint reads Kyobashi');
  assert.equal(rigs.find(r => r.id === 'town-west').nameHeight, undefined,
    'the displaced name plate is removed from the opposite vehicle arm');
  assert.ok(shopPole.pole.x > rigs.find(r => r.id === 'town-east').pole.x + 3,
    'the independent crossing pole stands at the east crossing, apart from the corner pole');
  assert.deepEqual(rigs.filter(r => r.pedestrians.length === 2).map(r => r.id), ['bridge-west', 'bridge-east', 'town-west']);
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
  assert.deepEqual([...crossings.keys()].sort(), ['east', 'north', 'south', 'west']);
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
  assert.ok(shown.items.some(i => i.a === 'HK_Sign_Paired30'));
  assert.ok(!shown.items.some(i => i.a === 'HK_Sign_Stop'), 'unconfirmed imported parking-exit stop sign omitted');
  // The confirmed eastern pair is 40; the western frontage carries a single no-parking disc.
  const forty = shown.items.filter(i => i.a === 'HK_Sign_Paired40');
  assert.equal(forty.length, 1);
  assert.ok(forty.every(i => i.p[2] >= 20 && i.p[2] <= 32), 'on Route 25');
  for (const name of new Set(shown.items.map(i => i.a))) assert.ok(manifest.models[name], `${name}: built`);
  for (const name of ['HK_Sign_Speed30', 'HK_Sign_Speed40', 'HK_Sign_Paired30', 'HK_Sign_Paired40']) {
    for (const material of ['HK_SignRed', 'HK_WhitePaint', 'HK_SignBlue', 'HK_MetalLight']) closed(name, material);
    assert.equal(manifest.models[name].design, name.includes('Paired') ? 'street-view-details-v1' : 'abstract-closed-solids-v2',
      `${name}: authored, digits read from the front`);
  }
  for (const material of ['HK_SignRed', 'HK_SignBlue', 'HK_MetalLight']) closed('HK_Sign_NoParking', material);
});

test('browser road and furniture overrides are idempotent and leave the imported source intact', () => {
  const layout = JSON.parse(fs.readFileSync(new URL('../data/layout.json', import.meta.url)));
  const original = JSON.stringify(layout), shown = webLayout(layout);
  assert.equal(JSON.stringify(layout), original, 'never mutates the generated source');
  assert.deepEqual(webLayout(shown), shown, 'reapplying the browser layout does not duplicate poles or lamps');
  assert.ok(!shown.items.some(i => i.g === 'Roads' || /GateHouse/.test(i.a)), 'the obsolete tile grid and invented gates are not displayed');
  assert.ok(shown.items.some(i => i.a === 'ART_CornerShop'), 'the reviewed junction frontage survives');
  assert.ok(shown.items.filter(i => ['Buildings', 'WebFrontage'].includes(i.g) && i.p[0] > 42)
    .every(i => i.p[2] < 22 + moatBend(i.p[0])), 'the old return-road buildings cannot remain on the moat path');
});

test('the box kei keeps the tall-kei envelope and closed hull, including its front-facing windows', () => {
  const before = bounds(glb('HK_Kei_Tall').json), after = bounds(glb('ART_KeiBox').json);
  for (const end of ['min', 'max']) for (let axis = 0; axis < 3; axis++)
    assert.ok(Math.abs(before[end][axis] - after[end][axis]) < 0.008, `${end}[${axis}]: existing collision envelope`);
  for (const material of ['HK_KeiPaint', 'HK_Rubber', 'ART_Glass']) closed('ART_KeiBox', material);
  const glass = rayDistance(triangles('ART_KeiBox', 'ART_Glass'), [0, 1.5, 5], [0, 0, -1]);
  const hull = rayDistance(triangles('ART_KeiBox', 'HK_KeiPaint'), [0, 1.5, 5], [0, 0, -1]);
  assert.ok(glass < hull, 'the windscreen is outside the body, visible to an approaching participant');
});

test('tactile paving, covers and drains follow the actual ground and never become body-height obstacles', () => {
  const ground = new Ground(JSON.parse(fs.readFileSync(new URL('../data/road_tiles.json', import.meta.url))));
  const file = glb('ART_PavingDetails');
  let count = 0;
  for (const p of file.json.meshes.flatMap(m => m.primitives)) for (const v of accessor(file, p.attributes.POSITION)) {
    const y = ground.heightAt(-v[0], v[2]);
    assert.ok(Math.abs(v[1] - y) < 0.025, `surface at ${v.map(n => n.toFixed(3))} follows ground ${y}`);
    count++;
  }
  assert.ok(count > 1000, 'check the exported relief, not just the placement origin');
});

test('tactile guidance stays on footways when roads and footways share an elevation', () => {
  const tiles = JSON.parse(fs.readFileSync(new URL('../data/road_tiles.json', import.meta.url)));
  const carriageway = new Ground({ road: tiles['Kyobashi carriageway'] });
  const tactile = triangles('ART_PavingDetails', 'ART_Tactile');
  for (const triangle of tactile) {
    const x = -triangle.reduce((sum, v) => sum + v[0], 0) / 3;
    const z = triangle.reduce((sum, v) => sum + v[2], 0) / 3;
    assert.equal(carriageway.roadHeightAt(x, z), null, `no guidance tile in the carriageway at ${x}, ${z}`);
  }
  assert.ok(tactile.length > 500, 'retain continuous guidance between the road openings');
});

test('the road network has one paint layer, and its markings follow the generated carriageway', () => {
  const base = glb('ART_MoatRoadSurface'), original = glb('HK_RoadSurf_Straight', false);
  assert.ok(base.json.meshes.flatMap(m => m.primitives).every(p => base.json.materials[p.material].name === 'HK_Asphalt'),
    'the repeating centre dash is absent from the replacement surface');
  const sourceBounds = bounds({ meshes: original.json.meshes.map(m => ({ ...m,
    primitives: m.primitives.filter(p => original.json.materials[p.material].name === 'HK_Asphalt') })), accessors: original.json.accessors });
  const replacement = bounds(base.json);
  for (const end of ['min', 'max']) for (const axis of [0, 2])
    assert.ok(Math.abs(replacement[end][axis] - sourceBounds[end][axis]) < 0.008, 'same road footprint');
  const ground = new Ground(JSON.parse(fs.readFileSync(new URL('../data/road_tiles.json', import.meta.url))));
  const paint = glb('ART_KyobashiRoads');
  let onMappedRoad = 0;
  for (const p of paint.json.meshes.flatMap(m => m.primitives).filter(p => paint.json.materials[p.material].name === 'HK_WhitePaint')) for (const v of accessor(paint, p.attributes.POSITION)) {
    const road = ground.roadHeightAt(-v[0], v[2]);
    assert.notEqual(road, null, 'all rendered markings have a ground polygon');
    assert.ok(road < 0.055 && Math.abs(v[1] - road) < 0.03,
      `paint at ${[-v[0], v[1], v[2]].map(n => n.toFixed(3))} follows carriageway, ground ${road}`);
    onMappedRoad++;
  }
  assert.ok(onMappedRoad > 100, 'audit the generated polygons, not only their placement origin');
});

test('the bridge entrance has its missing zebra, and the bridge itself has no centre dashes', () => {
  const paint = triangles('ART_KyobashiRoads', 'HK_WhitePaint');
  for (const x of [28.6, 30.3, 32.85, 35.4])
    assert.ok(rayDistance(paint, [-x, 2, 34.2], [0, -1, 0]) < 2, 'the north zebra spans the bridge approach');
  for (const z of [46, 55, 64]) {
    assert.equal(rayDistance(paint, [-32, 2, z], [0, -1, 0]), Infinity, 'no invented centre dashes');
    assert.ok(rayDistance(paint, [-35.62, 2, z], [0, -1, 0]) < 2, 'continuous edge line');
  }
});

test('reviewed grove and town-tree roots rest on authoritative ground', () => {
  const ground = new Ground(JSON.parse(fs.readFileSync(new URL('../data/road_tiles.json', import.meta.url))));
  const shown = webLayout(JSON.parse(fs.readFileSync(new URL('../data/layout.json', import.meta.url))));
  const trees = shown.items.filter(i => ['WebGrove', 'WebTownTrees'].includes(i.g));
  assert.ok(trees.length > 20, 'audit both the bank and street rows');
  for (const item of trees)
    assert.ok(Math.abs(item.p[1] - ground.heightAt(item.p[0], item.p[2])) < 0.025,
      `${item.a} at ${item.p}: roots match the exported terrain`);
});

test('bank vegetation is grounded and leaves the riverside path and bridge approach clear at body height', () => {
  const ground = new Ground(JSON.parse(fs.readFileSync(new URL('../data/road_tiles.json', import.meta.url))));
  const layout = webLayout(JSON.parse(fs.readFileSync(new URL('../data/layout.json', import.meta.url))));
  const bank = layout.items.filter(i => i.g === 'WebBank');
  assert.ok(bank.length > 0);
  const cache = new Map();
  for (const item of bank) {
    assert.ok(Math.abs(item.p[1] - ground.heightAt(item.p[0], item.p[2])) < 0.02, 'roots touch the bank');
    if (!cache.has(item.a)) {
      const f = glb(item.a);
      cache.set(item.a, f.json.meshes.flatMap(m => m.primitives).flatMap(p => accessor(f, p.attributes.POSITION)));
    }
    const angle = item.r * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
    for (const v of cache.get(item.a)) {
      const y = item.p[1] + v[1] * item.s[1];
      if (y < item.p[1] + 0.3 || y > item.p[1] + 1.8) continue;
      const x = item.p[0] - v[0] * item.s[0] * c + v[2] * item.s[2] * s;
      const z = item.p[2] + v[0] * item.s[0] * s + v[2] * item.s[2] * c;
      assert.ok(z - moatBend(x) > moatPathEdge(x) && (x < 24.2 || x > 41.3), 'only high crowns may overhang the curving path; trunks and shrubs stay clear');
    }
  }
});

test('the bridge abutments stay under the deck: no stone sliver across the road at the bridge ends', () => {
  const top = material => Math.max(...triangles('HK_Kyobashi', material).flat().map(p => p[1]));
  const deck = Math.min(...triangles('HK_Kyobashi', 'HK_Asphalt').flat().map(p => p[1]));
  assert.ok(top('HK_StoneDark') < deck - 0.02, `abutment top ${top('HK_StoneDark').toFixed(3)} below the deck ${deck.toFixed(3)}`);
});
