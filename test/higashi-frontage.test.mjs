import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {Ground} from '../src/simulation/collision/Ground.ts';
import {Obstacles} from '../src/simulation/collision/Obstacles.ts';
import {crossesWall} from '../src/simulation/core/scenario.ts';
import {geographicPoint} from '../src/world/geography/coordinates.ts';
import {APPROACH_DATA, APPROACH_CAMERA_SOLIDS, HIGASHI_FRONTAGE} from '../src/world/generators/castle-approach.js';
import {buildNativeModel} from '../src/three/geometry/model-builder.js';
import {CameraObstacles} from '../src/three/camera/camera-obstacles.js';
import {indexMeshRays} from '../src/three/camera/mesh-ray-index.js';

const read = name => JSON.parse(fs.readFileSync(new URL('../' + name, import.meta.url)));
const ground = new Ground(read('data/road_tiles.json'));
const body = new Obstacles(read('data/collision.json'));
const walls = read('data/walls.json');

function corridor(points, radius = .35) {
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1], c = points[k], n = Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1]) / .25);
    for (let i = 0; i <= n; i++) {
      const x = a[0] + (c[0] - a[0]) * i / n, z = a[1] + (c[1] - a[1]) * i / n;
      assert.ok(ground.roadHeightAt(x, z) != null, `ground at ${x},${z}`);
      assert.ok(!body.blocked(x, z, radius), `body clearance at ${x},${z}`);
    }
    assert.ok(!crossesWall(walls, {x:a[0],z:a[1]}, {x:c[0],z:c[1]}), 'no water blocker through the passage');
  }
}

test('the parking triangle connects all three public legs at the same geographic junctions', () => {
  const roads = HIGASHI_FRONTAGE.roads;
  assert.ok(APPROACH_DATA.north.some(p => p[0] === roads.schoolSide[0][0] && p[1] === roads.schoolSide[0][1]));
  assert.ok(APPROACH_DATA.innerRoad.some(p => p[0] === roads.schoolSide.at(-1)[0] && p[1] === roads.schoolSide.at(-1)[1]));
  for (const q of HIGASHI_FRONTAGE.source.osm.features) for (let i = 0; i < q.points.length; i++) {
    const registered = geographicPoint(...q.latlon[i]);
    assert.ok(Math.hypot(registered[0] - q.points[i][0], registered[1] - q.points[i][1]) < .00001, q.id);
  }
  corridor(APPROACH_DATA.north.slice(15));
  corridor(roads.schoolSide);
  corridor(roads.inner);
});

test('the parking entry and retracted school gate admit walking and bicycle bodies', () => {
  for (const radius of [.3, .45]) {
    corridor([[-23,166],[-23,169.35],[-20,177],[-12,182]], radius);
    corridor(HIGASHI_FRONTAGE.gate.approach, radius);
  }
  assert.ok(Math.abs(ground.heightAt(-12,182) - .01) < .0001, 'the lot interior is supported by the same authored surface, not the old grass fallback');
  assert.ok(Math.abs(ground.heightAt(25,166) - .01) < .0001, 'the courtyard has no stacked raised lawn');
  for (const [a,c] of [[[-23,166],[-23,174]],HIGASHI_FRONTAGE.gate.approach.slice(0,2)]) {
    for (let i=0;i<=100;i++) {
      const x=a[0]+(c[0]-a[0])*i/100,z=a[1]+(c[1]-a[1])*i/100;
      assert.ok(Math.abs(ground.heightAt(x,z)-.01)<.0001, `flush access, without a kerb across the entrance at ${x},${z}`);
    }
  }
});

for (const detail of ['', '.lod']) test(`school roofs close each mapped block and leave the real courtyard open (${detail || 'high'})`, () => {
  const parts = buildNativeModel(read(`models/ART_CastleApproach${detail}.json`));
  const group = new THREE.Group();
  for (const part of parts) {
    const mesh = new THREE.Mesh(part.geometry, part.material);
    mesh.applyMatrix4(part.matrix);group.add(mesh);
  }
  indexMeshRays(group);group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const top = (x,z) => {
    ray.set(new THREE.Vector3(-x,30,z), new THREE.Vector3(0,-1,0));
    return ray.intersectObject(group,true)[0]?.point.y;
  };
  assert.ok(top(70,170) > 13 && top(70,170) < 14, 'the main slab has its closed flat roof');
  assert.ok(top(81,191) > 15, 'the clock headhouse sits on the main roof');
  assert.ok(top(102,167) > 10 && top(102,167) < 11, 'the second slab has its separate three-storey roof');
  assert.ok((top(86,163) ?? .01) < .3, 'no generic connector/roof spans the open court');
  const gate = HIGASHI_FRONTAGE.gate, [gx,gz] = gate.center, [tx,tz] = gate.tangent;
  const nx = -tz, nz = tx, u = 6.85;
  ray.set(new THREE.Vector3(-(gx-tx*u+nx),1.3,gz-tz*u+nz),new THREE.Vector3(nx,0,-nz).normalize());
  const board = ray.intersectObject(group,true)[0];
  assert.equal(board?.object.material.name,'ART_DisplayInk','the notice face is in front of the concrete wall, not buried inside it');
  const city = new CameraObstacles([{asset:'ART_CastleApproach',low:parts,cameraSolids:APPROACH_CAMERA_SOLIDS,
    items:[{p:[0,0,0],r:0,s:[1,1,1]}]}]);
  assert.equal(city.cameraClear(new THREE.Vector3(-18.2,1.7,169.7)), true, 'the gate is not one solid camera envelope');
  assert.equal(city.clear(new THREE.Vector3(-12,1.4,153),new THREE.Vector3(-21,1.4,153)),false,'the actual gate wall blocks camera sight lines');
  for (const part of parts) {part.geometry.dispose();part.material.dispose();}
  for (const {mesh} of city.parts) mesh.geometry.dispose();
});
