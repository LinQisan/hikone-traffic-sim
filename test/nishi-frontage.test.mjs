import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {Ground} from '../src/simulation/collision/Ground.ts';
import {Obstacles} from '../src/simulation/collision/Obstacles.ts';
import {buildNativeModel} from '../src/three/geometry/model-builder.js';
import {CameraObstacles} from '../src/three/camera/camera-obstacles.js';
import {EAST_CAMERA_SOLIDS} from '../src/world/generators/east-layout.ts';
import {CASTLE_CAMPUS_LINK} from '../src/world/generators/university-layout.js';
import {indexMeshRays} from '../src/three/camera/mesh-ray-index.js';

const read = file => JSON.parse(fs.readFileSync(new URL('../'+file,import.meta.url)));
const ground = new Ground(read('data/road_tiles.json')), body = new Obstacles(read('data/collision.json'));

test('the closed Nishi gate leaves the photographed public turn and crossing clear',()=>{
  const line=CASTLE_CAMPUS_LINK.slice(2,9);
  for(let k=1;k<line.length;k++){
    const a=line[k-1],c=line[k],count=Math.ceil(Math.hypot(c[0]-a[0],c[1]-a[1])/.25);
    for(let i=0;i<=count;i++){
      const x=a[0]+(c[0]-a[0])*i/count,z=a[1]+(c[1]-a[1])*i/count;
      assert.ok(ground.roadHeightAt(x,z)!=null,`supported street at ${x},${z}`);
      assert.ok(!body.blocked(x,z,.45),`public bicycle body corridor at ${x},${z}`);
    }
  }
  assert.ok(body.blocked(-587,263.2,.3),'the photographed closed accordion gate blocks private campus entry');
});

for(const suffix of ['','.lod'])test(`Nishi nameplate is visible and separate wall envelopes leave the turn open (${suffix||'high'})`,()=>{
  const parts=buildNativeModel(read(`models/ART_EastHikoneBuildings${suffix}.json`)),group=new THREE.Group();
  for(const p of parts){const mesh=new THREE.Mesh(p.geometry,p.material);mesh.applyMatrix4(p.matrix);group.add(mesh);}
  indexMeshRays(group);group.updateMatrixWorld(true);
  const ray=new THREE.Raycaster();let glyph;
  for(const mesh of group.children){
    if(mesh.material.name!=='ART_DisplayInk')continue;
    const p=mesh.geometry.attributes.position,ix=mesh.geometry.index,count=ix?.count??p.count;
    for(let i=0;i<count;i+=3){
      const a=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,ix?ix.getX(i+k):i+k).applyMatrix4(mesh.matrix));
      const c=a[0].add(a[1]).add(a[2]).multiplyScalar(1/3);
      if(c.x>585.1&&c.x<588.9&&c.y>3.8&&c.y<4.12&&c.z<262.81&&c.z>262.75){glyph=c;break;}
    }
    if(glyph)break;
  }
  assert.ok(glyph,'the school name is actual front-facing mesh lettering');
  ray.set(glyph.clone().add(new THREE.Vector3(0,0,-.6)),new THREE.Vector3(0,0,1));
  const hit=ray.intersectObject(group,true)[0];
  assert.equal(hit?.object.material.name,'ART_DisplayInk','no brown portal face occludes the name');
  const camera=new CameraObstacles([{asset:'ART_EastHikoneBuildings',items:[{p:[0,0,0],r:0,s:[1,1,1]}],low:parts,cameraSolids:EAST_CAMERA_SOLIDS}]);
  assert.equal(camera.cameraClear(new THREE.Vector3(588,1.7,248)),true,'public road is outside every wall/gate envelope');
  assert.equal(camera.clear(new THREE.Vector3(590,1.5,250),new THREE.Vector3(597,1.5,250)),false,'the actual stone wall blocks the camera');
  for(const {mesh} of camera.parts)mesh.geometry.dispose();
  for(const p of parts){p.geometry.dispose();p.material.dispose();}
});
