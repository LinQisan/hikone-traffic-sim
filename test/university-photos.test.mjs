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
  const {centre:[gx,gz],tangent:[tx,tz],normal:[nx,nz],halfSpacing}=UNIVERSITY_GATE_DETAIL.entry;
  const px=gx-tx*halfSpacing,pz=gz-tz*halfSpacing;
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
test('the curved gate apron admits bodies on both sides of the old narrow driveway',()=>{
  const {centre,tangent,normal}=UNIVERSITY_GATE_DETAIL.entry;
  const at=(u,v)=>centre.map((p,i)=>p+tangent[i]*u+normal[i]*v);
  for(const side of [-1,1]){
    clearPath([at(side*6.0,4.4),at(side*3.0,1.5),at(side*3.0,-1.8)]);
    assert.ok(!body.blocked(...at(side*5.66,2.12),.3),'the concave forecourt stays free where the reversed bow used to protrude');
  }
});
for(const detail of ['','.lod'])test(`the recessed pillars and both quarter-circle returns survive ${detail||'high'} export`,()=>{
  const {centre,tangent,normal}=UNIVERSITY_GATE_DETAIL.entry,group=root(detail);
  const at=(u,v)=>centre.map((p,i)=>p+tangent[i]*u+normal[i]*v);
  for(const side of [-1,1]){
    const pillar=at(side*4.3,4);
    const ray=new THREE.Raycaster(new THREE.Vector3(-pillar[0],2.4,pillar[1]),new THREE.Vector3(normal[0],0,-normal[1]),0,5);
    const hit=ray.intersectObject(group,true)[0];
    assert.ok(hit?.distance>3.4&&hit.distance<3.6,'tall pillar is recessed behind the street frontage');
    for(const degrees of [25,45,65]){
      const angle=degrees*Math.PI/180,p=at(side*(4.78+3*Math.sin(angle)),3*(1-Math.cos(angle)));
      const n=normal.map((v,i)=>v*Math.cos(angle)-side*tangent[i]*Math.sin(angle));
      ray.set(new THREE.Vector3(-(p[0]+n[0]),.3,p[1]+n[1]),new THREE.Vector3(n[0],0,-n[1]));ray.far=1.4;
      const wall=ray.intersectObject(group,true)[0];
      assert.ok(wall&&wall.distance>.7&&wall.distance<1.0,`curved wall at ${side},${degrees}`);
      assert.ok(['HK_StoneDark','ART_StoneLight'].includes(wall.object.material.name),'the return is real masonry');
    }
  }
});
for(const detail of ['','.lod'])test(`the close postbox has a visible dark slot, white postal lettering and collection-door recess ${detail||'high'}`,()=>{
  const {postbox:[x,z],postboxNormal:[nx,nz]}=UNIVERSITY_GATE_DETAIL,group=root(detail);
  const surfaces=group.children.filter(mesh=>mesh.name==='ART_ShigaCampus');
  const tx=-nz,tz=nx,ray=new THREE.Raycaster();ray.far=1.1;
  function hit(u,y){
    ray.set(new THREE.Vector3(-(x+tx*u+nx),y,z+tz*u+nz),new THREE.Vector3(nx,0,-nz));
    return ray.intersectObjects(surfaces)[0];
  }
  const slot=hit(0,1.22);
  assert.equal(slot?.object.material.name,'ART_DisplayInk','the dark slot shows below its rain hood');
  assert.ok(slot.object.geometry.attributes.color.getX(slot.face.a)<.2,'the slot is dark');
  let white=0;
  for(let i=0;i<24;i++)for(let j=0;j<20;j++){
    const h=hit(-.15+(i+.5)*.3/24,.99+(j+.5)*.2/20);
    if(h?.object.material.name==='ART_DisplayInk'&&h.object.geometry.attributes.color.getX(h.face.a)>.8)white++;
  }
  assert.ok(white>70,'postal characters are visible from their reading side');
  const seam=hit(.115,.5);
  assert.equal(seam?.object.material.name,'ART_DisplayInk','the collection door is separated from its cast frame');
  assert.ok(seam.object.geometry.attributes.color.getX(seam.face.a)<.2,'the collection-door recess is dark');
  // Rear and underside remain closed when walking around or looking up at the box.
  ray.set(new THREE.Vector3(-(x-nx),.6,z-nz),new THREE.Vector3(-nx,0,nz));
  assert.equal(ray.intersectObjects(surfaces)[0]?.object.material.name,'HK_SignRed');
});
for(const detail of ['','.lod'])test(`the office gallery faces the hall and has a visible soffit ${detail||'high'}`,()=>{
  const group=root(detail),ray=new THREE.Raycaster();ray.far=3;
  ray.set(new THREE.Vector3(609.22,4.55,206.8),new THREE.Vector3(0,0,1));
  let hit=ray.intersectObject(group,true)[0];
  assert.equal(hit?.object.material.name,'ART_Window','the south gallery reaches real glazed doors');
  assert.ok(hit.point.z>208.4&&hit.point.z<208.6,'doors belong to the south wall, not the opposite face');
  ray.set(new THREE.Vector3(610,5.7,207.8),new THREE.Vector3(0,1,0));
  hit=ray.intersectObject(group,true)[0];
  assert.equal(hit?.object.material.name,'HK_MetalLight','the canopy has a visible underside');
  assert.ok(Math.abs(hit.point.y-6.18)<.01,'the underside sits below the roof top');
  ray.set(new THREE.Vector3(610,2.9,207.8),new THREE.Vector3(0,1,0));
  hit=ray.intersectObject(group,true)[0];
  assert.equal(hit?.object.material.name,'HK_MetalLight','the upper landing has a visible underside');
  assert.ok(Math.abs(hit.point.y-3.12)<.01,'the landing closes the gallery floor');
});
test.after(()=>{for(const group of roots.values())group.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});});
