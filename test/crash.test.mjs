import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('../vendor/three/three.module.js', import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: new URL(`../vendor/three/addons/${specifier.slice(13)}`, import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const THREE = await import('three');
const { classifyCrash, crashMotion } = await import('../src/crash.js');
const { createReplayAnimal, bearGirth } = await import('../src/replay-animal.js');
const { Replay } = await import('../src/replay.js');
const { registerModel } = await import('../src/world.js');
// a box stands in for the sedan model (the GLB loads only in a browser)
registerModel('WEB_Sedan', [{ geometry: new THREE.BoxGeometry(1.76, 1.45, 4.6), material: new THREE.MeshLambertMaterial({ name: 'Box' }), matrix: new THREE.Matrix4() }]);

// a car heading +x (yaw 90) at `speed` m/s; the person stands at (px, pz)
const hit = (px, pz, speed, extra = {}) => classifyCrash({ person: { x: px, z: pz }, car: { x: 0, z: 0, yaw: 90 },
  carVelocity: { x: speed, z: 0 }, size: [1.76, 1.45, 4.6], ...extra });

test('the impact point decides the kind of motion', () => {
  assert.equal(hit(2.5, 0, 8).kind, 'front', 'the bonnet');
  assert.equal(hit(2.4, -0.8, 8).kind, 'corner', 'a front corner');
  assert.equal(hit(0, -1.1, 8).kind, 'side', 'the flank sweeping past');
  assert.equal(hit(2.5, 0, 0.3).kind, 'bump', 'walking into a standing car');
  const front = hit(2.5, 0, 8);
  assert.ok(front.dir.x > 0.95, 'thrown along the car travel');
  const side = hit(0, -1.1, 8);
  assert.ok(side.dir.z < -0.5, 'pushed away from the flank');
  const corner = hit(2.4, -0.8, 8), centre = hit(2.5, 0, 8);
  assert.ok(Math.abs(corner.spin) > Math.abs(centre.spin) * 1.5, 'a corner spins the body round');
  assert.ok(hit(2.5, 0, 12).thrown > hit(2.5, 0, 5).thrown && hit(2.5, 0, 12).lift > hit(2.5, 0, 5).lift, 'faster: further and higher');
  const bump = hit(2.5, 0, 0.3, { personVelocity: { x: -1.2, z: 0 } });
  assert.ok(bump.dir.x > 0.9 && bump.thrown < 0.5, 'falls back the way one walked, close by');
});

test('every motion leans onto the bonnet (front, at speed), flies, lands lying and stays down', () => {
  for (const c of [hit(2.5, 0, 8), hit(2.4, -0.8, 8), hit(0, -1.1, 8), hit(2.5, 0, 0.3), hit(2.5, 0, 8, { bicycle: true })]) {
    assert.deepEqual(crashMotion(c, 0), { x: 0, y: 0, z: 0, tilt: 0, spin: 0, flail: 0 });
    const end = crashMotion(c, 1.6);
    assert.ok(Math.abs(end.tilt - Math.PI / 2) < 1e-6, `${c.kind}: lying`);
    assert.equal(end.y, 0, `${c.kind}: on the ground`);
    assert.ok(Math.abs(Math.hypot(end.x, end.z) - c.thrown) < 1e-6, `${c.kind}: at the throw distance`);
    assert.ok(end.flail < 0.5, 'limbs relax after landing');
    if (c.flight) assert.ok(crashMotion(c, c.flight / 2).y > 0.04, `${c.kind}: airborne`);
  }
  assert.ok(crashMotion(hit(2.5, 0, 8), 0.05).tilt < 0, 'wraps onto the bonnet first');
});

test("weight changes the bear's girth, height its size", () => {
  assert.ok(bearGirth(170, 90) > bearGirth(170, 60) && bearGirth(170, 60) > bearGirth(170, 45));
  const width = (h, w) => { const b = createReplayAnimal(h, { weightKg: w }); const s = new THREE.Box3().setFromObject(b.root, true).getSize(new THREE.Vector3()); b.dispose(); return s; };
  assert.ok(width(170, 95).x > width(170, 55).x * 1.12, 'heavier is rounder');
  assert.ok(Math.abs(width(150, 50).y - 1.5) < 1e-6 && Math.abs(width(190, 80).y - 1.9) < 1e-6, 'the ears touch the body height');
});

test('the replay throws the bear along the car and lays it on the road; the rider and the bicycle part', () => {
  const car = (t, x) => ({ id: 7, x, z: 2, yaw: 90, body: 'sedan' });
  const frames = [];
  for (let t = 0; t <= 2.6; t += 0.05) {
    const contact = Math.min(t, 1);
    frames.push({ t, head: { x: 12.3, z: 2, yaw: 0, rideYaw: 0 }, cars: [car(t, 12.3 - 2.5 - 8 * (1 - contact))] });
  }
  for (const mode of ['walking', 'bicycle']) {
    const replay = new Replay(new THREE.Scene(), new Map(), { heightAt: () => 0.01 });
    replay.start(frames, 1, 7, 170, mode, 70);
    assert.equal(replay.crash.kind, 'front');
    replay.frame(2.5);
    const body = mode === 'bicycle' ? replay.animal.rider : replay.animal.pivot;
    const box = new THREE.Box3().setFromObject(body, true), centre = box.getCenter(new THREE.Vector3());
    assert.ok(-centre.x > 12.3 + 1.5, `${mode}: thrown ahead of the car (Unity +x)`);
    assert.ok(Math.abs(box.min.y - 0.01) < 1e-6, `${mode}: resting on the road`);
    assert.ok(box.getSize(new THREE.Vector3()).y < 0.65 * 1.7, `${mode}: lying, not standing (${box.getSize(new THREE.Vector3()).y.toFixed(2)} m)`);
    if (mode === 'bicycle') {
      const bike = new THREE.Box3().setFromObject(replay.animal.bike, true);
      assert.ok(bike.getCenter(new THREE.Vector3()).distanceTo(centre) > 0.8, 'the bicycle lands apart from the rider');
      assert.ok(Math.abs(bike.min.y - 0.01) < 1e-6 && bike.getSize(new THREE.Vector3()).y < 0.7 * 0.79 * 1.7, 'the bicycle lies on its side (the handlebar width stands up)');
    }
    replay.restart();
    assert.ok(body.quaternion.angleTo(new THREE.Quaternion()) < 1e-6, 'restart stands up again');
    replay.stop();
  }
});

test("the driver's view sits in the accident car's right-hand seat, looks along its travel and follows it", () => {
  const frames = [];
  for (let t = 0; t <= 2.6; t += 0.05) {
    const contact = Math.min(t, 1);
    frames.push({ t, head: { x: 12.3, z: 2, yaw: 0 }, cars: [{ id: 7, x: 12.3 - 2.5 - 8 * (1 - contact), z: 2, yaw: 90, body: 'sedan' }] });
  }
  const replay = new Replay(new THREE.Scene(), new Map(), { heightAt: () => 0.01 });
  replay.start(frames, 1, 7, 170);
  assert.equal(replay.activeCamera, replay.camera, 'starts from above');
  replay.setView('driver');
  assert.equal(replay.activeCamera, replay.driverCamera);
  replay.frame(0.5);
  const eye = replay.driverCamera.position, look = replay.driverCamera.getWorldDirection(new THREE.Vector3());
  // car at Unity x = 5.8 heading +x: its right side is Unity -z (z = 2 - 0.37)
  assert.ok(Math.abs(-eye.x - (12.3 - 2.5 - 4 + 4.6 * 0.04)) < 1e-6 && Math.abs(eye.z - 1.63) < 1e-6, 'right-hand drive seat');
  assert.ok(Math.abs(eye.y - (0.01 + 1.45 * 0.78)) < 1e-6, 'at the driver\'s eye height');
  assert.ok(-look.x > 0.99 && look.y < 0, 'looking ahead along the road, slightly down');
  const before = eye.clone();
  replay.frame(0.9);
  assert.ok(-replay.driverCamera.position.x > -before.x + 3, 'moves with the car');
  const ahead = new THREE.Vector3(-12.3, 0.9, 2).project(replay.driverCamera);
  assert.ok(Math.abs(ahead.x) < 1 && Math.abs(ahead.y) < 1 && ahead.z < 1, 'the participant is in view before contact');
  replay.setView('overview');
  assert.equal(replay.activeCamera, replay.camera);
  replay.stop();
});
