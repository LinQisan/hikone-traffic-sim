import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {Ground} from '../src/simulation/collision/Ground.ts';
import {Obstacles} from '../src/simulation/collision/Obstacles.ts';
import {crossesWall} from '../src/simulation/core/scenario.ts';
import {buildNativeModel} from '../src/three/geometry/model-builder.js';
import {indexMeshRays} from '../src/three/camera/mesh-ray-index.js';
import {CameraObstacles} from '../src/three/camera/camera-obstacles.js';
import {EAST_CAMERA_SOLIDS} from '../src/world/generators/east-layout.ts';

const read = p => JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const ground = new Ground(read('data/road_tiles.json')), body = new Obstacles(read('data/collision.json'));
const source = read('world/east-hikone.json'), walls = read('data/walls.json');

test('the photographed north street retains swept public approaches, crossings and bridge',()=>{
  for (const id of ['way/1355292675','way/1376436168','way/1376436165','way/1374082601',
    'way/1374082599','way/73533337','way/73533338','way/1376682862','way/1464257158']) {
    const path = source.walks.find(p=>p.id===id);
    assert.ok(path,id);
    let previous=[];
    for (let k=1;k<path.points.length;k++) {
      const a=path.points[k-1],c=path.points[k],length=Math.hypot(c[0]-a[0],c[1]-a[1]),count=Math.ceil(length/.2);
      const nx=-(c[1]-a[1])/length,nz=(c[0]-a[0])/length;
      for (let i=0;i<=count;i++) {
        if (id==='way/1464257158' && k===1 && i/count*length<.85) continue;
        const candidates=[];
        for (const offset of [0,-.45,.45]) {
          const x=a[0]+(c[0]-a[0])*i/count+nx*offset,z=a[1]+(c[1]-a[1])*i/count+nz*offset;
          if (ground.roadHeightAt(x,z)==null || body.blocked(x,z,.3)) continue;
          if (previous.length && !previous.some(([px,pz])=>body.allows(px,pz,x,z,.3)
            && !crossesWall(walls,{x:px,z:pz},{x,z}))) continue;
          candidates.push([x,z]);
        }
        assert.ok(candidates.length,`continuous 0.6 m body corridor ${id} at ${a[0]+(c[0]-a[0])*i/count},${a[1]+(c[1]-a[1])*i/count}`);
        previous=candidates;
      }
    }
  }
  const southWalk=source.walks.find(p=>p.id==='way/1376436168').points;
  const [a,c]=southWalk,count=Math.ceil(Math.hypot(c[0]-a[0],c[1]-a[1])/.2);
  for (let i=0;i<=count;i++) {
    const x=a[0]+(c[0]-a[0])*i/count,z=a[1]+(c[1]-a[1])*i/count;
    assert.ok(!body.blocked(x,z,.45),`the moat barrier leaves the opposite cycling corridor clear at ${x},${z}`);
  }
});

for (const suffix of ['','.lod']) test(`north architecture and lettering have real visible surfaces (${suffix||'high'})`,()=>{
  const parts=buildNativeModel(read(`models/ART_EastHikoneBuildings${suffix}.json`)),group=new THREE.Group();
  for (const p of parts) { const m=new THREE.Mesh(p.geometry,p.material);m.applyMatrix4(p.matrix);group.add(m); }
  indexMeshRays(group);group.updateMatrixWorld(true);
  const ray=new THREE.Raycaster();
  // Runtime pigments cull their back faces. Double-sided rays would hide an inward
  // concave-wall normal and let an apparently closed test mesh render as a hole.
  for (const p of parts) p.material.side=THREE.FrontSide;
  for (const [z,x] of [[457,73.94],[480,75.28],[500,75.28]]) {
    ray.set(new THREE.Vector3(-82,4.2,z),new THREE.Vector3(1,0,0));ray.far=25;
    const hit=ray.intersectObject(group,true)[0];
    assert.ok(hit && Math.abs(-hit.point.x-x)<.35,`closed moat-facing museum wall near z=${z}`);
  }
  const top=(x,z)=>{ray.set(new THREE.Vector3(-x,25,z),new THREE.Vector3(0,-1,0));ray.far=30;return ray.intersectObject(group,true)[0]?.point.y;};
  assert.ok(top(70.5,439)>11.5,'the museum end turret rises above the long roof');
  assert.ok(top(70.5,500)<11,'the long middle remains one lower storey');
  assert.ok(top(66.3,390.2)>10.3,'the historic wing has its own two-tier end turret');
  assert.ok(top(62.45,455)<1,'the stair starts at its photographed south end');
  assert.ok(top(62.45,463)>3,'the stair rises toward the mapped entrance');
  ray.set(new THREE.Vector3(-60,.8,460.2),new THREE.Vector3(-1,0,0));ray.far=4;
  assert.equal(ray.intersectObject(group,true).length,0,'the space below the stair is not a full-height stone wedge');
  let glyph;
  for (const m of group.children) {
    if (m.material.name!=='ART_DisplayInk') continue;
    const p=m.geometry.attributes.position,ix=m.geometry.index,count=ix?.count??p.count;
    for (let i=0;i<count;i+=3) {
      const t=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,ix?ix.getX(i+k):i+k).applyMatrix4(m.matrix));
      const c=t[0].add(t[1]).add(t[2]).multiplyScalar(1/3);
      if (c.x>-236 && c.x<-234.5 && c.y>1.7 && c.y<1.86 && Math.abs(c.z-422.61)<.001) {glyph=c;break;}
    }
    if (glyph) break;
  }
  assert.ok(glyph,'the Irohamatsu title is offline mesh lettering, including the low model');
  ray.set(glyph.clone().add(new THREE.Vector3(0,0,.5)),new THREE.Vector3(0,0,-1));ray.far=1;
  assert.ok(ray.intersectObject(group,true)[0]?.point.distanceTo(glyph)<.002,'the title lies outside the supporting board');
  const camera=new CameraObstacles([{asset:'ART_EastHikoneBuildings',items:[{p:[0,0,0],r:0,s:[1,1,1]}],low:parts,cameraSolids:EAST_CAMERA_SOLIDS}]);
  assert.equal(camera.clear(new THREE.Vector3(-82,10.8,439),new THREE.Vector3(-70,10.8,439)),false,'raised turret blocks camera rays');
  assert.equal(camera.cameraClear(new THREE.Vector3(-100,1.7,428)),true,'the public street remains outside the architectural envelopes');
  for (const {mesh} of camera.parts) mesh.geometry.dispose();
  for (const p of parts) {p.geometry.dispose();p.material.dispose();}
  const pine=buildNativeModel(read(`models/ART_IrohaPine${suffix}.json`));
  const needles=pine.filter(p=>p.material.name==='HK_LeafDark').map(p=>{
    p.material.side=THREE.FrontSide;
    const m=new THREE.Mesh(p.geometry,p.material);m.applyMatrix4(p.matrix);m.updateMatrixWorld();return m;
  });
  let visibleFromBelow=0;
  for(let x=-4;x<=4;x+=.5)for(let z=-4;z<=4;z+=.5){
    ray.set(new THREE.Vector3(x,1.7,z),new THREE.Vector3(0,1,0));ray.far=10;
    if(ray.intersectObjects(needles)[0])visibleFromBelow++;
  }
  assert.ok(visibleFromBelow>20,'closed needles remain visible when walking under a front-face-only tree batch');
  for (const p of pine) {p.geometry.dispose();p.material.dispose();}
});
