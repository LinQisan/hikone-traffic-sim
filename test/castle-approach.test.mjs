import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { Ground } from '../src/ground.js';
import { APPROACH_DATA } from '../src/castle-approach.js';
import { smoothRoute, carPose } from '../src/traffic.js';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('../vendor/three/three.module.js', import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: new URL(`../vendor/three/addons/${specifier.slice(13)}`, import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const THREE = await import('three');
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const { Obstacles } = await import('../src/obstacles.js');
const { CameraObstacles } = await import('../src/camera-obstacles.js');
const read = async name => JSON.parse(await fs.readFile(new URL('../data/' + name, import.meta.url)));
const ground = new Ground(await read('road_tiles.json'));
const map = await read('map.json'), obstacles = new Obstacles(await read('collision.json'));

function* samples(points, spacing = 0.5) {
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i];
    const count = Math.ceil(Math.hypot(bx - ax, bz - az) / spacing);
    for (let j = 0.5; j < count; j++) yield [ax + (bx - ax) * j / count, az + (bz - az) * j / count];
  }
}

test('Kyobashi connects to the inner-moat road without terrain, buildings or water across the route', () => {
  let checked = 0;
  for (const path of [APPROACH_DATA.north, APPROACH_DATA.innerRoad]) for (const [x, z] of samples(path)) {
    assert.ok(Math.abs(ground.roadHeightAt(x, z) - 0.01) < 0.0001, `continuous carriageway at ${x}, ${z}`);
    if (x > map.world.xMin && x < map.world.xMax && z < map.world.zMax) {
      assert.ok(!obstacles.blocked(x, z, 0.35), `the approach is not blocked at ${x}, ${z}`);
    }
    checked++;
  }
  assert.ok(checked > 1000, 'inspect the full connecting road, including both sides of the T junction');
});

test('the exported inner-moat water walls contain neither the road nor the Otemon bridge', () => {
  const water = map.walls.filter(w => w.name.startsWith('Inner moat '));
  assert.ok(water.length > 20, 'the editor and walking bounds include the new moat');
  const inside = (x, z, values) => {
    let hit = false;
    for (let i = 0, j = values.length - 2; i < values.length; j = i, i += 2) {
      const ax = values[i], az = values[i + 1], bx = values[j], bz = values[j + 1];
      if ((az > z) !== (bz > z) && x < ax + (bx - ax) * (z - az) / (bz - az)) hit = !hit;
    }
    return hit;
  };
  for (const path of [APPROACH_DATA.north, APPROACH_DATA.innerRoad, APPROACH_DATA.path])
    for (const [x, z] of samples(path, 1)) assert.ok(!water.some(w => inside(x, z, w.polygon)), `water blocks the route at ${x}, ${z}`);
});

test('ordinary traffic retains its original route duration and arrival at the practice crossing', async () => {
  // Before the northern tail was fitted to the real approach. These are distances along
  // the old smoothed routes, preserving both traffic lifetime and the phase at the crossing.
  const references = [
    { length: 250.1954706718624, distance: 126.33080976693509, x: 30.153469646530258, yaw: 0.005427498854984523 },
    { length: 248.5841089617686, distance: 122.49347936414411, x: 33.846550699017584, yaw: 179.99458773540712 },
  ];
  for (const id of ['builtin-02', 'builtin-05']) {
    const scenario = await read(`scenarios/${id}.json`);
    references.forEach((ref, i) => {
      const vehicle = scenario.vehicles[i], path = smoothRoute(vehicle.route), pose = carPose(path, ref.distance, 2.7);
      assert.equal(vehicle.accident, false);
      assert.ok(Math.abs(path.at(-1).s - ref.length) < 0.00001, 'same ordinary-traffic lifetime');
      assert.ok(Math.hypot(pose.x - ref.x, pose.z - 26) < 0.00001, 'same crossing pose at the same travelled distance');
      assert.ok(Math.abs(pose.yaw - ref.yaw) < 0.00001, 'same heading through the practice crossing');
      assert.equal(vehicle.delaySeconds, 5);
      assert.equal(vehicle.speedKmh, 36);
    });
  }
});

test('batching the distant surroundings does not make open northern roads solid to replay cameras', async () => {
  const bytes = await fs.readFile(new URL('../data/models/impressionist/ART_CastleApproach.lod.glb', import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  gltf.scene.updateMatrixWorld(true);
  const low = [];
  gltf.scene.traverse(o => { if (o.isMesh) low.push({ geometry: o.geometry, material: o.material, matrix: o.matrixWorld.clone() }); });
  const definition = { asset: 'ART_CastleApproach', low, cameraSolids: APPROACH_DATA.buildings,
    items: [{ p: [0, 0, 0], r: 0, s: [1, 1, 1] }] };
  const city = new CameraObstacles([definition]);
  const road = new THREE.Vector3(-2.34729, 2, 138.86052);
  assert.equal(city.cameraClear(road), true, 'the open road between the longhouse and school is free');
  assert.equal(city.clear(road, new THREE.Vector3(9, 2, 138.86052)), false, 'the actual longhouse wall still blocks sight lines');
  assert.ok(city.parts.length >= 10, 'each observed building keeps its own camera bounds');
});

for (const detail of ['', '.lod']) {
  test(`the Otemon path rises with the hill and stays above the rendered terrain (${detail || 'high'})`, async () => {
    const bytes = await fs.readFile(new URL(`../data/models/impressionist/ART_CastleApproach${detail}.glb`, import.meta.url));
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const hillBytes = await fs.readFile(new URL(`../data/models/impressionist/HK_Terrain_Hikone${detail}.glb`, import.meta.url));
    const hill = await new GLTFLoader().parseAsync(hillBytes.buffer.slice(hillBytes.byteOffset, hillBytes.byteOffset + hillBytes.byteLength), '');
    hill.scene.position.set(-APPROACH_DATA.castle.x, 0, APPROACH_DATA.castle.z);
    hill.scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(), hits = [];
    let previous = null, checked = 0;
    for (const [x, z] of samples(APPROACH_DATA.path)) {
      const height = ground.roadHeightAt(x, z);
      assert.ok(height != null && height >= 0.0099, `ground under the entry path at ${x}, ${z}`);
      ray.set(new THREE.Vector3(-x, 100, z), new THREE.Vector3(0, -1, 0));
      hits.length = 0;
      ray.intersectObject(gltf.scene, true, hits);
      assert.ok(hits.some(hit => Math.abs(hit.point.y - height) < 0.0001), `rendered walking surface at ${x}, ${z}`);
      if (height > 0.17) {
        ray.set(new THREE.Vector3(-x, height + 0.02, z), new THREE.Vector3(0, -1, 0));
        ray.far = 0.1; hits.length = 0;
        ray.intersectObject(hill.scene, true, hits);
        assert.ok(hits.length && Math.abs(hits[0].point.y - height + 0.01) < 0.0001,
          `the hillside supports the path without burying it at ${x}, ${z}`);
        ray.far = Infinity;
      }
      if (previous) assert.ok(Math.abs(height - previous[2]) <= Math.hypot(x - previous[0], z - previous[1]) * 1.5 + 0.16,
        'the entry has a slope, not a vertical wall across the path');
      previous = [x, z, height]; checked++;
    }
    assert.ok(previous[2] > 1, 'the ticket-office approach no longer stays buried at road level');
    assert.ok(checked > 200);
    gltf.scene.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    hill.scene.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  });
}
