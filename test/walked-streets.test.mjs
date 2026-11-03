// Independent road stations from the source map and the owner's five review views.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Ground} from '../src/simulation/collision/Ground.ts';
import {Obstacles} from '../src/simulation/collision/Obstacles.ts';
import {indexMeshRays} from '../src/three/camera/mesh-ray-index.js';
import {toThree} from '../src/three/scene/coords.ts';

const read=async name=>JSON.parse(await fs.readFile(new URL('../data/'+name,import.meta.url)));
const ground=new Ground(await read('road_tiles.json')),obstacles=new Obstacles(await read('collision.json'));
const models=new Map();
async function model(detail){
  if(!models.has(detail))models.set(detail,(async()=>{
    const root=new THREE.Group();
    for(const name of ['ART_WestMoat','ART_CastleApproach','ART_InnerMoatStreet','ART_EastHikoneBuildings']){
      const bytes=await fs.readFile(new URL(`../data/models/impressionist/${name}${detail}.glb`,import.meta.url));
      root.add((await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene);
    }
    indexMeshRays(root);root.updateMatrixWorld(true);return root;
  })());
  return models.get(detail);
}
function surface(root,x,z){return new THREE.Raycaster(toThree(x,2.5,z),new THREE.Vector3(0,-1,0),0,4).intersectObject(root,true)[0];}
function asphalt(root,points){
  for(const [x,z] of points){
    const hit=surface(root,x,z);assert.ok(hit,`visible street at ${x},${z}`);
    assert.equal(hit.object.material.name,'HK_Asphalt',`asphalt at ${x},${z}`);
    assert.ok(Math.abs(hit.point.y-.01)<.001,`flush visible street at ${x},${z}`);
    assert.ok(Math.abs(ground.roadHeightAt(x,z)-.01)<.001,`matching Ground at ${x},${z}`);
    assert.ok(!obstacles.blocked(x,z,.3),`body clearance at ${x},${z}`);
  }
}
for(const detail of ['', '.lod']){
  test(`the university drive turns north inside the gate, ${detail||'high'}`,async()=>{
    asphalt(await model(detail),[[-604,179],[-610,188.5],[-616,203],[-626,214.7]]);
  });
  test(`the local lane joins the moat street at one height and continues behind the houses, ${detail||'high'}`,async()=>{
    const root=await model(detail);
    asphalt(root,[[-401.2,228.2],[-400.8,232.6],[-399.3,249],[-402.7,261.5],[-430,267.8],[-403.7,215],[-404.3,207]]);
    const layers=new THREE.Raycaster(toThree(-399.3,2.5,249),new THREE.Vector3(0,-1,0),0,3).intersectObject(root,true);
    assert.ok(!layers.some(h=>h.object.material.name==='HK_Grass'&&Math.abs(h.point.y)<.001),'no underlying grass sheet can show through the distant street');
    // A sharp averaged offset used to taper a long straight into a grassy wedge.
    for(let z=232;z<=254;z+=.5){
      const x=-401.36652+(z-226.33481)*3.11815/34.31867;
      asphalt(root,[[x-1.2,z],[x,z],[x+1.2,z]]);
    }
  });
  test(`the cherry island separates three paved arms, ${detail||'high'}`,async()=>{
    const root=await model(detail);
    asphalt(root,[[-541.6,250.6],[-537.2,256.3],[-531.4,263.5],[-526,256],[-533,247.5]]);
    // Sweep each public arm, including the former duplicate trunk and back fence.
    for(const line of [
      [[-542.81624,248.74897],[-540.08748,252.97439],[-524.9267,270.50764]],
      [[-526.73118,246.65791],[-524.9267,270.50764]],
      [[-522.85053,282.79195],[-454.04953,271.43941],[-398.24837,260.65348]],
    ])for(let i=1;i<line.length;i++){
      const a=line[i-1],c=line[i],length=Math.hypot(c[0]-a[0],c[1]-a[1]);
      for(let d=.5;d<length-.5;d+=.5)for(const side of [-1,0,1]){
        const x=a[0]+(c[0]-a[0])*d/length-(c[1]-a[1])*side/length;
        const z=a[1]+(c[1]-a[1])*d/length+(c[0]-a[0])*side/length;
        assert.ok(!obstacles.blocked(x,z,.3),`the complete branch stays free at ${x},${z}`);
      }
    }
    const x=-534.2,z=253.5,hit=surface(root,x,z);
    assert.equal(hit.object.material.name,'HK_Soil','an independent planted island, outside the grass lot');
    assert.ok(hit.point.y>.2&&hit.point.y<.65,'a low planted mound');
    assert.ok(Math.abs(hit.point.y-ground.heightAt(x,z))<.001,'the mound supports the same feet height as its visible face');
  });
  test(`the tennis fence leaves the full public carriageway clear, ${detail||'high'}`,async()=>{
    const root=await model(detail);
    for(let x=-478;x<=-429;x+=.5){
      const z=238.89-(x+478)*.1621;
      asphalt(root,[[x,z-2.2],[x,z],[x,z+2.2]]);
    }
  });
  test(`the Otemon bridge has a level timber deck with open side rails, ${detail||'high'}`,async()=>{
    const root=await model(detail);
    for(const [x,z] of [[-165.91,215.59],[-161.49,223.65],[-157.06,231.71]]){
      const hit=surface(root,x,z);
      assert.equal(hit.object.material.name,'HK_WoodMid','timber spans the moat');
      assert.ok(Math.abs(hit.point.y-.16)<.001,'level deck');
      assert.ok(Math.abs(ground.roadHeightAt(x,z)-.16)<.001,'matching supported ground');
      assert.ok(!obstacles.blocked(x,z,.3),'rails leave the central walk free');
    }
    for(const [x,z] of [[-163.09,224.53],[-159.89,222.77]]){
      const hit=surface(root,x,z);
      assert.ok(hit.point.y>1.19&&hit.point.y<1.3,'a low timber rail on each side');
    }
  });
}
test.after(async()=>{for(const pending of models.values())(await pending).traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});});
