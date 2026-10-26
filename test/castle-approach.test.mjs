import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Ground } from '../src/simulation/collision/Ground.ts';
import { APPROACH_DATA } from '../src/world/generators/castle-approach.js';
import { smoothRoute, carPose } from '../src/simulation/traffic/Traffic.ts';
import { HIKONE_BOUNDS } from '../src/simulation/core/scenario.ts';

const THREE = await import('three');
const { indexMeshRays } = await import('../src/three/camera/mesh-ray-index.js');
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const { Obstacles } = await import('../src/simulation/collision/Obstacles.ts');
const { CameraObstacles } = await import('../src/three/camera/camera-obstacles.js');
const read = async name => JSON.parse(await fs.readFile(new URL('../data/' + name, import.meta.url)));
const ground = new Ground(await read('road_tiles.json'));
const map = await read('map.json'), obstacles = new Obstacles(await read('collision.json'));

test('the castle entrance slopes, gates, keep, west ridge and lower buildings form one path network', () => {
  const { nodes, routes } = APPROACH_DATA.paths;
  const reached = new Set(['otemon']);
  for (let pass = 0; pass < routes.length; pass++) for (const route of routes) {
    assert.deepEqual(route.points[0], nodes[route.from], `${route.id}: starts at its junction`);
    assert.deepEqual(route.points.at(-1), nodes[route.to], `${route.id}: reaches its junction`);
    if (reached.has(route.from)) reached.add(route.to);
    if (reached.has(route.to)) reached.add(route.from);
  }
  for (const id of ['tenbin', 'taikoSouth', 'honmaru', 'nishinomaru', 'kuromon', 'museum', 'sawaguchi'])
    assert.ok(reached.has(id), `${id}: reachable from the Otemon entrance`);
});

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
    // Body clearance is guaranteed inside the practice area, independently of editor coverage.
    if (x > HIKONE_BOUNDS.xMin && x < HIKONE_BOUNDS.xMax && z < HIKONE_BOUNDS.zMax) {
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
  const castleLand = APPROACH_DATA.paths.routes.filter(r => r.kind !== 'bridge').map(r => r.points.map(([x, y, z]) => [x, z]));
  for (const path of [APPROACH_DATA.north, APPROACH_DATA.innerRoad, APPROACH_DATA.path, ...castleLand])
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
  test(`wooded slopes do not acquire vertical shelves between court aprons (${detail || 'high'})`, async () => {
    const bytes = await fs.readFile(new URL(`../data/models/impressionist/HK_Terrain_Hikone${detail}.glb`, import.meta.url));
    const hill = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
    const exclusions = APPROACH_DATA.paths.routes.flatMap(r => r.points.slice(1).map((p, i) =>
      [r.points[i][0], r.points[i][2], p[0], p[2], r.width / 2 + 7]));
    for (const t of APPROACH_DATA.terraces) for (let i = 0; i < t.footprint.length; i++) {
      const a = t.footprint[i], b = t.footprint[(i + 1) % t.footprint.length];
      exclusions.push([...a, ...b, 8]);
    }
    const close = (x, z, [ax, az, bx, bz, radius]) => {
      const dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(x - ax - t * dx, z - az - t * dz) < radius;
    };
    let checked = 0;
    hill.traverse(o => {
      if (!o.isMesh || o.material.name !== 'HK_Grass') return;
      const p = o.geometry.attributes.position, index = o.geometry.index;
      for (let i = 0; i < index.count; i += 3) for (let edge = 0; edge < 3; edge++) {
        const a = index.getX(i + edge), b = index.getX(i + (edge + 1) % 3);
        const length = Math.hypot(p.getX(a) - p.getX(b), p.getZ(a) - p.getZ(b));
        const x = APPROACH_DATA.castle.x - (p.getX(a) + p.getX(b)) / 2;
        const z = APPROACH_DATA.castle.z + (p.getZ(a) + p.getZ(b)) / 2;
        if (length < 0.1 || exclusions.some(e => close(x, z, e))) continue;
        // Retaining walls and authored path cuts are excluded. A discontinuous apron
        // previously created a 30 m shelf over 5.7 m in the unretained wooded slope.
        assert.ok(Math.abs(p.getY(a) - p.getY(b)) / length < 3, `no artificial cliff at ${x}, ${z}`);
        checked++;
      }
    });
    assert.ok(checked > 1000, 'inspect the exported wooded hillside, not only court samples');
    hill.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  });

  test(`castle buildings occupy separate supported terraces, including the west ridge (${detail || 'high'})`, async () => {
    const load = async name => {
      const bytes = await fs.readFile(new URL(`../data/models/impressionist/${name}${detail}.glb`, import.meta.url));
      return indexMeshRays((await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene);
    };
    const hill = await load('HK_Terrain_Hikone'), buildings = await load('ART_HikoneCompound');
    for (const root of [hill, buildings]) {
      root.position.set(-APPROACH_DATA.castle.x, 0, APPROACH_DATA.castle.z);
      root.updateMatrixWorld(true);
    }
    const ray = new THREE.Raycaster(), hits = [];
    for (const site of APPROACH_DATA.compound) {
      if (site.floor > 1 || site.id === 'omotegoten') {
        // The gate's centre is a passage, with path bedding below the floor. Inspect
        // a gate post instead of treating the newly open portal as a solid foundation.
        const dx = ['taikomon', 'tenbin'].includes(site.id) ? 5 : 0, a = site.yaw * Math.PI / 180;
        ray.set(new THREE.Vector3(-site.x - dx * Math.cos(a), 100, site.z - dx * Math.sin(a)), new THREE.Vector3(0, -1, 0));
        hits.length = 0; ray.intersectObject(hill, true, hits);
        assert.ok(hits.length && Math.abs(hits[0].point.y - site.floor) < 0.001,
          `${site.id}: its foundation meets the hill, not a floating or buried roof`);
      }
      const dx = site.id === 'omotegoten' ? -10 : 0;
      const a = site.yaw * Math.PI / 180;
      ray.set(new THREE.Vector3(-site.x - dx * Math.cos(a), 100, site.z - dx * Math.sin(a)), new THREE.Vector3(0, -1, 0));
      hits.length = 0; ray.intersectObject(buildings, true, hits);
      assert.ok(hits.length && hits[0].point.y > site.floor + 4, `${site.id}: a distinct roof survives both detail levels`);
    }
    // A point below the summit is not below every face of a concave terraced hill.
    // Inspect cleared court edges too: down-facing triangles used to expose the sky here.
    const footprint = [...APPROACH_DATA.innerBank, ...APPROACH_DATA.northBank];
    const onHill = (x, z) => {
      let inside = false;
      for (let i = 0, j = footprint.length - 1; i < footprint.length; j = i++) {
        const [ax, az] = footprint[i], [bx, bz] = footprint[j];
        if ((az > z) !== (bz > z) && x < ax + (bx - ax) * (z - az) / (bz - az)) inside = !inside;
      }
      return inside;
    };
    for (const terrace of APPROACH_DATA.terraces) {
      const p = terrace.footprint, cx = p.reduce((s, p) => s + p[0], 0) / 4, cz = p.reduce((s, p) => s + p[1], 0) / 4;
      for (const scale of [0.8, 1.06, 1.2, 1.4]) for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length];
        for (const t of [0.25, 0.5, 0.75]) {
          const x = cx + (a[0] + (b[0] - a[0]) * t - cx) * scale;
          const z = cz + (a[1] + (b[1] - a[1]) * t - cz) * scale;
          if (!onHill(x, z)) continue; // Expanded low-court samples may reach the moat.
          ray.set(new THREE.Vector3(-x, 100, z), new THREE.Vector3(0, -1, 0));
          hits.length = 0; ray.intersectObject(hill, true, hits);
          assert.ok(hits.length, `${terrace.id}: no back-face hole beside its court at ${x}, ${z}`);
        }
      }
    }
    for (const root of [hill, buildings]) root.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  });

  test(`the Otemon bridge and bank landing retain supported walking ground (${detail || 'high'})`, async () => {
    const bytes = await fs.readFile(new URL(`../data/models/impressionist/ART_CastleApproach${detail}.glb`, import.meta.url));
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    indexMeshRays(gltf.scene);
    const ray = new THREE.Raycaster(), hits = [];
    let previous = null, checked = 0;
    for (const [x, z] of samples(APPROACH_DATA.path)) {
      const height = ground.roadHeightAt(x, z);
      assert.ok(height != null && height >= 0.0099, `ground under the entry path at ${x}, ${z}`);
      ray.set(new THREE.Vector3(-x, 100, z), new THREE.Vector3(0, -1, 0));
      hits.length = 0;
      ray.intersectObject(gltf.scene, true, hits);
      assert.ok(hits.some(hit => Math.abs(hit.point.y - height) < 0.0001), `rendered walking surface at ${x}, ${z}`);
      if (previous) assert.ok(Math.abs(height - previous[2]) <= Math.hypot(x - previous[0], z - previous[1]) * 1.5 + 0.16,
        'the entry has a slope, not a vertical wall across the path');
      previous = [x, z, height]; checked++;
    }
    assert.ok(Math.abs(previous[2] - 0.16) < 0.001, 'the bank landing joins the castle entrance path at pavement height');
    assert.ok(checked > 80);
    gltf.scene.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  });
}
