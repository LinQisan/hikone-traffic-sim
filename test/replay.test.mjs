import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Match the browser import map to the repository's vendored three.js, without npm packages.
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('../vendor/three/three.module.js', import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: new URL(`../vendor/three/addons/${specifier.slice(13)}`, import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const THREE = await import('three');
const { createReplayAnimal } = await import('../src/replay-animal.js');
const { Replay } = await import('../src/replay.js');

test('the bear is lightweight, texture-free and scales to participant height', () => {
  for (const height of [90, 170, 210]) {
    const bear = createReplayAnimal(height, { weightKg: height * height / 10000 * 21.5 });
    const bounds = new THREE.Box3().setFromObject(bear.root, true);
    assert.ok(Math.abs(bounds.min.y) < 1e-6);
    assert.ok(Math.abs(bounds.max.y - height / 100) < 1e-6, 'height includes the ears');
    let triangles = 0, meshes = 0;
    bear.root.traverse(o => {
      if (!o.isMesh) return;
      meshes++;
      triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
      assert.ok(o.material.isMeshLambertMaterial && !o.material.map, 'simple diffuse materials, no textures');
    });
    assert.ok(triangles < 8000, `triangle budget: ${triangles}`);
    assert.ok(meshes <= 14, `draw-call budget: ${meshes}`);
    bear.dispose();
  }
});

const recording = [
  { t: 0, head: { x: 10, z: 2, yaw: 350 }, cars: [] },
  { t: 1, head: { x: 12, z: 2, yaw: 10 }, cars: [] },
  { t: 2.6, head: { x: 12, z: 2, yaw: 10 }, cars: [] },
];
test('replay bear follows recorded position/yaw, walks, falls on the ground and resets immediately', () => {
  const replay = new Replay(new THREE.Scene(), new Map(), { heightAt: () => 0.41 });
  replay.start(recording, 1, null, 170);
  replay.frame(0.5);
  assert.equal(replay.figure.position.x, -11);
  assert.equal(replay.figure.position.z, 2);
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(replay.figure.quaternion);
  assert.ok(Math.abs(forward.x) < 1e-6 && forward.z > 0.999, 'yaw interpolates across 360 degrees');
  assert.ok(Math.abs(replay.animal.legs[0].rotation.x) > 0.1, 'recorded movement drives the legs');
  replay.frame(1.7);
  assert.ok(replay.animal.pivot.quaternion.angleTo(new THREE.Quaternion()) > 1.3, 'the whole animal falls');
  assert.ok(Math.abs(new THREE.Box3().setFromObject(replay.animal.root, true).min.y - 0.41) < 1e-6, 'no ground penetration');
  assert.equal(replay.contact.visible, true);
  replay.restart();
  assert.equal(replay.time, 0);
  assert.equal(replay.figure.position.x, -10);
  assert.equal(replay.contact.visible, false);
  assert.ok(replay.animal.pivot.quaternion.angleTo(new THREE.Quaternion()) < 1e-6);
  replay.stop();
});

test('leaving/restarting replay disposes its animal and overlays exactly once', () => {
  const scene = new THREE.Scene(), replay = new Replay(scene, new Map(), { heightAt: () => 0 });
  replay.start(recording, 1, null, 170);
  const geometries = new Set(), materials = new Set();
  replay.root.traverse(o => {
    if (o.geometry) geometries.add(o.geometry);
    if (o.material) materials.add(o.material);
  });
  let disposedGeometry = 0, disposedMaterial = 0;
  geometries.forEach(g => g.addEventListener('dispose', () => disposedGeometry++));
  materials.forEach(m => m.addEventListener('dispose', () => disposedMaterial++));
  replay.stop(); replay.stop();
  assert.equal(disposedGeometry, geometries.size);
  assert.equal(disposedMaterial, materials.size);
  assert.equal(scene.children.length, 0);
  replay.start(recording, 1, null, 90);
  assert.ok(replay.animal && replay.playing, 'a new replay has a fresh animal');
  replay.stop();
});

test('finished replay remains on its final frame until an explicit stop or restart', () => {
  const scene = new THREE.Scene(), replay = new Replay(scene, new Map(), { heightAt: () => 0 });
  replay.start(recording, 1, null, 170);
  for (let i = 0; i < 200; i++) replay.update(0.1);
  assert.equal(replay.atEnd, true);
  const root = replay.root, animal = replay.animal;
  const position = replay.figure.position.clone(), pose = animal.pivot.quaternion.clone();
  let poseCalls = 0;
  const originalPose = animal.pose;
  animal.pose = (...args) => { poseCalls++; return originalPose(...args); };
  // Waiting for two minutes must neither advance the stage nor remove the final pose.
  for (let i = 0; i < 1200; i++) replay.update(0.1);
  assert.equal(replay.time, recording.at(-1).t);
  assert.equal(replay.playing, true, 'replay stays open while waiting for the participant');
  assert.equal(replay.root, root);
  assert.equal(replay.animal, animal);
  assert.ok(scene.children.includes(root));
  assert.ok(replay.figure.position.equals(position) && animal.pivot.quaternion.equals(pose));
  assert.equal(poseCalls, 0, 'waiting does not recompute the frozen pose');
  replay.restart();
  assert.equal(replay.atEnd, false);
  assert.equal(replay.time, recording[0].t);
  replay.stop();
  assert.equal(scene.children.length, 0);
});
