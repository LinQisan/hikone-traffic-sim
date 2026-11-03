import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import * as THREE from 'three';
import {Ground} from '../src/simulation/collision/Ground.ts';
import {Obstacles} from '../src/simulation/collision/Obstacles.ts';
import {buildNativeModel} from '../src/three/geometry/model-builder.js';
import {CameraObstacles} from '../src/three/camera/camera-obstacles.js';
import {EAST_CAMERA_SOLIDS} from '../src/world/generators/east-layout.ts';
import {CASTLE_CAMPUS_LINK} from '../src/world/generators/university-layout.js';
import {indexMeshRays} from '../src/three/camera/mesh-ray-index.js';

const read = file => JSON.parse(fs.readFileSync(new URL('../'+file,import.meta.url)));
const ground = new Ground(read('data/road_tiles.json')), body = new Obstacles(read('data/collision.json'));

test('textured battered wall corners and undersides form closed shells in both levels',()=>{
  execFileSync('python3',['-c',`
import sys
from collections import Counter
sys.path.insert(0,'tools')
from nishi_school import wall,data
class Mesh:
    def __init__(self,distant): self.distant=distant;self.faces=[]
    def face(self,points,material,**kwargs):
        assert material=='ART_CastleStone'
        self.faces.append(points)
for item in data()['walls']:
    near,far=Mesh(False),Mesh(True)
    for b in (near,far):
        wall(b,item)
        edges=Counter(tuple(sorted((tuple(a),tuple(c)))) for f in b.faces for a,c in zip(f,f[1:]+f[:1]))
        assert edges and all(n==2 for n in edges.values()), (item['osm'],'open wall edge')
    assert near.faces==far.faces, (item['osm'],'LOD changed the closed shell')
`],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
});

test('every bare cherry branch grows from an existing branch instead of floating',()=>{
  const result=execFileSync('python3',['-c',`
import sys, math
sys.path.insert(0, 'tools')
import school_road
segments=[]
school_road.bar=lambda b,a,c,*args,**kwargs: segments.append((a,c))
class Mesh: distant=False
school_road.bare_cherry(Mesh(),0,0,0,4)
def distance(p,a,c):
    d=[c[i]-a[i] for i in range(3)]
    t=max(0,min(1,sum((p[i]-a[i])*d[i] for i in range(3))/sum(v*v for v in d)))
    return math.dist(p,[a[i]+d[i]*t for i in range(3)])
for j,(a,c) in enumerate(segments[1:],1):
    assert min(distance(a,p,q) for p,q in segments[:j])<.1, ('detached branch',j,a)
print(len(segments))
`],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
  assert.ok(Number(result.trim())>20,'the check emitted a tree with fine branches');
});

test('the closed Nishi gate leaves the photographed public turn and crossing clear',()=>{
  const line=CASTLE_CAMPUS_LINK.slice(2,9);
  for(let k=1;k<line.length;k++){
    const a=line[k-1],c=line[k],count=Math.ceil(Math.hypot(c[0]-a[0],c[1]-a[1])/.25);
    for(let i=0;i<=count;i++){
      const x=a[0]+(c[0]-a[0])*i/count,z=a[1]+(c[1]-a[1])*i/count;
      assert.ok(ground.roadHeightAt(x,z)!=null,`supported street at ${x},${z}`);
      assert.ok(!body.blocked(x,z,.45),`public bicycle body corridor at ${x},${z}`);
    }
  }
  assert.ok(body.blocked(-587,263.2,.3),'the photographed closed accordion gate blocks private campus entry');
});

for(const suffix of ['','.lod'])test(`Nishi nameplate is visible and separate wall envelopes leave the turn open (${suffix||'high'})`,()=>{
  const parts=buildNativeModel(read(`models/ART_EastHikoneBuildings${suffix}.json`)),group=new THREE.Group();
  for(const p of parts){const mesh=new THREE.Mesh(p.geometry,p.material);mesh.applyMatrix4(p.matrix);group.add(mesh);}
  indexMeshRays(group);group.updateMatrixWorld(true);
  const ray=new THREE.Raycaster();let glyph;
  for(const mesh of group.children){
    if(mesh.material.name!=='ART_DisplayInk')continue;
    const p=mesh.geometry.attributes.position,ix=mesh.geometry.index,count=ix?.count??p.count;
    for(let i=0;i<count;i+=3){
      const a=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,ix?ix.getX(i+k):i+k).applyMatrix4(mesh.matrix));
      const c=a[0].add(a[1]).add(a[2]).multiplyScalar(1/3);
      if(c.x>585.1&&c.x<588.9&&c.y>3.8&&c.y<4.12&&c.z<262.81&&c.z>262.75){glyph=c;break;}
    }
    if(glyph)break;
  }
  assert.ok(glyph,'the school name is actual front-facing mesh lettering');
  ray.set(glyph.clone().add(new THREE.Vector3(0,0,-.6)),new THREE.Vector3(0,0,1));
  const hit=ray.intersectObject(group,true)[0];
  assert.equal(hit?.object.material.name,'ART_DisplayInk','no brown portal face occludes the name');
  const camera=new CameraObstacles([{asset:'ART_EastHikoneBuildings',items:[{p:[0,0,0],r:0,s:[1,1,1]}],low:parts,cameraSolids:EAST_CAMERA_SOLIDS}]);
  assert.equal(camera.cameraClear(new THREE.Vector3(588,1.7,248)),true,'public road is outside every wall/gate envelope');
  assert.equal(camera.clear(new THREE.Vector3(590,1.5,250),new THREE.Vector3(597,1.5,250)),false,'the actual stone wall blocks the camera');
  for(const {mesh} of camera.parts)mesh.geometry.dispose();
  for(const p of parts){p.geometry.dispose();p.material.dispose();}
});
