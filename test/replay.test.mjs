import test from 'node:test';
import assert from 'node:assert/strict';

// Rendering checks use the same npm three.js package as the browser.
const THREE = await import('three');
const { createReplayAnimal } = await import('../src/three/entities/replay-animal.js');
const { Replay } = await import('../src/three/entities/replay.js');
const { GroundContact } = await import('../src/three/scene/ground-contact.js');
const {ParticipantReplayCamera} = await import('../src/three/camera/ParticipantReplayCamera.ts');
const {Recorder} = await import('../src/simulation/metrics/analysis.ts');
const {nearestReplayCar} = await import('../src/simulation/metrics/replay.ts');

test('ground contact matches precise posed vertices under nested rotations and nonuniform scales', () => {
  const root = new THREE.Group(), pivot = new THREE.Group();
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12));
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 0.3));
  root.add(pivot); pivot.add(sphere, box);
  sphere.position.set(1, 2, -0.3); box.position.set(-0.2, 0.5, 0.4);
  const contact = new GroundContact(pivot);
  for (let i = 0; i < 120; i++) {
    root.position.set(i / 100, 0.41, -0.7);
    root.rotation.set(i / 31, i / 41, -i / 53); root.scale.set(1.3, 0.7, 2);
    pivot.rotation.set(-i / 23, i / 19, i / 29);
    sphere.rotation.set(i / 17, -i / 13, 0);
    root.updateWorldMatrix(true, true);
    const expected = new THREE.Box3().setFromObject(pivot, true).min.y;
    assert.ok(Math.abs(contact.minimumY() - expected) < 1e-12, `exact ground contact at pose ${i}`);
  }
  sphere.geometry.dispose(); sphere.material.dispose(); box.geometry.dispose(); box.material.dispose();
});

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
    if (o.userData.shared) return;                  // shared shadow pools stay
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
  assert.equal(replay.frames, null, 'leaving releases the recording and posed hierarchy');
  assert.equal(replay.figure, null);
  assert.equal(replay.headTrack, null);
  assert.equal(replay.grounding, null);
  assert.equal(replay.driverCamera.parent, null, 'the persistent driver camera must not retain the disposed root');
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

test('safe walking and cycling replay finish without contact, falling or slow motion and can restart', () => {
  for (const mode of ['walking', 'bicycle']) {
    const replay = new Replay(new THREE.Scene(), new Map(), {heightAt: () => 0.41});
    replay.start(recording, null, null, 170, mode);
    const start = replay.time;
    replay.update(0.1);
    assert.ok(Math.abs(replay.time - start - 0.1) < 1e-9);
    for (let i = 0; i < 100; i++) {
      assert.doesNotMatch(replay.update(0.1), /接触|Contact|Infinity|NaN/);
      assert.equal(replay.contact.visible, false);
    }
    assert.equal(replay.time, recording.at(-1).t);
    assert.equal(replay.atEnd, true);
    assert.ok((replay.rideTrack ? replay.animal.rider : replay.animal.pivot).quaternion.angleTo(new THREE.Quaternion()) < 1e-6);
    assert.equal(replay.playing, true);
    replay.setView('participant');
    assert.equal(replay.activeCamera, replay.participantCamera);
    assert.equal(replay.figure.visible, false);
    replay.setView('driver');
    assert.equal(replay.view, 'overview', 'a clip without cars has no driver view');
    assert.equal(replay.figure.visible, true);
    replay.restart();
    assert.equal(replay.time, recording[0].t);
    assert.equal(replay.atEnd, false);
    replay.stop();
    assert.equal(replay.participantCamera.parent, null);
  }
});

test('participant replay interpolates recorded eyes and look angles, falls and handles legacy head poses', () => {
  const camera = new ParticipantReplayCamera(), ground = {heightAt: () => 0.4};
  const track = [
    {t: 0, x: 10, z: 20, yaw: 350, eyeX: 10.2, eyeZ: 19.8, y: 1.9, pitch: -20, roll: 0},
    {t: 1, x: 10, z: 20, yaw: 10, eyeX: 11, eyeZ: 20.2, y: 0.6, pitch: 8, roll: -75},
  ];
  camera.place(track, 0.5, ground, 1.6);
  assert.ok(camera.position.distanceTo(new THREE.Vector3(-10.6, 1.25, 20)) < 1e-9);
  assert.ok(Math.abs(camera.rotation.x * 180 / Math.PI + 6) < 1e-9);
  assert.ok(Math.abs(camera.rotation.z * 180 / Math.PI + 37.5) < 1e-9);
  const forward = camera.getWorldDirection(new THREE.Vector3());
  assert.ok(Math.abs(forward.x) < 1e-9 && forward.z > 0.99, 'yaw takes the short arc through zero');
  camera.reducedMotion = true;
  camera.place(track, 1, ground, 1.6);
  assert.equal(camera.rotation.z, 0);
  camera.place([{t: 0, x: 1, z: 2, yaw: 90}], 0, ground, 1.6);
  assert.deepEqual(camera.position.toArray(), [-1, 2, 2]);
  assert.equal(camera.rotation.x, 0);
});

test('the safe replay includes a goal between regular samples and chooses the closest recorded car', () => {
  const recorder = new Recorder();
  recorder.capture(0, {x: 0, z: 0, yaw: 0}, []);
  recorder.capture(0.02, {x: 0, z: 0.05, yaw: 0}, [], true);
  recorder.stop();
  recorder.capture(0.03, {x: 0, z: 1, yaw: 0}, [], true);
  assert.equal(recorder.frames.at(-1).t, 0.02);
  assert.equal(recorder.frames.at(-1).head.z, 0.05);
  assert.equal(nearestReplayCar(recorder.frames), null);
  const frames = recording.map((f, i) => ({...f, cars: [
    {id: 7, x: 30, z: 2}, {id: 2, x: i === 1 ? 13 : 50, z: 2},
  ]}));
  assert.equal(nearestReplayCar(frames), 2, 'the closest approach anywhere in the clip defines the driver view');
});
