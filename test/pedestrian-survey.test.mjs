// Walked street and bridge sight lines from the owner's 1 November 2026 survey.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {Ground} from '../src/simulation/collision/Ground.ts';
import {Obstacles} from '../src/simulation/collision/Obstacles.ts';
import {crossesWall} from '../src/simulation/core/scenario.ts';
import {buildNativeModel} from '../src/three/geometry/model-builder.js';
import {toThree} from '../src/three/scene/coords.ts';
import {CASTLE_SITE} from '../src/world/generators/castle-layout.js';

const read = name => JSON.parse(fs.readFileSync(new URL('../' + name, import.meta.url)));
const ground = new Ground(read('data/road_tiles.json'));
const body = new Obstacles(read('data/collision.json'));
const walls = read('data/walls.json');

// Registered OSM way 121393441, independently supported by IMG_1071/1072 and
// the November 2022 panorama. These are road stations, not raw camera GPS fixes.
const street = [[-304.8,210.965],[-277,206.54],[-232,199.375],[-187.27,192.251],[-133,183.87],[-80.61,175.415]];

test('the inner-moat street carries a continuous swept pedestrian corridor through the photographed frontage', () => {
  for (let k = 1; k < street.length; k++) {
    const a = street[k - 1], c = street[k], length = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const nx = -(c[1] - a[1]) / length, nz = (c[0] - a[0]) / length;
    const count = Math.ceil(length / .25);
    for (const offset of [-.7, 0, .7]) {
      let previous = null;
      for (let i = 0; i <= count; i++) {
        const x = a[0] + (c[0] - a[0]) * i / count + nx * offset;
        const z = a[1] + (c[1] - a[1]) * i / count + nz * offset;
        assert.ok(Math.abs(ground.roadHeightAt(x,z) - .01) < .001, `flush public street at ${x},${z}`);
        assert.ok(!body.blocked(x,z,.3), `body clearance at ${x},${z}`);
        if (previous) assert.ok(!crossesWall(walls,previous,{x,z}), 'no moat barrier through the walking route');
        previous = {x,z};
      }
    }
  }
});

function model(name, detail, origin = [0,0,0]) {
  const group = new THREE.Group();
  group.position.copy(toThree(...origin));
  for (const part of buildNativeModel(read(`models/${name}${detail}.json`))) {
    const mesh = new THREE.Mesh(part.geometry,part.material);
    mesh.applyMatrix4(part.matrix); group.add(mesh);
  }
  group.updateMatrixWorld(true);
  return group;
}
function dispose(group) {
  group.traverse(mesh => { if (mesh.isMesh) { mesh.geometry.dispose(); mesh.material.dispose(); } });
}

for (const detail of ['', '.lod']) {
  test(`the bridge sees trees and the museum without stone curtains from clipped foliage, ${detail || 'high'}`, () => {
    const group = model('HK_Terrain_Hikone', detail, [CASTLE_SITE.x,0,CASTLE_SITE.z]);
    try {
      const start = toThree(23,1.7,367);
      // The real bank still closes to its 2.6 m ground height here.
      for (const height of [5,8,11.3]) {
        const target = toThree(-20,height,374);
        const ray = new THREE.Raycaster(start,target.sub(start).normalize(),0,55);
        const falseWalls = ray.intersectObject(group,true).filter(hit => hit.object.material.name === 'HK_Stone');
        assert.equal(falseWalls.length,0,`a clipped canopy cannot become a stone wall at height ${height}`);
      }
    } finally { dispose(group); }
  });
  test(`the visible road agrees with Ground beside the hedge, ${detail || 'high'}`, () => {
    const group = new THREE.Group();
    for (const name of ['ART_CastleApproach','ART_InnerMoatStreet','ART_EastHikoneSurface']) group.add(model(name,detail));
    group.updateMatrixWorld(true);
    try {
      for (const [x,z] of street.slice(0,4)) {
        const ray = new THREE.Raycaster(toThree(x,3,z),new THREE.Vector3(0,-1,0),0,4);
        const surface = ray.intersectObject(group,true)[0];
        assert.ok(surface,`visible support at ${x},${z}`);
        assert.equal(surface.object.material.name,'HK_Asphalt','car-park gravel cannot cover the public road');
        assert.ok(Math.abs(surface.point.y - ground.roadHeightAt(x,z)) < .001,'rendered and walking heights agree');
      }
    } finally { dispose(group); }
  });
}
