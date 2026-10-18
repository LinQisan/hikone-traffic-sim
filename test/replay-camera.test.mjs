import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import fs from 'node:fs/promises';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('../vendor/three/three.module.js', import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: new URL(`../vendor/three/addons/${specifier.slice(13)}`, import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const THREE = await import('three');
const { CameraObstacles } = await import('../src/camera-obstacles.js');
const { ReplayCamera, replaySampleTimes } = await import('../src/replay-camera.js');
const { Replay } = await import('../src/replay.js');
const { registerModel } = await import('../src/world.js');

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
const { replayReviewFrames } = await import('../src/replay-review.js');
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const { webLayout } = await import('../src/web-layout.js');
const { Ground } = await import('../src/ground.js');

const flat = { heightAt: () => 0.01 };
const vector = (x, y, z) => new THREE.Vector3(x, y, z);
test('fractional recording timestamps do not create near-duplicate camera keys', () => {
  const start = 1.6333333333333, impact = start + 2, end = impact + 1.6;
  const times = replaySampleTimes(start, end, impact);
  for (const t of [start, impact, end]) assert.ok(times.includes(t), 'exact event boundaries are retained');
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] > 1e-4, 'no sub-millisecond camera jump');
});
function sample(t, x = t * 2, z = 0) {
  const bounds = new THREE.Box3(vector(x - 1, 0.01, z - 1), vector(x + 1, 1.8, z + 1));
  return { t, bounds, targets: [vector(x, 0.9, z), vector(x, 0.2, z), vector(x, 1.7, z)] };
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

test('overview avoids a foreground roof without hiding it, holds one angle and frames portrait subjects', () => {
  const obstacles = new CameraObstacles();
  const roof = addBox(obstacles, 3, 5, 8, 20, 10, 8);
  const camera = new THREE.PerspectiveCamera(50, 9 / 16, 0.3, 500);
  const director = new ReplayCamera(camera, flat, obstacles);
  const samples = Array.from({ length: 21 }, (_, i) => sample(i / 5));
  director.start(samples, 2, 0);
  assert.equal(director.track.filter(p => p.cut).length, 0, 'no cut is needed to get around the roof');
  assert.equal(new Set(director.track.map(p => p.angle)).size, 1, 'a whole-clip clear angle stays stable');
  let before = null;
  for (let i = 0; i <= 240; i++) {
    const t = i / 60, s = sample(t);
    director.frame(t);
    assertFramed(camera, s.bounds);
    assert.ok(director.clear(camera.position, s.targets), `clear sight at ${t}`);
    if (before) assert.ok(camera.position.distanceTo(before) < 0.3, 'smooth translation, no teleport');
    before = camera.position.clone();
  }
  assert.equal(roof.attributes.position.count, 24, 'obstacle geometry remains intact');
  roof.dispose();
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

test('clear endpoint cameras cannot take a shortcut through a building', () => {
  const obstacles = new CameraObstacles();
  const roof = addBox(obstacles, 0, 5, 0, 4, 10, 4);
  const director = new ReplayCamera(new THREE.PerspectiveCamera(), flat, obstacles);
  const a = { position: vector(-5, 5, 0) }, b = { position: vector(5, 5, 0) };
  assert.equal(director.edge(a, b, sample(0, -7), sample(1, 7)), false);
  roof.dispose();
});

test('parked truck copies affect camera planning without changing or retaining the rendered vehicle', () => {
  const city = new CameraObstacles();
  const root = new THREE.Group();
  const truck = new THREE.Mesh(new THREE.BoxGeometry(7, 6, 10), new THREE.MeshBasicMaterial());
  truck.position.set(2, 3, 7); root.add(truck);
  const obstacles = city.withRoot(root);
  const director = new ReplayCamera(new THREE.PerspectiveCamera(50, 16 / 9), flat, obstacles);
  director.start(Array.from({ length: 11 }, (_, i) => sample(i / 5)), 1, 0);
  for (const shot of director.samples) {
    director.frame(shot.t);
    assert.ok(director.clear(director.camera.position, shot.targets));
  }
  assert.equal(city.parts.length, 0, 'the shared city does not retain a scenario truck');
  assert.equal(truck.visible, true, 'planning does not hide the truck');
  truck.geometry.dispose(); truck.material.dispose();
});

test('planned playback allocates no camera probes, restarts exactly and replans a resized viewport', () => {
  const obstacles = new CameraObstacles();
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.3, 500);
  const director = new ReplayCamera(camera, flat, obstacles);
  director.start(Array.from({ length: 16 }, (_, i) => sample(i / 5)), 1.5, 0, true);
  const start = camera.position.clone(), track = director.track;
  const original = obstacles.clear;
  obstacles.clear = () => { throw new Error('playback must not raycast'); };
  for (let i = 0; i <= 180; i++) director.frame(i / 60);
  assert.ok(camera.position.distanceTo(start) < 1e-10, 'reduced motion holds a stationary shot');
  director.frame(0);
  assert.ok(camera.position.equals(start));
  assert.equal(director.track, track);
  obstacles.clear = original;
  camera.aspect = 9 / 16; camera.updateProjectionMatrix();
  director.frame(1.5);
  assert.notEqual(director.track, track);
  assertFramed(camera, sample(1.5).bounds);
});

test('a blind corner anticipates an angle change without cuts or oscillating between sides', () => {
  const obstacles = {
    cameraClear: () => true,
    clear(from, to) {
      if (to.y > 3) return true; // Camera translations are in open air.
      const desired = Math.PI * Math.max(0, Math.min(1, to.x / 8));
      const actual = Math.atan2(from.x - to.x, from.z - to.z);
      return Math.abs(Math.atan2(Math.sin(actual - desired), Math.cos(actual - desired))) < 0.95;
    },
  };
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.3, 500);
  const director = new ReplayCamera(camera, flat, obstacles);
  director.start(Array.from({ length: 41 }, (_, i) => sample(i / 5, i / 5)), 4, 0);
  assert.equal(director.track.filter(p => p.cut).length, 0);
  let last = null;
  for (let i = 0; i <= 480; i++) {
    const t = i / 60;
    director.frame(t);
    assert.ok(director.clear(camera.position, sample(t, t).targets));
    if (last) assert.ok(camera.position.distanceTo(last) < 0.45, 'the planned turn stays gradual');
    last = camera.position.clone();
  }
});

test('an enclosed custom recording still has a finite stable camera and can reach its end', () => {
  const director = new ReplayCamera(new THREE.PerspectiveCamera(), flat, { cameraClear: () => true, clear: () => false });
  director.start(Array.from({ length: 11 }, (_, i) => sample(i / 5)), 1, 0);
  for (let t = 0; t < 2; t += 1 / 60) director.frame(t);
  assert.ok(director.camera.position.toArray().every(Number.isFinite));
  assert.equal(new Set(director.track.map(p => p.angle)).size, 1);
});

test('portrait overview reserves the actual area covered by wrapped replay controls', () => {
  const replay = new Replay(new THREE.Scene(), new Map(), flat);
  replay.setViewport(9 / 16, 0.32);
  const frames = Array.from({ length: 21 }, (_, i) => ({ t: i / 5, head: { x: i / 5, z: 0, yaw: 90 }, cars: [] }));
  replay.start(frames, 2, null, 170);
  for (const shot of replay.overview.samples) {
    replay.frame(shot.t);
    for (let i = 0; i < 8; i++) {
      const p = vector(i & 1 ? shot.bounds.max.x : shot.bounds.min.x, i & 2 ? shot.bounds.max.y : shot.bounds.min.y,
        i & 4 ? shot.bounds.max.z : shot.bounds.min.z).project(replay.camera);
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
    assert.equal(replay.overview.track.filter(p => p.cut).length, 0, 'the junction has a continuous visible view');
    for (const shot of replay.overview.samples) {
      replay.frame(shot.t);
      assertFramed(replay.camera, shot.bounds);
      assert.ok(replay.overview.clear(replay.camera.position, shot.targets, shot.blockers), `visible at ${shot.t}, bicycle=${bicycle}`);
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
