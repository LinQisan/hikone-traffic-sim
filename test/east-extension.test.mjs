import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {geographicPoint, geographicLocation, frame} from '../src/world/geography/coordinates.ts';
import {Ground} from '../src/simulation/collision/Ground.ts';
import {Obstacles} from '../src/simulation/collision/Obstacles.ts';
import {crossesWall, newScenario, validateStructure} from '../src/simulation/core/scenario.ts';
import {buildNativeModel} from '../src/three/geometry/model-builder.js';
import {CameraObstacles} from '../src/three/camera/camera-obstacles.js';
import {EAST_CAMERA_SOLIDS,deepInEastExtension} from '../src/world/generators/east-layout.ts';
import * as THREE from 'three';
const read = file => JSON.parse(fs.readFileSync(new URL('../'+file,import.meta.url)));
const source = read('world/east-hikone.json');
const ground = new Ground(read('data/road_tiles.json'));
const grid = read('data/collision.json'), obstacles = new Obstacles(grid), walls = read('data/walls.json');
const map = read('data/map.json');
const inRequested=(x,z)=>{const r=frame.east.requested;return x>=r.xMin&&x<=r.xMax&&z>=r.zMin&&z<=r.zMax;};

test('geographic extension retains the bridge frame, metre scale, orientation and inverse',()=>{
 assert.deepEqual(geographicPoint(frame.anchor.lat,frame.anchor.lon),[32,56.8]);
 for(const [x,z]of[[0,0],[200,0],[400,600],[420,620],[-700,200]]){
  const {lat,lon}=geographicLocation(x,z),p=geographicPoint(lat,lon);
  assert.ok(Math.hypot(p[0]-x,p[1]-z)<1e-7,'round-trip map coordinates');
 }
 const origin=geographicLocation(0,0),north=geographicPoint(origin.lat+1/frame.metresPerLatitudeDegree,origin.lon);
 assert.ok(Math.abs(Math.hypot(...north)-1)<1e-7,'one metre remains one metre');
 assert.ok(north[0]<0&&north[1]>0,'geographic north follows the retained 32-degree rotation');
});

test('geographic ground partitions cover the world outside the authored core without overlap or holes',()=>{
 const groups=Object.entries(source.surfaces).map(([kind,ts])=>[kind,new Ground({[kind]:ts.map(t=>t.flatMap(([x,z])=>[x,0,z]))})]);
 let sampled=0;
 // The whole world outside the retained authored core: no bare green or grey filler remains.
 for(let x=frame.world.xMin+.371;x<frame.world.xMax;x+=9.19)for(let z=frame.world.zMin+.417;z<frame.world.zMax;z+=9.13){
  if(!deepInEastExtension(x,z,.01))continue;sampled++;
  const hits=groups.filter(([,g])=>g.roadHeightAt(x,z)!=null);
  assert.equal(hits.length,1,`one owner at ${x},${z}: ${hits.map(([k])=>k)}`);
 }
 assert.ok(sampled>9000,'the coverage spans most of the world extent');
 assert.ok(Math.abs(source.summary.surfaceArea-source.summary.coverageArea)<.1);
 assert.equal(map.world.xMax,frame.world.xMax);
 assert.equal(grid.xMin+grid.width*grid.cell,frame.world.xMax);
 assert.equal(map.practiceWorld.xMax,200,'existing high-detail practice image keeps its bounds');
});

function walkPath(path){
 for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.25);let previous={x:a[0],z:a[1]};
  for(let k=0;k<=n;k++){
   const x=a[0]+(b[0]-a[0])*k/n,z=a[1]+(b[1]-a[1])*k/n;
   assert.ok(Math.abs(ground.heightAt(x,z)-.01)<.001,`continuous road/path at ${x},${z}`);
   assert.ok(!obstacles.blocked(x,z,.25),`no building/tree on through route at ${x},${z}`);
   assert.ok(!crossesWall(walls,previous,{x,z}),`no water wall across road at ${x},${z}`);previous={x,z};
  }
 }
}

test('Route 25 joins both new north/south through roads without a water wall or building',()=>{
 const degree=new Map();
 for(const r of source.roads)for(let i=1;i<r.nodes.length;i++)for(const id of[r.nodes[i-1],r.nodes[i]])
   degree.set(id,(degree.get(id)??0)+1);
 for(const r of source.roads.filter(r=>r.kind!=='service'))for(const i of[0,r.nodes.length-1])
   // Seam continuity in the reviewed eastern rectangle; elsewhere OSM records genuine dead ends.
   if(inRequested(...r.points[i]))assert.ok(degree.get(r.nodes[i])>1,`${r.id}: no disconnected street endpoint inside coverage`);
 walkPath([[180,44.25],[191.11,43.8],[229.8,42.56],[248.18,42.51],[298.36,40.88],[336.09,41.71],[396.92,43.15]]);
 for(const id of['way/59265940','way/122756202']){
  const road=source.roads.find(r=>r.id===id);
  const points=road.points.filter(([x,z])=>z>=60&&z<=400&&x>=200&&x<=400);
  assert.ok(points.length>2);walkPath(points);
 }
});

test('mapped water is blocked, and building footprints are solid with labelled heights',()=>{
 assert.ok(source.summary.waterFeatures>0&&source.buildings.length>100);
 // Every footprint is extruded; estimates are labelled so they are never mistaken for source heights.
 for(const b of source.buildings)assert.ok(b.height>0&&/^(OSM |estimate )/.test(b.heightBasis),`${b.id}: height basis`);
 assert.equal(source.summary.buildingsWithSourceHeight,source.buildings.filter(b=>!b.heightBasis.startsWith('estimate')).length);
 let checked=0;
 for(const building of source.buildings){
  const t=(building.solidTriangles??building.triangles).find(t=>Math.abs((t[1][0]-t[0][0])*(t[2][1]-t[0][1])-(t[2][0]-t[0][0])*(t[1][1]-t[0][1]))>3);
  if(!t)continue;
  const x=t.reduce((s,p)=>s+p[0]/3,0),z=t.reduce((s,p)=>s+p[1]/3,0);
  assert.ok(obstacles.blocked(x,z,.1),`${building.id}: closed body footprint`);checked++;
 }
 assert.ok(checked>100);
 const t=source.waterWalls.find(t=>Math.abs((t[1][0]-t[0][0])*(t[2][1]-t[0][1])-(t[2][0]-t[0][0])*(t[1][1]-t[0][1]))>100);
 const p={x:t.reduce((s,v)=>s+v[0]/3,0),z:t.reduce((s,v)=>s+v[1]/3,0)};
 assert.ok(walls.walls.some(w=>w.name.startsWith('East moat ')));
 assert.ok(crossesWall(walls,{x:p.x-200,z:p.z},p),'mapped moat cannot be walked into');
});

test('saved scenario structure can use the extension without changing its version',()=>{
 const s=newScenario('east-reference');s.spawn={x:300,z:300};s.goal={x:310,z:350,width:2,depth:2,yaw:0};
 assert.ok(!validateStructure(s).some(p=>p.message.includes('地図の外')));
 s.spawn.x=frame.world.xMax+1;
 assert.ok(validateStructure(s).some(p=>p.message.includes('地図の外')));
});

test('estimated street widths yield to mapped building boundaries',()=>{
 const road = new Ground({road:source.surfaces.road.map(t=>t.flatMap(([x,z])=>[x,.01,z]))});
 // OSM building 676059554 previously overlapped the buffered street by 6.66 square metres.
 const x=399.69864,z=426.61573;
 assert.equal(road.roadHeightAt(x,z),null,'a known building interior cannot become carriageway');
 assert.ok(obstacles.blocked(x,z,.1),'the original footprint remains solid');
});

test('the inherited castle bank meets new green ground without a height step',()=>{
 for(const [a,b]of [[[119.99,102.5],[120.01,102.5]],[[183.99,103],[184.01,103]],[[120.5,100.2],[121.5,100.2]]])
   assert.ok(Math.abs(ground.heightAt(...a)-ground.heightAt(...b))<.04,`continuous bank at ${a}`);
 assert.ok(Math.abs(ground.heightAt(200,110)-.15)<.001,'the bank returns to town datum before the requested area');
});

test('native cropped primitives cannot restore old land or buildings inside the extension',()=>{
 const point=new THREE.Vector3();
 for(const asset of ['ART_CastleApproach','ART_KyobashiRoads','ART_KyobashiLand','ART_KyobashiBanks','ART_KyobashiWater']){
  for(const part of buildNativeModel(read('models/'+asset+'.json'))){
   const position=part.geometry.attributes.position;
   for(let i=0;i<position.count;i++){
    point.fromBufferAttribute(position,i).applyMatrix4(part.matrix);
    const x=-point.x,z=point.z;
    assert.ok(!deepInEastExtension(x,z,.002),`${asset}: old geometry at ${x},${z}`);
   }
   part.geometry.dispose();part.material.dispose();
  }
 }
});

test('new building batches leave road cameras free while retaining real roof obstacles',()=>{
 const low=buildNativeModel(read('models/ART_EastHikoneBuildings.lod.json'));
 const city=new CameraObstacles([{asset:'ART_EastHikoneBuildings',low,cameraSolids:EAST_CAMERA_SOLIDS,
   items:[{p:[0,0,0],r:0,s:[1,1,1]}]}]);
 assert.ok(city.cameraClear(new THREE.Vector3(-336.09,2,60)),'the street is outside individual building bounds');
 const b=source.buildings.find(b=>b.height!==null),t=b.triangles[0];
 const x=t.reduce((s,p)=>s+p[0]/3,0),z=t.reduce((s,p)=>s+p[1]/3,0);
 assert.equal(city.clear(new THREE.Vector3(-x,30,z),new THREE.Vector3(-x,1,z)),false,'a mapped roof blocks the camera ray');
 for(const p of low){p.geometry.dispose();p.material.dispose();}
});
