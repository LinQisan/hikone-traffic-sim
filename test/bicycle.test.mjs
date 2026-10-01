import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('../vendor/three/three.module.js', import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: new URL(`../vendor/three/addons/${specifier.slice(13)}`, import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const THREE = await import('three');
const { createBicycle, WHEEL_RADIUS, CRANK_RADIUS } = await import('../src/bicycle.js');
const { createReplayCyclist, ridingTrack, sampleRide } = await import('../src/replay-cyclist.js');
const { Replay } = await import('../src/replay.js');
const { Player } = await import('../src/player.js');

function budget(root) {
  let triangles = 0, meshes = 0;
  root.traverse(o => {
    if (!o.isMesh) return;
    meshes++;
    triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
    assert.ok(o.material.isMeshLambertMaterial && !o.material.map);
  });
  return { triangles, meshes };
}

test('bicycle pigments are geometry, wheels roll by distance and level pedals oppose each other', () => {
  const bike = createBicycle();
  const cost = budget(bike.root);
  assert.ok(cost.triangles < 4000 && cost.meshes <= 6, JSON.stringify(cost));
  bike.root.traverse(o => { if (o.isMesh) assert.ok(o.geometry.attributes.color, 'baked pigment on every part'); });
  assert.ok(Math.abs(new THREE.Box3().setFromObject(bike.root, true).min.y) < 1e-6);
  const before = bike.feet.map(p => p.clone());
  bike.pose(WHEEL_RADIUS * Math.PI / 2);
  assert.ok(Math.abs(bike.wheels[0].rotation.x - Math.PI / 2) < 1e-6);
  assert.ok(bike.feet[0].distanceTo(before[0]) > 0.02);
  assert.ok(Math.abs(bike.feet[0].distanceTo(bike.feet[1]) - Math.hypot(0.27, CRANK_RADIUS * 2)) < 1e-6);
  bike.pedals.forEach(p => assert.ok(p.quaternion.angleTo(new THREE.Quaternion()) < 1e-6));
  const angle = bike.wheels[0].rotation.x;
  bike.pose(WHEEL_RADIUS * Math.PI / 2);
  assert.equal(bike.wheels[0].rotation.x, angle, 'stopped bike does not keep spinning');
  bike.dispose();
});

test('rider paws stay on the grips and both soles follow the pedals throughout a crank revolution', () => {
  for (const [height, weight] of [[90, 15], [170, 60], [170, 110], [210, 70]]) {
    const rider = createReplayCyclist(height, { weightKg: weight });
    const cost = budget(rider.root);
    assert.ok(cost.triangles < 12000 && cost.meshes <= 20, JSON.stringify(cost));
    const grip = new THREE.Vector3(), paw = new THREE.Vector3(), sole = new THREE.Vector3(), pedal = new THREE.Vector3();
    for (let i = 0; i <= 24; i++) {
      // looking round over the shoulder (up to 2.5 rad) must not take the paws off the bar
      rider.pose(i / 24, 2.4, 0, i / 24 * WHEEL_RADIUS * Math.PI * 2 * 1.8 * rider.height, (i % 3 - 1) * 2.5);
      rider.root.updateWorldMatrix(true, true);
      for (let side = 0; side < 2; side++) {
        rider.bicycle.root.localToWorld(grip.copy(rider.bicycle.grips[side]));
        assert.ok(rider.pawWorld(side, paw).distanceTo(grip) < 0.01 * rider.height, `paw on the grip (${height} cm, ${weight} kg)`);
        rider.bicycle.pedals[side].getWorldPosition(pedal);
        assert.ok(rider.soleWorld(side, sole).distanceTo(pedal) < 0.01 * rider.height, `sole on the pedal (${height} cm, ${weight} kg)`);
      }
      assert.ok(Math.abs(new THREE.Box3().setFromObject(rider.root, true).min.y) < 1e-6, 'tyres remain on the floor');
    }
    rider.pose(0, 0, 0, 0, 0.5);
    assert.ok(Math.abs(rider.head.rotation.y + rider.torso.rotation.y - 0.5) < 1e-6, 'body twist + head turn = the looking direction');
    assert.ok(rider.torso.rotation.y > 0.1, 'the body twists, not only the head');
    rider.dispose();
  }
});

const recording = [
  { t: 0, head: { x: 10, z: 2, yaw: 0, rideYaw: 90 }, cars: [] },
  { t: 1, head: { x: 12, z: 2, yaw: 60, rideYaw: 90 }, cars: [] },
  { t: 2.6, head: { x: 12, z: 2, yaw: 60, rideYaw: 90 }, cars: [] },
];
test('bicycle replay preserves independent gaze, rolling, grounded fall and exact restart', () => {
  const replay = new Replay(new THREE.Scene(), new Map(), { heightAt: () => 0.41 });
  replay.start(recording, 1, null, 170, 'bicycle');
  replay.frame(0.5);
  assert.equal(replay.animal.root.name, 'ReplayCyclist');
  const initial = replay.animal.bicycle.crank.rotation.x;
  assert.ok(Math.abs(replay.figure.rotation.y + Math.PI / 2) < 1e-6, 'bike faces travel, not the looking direction');
  const center = replay.figure.position.clone().add(new THREE.Vector3(0, 0.8, 0)).project(replay.camera);
  assert.ok(Math.abs(center.x) < 0.8 && Math.abs(center.y) < 0.8, 'camera keeps the rider in the replay frame');
  const fan = new THREE.Vector3(0, 0, 1).applyQuaternion(replay.gaze.getWorldQuaternion(new THREE.Quaternion()));
  assert.ok(Math.abs(fan.x + 0.5) < 1e-6, 'gaze still represents the recorded 30-degree check');
  replay.frame(0.9);
  assert.notEqual(replay.animal.bicycle.crank.rotation.x, initial);
  replay.frame(1.7);
  assert.ok(replay.animal.pivot.quaternion.angleTo(new THREE.Quaternion()) > 1.3);
  assert.ok(Math.abs(new THREE.Box3().setFromObject(replay.animal.root, true).min.y - 0.41) < 1e-6);
  const stopped = replay.animal.bicycle.crank.rotation.x;
  replay.frame(2.4);
  assert.equal(replay.animal.bicycle.crank.rotation.x, stopped, 'no pedalling after contact');
  replay.restart();
  assert.equal(replay.animal.bicycle.crank.rotation.x, 0);
  assert.ok(replay.animal.pivot.quaternion.angleTo(new THREE.Quaternion()) < 1e-6);
  const geometries = new Set(), materials = new Set();
  replay.root.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) materials.add(o.material); });
  let freedGeometry = 0, freedMaterial = 0;
  geometries.forEach(g => g.addEventListener('dispose', () => freedGeometry++));
  materials.forEach(m => m.addEventListener('dispose', () => freedMaterial++));
  replay.stop(); replay.stop();
  assert.equal(freedGeometry, geometries.size);
  assert.equal(freedMaterial, materials.size);
});

test('older recordings infer bicycle heading from movement and hold the last heading when stopped', () => {
  const track = ridingTrack(recording.map(f => { const { rideYaw, ...head } = f.head; return { t: f.t, ...head }; }), 1);
  assert.equal(sampleRide(track, 0.5).yaw, 90);
  assert.equal(sampleRide(track, 2.5).yaw, 90);
  assert.equal(sampleRide(track, 2.5).distance, 2);
});

test('live bicycle mode displays and rolls the bike, records travel yaw and resets for walking', () => {
  const original = globalThis.addEventListener;
  globalThis.addEventListener = () => {};
  try {
    const renderer = { domElement: { addEventListener() {} } };
    const player = new Player(new THREE.PerspectiveCamera(), renderer, { walls: [] }, { heightAt: () => 0.41 });
    player.place(10, 2, 90, 170, 'bicycle');
    player.enabled = true; player.keys.add('KeyW'); player.update(0.1);
    assert.ok(player.bicycle.root.visible);
    assert.ok(Math.abs(player.bicycle.root.position.x + player.x) < 1e-6);
    assert.ok(Math.abs(new THREE.Box3().setFromObject(player.bicycle.root, true).min.y - 0.41) < 1e-6,
      'tyres remain grounded as they roll');
    assert.notEqual(player.bicycle.wheels[0].rotation.x, 0);
    assert.equal(player.head().rideYaw, 90);
    player.keys.clear(); player.yaw = 0; player.update(0.1);
    assert.equal(player.head().yaw, 0);
    assert.equal(player.head().rideYaw, 90, 'turning the head does not turn the stationary bike');
    player.place(10, 2, 0, 170, 'walking');
    assert.equal(player.bicycle.root.visible, false);
    assert.equal(player.bicycle.wheels[0].rotation.x, 0);
    assert.equal(player.head().rideYaw, undefined);
    player.bicycle.dispose();
  } finally { globalThis.addEventListener = original; }
});
