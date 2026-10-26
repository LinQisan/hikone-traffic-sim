import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { APPROACH_DATA } from '../src/world/generators/castle-approach.js';
import { Ground } from '../src/simulation/collision/Ground.ts';

const THREE = await import('three');
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const tiles = JSON.parse(await fs.readFile(new URL('../data/road_tiles.json', import.meta.url)));

const { indexMeshRays } = await import('../src/three/camera/mesh-ray-index.js');

for (const detail of ['', '.lod']) {
  test(`castle paths have matching walking surfaces and clear body space through the gates (${detail || 'high'})`, async () => {
    const load = async name => {
      const bytes = await fs.readFile(new URL(`../data/models/impressionist/${name}${detail}.glb`, import.meta.url));
      return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
    };
    const compound = await load('ART_HikoneCompound'), hill = await load('HK_Terrain_Hikone');
    const approach = await load('ART_CastleApproach');
    approach.updateMatrixWorld(true);
    for (const root of [compound, hill]) {
      root.position.set(-APPROACH_DATA.castle.x, 0, APPROACH_DATA.castle.z);
      root.updateMatrixWorld(true);
      root.traverse(o => { if (o.isMesh) o.material.side = THREE.DoubleSide; });
    }
    approach.traverse(o => { if (o.isMesh) o.material.side = THREE.DoubleSide; });
    const geometry = indexMeshRays(compound), terrain = indexMeshRays(hill), street = indexMeshRays(approach);
    const ray = new THREE.Raycaster(), hits = [];
    let checked = 0;
    for (const route of APPROACH_DATA.paths.routes) {
      const triangles = tiles['Hikone castle path ' + route.id];
      assert.ok(triangles?.length, `${route.id}: exported ground, including its own level under/over Roka`);
      const ground = new Ground({ path: triangles, road: tiles['Kyobashi carriageway'] });
      for (let i = 1; i < route.points.length; i++) {
        const a = route.points[i - 1], b = route.points[i], length = Math.hypot(b[0] - a[0], b[2] - a[2]);
        const nx = -(b[2] - a[2]) / length, nz = (b[0] - a[0]) / length;
        const count = Math.ceil(length / 1.2);
        for (let j = 0.371; j < count; j++) for (const side of [-0.45, 0, 0.45]) {
          const t = j / count, x = a[0] + (b[0] - a[0]) * t + nx * side, z = a[2] + (b[2] - a[2]) * t + nz * side;
          const y = ground.roadHeightAt(x, z);
          const low = route.kind === 'street' ? 0.01 : Math.min(a[1], b[1]);
          assert.ok(y != null && y >= low - 0.001 && y <= Math.max(a[1], b[1]) + 0.001, `${route.id}: continuous steps within its landing levels at ${x}, ${z}`);
          ray.set(new THREE.Vector3(-x, y + 0.025, z), new THREE.Vector3(0, -1, 0));
          ray.far = 0.05; hits.length = 0; ray.intersectObject(geometry, true, hits);
          ray.intersectObject(street, true, hits);
          assert.ok(hits.some(h => Math.abs(h.point.y - y) < 0.0001), `${route.id}: rendered tread equals walking ground at ${x}, ${z}, ground ${y}, hits ${hits.map(h => h.point.y)}`);
          ray.set(new THREE.Vector3(-x, y + 0.32, z), new THREE.Vector3(0, 1, 0));
          ray.far = 1.45; hits.length = 0;
          ray.intersectObject(geometry, true, hits); ray.intersectObject(terrain, true, hits);
          assert.equal(hits.length, 0, `${route.id}: no wall, tree or hillside in body space at ${x}, ${z}: ${hits.map(h => h.object.material.name + ' ' + h.point.y.toFixed(3))}`);
          for (const height of [0.4, 1.3]) {
            ray.set(new THREE.Vector3(-x + nx * 0.6, y + height, z - nz * 0.6), new THREE.Vector3(-nx, 0, nz));
            ray.far = 1.2; hits.length = 0;
            ray.intersectObject(geometry, true, hits); ray.intersectObject(terrain, true, hits);
            assert.equal(hits.length, 0, `${route.id}: clear body width at ${x}, ${z}, ground ${y}: ${hits.map(h => h.object.material.name + ' ' + h.point.toArray().map(v => v.toFixed(3)))}`);
          }
          checked++;
        }
      }
    }
    assert.ok(checked > 1000, 'inspect the complete network and both sides of the walking body');
    for (const root of [compound, hill, approach]) root.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  });
}
