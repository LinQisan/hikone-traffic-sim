// Photo review regressions exercise exported native geometry and real body/ground data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {buildNativeModel} from '../src/three/geometry/model-builder.js';
import {Ground} from '../src/simulation/collision/Ground.ts';
import {Obstacles} from '../src/simulation/collision/Obstacles.ts';
import {crossesWall} from '../src/simulation/core/scenario.ts';
import {UNIVERSITY_BUILDINGS, UNIVERSITY_GATE, UNIVERSITY_AXIS, UNIVERSITY_GATE_DETAIL} from '../src/world/generators/university-layout.js';
const read = file => JSON.parse(fs.readFileSync(new URL('../'+file,import.meta.url)));
const ground=new Ground(read('data/road_tiles.json')),body=new Obstacles(read('data/collision.json')),walls=read('data/walls.json');
const roots=new Map();
function root(detail) {
  if(!roots.has(detail)){
    const group=new THREE.Group();
    for(const name of ['ART_ShigaCampus','ART_EastHikoneBuildings']){
      for(const part of buildNativeModel(read(`models/${name}${detail}.json`))){
        const mesh=new THREE.Mesh(part.geometry,part.material);mesh.name=name;mesh.applyMatrix4(part.matrix);group.add(mesh);
      }
    }
    group.updateMatrixWorld(true);roots.set(detail,group);
  }
  return roots.get(detail);
}
function clearPath(path){
  for(let i=1;i<path.length;i++){
    const a=path[i-1],c=path[i],n=Math.ceil(Math.hypot(c[0]-a[0],c[1]-a[1])/.2);
    for(let j=0;j<=n;j++){
      const x=a[0]+(c[0]-a[0])*j/n,z=a[1]+(c[1]-a[1])*j/n;
      assert.ok(ground.roadHeightAt(x,z)!=null,`walk surface at ${x},${z}`);
      assert.ok(!body.blocked(x,z,.3),`body corridor at ${x},${z}`);
    }
    assert.ok(!crossesWall(walls,{x:a[0],z:a[1]},{x:c[0],z:c[1]}),'no water barrier');
  }
}
test('photo furniture keeps the main gate and south lane physically passable',()=>{
  clearPath([[-589,178],UNIVERSITY_GATE,...UNIVERSITY_AXIS.slice(1,3)]);
  const a=[-596.3503,141.56498],c=[-697.68384,148.14398];
  clearPath([a,[-672,a[1]+(c[1]-a[1])*(-672-a[0])/(c[0]-a[0])]]);
  assert.ok(body.blocked(...UNIVERSITY_GATE_DETAIL.postbox,.1),'post box has body collision');
  assert.ok(body.blocked(-651.55,147.1,.1),'observed alley pole has body collision');
});
test('the relocated temporary office stands on dry ground inside the mapped campus corner',()=>{
  const office=UNIVERSITY_BUILDINGS.find(b=>b.id==='site-office');
  const center=office.footprint.reduce((s,p)=>s.map((v,i)=>v+p[i]/4),[0,0]);
  for(const p of office.footprint){
    const q=p.map((v,i)=>v*.96+center[i]*.04);
    assert.ok(ground.roadHeightAt(...q)>=.14,'dry exported ground below office');
    assert.ok(!crossesWall(walls,{x:center[0],z:center[1]},{x:q[0],z:q[1]}),'no moat crosses office');
  }
});
for(const detail of ['','.lod'])test(`the photographed hall sight line and non-emissive post box survive ${detail||'high'} export`,()=>{
  const group=root(detail),start=new THREE.Vector3(605,1.65,180),end=new THREE.Vector3(623.75,6.8,204.5);
  const ray=new THREE.Raycaster(start,end.clone().sub(start).normalize(),0,start.distanceTo(end)+1);
  const hits=ray.intersectObject(group,true);
  assert.ok(hits.length,'the hall facade is present');
  assert.ok(!['HK_Leaf','HK_LeafDark','HK_Bark'].includes(hits[0].object.material.name),'trees do not replace the open hall view');
  assert.ok(hits[0].point.x>622,'first visible surface belongs to the hall, beyond the gate furniture');
  const [x,z]=UNIVERSITY_GATE_DETAIL.postbox;
  ray.set(new THREE.Vector3(-x+1,.9,z),new THREE.Vector3(-1,0,0));ray.far=2;
  const box=ray.intersectObject(group,true).find(h=>h.object.material.name==='HK_SignRed');
  assert.ok(box,'cylindrical post box remains visible');
  assert.equal(box.object.material.emissive.getHex(),0,'painted metal never emits signal light');
});
for(const detail of ['','.lod'])test(`all four gate characters remain visible in front of the stone column ${detail||'high'}`,()=>{
  const [gx,gz]=UNIVERSITY_GATE,[ax,az]=UNIVERSITY_AXIS[1];
  const length=Math.hypot(ax-gx,az-gz),ix=(ax-gx)/length,iz=(az-gz)/length;
  const tx=-iz,tz=ix,nx=-ix,nz=-iz,px=gx-tx*4.3,pz=gz-tz*4.3;
  const group=root(detail),ray=new THREE.Raycaster();ray.far=3;
  const columnSurfaces=[];
  group.traverse(mesh=>{if(mesh.isMesh&&mesh.name==='ART_ShigaCampus'&&
    ['ART_DisplayInk','HK_Stone','ART_StoneLight'].includes(mesh.material.name))columnSurfaces.push(mesh);});
  // Sample the exported lettering, including holes, through the real first visible
  // surface. This catches an inscription plane buried inside or behind its column.
  for(let row=0;row<4;row++){
    let gold=0;
    for(let i=0;i<12;i++)for(let j=0;j<12;j++){
      const u=-.175+(i+.5)*.35/12,y=1.98-row*.39+(j+.5)*.34/12;
      const x=px-tx*u,z=pz-tz*u;
      ray.set(new THREE.Vector3(-(x+nx*2),y,z+nz*2),new THREE.Vector3(nx,0,-nz));
      const hit=ray.intersectObjects(columnSurfaces)[0];
      assert.ok(hit,'the plaque has a visible physical surface');
      assert.equal(hit.object.material.name,'ART_DisplayInk','stone never paints over the lettering');
      const color=hit.object.geometry.attributes.color;
      if(color.getX(hit.face.a)>.4&&color.getY(hit.face.a)>.3)gold++;
    }
    assert.ok(gold>=8,`the character at row ${row} has visible gold strokes, not an empty plaque`);
  }
});
test.after(()=>{for(const group of roots.values())group.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});});
