import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { Ground } from '../src/ground.js';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('../vendor/three/three.module.js', import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: new URL(`../vendor/three/addons/${specifier.slice(13)}`, import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const THREE = await import('three');
const { indexMeshRays } = await import('../tools/mesh-ray-index.mjs');
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const tiles = JSON.parse(await fs.readFile(new URL('../data/road_tiles.json', import.meta.url)));
const ground = new Ground(tiles);
const material = new THREE.MeshBasicMaterial({ side: THREE.FrontSide });

async function buildGeometry(detail) {
  const vertical = [], tops = [], caps = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const normal = new THREE.Vector3(), edge = new THREE.Vector3(), secondEdge = new THREE.Vector3();
  for (const asset of ['ART_KyobashiRoads', 'ART_KyobashiBanks', 'ART_CastleApproach']) {
    const bytes = await fs.readFile(new URL(`../data/models/impressionist/${asset}${detail}.glb`, import.meta.url));
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    gltf.scene.traverse(object => {
      if (!object.isMesh || !['HK_Asphalt', 'HK_Sidewalk', 'HK_Curb', 'HK_Stone'].includes(object.material.name)) return;
      const g = object.geometry, p = g.attributes.position;
      for (let i = 0; i < g.index.count; i += 3) {
        a.fromBufferAttribute(p, g.index.getX(i));
        b.fromBufferAttribute(p, g.index.getX(i + 1));
        c.fromBufferAttribute(p, g.index.getX(i + 2));
        normal.crossVectors(edge.subVectors(b, a), secondEdge.subVectors(c, a));
        if (object.material.name === 'HK_Curb') assert.ok(normal.lengthSq() > 0, 'no collinear exported curb triangles');
        const triangle = [...a.toArray(), ...b.toArray(), ...c.toArray()];
        if (Math.abs(normal.y) < normal.length() * 1e-5 && normal.lengthSq() > 1e-18) vertical.push(...triangle);
        if (asset === 'ART_KyobashiBanks' || normal.y < normal.length() * 0.7) continue;
        const curb = object.material.name === 'HK_Curb';
        const base = [a, b, c].every(v => Math.abs(v.y - ground.heightAt(-v.x, v.z)) < 0.00005);
        if (curb || base) tops.push(...triangle);
        if (curb) caps.push([a.clone(), b.clone(), c.clone()]);
      }
    });
  }
  const mesh = positions => indexMeshRays(new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position',
    new THREE.Float32BufferAttribute(positions, 3)), material));
  return { vertical: mesh(vertical), tops: mesh(tops), caps };
}

// The four assertions query the same immutable exported surfaces at each detail level.
const prepared = new Map();
function geometry(detail) {
  if (!prepared.has(detail)) prepared.set(detail, buildGeometry(detail));
  return prepared.get(detail);
}
after(async () => {
  for (const promise of prepared.values()) {
    const meshes = await promise;
    meshes.vertical.geometry.dispose(); meshes.tops.geometry.dispose();
  }
  material.dispose();
});

for (const detail of ['', '.lod']) {
  test(`the north bridge opening closes the exposed bank without covering the walking margin (${detail || 'high'})`, async () => {
    const meshes = await geometry(detail), ray = new THREE.Raycaster(), hits = [];
    const from = new THREE.Vector3(-32, 2.1, 53);
    // These formerly looked through the unclosed bank beside the eastern bridge end,
    // including below the town ground level. The faces belong to the bank's true contour.
    for (const [x, z] of [[40.9228715, 83.1222401], [38.660272, 75.5130717]]) {
      ray.set(from, new THREE.Vector3(-x, 0.15, z).sub(from).normalize());
      ray.far = 50; hits.length = 0;
      ray.intersectObject(meshes.vertical, false, hits);
      assert.ok(hits.length, 'the bank is closed to the water bed instead of exposing sky');
    }
    assert.ok(Math.abs(ground.heightAt(37.6, 72) - 0.01) < 0.00001, 'the existing bridge walking margin stays flush');
  });

  test(`road/pavement steps are closed across the complete exported network (${detail || 'high'})`, async () => {
    const meshes = await geometry(detail), ray = new THREE.Raycaster(), hits = [];
    let checked = 0;
    const edges = new Set();
    for (const triangle of tiles['Kyobashi carriageway']) {
      for (let i = 0; i < 3; i++) {
        const j = (i + 1) % 3;
        const ax = triangle[i * 3], az = triangle[i * 3 + 2], bx = triangle[j * 3], bz = triangle[j * 3 + 2];
        const key = [[ax, az].join(','), [bx, bz].join(',')].sort().join('/');
        if (edges.has(key)) continue;
        edges.add(key);
        const length = Math.hypot(bx - ax, bz - az);
        if (length < 0.002) continue;
        const x = (ax + bx) / 2, z = (az + bz) / 2, nx = -(bz - az) / length, nz = (bx - ax) / length;
        const epsilon = 0.003;
        const left = ground.heightAt(x + nx * epsilon, z + nz * epsilon);
        const right = ground.heightAt(x - nx * epsilon, z - nz * epsilon);
        if (Math.min(left, right) > 0.0101 || Math.max(left, right) < 0.011) continue;
        const sign = left > right ? 1 : -1, y = (0.01 + Math.max(left, right)) / 2;
        ray.set(new THREE.Vector3(-(x - nx * sign * epsilon), y, z - nz * sign * epsilon),
          new THREE.Vector3(-nx * sign, 0, nz * sign));
        ray.far = 2 * epsilon + 0.0001;
        hits.length = 0;
        ray.intersectObject(meshes.vertical, false, hits);
        assert.ok(hits.length, `closed outward-facing step at ${x.toFixed(5)}, ${z.toFixed(5)}, y=${y.toFixed(5)}`);
        checked++;
      }
    }
    assert.ok(checked > 500, `check the whole road network, not only the practice intersection: ${checked}`);
  });

  test(`flush footways retain both exposed kerb faces and open crossings (${detail || 'high'})`, async () => {
    const meshes = await geometry(detail), ray = new THREE.Raycaster(), hits = [];
    for (const [z, direction] of [[29.6, 1], [30.6, -1], [22.4, -1], [21.4, 1]]) {
      ray.set(new THREE.Vector3(-60, 0.085, z), new THREE.Vector3(0, 0, direction));
      ray.far = 0.7; hits.length = 0;
      ray.intersectObject(meshes.vertical, false, hits);
      assert.ok(hits.length, 'a low eye on either side sees a closed kerb face');
    }
    for (const x of [19.7, 44.3]) {
      ray.set(new THREE.Vector3(-x, 0.085, 29.8), new THREE.Vector3(0, 0, 1));
      ray.far = 0.5; hits.length = 0;
      ray.intersectObject(meshes.vertical, false, hits);
      assert.equal(hits.length, 0, 'the zebra opening has no upright kerb across it');
    }
    assert.ok(Math.abs(ground.heightAt(60, 30.6) - ground.heightAt(60, 29.6)) < 1e-6,
      'the separated kerb stands between level road and walking surfaces');
  });

  test(`separate curb caps match ground queries without coplanar overlap (${detail || 'high'})`, async () => {
    const meshes = await geometry(detail), ray = new THREE.Raycaster(), hits = [], centre = new THREE.Vector3();
    for (const triangle of meshes.caps) {
      centre.copy(triangle[0]).add(triangle[1]).add(triangle[2]).divideScalar(3);
      const height = ground.heightAt(-centre.x, centre.z);
      assert.ok(Math.abs(centre.y - height) < 0.00005,
        `the cap has no extra renderer/mesh lift at ${-centre.x}, ${centre.z}: ${centre.y} / ${height}`);
      assert.ok(centre.y <= 0.16001 && centre.y >= 0.00999, '15 cm kerb caps and the authored bridge ramps');
      ray.set(new THREE.Vector3(centre.x, 1, centre.z), new THREE.Vector3(0, -1, 0));
      ray.far = 2;
      hits.length = 0;
      ray.intersectObject(meshes.tops, false, hits);
      const touching = hits.filter(h => Math.abs(h.point.y - centre.y) < 0.00001);
      assert.equal(touching.length, 1, `one cap surface at ${(-centre.x).toFixed(5)}, ${centre.z.toFixed(5)}`);
    }
    assert.ok(meshes.caps.length > 100, 'audit caps along straights and bends');
    // A sub-millimetre corner fragment used to be discarded by the polygon area cutoff.
    ray.set(new THREE.Vector3(-32.04618, 1, 84.969566667), new THREE.Vector3(0, -1, 0));
    hits.length = 0;
    ray.intersectObject(meshes.tops, false, hits);
    assert.ok(hits.some(hit => Math.abs(hit.point.y - 0.16) < 0.00001), 'no pinhole at the northern bend join');
  });
}
