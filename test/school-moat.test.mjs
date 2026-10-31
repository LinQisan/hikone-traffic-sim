// Regressions for the exported bank and roadside furniture observed in IMG_0848.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {Ground} from '../src/simulation/collision/Ground.ts';
import {Obstacles} from '../src/simulation/collision/Obstacles.ts';
import {buildNativeModel} from '../src/three/geometry/model-builder.js';
import {CASTLE_CAMPUS_LINK} from '../src/world/generators/university-layout.js';
const read=file=>JSON.parse(fs.readFileSync(new URL('../'+file,import.meta.url)));
const ground=new Ground(read('data/road_tiles.json')),body=new Obstacles(read('data/collision.json'));
test('the raised rampart ground joins the retained Kyobashi bank without a height crack',()=>{
  assert.ok(ground.heightAt(-540,183)>2.5,'the photographed shore has a raised crest, not a flat playing field');
  assert.ok(ground.heightAt(-530,183)<.3,'the inner school ground returns to its retained level');
  for(const z of [90,100,110,116]){
    const west=ground.heightAt(-220.15,z),east=ground.heightAt(-219.85,z);
    assert.ok(Number.isFinite(west)&&Number.isFinite(east),'both sides of the ground seam exist');
    assert.ok(Math.abs(west-east)<.12,`bank height continuity at z=${z}: ${west}, ${east}`);
  }
});
test('a continuous walking corridor passes the cabinet, transformer pole and benches',()=>{
  const a=CASTLE_CAMPUS_LINK[1],c=CASTLE_CAMPUS_LINK[2],length=Math.hypot(c[0]-a[0],c[1]-a[1]);
  for(let z=141;z<=159;z+=.2){
    const t=(z-a[1])/(c[1]-a[1]),x=a[0]+(c[0]-a[0])*t+(c[1]-a[1])/length*3.25;
    const pz=z-(c[0]-a[0])/length*3.25;
    assert.ok(ground.roadHeightAt(x,pz)!=null,`dry walking surface at ${x},${pz}`);
    assert.ok(!body.blocked(x,pz,.3),`free body corridor at ${x},${pz}`);
  }
});
for(const lod of ['','.lod'])test(`the stone batter and raised ground survive native ${lod||'high'} export`,()=>{
  const group=new THREE.Group();
  for(const part of buildNativeModel(read(`models/ART_WestMoat${lod}.json`))){
    const mesh=new THREE.Mesh(part.geometry,part.material);mesh.applyMatrix4(part.matrix);group.add(mesh);
  }
  group.updateMatrixWorld(true);const ray=new THREE.Raycaster();
  const top=(x,z)=>{ray.set(new THREE.Vector3(-x,20,z),new THREE.Vector3(0,-1,0));return ray.intersectObject(group,true)[0];};
  const wall=top(-542,183);
  assert.ok(wall?.point.y>1.5,'a tall stone face replaces the low water-edge strip');
  assert.ok(['HK_StoneDark','HK_Stone','ART_StoneLight','ART_Boulder','ART_Joint'].includes(wall.object.material.name),'the batter is masonry');
  const soil=top(-540,183);
  assert.ok(Math.abs(soil.point.y-ground.heightAt(-540,183))<.03,'the visible slope is the same height as exported Ground');
  for(const z of [55,65,75]){
    ray.set(new THREE.Vector3(221,-.7,z),new THREE.Vector3(-1,0,0));ray.far=2;
    assert.equal(ray.intersectObject(group,true).length,0,'no false retaining blade crosses the joined middle-moat water');
  }
  group.traverse(mesh=>{if(mesh.isMesh){mesh.geometry.dispose();mesh.material.dispose();}});
});
