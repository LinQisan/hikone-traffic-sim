// Physical continuity of the geographic extension, beyond the editor's practice frame.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Ground } from '../src/simulation/collision/Ground.ts';
import { Obstacles } from '../src/simulation/collision/Obstacles.ts';
import { crossesWall } from '../src/simulation/core/scenario.ts';
import { INNER_MOAT_INNER, INNER_MOAT_OUTER } from '../src/world/generators/castle-approach.js';
import { WEST_ROUTE, UNIVERSITY_ENTRANCE, UNIVERSITY_AXIS, UNIVERSITY_WEST_LANE,
  UNIVERSITY_BUILDINGS, CASTLE_CAMPUS_LINK, UNIVERSITY_BOUNDARY,
  UNIVERSITY_FRONT_LANE, UNIVERSITY_WEST_ENTRY, UNIVERSITY_WEST_GATE,
  SCHOOL_LANES, SCHOOL_LOT_ENTRY, SCHOOL_LOT, WEST_BUILDINGS, UNIVERSITY_FIELDS } from '../src/world/generators/university-layout.js';

const read = name => JSON.parse(fs.readFileSync(new URL('../data/'+name,import.meta.url)));
const ground = new Ground(read('road_tiles.json'));
const town = new Obstacles(read('collision.json'));
const walls = read('walls.json');
function inWater(x,z) {
  return walls.walls.filter(w=>w.name.startsWith('University moat ')).some(w=>{
    const p=w.polygon;let hit=false;
    for(let i=0,j=p.length-2;i<p.length;j=i,i+=2)
      if((p[i+1]>z)!=(p[j+1]>z)&&x<(p[j]-p[i])*(z-p[i+1])/(p[j+1]-p[i+1])+p[i])hit=!hit;
    return hit;
  });
}
function checkPath(path) {
  let previous = path[0];
  for (let k=1;k<path.length;k++) {
    const a=path[k-1],b=path[k],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.4);
    for(let i=0;i<=steps;i++) {
      const p=a.map((v,j)=>v+(b[j]-v)*i/steps);
      const at=p.map(v=>v.toFixed(2)).join(',');
      assert.ok(ground.roadHeightAt(...p)!=null,'continuous exported walking surface at '+at);
      assert.ok(!town.blocked(...p,.25),'free body corridor at '+at);
      assert.ok(!crossesWall(walls,{x:previous[0],z:previous[1]},{x:p[0],z:p[1]}),'no water wall across access at '+at);
      previous=p;
    }
  }
}

test('Kyobashi connects through Route 25 and the main gate to the university forecourt',()=>{
  checkPath([[-210,26],...WEST_ROUTE.slice(0,7),...CASTLE_CAMPUS_LINK.slice(1,3),
    ...UNIVERSITY_ENTRANCE.slice(1),...UNIVERSITY_AXIS.slice(2)]);
  checkPath(CASTLE_CAMPUS_LINK);
  checkPath([CASTLE_CAMPUS_LINK.at(-1),...UNIVERSITY_DATA.outerMoatStreet.slice(1,4)]);
});

test('the western lane and university gate remain usable, while campus buildings are solid',()=>{
  checkPath(WEST_ROUTE);
  checkPath(UNIVERSITY_WEST_LANE);
  for(const item of UNIVERSITY_BUILDINGS) {
    const [a,b]=item.footprint;
    assert.ok(town.blocked((a[0]+b[0])/2,(a[1]+b[1])/2,.35),item.id+' has body collision at its facade');
  }
});


test('the street enclosure blocks bodies while the realigned main gate remains open',()=>{
  const walls=UNIVERSITY_BOUNDARY.filter(r=>r.kind==='wall');
  let checked=0;
  for(const run of walls)for(let i=1;i<run.points.length;i++){
    const a=run.points[i-1],b=run.points[i];
    for(const t of [.2,.5,.8]){
      const x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;
      assert.ok(town.blocked(x,z,.25),'solid campus boundary at '+x+','+z);
      checked++;
    }
  }
  assert.ok(checked>=12);
  checkPath(UNIVERSITY_ENTRANCE);
});

test('the frontage lane connects the west gate to both public streets and the campus axis',()=>{
  checkPath(UNIVERSITY_FRONT_LANE);
  checkPath(UNIVERSITY_WEST_ENTRY);
  // The real opening is narrower than the main gate: adjacent enclosure stays solid.
  const run=UNIVERSITY_BOUNDARY[1],a=run.points[0],b=run.points[1];
  const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
  const x=UNIVERSITY_WEST_GATE[0]+(b[0]-a[0])/length*3.5;
  const z=UNIVERSITY_WEST_GATE[1]+(b[1]-a[1])/length*3.5;
  assert.ok(town.blocked(x,z,.25),'the wall beside the west gate remains solid');
});

test('the school lane and open-lot entrance connect to the public moat street without crossing barriers',()=>{
  for(const path of [...SCHOOL_LANES,SCHOOL_LOT_ENTRY])checkPath(path);
  const house=WEST_BUILDINGS.find(b=>b.id==='moat-timber-house');
  const [a,b]=house.footprint;
  assert.ok(town.blocked((a[0]+b[0])/2,(a[1]+b[1])/2,.25),'the observed timber house has a solid facade');
});

test('school buildings, tennis grounds and the open lot stand on dry exported land',()=>{
  const plots=[...WEST_BUILDINGS,...UNIVERSITY_FIELDS.filter(f=>['school-ground','tennis'].includes(f.id)),
    {id:'open-lot',footprint:SCHOOL_LOT}];
  for(const plot of plots){
    const p=plot.footprint,c=p.reduce((s,v)=>s.map((x,j)=>x+v[j]/p.length),[0,0]);
    for(let i=0;i<p.length;i++)for(const t of [.05,.5,.95]){
      const a=p[i],b=p[(i+1)%p.length];
      const q=a.map((v,j)=>(v+(b[j]-v)*t)*.96+c[j]*.04);
      assert.ok(!inWater(...q),plot.id+' has no water beneath its footprint at '+q);
      assert.ok(ground.roadHeightAt(...q)>=0,plot.id+' has exported dry ground at '+q);
    }
  }
});

// Check the exported surfaces at the shared seam. Comparing source arrays alone would
// miss a generator that cropped the hill at an obsolete radial ring.
import { registerHooks } from 'node:module';
import { UNIVERSITY_DATA } from '../src/world/generators/university-layout.js';
import { CASTLE_SITE } from '../src/world/generators/castle-layout.js';
registerHooks({resolve(specifier,context,next){
  return next(specifier,context);
}});
const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
for(const detail of ['', '.lod'])test('castle foot and inner-moat retaining top share exported vertices '+(detail||'high'),async()=>{
  const vertices=async(name,offset)=>{
    const bytes=fs.readFileSync(new URL('../data/models/impressionist/'+name+detail+'.glb',import.meta.url));
    const root=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
    const out=[];
    root.traverse(o=>{
      if(!o.isMesh)return;
      const p=o.geometry.attributes.position;
      for(let i=0;i<p.count;i++)out.push([offset[0]-p.getX(i),p.getY(i),offset[1]+p.getZ(i)]);
      o.geometry.dispose();o.material.dispose();
    });
    return out;
  };
  const hill=await vertices('HK_Terrain_Hikone',[CASTLE_SITE.x,CASTLE_SITE.z]);
  const moat=await vertices('ART_WestMoat',[0,0]);
  for(const [x,z]of UNIVERSITY_DATA.castleBank){
    for(const [name,points]of [['hill',hill],['moat retaining top',moat]]){
      assert.ok(points.some(p=>Math.hypot(p[0]-x,p[2]-z)<.002&&Math.abs(p[1]-.15)<.001),
        name+' closes at the shared shore '+x+','+z);
    }
  }
});

const THREE=await import('three');
for(const detail of ['', '.lod'])test('the campus filler leaves the existing inner-moat water visible '+(detail||'high'),async()=>{
  const load=async name=>{
    const bytes=fs.readFileSync(new URL('../data/models/impressionist/'+name+detail+'.glb',import.meta.url));
    const root=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
    root.updateMatrixWorld(true);return root;
  };
  const extension=await load('ART_WestMoat'),native=await load('ART_CastleApproach');
  const ray=new THREE.Raycaster();ray.far=3;
  for(let i=0;i<3;i++){
    const q=INNER_MOAT_INNER[i].map((v,j)=>(v+INNER_MOAT_OUTER[i][j])/2);
    ray.set(new THREE.Vector3(-q[0],1,q[1]),new THREE.Vector3(0,-1,0));
    assert.ok(!ray.intersectObject(extension,true).some(h=>['HK_Grass','HK_Sidewalk'].includes(h.object.material.name)&&h.point.y> -1.3),
      'no dry filler above the joined water at '+q);
    assert.ok(ray.intersectObject(native,true).some(h=>h.object.material.name==='HK_Water'&&Math.abs(h.point.y+1.35)<.001),
      'the original water surface remains visible at '+q);
  }
  for(const root of [extension,native])root.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
});
for(const detail of ['', '.lod'])test('both banks present closed retaining faces to the water '+(detail||'high'),async()=>{
  const bytes=fs.readFileSync(new URL('../data/models/impressionist/ART_WestMoat'+detail+'.glb',import.meta.url));
  const root=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
  root.updateMatrixWorld(true);
  const ray=new THREE.Raycaster();ray.far=1.6;
  let checked=0;
  for(const key of ['campusBank','schoolBank','schoolInnerBank','castleBank']){
    const line=UNIVERSITY_DATA[key],side=['campusBank','schoolInnerBank'].includes(key)?1:-1;
    for(let i=1;i<line.length;i++){
      const a=line[i-1],b=line[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
      const nx=(b[1]-a[1])/length*side,nz=-(b[0]-a[0])/length*side;
      const mx=(a[0]+b[0])/2,mz=(a[1]+b[1])/2;
      if(!inWater(mx+nx*.8,mz+nz*.8)&&!inWater(mx-nx*.8,mz-nz*.8)){
        assert.ok(Math.abs(ground.roadHeightAt(mx,mz)-.01)<.001,'only a paved bridge opening interrupts the bank');
        continue;
      }
      ray.set(new THREE.Vector3(-(a[0]+b[0])/2-nx*.8,-.7,(a[1]+b[1])/2+nz*.8),
        new THREE.Vector3(nx,0,-nz));
      const hits=ray.intersectObject(root,true);
      assert.ok(hits.some(h=>Math.abs(h.distance-.8)<.003),key+' faces its adjoining water at segment '+i);
      checked++;
    }
  }
  assert.ok(checked>50,'inspect the continuous banks outside their bridge opening');
  root.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
});

test('the verge beside the main-gate landing has ground instead of a triangular water pocket',()=>{
  for(const x of [-601,-600,-599])for(const z of [184,185]){
    assert.ok(ground.roadHeightAt(x,z)!=null,'exported ground beside the gate at '+x+','+z);
    assert.ok(!walls.walls.some(w=>{
      let hit=false;const p=w.polygon;
      for(let i=0,j=p.length-2;i<p.length;j=i,i+=2)
        if((p[i+1]>z)!=(p[j+1]>z)&&x<(p[j]-p[i])*(z-p[i+1])/(p[j+1]-p[i+1])+p[i])hit=!hit;
      return hit;
    }),'dry landing beside the entrance at '+x+','+z);
  }
});

test('editor surfaces retain the campus gate and local street after a castle-only rebuild',()=>{
  const map=read('map.json');
  const covered=(p,kind)=>map.surfaces.filter(s=>s.kind===kind).some(s=>{
    for(let i=0;i<s.triangles.length;i+=6){
      const [ax,az,bx,bz,cx,cz]=s.triangles.slice(i,i+6);
      const d=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);if(Math.abs(d)<1e-10)continue;
      const u=((bz-cz)*(p[0]-cx)+(cx-bx)*(p[1]-cz))/d;
      const v=((cz-az)*(p[0]-cx)+(ax-cx)*(p[1]-cz))/d;
      if(Math.min(u,v,1-u-v)>=-1e-6)return true;
    }return false;
  });
  assert.ok(covered(UNIVERSITY_AXIS[0],'sidewalk'),'the editor retains the main-gate entry');
  assert.ok(covered(UNIVERSITY_AXIS.at(-1),'sidewalk'),'the editor retains the campus forecourt');
  assert.ok(covered(CASTLE_CAMPUS_LINK[4],'carriageway'),'the editor retains the connecting local street');
});
