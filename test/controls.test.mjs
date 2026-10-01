import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('../vendor/three/three.module.js', import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: new URL(`../vendor/three/addons/${specifier.slice(13)}`, import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const THREE = await import('three');
const { Player, FALL_SECONDS } = await import('../src/player.js');
const { stickVector } = await import('../src/touch-controls.js');

function makePlayer() {
  const original = globalThis.addEventListener;
  globalThis.addEventListener = () => {};
  try {
    return new Player(new THREE.PerspectiveCamera(), { domElement: { addEventListener() {} } }, { walls: [] }, { heightAt: () => 0.01 });
  } finally { globalThis.addEventListener = original; }
}

test('the touch stick gives a clamped [strafe, forward] vector; up on screen walks forward', () => {
  assert.deepEqual(stickVector(0, 0, 50), [0, 0]);
  const [x, y] = stickVector(0, -50, 50);
  assert.ok(Math.abs(x) < 1e-9 && Math.abs(y - 1) < 1e-9);
  const [dx, dy] = stickVector(200, 200, 50);
  assert.ok(Math.abs(Math.hypot(dx, dy) - 1) < 1e-9 && dx > 0 && dy < 0, 'clamped to the rim');
});

test('the on-screen stick moves the participant like the keys, and drag-look turns the head', () => {
  const player = makePlayer();
  player.place(0, 0, 0, 170);
  player.enabled = true;
  player.stick = [0, 1];
  player.update(0.5);
  assert.ok(player.z > 1 && Math.abs(player.x) < 1e-9, 'forward along the facing direction');
  player.look(30, 10);
  assert.equal(player.yaw, 30); assert.equal(player.pitch, -10);
  player.enabled = false; player.look(30, 0);
  assert.equal(player.yaw, 30, 'no looking while the participant is not in control');
  player.bicycle.dispose();
});

test('after contact the view falls to the ground, rolls away from the car and stays down; place() stands up again', () => {
  const player = makePlayer();
  player.place(5, 5, 0, 170);
  const eye = player.camera.position.y;
  player.knockDown(90);                                    // the car heads to the participant's right
  for (let t = 0; t < FALL_SECONDS * 0.5; t += 1 / 60) player.update(1 / 60);
  const half = player.camera.position.y;
  assert.ok(half < eye && half > 0.5, `falling, not teleported: ${half}`);
  for (let t = 0; t < 1.2; t += 1 / 60) player.update(1 / 60);
  assert.ok(player.camera.position.y < 0.35, 'lying on the ground');
  assert.ok(player.camera.rotation.z < -1, 'rolled onto the right side');
  assert.ok(-player.rig.position.x > 5.5, 'thrown along the car heading (Unity +x)');
  assert.equal(player.head().x, 5, 'the recording keeps the contact position');
  player.place(5, 5, 0, 170);
  assert.ok(Math.abs(player.camera.position.y - eye) < 1e-9 && player.camera.rotation.z === 0);
  player.bicycle.dispose();
});

test('riding: looking back never turns the bicycle; forward follows the bicycle, not the view', () => {
  const player = makePlayer();
  player.place(0, 0, 0, 170, 'bicycle');
  player.enabled = true;
  player.look(170, 0);
  assert.equal(player.yaw, 150, 'turning round is limited by the body twist');
  assert.equal(player.rideYaw, 0);
  player.keys.add('KeyW');
  for (let i = 0; i < 120; i++) player.update(1 / 60);
  assert.ok(player.z > 1.5 && Math.abs(player.x) < 1e-6, 'rides on along the bicycle heading');
  assert.equal(player.rideYaw, 0);
  assert.equal(player.head().yaw, 150, 'the recording keeps the looking direction');
  player.bicycle.dispose();
});

test('riding: back brakes, then pushes the bicycle back slowly without turning it', () => {
  const player = makePlayer();
  player.place(0, 0, 90, 170, 'bicycle');
  player.enabled = true;
  player.keys.add('KeyW');
  for (let i = 0; i < 120; i++) player.update(1 / 60);
  const moving = player.speed;
  player.keys.clear(); player.keys.add('KeyS');
  player.update(1 / 60);
  assert.ok(player.speed < moving, 'brakes');
  for (let i = 0; i < 60; i++) player.update(1 / 60);
  const stoppedAt = player.x;
  for (let i = 0; i < 120; i++) player.update(1 / 60);
  assert.ok(player.x < stoppedAt && stoppedAt - player.x < 1.3, 'pushed back slowly');
  assert.equal(player.rideYaw, 90, 'still facing the same way');
  player.bicycle.dispose();
});

test('riding: steering rides a U-turn along an arc, and the view turns with the bicycle', () => {
  const player = makePlayer();
  player.place(0, 0, 0, 170, 'bicycle');
  player.enabled = true;
  player.look(-30, 0);
  player.keys.add('KeyW');
  for (let i = 0; i < 60; i++) player.update(1 / 60);         // up to speed
  player.keys.add('KeyD');
  let widest = 0, t = 0;
  while (Math.abs(((player.rideYaw - 180 + 540) % 360) - 180) > 3 && t < 10) {
    player.update(1 / 60); t += 1 / 60;
    widest = Math.max(widest, player.x);
  }
  assert.ok(t < 10, 'turned round');
  assert.ok(widest > 2, `an arc, not a spin on the spot (${widest.toFixed(2)} m wide)`);
  assert.ok(Math.abs(((player.yaw - player.rideYaw + 540) % 360) - 180 + 30) < 1e-6, 'the view keeps its angle to the bicycle');
  player.bicycle.dispose();
});
