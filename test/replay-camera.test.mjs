import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const THREE = await import('three');
const { CameraObstacles } = await import('../src/three/camera/camera-obstacles.js');
const { ReplayCamera, replaySampleTimes } = await import('../src/three/camera/ReplayCamera.ts');
const { Replay } = await import('../src/three/entities/replay.js');
const { registerModel } = await import('../src/three/scene/world.js');

test('camera silhouettes share compact position/index copies without retaining render attributes', () => {
  const source = new THREE.BoxGeometry();
  const obstacles = new CameraObstacles();
  obstacles.add(source, new THREE.Matrix4());
  obstacles.add(source, new THREE.Matrix4().makeTranslation(5, 0, 0));
  const a = obstacles.parts[0].mesh.geometry, b = obstacles.parts[1].mesh.geometry;
  assert.equal(a, b);
  assert.deepEqual(Object.keys(a.attributes), ['position']);
  assert.notEqual(a.attributes.position.array.buffer, source.attributes.position.array.buffer);
  assert.notEqual(a.index.array.buffer, source.index.array.buffer);
  assert.deepEqual(a.attributes.position.array, source.attributes.position.array);
  assert.deepEqual(a.index.array, source.index.array);
  assert.equal(obstacles.clear(new THREE.Vector3(-2, 0, 0), new THREE.Vector3(2, 0, 0)), false);
  source.dispose(); a.dispose();
});

test('shared camera ray indices retain exact occlusion across independently transformed placements', () => {
  const source = new THREE.TorusKnotGeometry(1, 0.35, 64, 8), obstacles = new CameraObstacles();
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), originals = [];
  for (const x of [-4, 4]) {
    const mesh = new THREE.Mesh(source, material);
    mesh.position.set(x, 2, 1); mesh.rotation.set(0.3, x / 3, -0.2); mesh.scale.set(x < 0 ? -1.2 : 0.7, 1.3, 0.9);
    mesh.updateMatrixWorld(true); originals.push(mesh); obstacles.add(source, mesh.matrixWorld);
  }
  assert.equal(obstacles.parts[0].mesh.raycast, obstacles.parts[1].mesh.raycast, 'repeated geometry shares its CPU index');
  assert.notEqual(obstacles.parts[0].mesh.raycast, THREE.Mesh.prototype.raycast, 'dense probes use the index');
  const ray = new THREE.Raycaster(), direction = new THREE.Vector3();
  let clear = 0, blocked = 0;
  for (let i = 0; i < 180; i++) {
    const angle = i * 2.399963, from = new THREE.Vector3(Math.cos(angle) * 9, 2 + Math.sin(i * 0.7) * 4, Math.sin(angle) * 9);
    const to = new THREE.Vector3((i % 3 - 1) * 4, i % 4, 1);
    const distance = direction.subVectors(to, from).length();
    ray.set(from, direction.divideScalar(distance)); ray.near = 0.02; ray.far = distance - 0.02;
    const expected = ray.intersectObjects(originals, false).length === 0;
    assert.equal(obstacles.clear(from, to), expected, `same double-sided segment result at ray ${i}`);
    if (expected) clear++; else blocked++;
  }
  assert.ok(clear && blocked, 'rays exercise openings as well as solid silhouettes');
  source.dispose(); obstacles.parts[0].mesh.geometry.dispose(); material.dispose();
});
const { replayReviewFrames } = await import('../src/three/scene/replay-review.js');
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const { webLayout } = await import('../src/world/generators/web-layout.js');
const { Ground } = await import('../src/simulation/collision/Ground.ts');

const flat = { heightAt: () => 0.01 };
const vector = (x, y, z) => new THREE.Vector3(x, y, z);
test('camera bounds grid answers exactly like testing every part, including parts added later', () => {
  const obstacles = new CameraObstacles(), geometry = new THREE.BoxGeometry(3, 6, 3);
  const place = i => new THREE.Matrix4().makeTranslation(Math.sin(i * 12.9) * 90, 3, Math.cos(i * 7.3) * 90);
  for (let i = 0; i < 40; i++) obstacles.add(geometry, place(i));
  obstacles.add(new THREE.BoxGeometry(70, 8, 2), new THREE.Matrix4().makeTranslation(0, 4, -5));
  obstacles.cameraClear(vector(0, 2, 0));
  obstacles.add(geometry, place(41));
  const ray = new THREE.Raycaster(), direction = new THREE.Vector3(), meshes = obstacles.parts.map(p => p.mesh);
  let blocked = 0;
  for (let i = 0; i < 400; i++) {
    const from = vector(Math.sin(i * 3.1) * 100, 1 + i % 5, Math.cos(i * 1.7) * 100);
    const to = vector(Math.sin(i * 0.9) * 100, 2, Math.cos(i * 2.3) * 100);
    const distance = direction.subVectors(to, from).length();
    ray.set(from, direction.divideScalar(distance)); ray.near = 0.02; ray.far = distance - 0.02;
    const hits = [];
    for (const mesh of meshes) mesh.raycast(ray, hits);
    assert.equal(obstacles.clear(from, to), hits.length === 0, `ray ${i}`);
    assert.equal(obstacles.cameraClear(from), obstacles.parts.every(p => p.bounds.distanceToPoint(from) > 0.35), `camera ${i}`);
    if (hits.length) blocked++;
  }
  assert.ok(blocked > 20 && blocked < 380, 'rays exercise both outcomes');
});
test('fractional recording timestamps do not create near-duplicate camera keys', () => {
  const start = 1.6333333333333, impact = start + 2, end = impact + 1.6;
  const times = replaySampleTimes(start, end, impact);
  for (const t of [start, impact, end]) assert.ok(times.includes(t), 'exact event boundaries are retained');
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] > 1e-4, 'no sub-millisecond camera jump');
});
function sample(t, x = t * 2, z = 0) {
  const bounds = new THREE.Box3(vector(x - 1, 0.01, z - 1), vector(x + 1, 1.8, z + 1));
  return {t, subjects: [{role:'participant',bounds,targets:[vector(x,.9,z),vector(x,.2,z),vector(x,1.7,z)]}], blockers:[]};
}
function sampleBounds(s) {
  const bounds=new THREE.Box3();for(const subject of s.subjects)bounds.union(subject.bounds);return bounds;
}
function addBox(obstacles, x, y, z, w, h, d) {
  const geometry = new THREE.BoxGeometry(w, h, d);
  obstacles.add(geometry, new THREE.Matrix4().makeTranslation(x, y, z));
  return geometry;
}
function assertFramed(camera, bounds) {
  for (let i = 0; i < 8; i++) {
    const p = vector(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y,
      i & 4 ? bounds.max.z : bounds.min.z).project(camera);
    assert.ok(Math.abs(p.x) < 0.83 && Math.abs(p.y) < 0.83 && p.z > -1 && p.z < 1, 'subject stays inside the safe screen margins');
  }
}
function startCamera(camera,samples,referenceTime,preferredAngle,obstacles=null,reducedMotion=false){
  const director=new ReplayCamera(camera,flat);
  director.configure({reducedMotion});
  director.start({samples,referenceTime,preferredAngle,obstacles});return director;
}
function assertLockedShots(director){
  const fov=director.camera.fov;
  for(const shot of director.shots){
    director.frame(shot.from+.0001);const from=director.camera.position.clone(),focus=director.focus.clone();
    director.frame((shot.from+shot.until)/2);
    assert.ok(director.camera.position.equals(from)&&director.focus.equals(focus),'each shot holds its composition');
    assert.equal(director.camera.fov,fov,'the lens does not zoom');
  }
}

test('analysis shots avoid a foreground roof without hiding it and frame portrait subjects', () => {
  const obstacles = new CameraObstacles();
  const roof = addBox(obstacles, 3, 5, 8, 20, 10, 8);
  const camera = new THREE.PerspectiveCamera(50, 9 / 16, 0.3, 500);
  const director = startCamera(camera,Array.from({length:21},(_,i)=>sample(i/5)),2,0,obstacles);
  assertLockedShots(director);
  for(let i=0;i<=240;i++){
    const t=i/60,s=sample(t);director.frame(t);assertFramed(camera,sampleBounds(s));
    assert.ok(director.clear(camera.position,s),`clear sight at ${t}`);
  }
  assert.equal(roof.attributes.position.count,24,'obstacle geometry remains intact');roof.dispose();
});

test('camera queries preserve openings, see back faces, and do not depend on render visibility', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-2, 0, 0, 2, 0, 0, 0, 4, 0], 3));
  const obstacles = new CameraObstacles();
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  root.position.x = 4; mesh.visible = false; root.add(mesh);
  obstacles.addRoot(root);
  assert.equal(obstacles.clear(vector(4, 1, 2), vector(4, 1, -2)), false);
  assert.equal(obstacles.clear(vector(4, 1, -2), vector(4, 1, 2)), false, 'the back of a roof also occludes');
  assert.equal(obstacles.clear(vector(5.8, 3.8, 2), vector(5.8, 3.8, -2)), true, 'an empty AABB corner stays open');
  assert.equal(mesh.visible, false);
  geometry.dispose(); mesh.material.dispose();
});

test('parked truck copies affect planning without changing the rendered vehicle', () => {
  const city=new CameraObstacles(),root=new THREE.Group();
  const truck=new THREE.Mesh(new THREE.BoxGeometry(7,6,10),new THREE.MeshBasicMaterial());
  truck.position.set(2,3,7);root.add(truck);
  const obstacles=city.withRoot(root),camera=new THREE.PerspectiveCamera(50,16/9,.3,500);
  const director=startCamera(camera,Array.from({length:11},(_,i)=>sample(i/5)),1,0,obstacles);
  for(const s of director.samples){director.frame(s.t);assert.ok(director.clear(camera.position,s));}
  assert.equal(city.parts.length,0);assert.equal(truck.visible,true);truck.geometry.dispose();truck.material.dispose();
});

test('planned playback probes nothing, reduced motion holds still and resize/restart are deterministic', () => {
  const obstacles=new CameraObstacles(),camera=new THREE.PerspectiveCamera(50,16/9,.3,500);
  const director=startCamera(camera,Array.from({length:16},(_,i)=>sample(i/5)),1.5,0,obstacles,true);
  const start=camera.position.clone(),shots=director.shots,original=obstacles.clear;
  obstacles.clear=()=>{throw Error('playback must not raycast');};
  for(let i=0;i<=180;i++)director.frame(i/60);
  assert.ok(camera.position.distanceTo(start)<1e-10);
  director.frame(0);assert.ok(camera.position.equals(start));assert.equal(director.shots,shots);
  obstacles.clear=original;director.configure({aspect:9/16});director.frame(0);
  assert.notEqual(director.shots,shots);
  for(const s of director.samples){director.frame(s.t);assertFramed(camera,sampleBounds(s));}
});

test('a blind corner uses held visible compositions instead of a camera flight through the scene', () => {
  const obstacles={cameraClear:()=>true,clear(from,to){
    if(to.y>3)return true;
    const desired=Math.PI*Math.max(0,Math.min(1,to.x/8)),actual=Math.atan2(from.x-to.x,from.z-to.z);
    return Math.abs(Math.atan2(Math.sin(actual-desired),Math.cos(actual-desired)))<.95;
  }};
  const camera=new THREE.PerspectiveCamera(50,16/9,.3,500);
  const director=startCamera(camera,Array.from({length:41},(_,i)=>sample(i/5,i/5)),4,0,obstacles);
  assertLockedShots(director);
  for(let i=0;i<=480;i++){const t=i/60;director.frame(t);assert.ok(director.clear(camera.position,sample(t,t)),`visible at ${t}`);}
});

test('a short blind corner prioritizes visibility over the preferred shot duration', () => {
  const obstacles={cameraClear:()=>true,clear(from,to){
    const desired=Math.PI*Math.max(0,Math.min(1,to.x/8)),actual=Math.atan2(from.x-to.x,from.z-to.z);
    return Math.abs(Math.atan2(Math.sin(actual-desired),Math.cos(actual-desired)))<.95;
  }};
  const camera=new THREE.PerspectiveCamera(50,16/9,.3,500);
  const director=startCamera(camera,replaySampleTimes(0,2.8,1.4).map(t=>sample(t,t*8/2.8)),1.4,0,obstacles);
  assert.ok(director.shots.every(s=>s.visibility==='clear'),'short visibility cuts replace an obstructed fallback');
  for(let t=0;t<=2.8;t+=1/120){
    director.frame(t);assert.ok(director.clear(camera.position,sample(t,t*8/2.8)),`visible around the corner at ${t}`);
  }
  assertLockedShots(director);
});

test('an arriving then departing car cannot pump the camera distance inside an analytical shot', () => {
  const impact=3,shots=replaySampleTimes(0,5,impact).map(t=>{
    const s=sample(t,t<impact?0:Math.min(3,(t-impact)*4),t<impact?t*1.3-3.9:0),car=30-t*10;
    if(Math.abs(car)<32)s.subjects.push({role:'vehicle',bounds:new THREE.Box3(vector(car-2.2,0,-1),vector(car+2.2,1.5,1)),
      targets:[vector(car,.8,0),vector(car-1.8,.8,0),vector(car+1.8,.8,0)]});
    return s;
  });
  const camera=new THREE.PerspectiveCamera(50,16/9,.3,500),director=startCamera(camera,shots,impact,.6);
  assertLockedShots(director);
  assert.ok(director.shots.length<=3,'edits form a short sequence, not per-frame cuts');
  for(const shot of director.shots.slice(1))assert.ok(Math.abs(shot.from-impact)>.7,'the contact itself has no distracting cut');
  for(const s of shots){director.frame(s.t);assertFramed(camera,sampleBounds(s));}
});

test('a moving truck between planning samples cannot briefly hide the participant', () => {
  const truck=t=>({id:9,reference:false,bounds:new THREE.Box3(vector(t*50-6,0,4),vector(t*50-4,6,7))});
  const samples=[0,.2].map(t=>({...sample(t,0),blockers:[truck(t)]}));
  const camera=new THREE.PerspectiveCamera(50,16/9,.3,500),director=startCamera(camera,samples,.1,0);
  assert.ok(director.shots.every(s=>s.visibility==='clear'));
  for(let t=0;t<=.2;t+=1/240){
    director.frame(t);
    assert.ok(director.clear(camera.position,{...sample(t,0),blockers:[truck(t)]}),`truck does not obscure the body at ${t}`);
  }
  assertLockedShots(director);
});

test('enclosed custom recordings retain a finite stable camera and working timeline', () => {
  const camera=new THREE.PerspectiveCamera(),director=startCamera(camera,Array.from({length:11},(_,i)=>sample(i/5)),1,0,
    {cameraClear:()=>true,clear:()=>false});
  for(let t=0;t<2;t+=1/60)director.frame(t);
  assert.ok(camera.position.toArray().every(Number.isFinite));assertLockedShots(director);
});

test('portrait overview reserves the actual area covered by wrapped replay controls', () => {
  const replay = new Replay(new THREE.Scene(), new Map(), flat);
  replay.setViewport(9 / 16, 0.32);
  const frames = Array.from({ length: 21 }, (_, i) => ({ t: i / 5, head: { x: i / 5, z: 0, yaw: 90 }, cars: [] }));
  replay.start(frames, 2, null, 170);
  for (const shot of replay.overview.samples) {
    replay.frame(shot.t);
    for (let i = 0; i < 8; i++) {
      const p = vector(i & 1 ? sampleBounds(shot).max.x : sampleBounds(shot).min.x, i & 2 ? sampleBounds(shot).max.y : sampleBounds(shot).min.y,
        i & 4 ? sampleBounds(shot).max.z : sampleBounds(shot).min.z).project(replay.camera);
      assert.ok(p.y > -0.32 && p.y < 0.93 && Math.abs(p.x) < 0.83, 'the figure stays above the controls');
    }
  }
  replay.stop();
});

test('walking and cycling replay see the actual town throughout approach, impact and landing', async () => {
  const layout = webLayout(JSON.parse(await fs.readFile(new URL('../data/layout.json', import.meta.url))));
  const loader = new GLTFLoader();
  const parts = async name => {
    const bytes = await fs.readFile(new URL(`../data/models/impressionist/${name}.lod.glb`, import.meta.url));
    const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const result = [];
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(o => { if (o.isMesh) result.push({ geometry: o.geometry, material: o.material, matrix: o.matrixWorld.clone() }); });
    return result;
  };
  const definitions = await Promise.all([...new Set(layout.items.map(i => i.a))].map(async asset =>
    ({ asset, items: layout.items.filter(i => i.a === asset), low: await parts(asset) })));
  const obstacles = new CameraObstacles(definitions);
  registerModel('WEB_Sedan', await parts('WEB_Sedan'));
  const ground = new Ground(JSON.parse(await fs.readFile(new URL('../data/road_tiles.json', import.meta.url))));
  for (const mode of ['walking', 'bicycle', 'west-bicycle']) {
    const bicycle = mode !== 'walking';
    const demo = replayReviewFrames(bicycle);
    if (mode === 'west-bicycle') for (const f of demo.frames) {
      f.head = { x: -70 - Math.min(f.t, 4) * 2.4, z: 23, yaw: 270, rideYaw: 270 };
      f.cars[0] = { ...f.cars[0], x: -51.7 - Math.min(f.t, 4) * 6.4, z: 23, yaw: 270 };
    }
    const replay = new Replay(new THREE.Scene(), new Map(), ground, obstacles);
    if (mode === 'west-bicycle') replay.setView('driver');
    replay.start(demo.frames, demo.impact, demo.car.id, 170, bicycle ? 'bicycle' : 'walking');
    replay.setView('overview');
    assertLockedShots(replay.overview);
    assert.ok(replay.overview.shots.length<=3,'the junction uses a short analytical sequence');
    for (const shot of replay.overview.samples) {
      replay.frame(shot.t);
      assertFramed(replay.camera, sampleBounds(shot));
      assert.ok(replay.overview.clear(replay.camera.position, shot), `visible at ${shot.t}, bicycle=${bicycle}`);
    }
    // Dense playback catches a camera path or moving vehicle that is clear only at its keyframes.
    for (let t = 0; t <= 5.6; t += 1 / 60) {
      replay.frame(t);
      replay.root.updateWorldMatrix(true, true);
      const person = new THREE.Box3().setFromObject(replay.rideTrack ? replay.animal.rider : replay.animal.pivot);
      const centre = person.getCenter(new THREE.Vector3());
      assert.ok(obstacles.clear(replay.camera.position, centre), `body remains visible between samples: ${mode}, ${t}`);
    }
    replay.restart();
    const initial = replay.camera.position.clone();
    replay.frame(demo.impact); replay.restart();
    assert.ok(replay.camera.position.equals(initial));
    replay.stop();
  }
});
