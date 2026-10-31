import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {Ground} from '../src/simulation/collision/Ground.ts';
import {Obstacles} from '../src/simulation/collision/Obstacles.ts';
import {crossesWall} from '../src/simulation/core/scenario.ts';
import {buildNativeModel} from '../src/three/geometry/model-builder.js';
import {indexMeshRays} from '../src/three/camera/mesh-ray-index.js';
import {APPROACH_BUILDINGS} from '../src/world/generators/castle-approach.js';
import {moatBend} from '../src/world/generators/road-layout.js';

const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const ground=new Ground(read('data/road_tiles.json')),body=new Obstacles(read('data/collision.json'));
const walls=read('data/walls.json'),survey=read('world/field-observations.json'),source=read('world/south-promenade.json');
function sweep(path,radius=.3){
  for(let k=1;k<path.length;k++){
    const a=path[k-1],c=path[k],count=Math.ceil(Math.hypot(c[0]-a[0],c[1]-a[1])/.15);let previous=a;
    for(let j=0;j<=count;j++){
      const x=a[0]+(c[0]-a[0])*j/count,z=a[1]+(c[1]-a[1])*j/count;
      assert.ok(ground.roadHeightAt(x,z)!=null,`ground at ${x},${z}`);
      assert.ok(!body.blocked(x,z,radius),`${radius*2} m body at ${x},${z}`);
      assert.ok(body.allows(...previous,x,z,radius),'connected body clearance');
      assert.ok(!crossesWall(walls,{x:previous[0],z:previous[1]},{x,z}),'no water wall across the walk');
      previous=[x,z];
    }
  }
}

test('new furniture leaves the curved promenade, both bridge shoulders and Saigo verge open',()=>{
  const east=[[26.6,38],[26.6,76]],west=[[37.4,38],[37.4,72.5],[37.7,74.4],[37.7,76]];
  for(const path of [east,west]){sweep(path,.45);sweep([...path].reverse(),.45);}
  const bent=Array.from({length:100},(_,i)=>[82+i,31.4+moatBend(82+i)]);
  sweep(bent,.30);sweep([...bent].reverse(),.30);
  sweep([[186,50.6],[229.74241,48.84763],[240,49.85]],.30);
  sweep([[254.5,49.4],[265,49.28]],.45);
  sweep([[-1.6,118],[-.8,124],[2.4,143]],.30);
  for(const q of survey.facilities.filter(q=>q.kind==='bench')){
    assert.ok(body.blocked(...q.placement,.1),'a bench remains a physical obstacle');
    assert.ok(q.placement[1]>31.4+moatBend(q.placement[0])+1.6,'bench is behind the public guidance line');
  }
});

for(const suffix of ['','.lod'])test(`Saigo doors, sloping maps and two-sided information have visible geometry (${suffix||'high'})`,()=>{
  const roots=new Map();
  for(const name of ['ART_CastleApproach','ART_EastHikoneBuildings','ART_PromenadeCherry']){
    const group=new THREE.Group();
    for(const part of buildNativeModel(read(`models/${name}${suffix}.json`))){
      part.material.side=THREE.FrontSide;
      const mesh=new THREE.Mesh(part.geometry,part.material);mesh.applyMatrix4(part.matrix);group.add(mesh);
    }
    group.updateMatrixWorld(true);indexMeshRays(group);roots.set(name,group);
  }
  const ray=new THREE.Raycaster(),saigo=APPROACH_BUILDINGS.find(b=>b.name===source.gate.name);
  const [a,c]=source.gate.frontEdge.map(i=>saigo.footprint[i]),length=Math.hypot(c[0]-a[0],c[1]-a[1]);
  const ux=(c[0]-a[0])/length,uz=(c[1]-a[1])/length,nx=uz,nz=-ux;
  const x=a[0]+ux*source.gate.doorStation,z=a[1]+uz*source.gate.doorStation;
  ray.set(new THREE.Vector3(-x-nx*2,1.8,z+nz*2),new THREE.Vector3(nx,0,-nz));ray.far=3;
  const hit=ray.intersectObject(roots.get('ART_CastleApproach'),true)[0];
  assert.ok(hit&&hit.object.material.name==='ART_Timber','door/front posts are visible from the street');
  ray.set(new THREE.Vector3(-x-nx*.55,3.50,z+nz*.55),new THREE.Vector3(0,1,0));ray.far=1;
  assert.ok(ray.intersectObject(roots.get('ART_CastleApproach'),true)[0],'the roof soffit faces a pedestrian underneath it');
  for(const sign of survey.facilities.filter(q=>['node/4405142292','node/4405142293'].includes(q.osm))){
    const [sx,sz]=sign.placement??sign.point;
    let hasInk=false;
    roots.get('ART_EastHikoneBuildings').traverse(m=>{
      if(!m.isMesh||m.material.name!=='ART_DisplayInk')return;
      const p=m.geometry.attributes.position,v=new THREE.Vector3();
      for(let i=0;i<p.count;i++){
        v.fromBufferAttribute(p,i).applyMatrix4(m.matrixWorld);
        if(Math.abs(v.x+sx)<1.2&&Math.abs(v.z-sz)<.8&&v.y>.8&&v.y<1.7){hasInk=true;break;}
      }
    });
    assert.ok(hasInk,'sloping map carries actual mesh graphics');
    ray.set(new THREE.Vector3(-sx,3,sz),new THREE.Vector3(0,-1,0));ray.far=3;
    assert.ok(ray.intersectObject(roots.get('ART_EastHikoneBuildings'),true)[0]?.point.y>.85,'map has a solid upward-facing sloping surface');
    const angle=(sign.heading-122)*Math.PI/180,nx=-Math.cos(angle),nz=Math.sin(angle);
    const top=side=>{
      ray.set(new THREE.Vector3(-sx-nx*side,3,sz+nz*side),new THREE.Vector3(0,-1,0));
      return ray.intersectObject(roots.get('ART_EastHikoneBuildings'),true)[0]?.point.y;
    };
    assert.ok(top(-.25)-top(.25)>.1,'far edge rises away from the reader instead of hiding the map behind its near rim');
  }
  const [sx,sz]=source.guide.placement;
  for(const side of [-1,1]){
    const [nx,nz]=source.guide.normal.map(v=>v*side);
    ray.set(new THREE.Vector3(-sx-nx*1.5,2,sz+nz*1.5),new THREE.Vector3(nx,0,-nz));ray.far=2;
    assert.ok(ray.intersectObject(roots.get('ART_EastHikoneBuildings'),true)[0]?.object.material.name==='ART_DisplayInk','both faces of the directory are outside their support');
  }
  let visible=0;
  for(let x=-4;x<=4;x+=.6)for(let z=-3;z<=6;z+=.6){
    ray.set(new THREE.Vector3(x,1.7,z),new THREE.Vector3(0,1,0));ray.far=10;
    if(ray.intersectObject(roots.get('ART_PromenadeCherry'),true)[0])visible++;
  }
  assert.ok(visible>25,'branches and closed foliage remain visible from pedestrian height');
  for(const root of roots.values())root.traverse(m=>{if(m.isMesh){m.geometry.dispose();m.material.dispose();}});
});
