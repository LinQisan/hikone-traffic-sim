// Exercise the generated scene, not just the reviewed metadata arrays.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {Ground} from '../src/simulation/collision/Ground.ts';
import {Obstacles} from '../src/simulation/collision/Obstacles.ts';
import {crossesWall} from '../src/simulation/core/scenario.ts';
import {buildNativeModel} from '../src/three/geometry/model-builder.js';
import {CASTLE_CAMPUS_LINK} from '../src/world/generators/university-layout.js';
import {EAST_CAMERA_SOLIDS} from '../src/world/generators/east-layout.ts';
import {inEastExtension} from '../src/world/generators/east-layout.ts';
import {moatPathEdge} from '../src/world/generators/road-layout.js';
const read=file=>JSON.parse(fs.readFileSync(new URL('../'+file,import.meta.url)));
const ground=new Ground(read('data/road_tiles.json')),body=new Obstacles(read('data/collision.json')),walls=read('data/walls.json'),source=read('world/east-hikone.json');
function corridor(line){
 for(let k=1;k<line.length;k++){
  const a=line[k-1],c=line[k],n=Math.ceil(Math.hypot(c[0]-a[0],c[1]-a[1])/.3);
  for(let i=0;i<=n;i++){
   const x=a[0]+(c[0]-a[0])*i/n,z=a[1]+(c[1]-a[1])*i/n;
   assert.ok(ground.roadHeightAt(x,z)!=null,`ground at ${x},${z}`);
   assert.ok(!body.blocked(x,z,.25),`body clearance at ${x},${z}`);
  }
  assert.ok(!crossesWall(walls,{x:a[0],z:a[1]},{x:c[0],z:c[1]}),'no moat barrier across the road');
 }
}
test('the photo-corrected school turn remains a continuous public body corridor',()=>corridor(CASTLE_CAMPUS_LINK.slice(2,9)));
test('mapped public promenades and the museum ground passage stay clear of new photo furniture',()=>{
 for(const item of read('world/field-observations.json').facilities.filter(f=>f.kind==='bench')){
  const [x,z]=item.placement??item.point;
  for(const offset of [-.7,.7])assert.ok(ground.roadHeightAt(x+offset,z)!=null,`dry support for ${item.osm}`);
 }
 // The retained practice area owns a different, explicitly documented shore registration.
 // Check its actual footway, rather than asserting that an unused GIS axis is its centre.
 // Stop before the diagonal eastern corner, where this straight shore profile ends.
 corridor(Array.from({length:124},(_,i)=>{const x=43+i;return [x,moatPathEdge(x)-1.2];}));
 let sampled=0;
 for(const id of ['way/1374082612','way/1374091997','way/1376436165','way/1374082601','way/1464257158']){
  const path=source.walks.find(w=>w.id===id);assert.ok(path,id);
  // Existing bank trees do not guarantee a free mathematical centre line. Prove a
  // continuous swept body route within the mapped two-metre footway instead.
  let previous=[];
  const points=path.points;
  for(let k=1;k<points.length;k++){
   const a=points[k-1],c=points[k],length=Math.hypot(c[0]-a[0],c[1]-a[1]),n=Math.ceil(length/.25),nx=-(c[1]-a[1])/length,nz=(c[0]-a[0])/length;
   for(let i=0;i<=n;i++){
    const bx=a[0]+(c[0]-a[0])*i/n,bz=a[1]+(c[1]-a[1])*i/n;
    // This mapped museum spur starts at an existing closed building threshold.
    // Exercise its exterior passage; the scene does not provide museum interiors.
    if(id==='way/1464257158'&&k===1&&i/n*length<.85)continue;
    if(id==='way/1374082612'&&!inEastExtension(bx,bz)){previous=[];continue;}
    const candidates=[];
    for(const offset of [-.65,0,.65]){
     const x=a[0]+(c[0]-a[0])*i/n+nx*offset,z=a[1]+(c[1]-a[1])*i/n+nz*offset;
     if(body.blocked(x,z,.25)||ground.roadHeightAt(x,z)==null)continue;
     if(previous.length && !previous.some(p=>body.allows(p[0],p[1],x,z,.25)&&!crossesWall(walls,{x:p[0],z:p[1]},{x,z})))continue;
     candidates.push([x,z]);
    }
    assert.ok(candidates.length,`continuous free footway ${id} near ${bx},${bz}`);previous=candidates;sampled++;
   }
  }
 }
 assert.ok(sampled>200,'exercise actual mapped public paths as well as the retained walk');
});
for(const detail of ['','.lod'])test(`photo roofs have their real gable and stepped massing, within camera envelopes ${detail||'high'}`,()=>{
 const group=new THREE.Group();
 for(const part of buildNativeModel(read(`models/ART_EastHikoneBuildings${detail}.json`))){const mesh=new THREE.Mesh(part.geometry,part.material);mesh.applyMatrix4(part.matrix);group.add(mesh);}
 group.updateMatrixWorld(true);const ray=new THREE.Raycaster();
 const top=(x,z)=>{ray.set(new THREE.Vector3(-x,30,z),new THREE.Vector3(0,-1,0));return ray.intersectObject(group,true)[0]?.point.y;};
 assert.ok(top(266,174.2)>7,'cafe pitched roof is not a flat rectangle');
 assert.ok(top(290,286)>6.7,'church has a pitched nave roof');
 assert.ok(top(285,382)<7.1,'hotel street frontage stays below its upper block');
 assert.ok(top(295,382)>12.8,'hotel upper block remains behind the low frontage');
 const photos=read('world/field-observations.json');
 for(const p of Object.values(photos.buildings)){
  const b=source.buildings.find(b=>b.outlines[0][0][0]===p.anchor[0]&&b.outlines[0][0][1]===p.anchor[1]);
  assert.ok(b,'profile anchor resolves to its frozen OSM footprint');
  const bound=EAST_CAMERA_SOLIDS.find(b=>Math.hypot(b.footprint[0][0]-p.anchor[0],b.footprint[0][1]-p.anchor[1])<.008);
  assert.ok(bound && bound.height+(bound.rise??0)>=p.height+p.rise-.01,'camera bounds include the new roof');
 }
 group.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
});
test('photographed boards, posts and lamps stand beside the carriageway, not on it',()=>{
 const tiles=read('data/road_tiles.json'),carriageways=['Kyobashi carriageway','East Hikone carriageway'].map(name=>tiles[name]);
 const onCarriageway=(x,z)=>carriageways.some(t=>{
  for(let i=0;i<t.length;i+=9){
   const [ax,,az,bx,,bz,cx,,cz]=t.slice(i,i+9),d=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);
   const u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/d,v=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/d;
   if(u>=0&&v>=0&&u+v<=1)return true;
  }
  return false;
 });
 const photos=read('world/field-observations.json');
 for(const item of [...photos.facilities,...photos.lamps]){
  const [x,z]=item.placement??item.point;
  // Lamp poles may stand on the plain 0.15 m verge beyond the exported pavement.
  if(!photos.lamps.includes(item))assert.ok(ground.roadHeightAt(x,z)!=null,`${item.osm} stands on mapped ground`);
  assert.ok(!onCarriageway(x,z),`${item.osm} at ${x},${z} is off the carriageway`);
 }
});
test('the walked east street keeps a continuous public footway past its new furniture',()=>{
 const {street}=read('world/east-street.json'),centre=z=>{
  for(let i=1;i<street.points.length;i++){const a=street.points[i-1],c=street.points[i];
   if(z<=c[1])return a[0]+(c[0]-a[0])*(z-a[1])/(c[1]-a[1]);}
  return street.points.at(-1)[0];};
 const middle=(street.footway[0]+street.footway[1])/2;
 let previous=null,sampled=0;
 for(let z=street.from+2;z<street.to-2;z+=.5){
  const candidates=[-.6,0,.6,-1.4,-2.2].map(o=>[centre(z)+middle+o,z]).filter(([x,w])=>ground.roadHeightAt(x,w)!=null&&!body.blocked(x,w,.25));
  assert.ok(candidates.length,`free footway near z=${z}`);
  if(previous)assert.ok(candidates.some(c=>previous.some(p=>body.allows(p[0],p[1],c[0],c[1],.25))),`continuous footway near z=${z}`);
  previous=candidates;sampled++;
 }
 assert.ok(sampled>500,'walk the whole street');
});
test('no photo furniture stands in the moat along the retained promenade',()=>{
 const group=new THREE.Group();
 for(const part of buildNativeModel(read('models/ART_EastHikoneBuildings.lod.json'))){const mesh=new THREE.Mesh(part.geometry,part.material);mesh.applyMatrix4(part.matrix);group.add(mesh);}
 group.updateMatrixWorld(true);const ray=new THREE.Raycaster();
 for(let x=142;x<198;x+=.7){
  ray.set(new THREE.Vector3(-x,3,52.5),new THREE.Vector3(0,-1,0));ray.far=8;
  assert.equal(ray.intersectObject(group,true).length,0,`nothing stands in the water at x=${x}`);
 }
 group.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
});
test('the castle-side bank closes its battered corners at the Kyobashi opening',()=>{
 const group=new THREE.Group();
 for(const part of buildNativeModel(read('models/ART_KyobashiBanks.json'))){const mesh=new THREE.Mesh(part.geometry,part.material);mesh.applyMatrix4(part.matrix);group.add(mesh);}
 group.updateMatrixWorld(true);const ray=new THREE.Raycaster();
 // Look from the approach into each corner, below the sloped face: a hollow wedge lets
 // the view pass into the bank (photo 0872 shows solid stone corners at the bridge end).
 for(const [x,dir] of [[30,-1],[34,1]])for(const z of [76.5,77.2,77.8]){
  ray.set(new THREE.Vector3(-x,1.2,z),new THREE.Vector3(-dir,0,0));
  const hit=ray.intersectObject(group,true)[0];
  assert.ok(hit&&Math.abs(-hit.point.x-(dir<0?25.5:38.5))<.1,`solid bank corner seen from ${x},${z}`);
 }
 group.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
});
