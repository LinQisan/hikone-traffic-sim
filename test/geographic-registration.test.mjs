import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {indexMeshRays} from '../src/three/camera/mesh-ray-index.js';
import {Ground} from '../src/simulation/collision/Ground.ts';
import {Obstacles} from '../src/simulation/collision/Obstacles.ts';
import {SCHOOL_LANES,WEST_BUILDINGS} from '../src/world/generators/university-layout.js';
import {geographicLocation} from '../src/world/geography/coordinates.ts';

const read=name=>JSON.parse(fs.readFileSync(new URL('../data/'+name,import.meta.url)));
const ground=new Ground(read('road_tiles.json')),obstacles=new Obstacles(read('collision.json'));
// Independent WGS84 vertices from OSM way 380217950. A shifted screenshot trace fails here.
test('the north school wing occupies the mapped geographic footprint',()=>{
  const ring=WEST_BUILDINGS.find(b=>b.id==='nishi-north').footprint.map(([x,z])=>geographicLocation(x,z));
  const reference=JSON.parse(fs.readFileSync(new URL('../world/geographic-registration.json',import.meta.url))).features['nishi-north'].geometryWgs84.coordinates[0].slice(0,-1);
  for(const[lon,lat]of reference)assert.ok(ring.some(p=>Math.hypot((p.lon-lon)*91000,(p.lat-lat)*111320)<.02));
});
function* laneSamples(){
  const line=SCHOOL_LANES[0];
  for(let i=1;i<line.length;i++){
    const a=line[i-1],b=line[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),count=Math.ceil(len/.7);
    // The last row would lie exactly on the street polygon's open end.
    for(let j=0;j<(i===line.length-1?count:count+1);j++)for(const offset of [-1.4,0,1.4])yield [a[0]+dx*j/count-dz/len*offset,a[1]+dz*j/count+dx/len*offset];
  }
}
for(const detail of ['', '.lod'])test('registered school lane carries a body corridor on the visible road '+(detail||'high'),async()=>{
  const bytes=fs.readFileSync(new URL('../data/models/impressionist/ART_WestMoat'+detail+'.glb',import.meta.url));
  const scene=indexMeshRays((await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene);
  scene.updateMatrixWorld(true);
  const ray=new THREE.Raycaster();ray.far=2;
  for(const[x,z]of laneSamples()){
    assert.ok(Math.abs(ground.roadHeightAt(x,z)-.01)<.001,`Ground road at ${x},${z}`);
    assert.ok(!obstacles.blocked(x,z,.35),`body clearance at ${x},${z}`);
    ray.set(new THREE.Vector3(-x,1,z),new THREE.Vector3(0,-1,0));
    const hits=ray.intersectObject(scene,true);
    assert.ok(hits.some(h=>h.object.material.name==='HK_Asphalt'&&Math.abs(h.point.y-.01)<.001),`visible asphalt at ${x},${z}`);
    assert.ok(!hits.some(h=>h.point.y>.02),`no wall, roof or planting across the corridor at ${x},${z}`);
  }
  scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
});

test('the relocated lodge roof remains a replay-camera obstacle',async()=>{
  const {SCHOOL_VILLA}=await import('../src/world/generators/university-layout.js');
  const {CameraObstacles}=await import('../src/three/camera/camera-obstacles.js');
  const bytes=fs.readFileSync(new URL('../data/models/impressionist/ART_EastHikoneBuildings.lod.glb',import.meta.url));
  const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
  scene.updateMatrixWorld(true);const low=[];
  scene.traverse(o=>{if(o.isMesh)low.push({geometry:o.geometry,material:o.material,matrix:o.matrixWorld.clone()});});
  const cameras=new CameraObstacles([{asset:'ART_EastHikoneBuildings',low,cameraSolids:[SCHOOL_VILLA],items:[{p:[0,0,0],r:0,s:[1,1,1]}]}]);
  const [x,z]=SCHOOL_VILLA.footprint.reduce((s,p)=>s.map((v,i)=>v+p[i]/4),[0,0]);
  assert.equal(cameras.clear(new THREE.Vector3(-x,12,z),new THREE.Vector3(-x,7,z)),false,'the ray must meet the hipped roof above the facade');
  assert.equal(cameras.clear(new THREE.Vector3(-x-15,12,z),new THREE.Vector3(-x-15,7,z)),true,'open air beside the lodge remains free');
  scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
});
