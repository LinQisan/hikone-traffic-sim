import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {Ground} from '../src/simulation/collision/Ground.ts';
import {Obstacles} from '../src/simulation/collision/Obstacles.ts';
import {crossesWall} from '../src/simulation/core/scenario.ts';
import {APPROACH_DATA} from '../src/world/generators/castle-approach.js';
import {buildNativeModel} from '../src/three/geometry/model-builder.js';
import {deepInEastExtension} from '../src/world/generators/east-layout.ts';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const source=read('world/east-hikone.json'),tiles=read('data/road_tiles.json');
const ground=new Ground(tiles),obstacles=new Obstacles(read('data/collision.json')),walls=read('data/walls.json');

test('reviewed north rectangle has complete source ground, water and named landmarks',()=>{
 const groups=Object.entries(source.surfaces).map(([kind,ts])=>[kind,new Ground({[kind]:ts.map(t=>t.flatMap(([x,z])=>[x,0,z]))})]);
 for(let x=.381;x<200;x+=6.37)for(let z=400.791;z<600;z+=6.19)
  assert.equal(groups.filter(([,g])=>g.roadHeightAt(x,z)!==null).length,1,`one geographic surface at ${x},${z}`);
 for(const id of ['way/363244220','way/363244221','way/363244237'])
  assert.ok(source.buildings.some(b=>b.id===id&&b.outlines.length),`mapped Sawaguchi/stable footprint ${id}`);
 assert.ok(source.water.some(w=>w.id==='way/45731153'),'the inner moat uses its own source outline');
});

test('mapped Sawaguchi footways and the building passage remain traversable',()=>{
 const path=APPROACH_DATA.paths.routes.find(r=>r.id==='ninomaru-access').points.map(([x,y,z])=>[x,z]);
 const passage=source.walks.find(w=>w.id==='way/1464257173');
 assert.equal(passage.tunnel,'building_passage');
 for(const points of [path,passage.points])for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.2);let previous={x:a[0],z:a[1]};
  for(let j=0;j<=n;j++){
   const x=a[0]+(b[0]-a[0])*j/n,z=a[1]+(b[1]-a[1])*j/n;
   const height=ground.roadHeightAt(x,z);
   // Rounded source nodes can lie on a retained plot threshold at a passage mouth.
   assert.ok(height!==null && (j===0||j===n ? height>=.009&&height<=.151 : Math.abs(height-.01)<.001),
     `mapped footway at ${x},${z}`);
   assert.ok(!obstacles.blocked(x,z,.25),`open body space at ${x},${z}`);
   assert.ok(!crossesWall(walls,previous,{x,z}),`no false moat wall at ${x},${z}`);previous={x,z};
  }
 }
});

test('placed castle composites cannot restore obsolete terrain inside the source correction',()=>{
 const point=new THREE.Vector3();
 for(const asset of ['HK_Terrain_Hikone','ART_HikoneCompound'])for(const part of buildNativeModel(read('models/'+asset+'.json'))){
  const p=part.geometry.attributes.position;
  for(let i=0;i<p.count;i++){
   point.fromBufferAttribute(p,i).applyMatrix4(part.matrix);
   const x=-point.x+APPROACH_DATA.castle.x,z=point.z+APPROACH_DATA.castle.z;
   assert.ok(!deepInEastExtension(x,z,.002),`${asset}: uncropped world point ${x},${z}`);
  }
  part.geometry.dispose();part.material.dispose();
 }
});

test('mapped moat decks have no raised shoreline across them or dam at the north crop',()=>{
 const decks=new Ground(Object.fromEntries(Object.entries(tiles).filter(([name])=>/East Hikone (carriageway|pavement)$/.test(name))));
 const faces=read('models/ART_EastHikoneSurface.json').commands.filter(c=>c[0]==='face'&&c[1]==='HK_Stone');
 assert.ok(faces.length>0);
 for(const face of faces){
  const p=face[2];
  assert.ok(!(p.every(v=>Math.abs(v[2]-600)<1e-4)&&Math.max(...p.map(v=>v[0]))-Math.min(...p.map(v=>v[0]))>.1),'no artificial dam at Z=600');
  for(const[x,y,z]of p)if(decks.roadHeightAt(x,z)!==null)
   assert.ok(y<=.015,`shoreline cannot stand above a mapped deck at ${x},${z}`);
 }
});
