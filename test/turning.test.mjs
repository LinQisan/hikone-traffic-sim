import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('../vendor/three/three.module.js', import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: new URL(`../vendor/three/addons/${specifier.slice(13)}`, import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const THREE = await import('three');
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const { smoothRoute, pathAt, carPose, Traffic, TURN_RADIUS, MAX_STEER } = await import('../src/traffic.js');
const { registerModel } = await import('../src/world.js');
const { instance, frontWheels } = await import('../src/vehicles.js');
const S = await import('../src/shared/scenario.js');

const dyaw = (a, b) => ((b - a + 540) % 360) - 180;
// a right-angle turn to the right: north 20 m, then east 20 m
const corner = [{ x: 0, z: 0 }, { x: 0, z: 20 }, { x: 20, z: 20 }];

test('route corners become arcs: the heading turns smoothly and the path stays close to the route', () => {
  const path = smoothRoute(corner);
  let previous = pathAt(path, 0).yaw, maxStep = 0;
  for (let d = 0.25; d < path.at(-1).s; d += 0.25) {
    const yaw = pathAt(path, d).yaw;
    maxStep = Math.max(maxStep, Math.abs(dyaw(previous, yaw)));
    previous = yaw;
  }
  assert.ok(maxStep < 4, `heading changes at most ${maxStep.toFixed(2)}° per 25 cm (a polyline jumps 90°)`);
  assert.ok(Math.abs(pathAt(path, 0).yaw) < 1e-9 && Math.abs(pathAt(path, path.at(-1).s - 0.01).yaw - 90) < 1e-6);
  // the arc's radius: tangent length min(R tan 45°, 0.45 × 20 m) = 9 m → radius 9 m
  const length = path.at(-1).s, straight = 40;
  assert.ok(Math.abs(length - (straight - 2 * 9 + Math.PI / 2 * 9)) < 0.05, `length ${length}`);
  assert.ok(TURN_RADIUS >= 9);
});

test('the front wheels turn in before the body does, steer towards the turn and straighten after it', () => {
  const path = smoothRoute(corner), L = 2.7;
  const at = d => carPose(path, d, L);
  // the arc starts at s = 11; front axle (d + 1.35) reaches it first
  const before = at(10.5);
  assert.ok(before.steer > 5 && Math.abs(before.yaw) < 3, `wheels turned ${before.steer.toFixed(1)}°, body ${before.yaw.toFixed(1)}°`);
  let maxSteer = 0;
  for (let d = 0; d < path.at(-1).s; d += 0.2) maxSteer = Math.max(maxSteer, at(d).steer);
  assert.ok(maxSteer > 12 && maxSteer <= MAX_STEER, `right turn: positive steer up to ${maxSteer.toFixed(1)}°`);
  const after = at(path.at(-1).s - 2);
  assert.ok(Math.abs(after.steer) < 0.5 && Math.abs(after.yaw - 90) < 0.5, 'straight again');
  // on a straight, the pose is exactly the route
  const s = at(3);
  assert.ok(Math.abs(s.x) < 1e-9 && Math.abs(s.z - 3) < 1e-9 && Math.abs(s.steer) < 1e-9);
});

test('a car of the traffic drives the rounded route, its yaw never jumping', () => {
  const scenario = S.normalize({ ...S.newScenario('turn'), vehicles: [S.newVehicle({ route: corner, speedKmh: 30 })] });
  const traffic = new Traffic(scenario, { seed: 3 });
  let last = null, maxJump = 0, steered = false;
  for (let t = 0; t < 8; t += 1 / 30) {
    traffic.step(1 / 30);
    const car = traffic.cars[0];
    if (!car) break;
    if (last != null) maxJump = Math.max(maxJump, Math.abs(dyaw(last, car.yaw)));
    if (car.steer > 10) steered = true;
    last = car.yaw;
  }
  assert.ok(steered, 'the wheels turned');
  assert.ok(maxJump < 6, `yaw changes at most ${maxJump.toFixed(2)}° per frame at 30 km/h`);
});

test('a short lateral correction on a straight does not become a sharp steering manoeuvre', () => {
  // Regression from the former westbound tail of events 06 and 09: a 27 cm step between straights.
  const route = [{ x: 19.42, z: 24.19 }, { x: -6.08, z: 24.19 },
    { x: -6.08, z: 23.92 }, { x: -109, z: 23.92 }];
  const original = structuredClone(route);
  const path = smoothRoute(route);
  let maxSteer = 0, maxJump = 0, previous = carPose(path, 0, 2.7).yaw;
  for (let d = 0; d < path.at(-1).s; d += 0.1) {
    const pose = carPose(path, d, 2.7);
    maxSteer = Math.max(maxSteer, Math.abs(pose.steer));
    maxJump = Math.max(maxJump, Math.abs(dyaw(previous, pose.yaw)));
    assert.ok(pose.z >= 23.92 - 1e-6 && pose.z <= 24.19 + 1e-6, 'stays within the original lane corridor');
    previous = pose.yaw;
  }
  assert.ok(maxSteer < 3, `a minor lane correction needs little steering, got ${maxSteer.toFixed(1)}°`);
  assert.ok(maxJump < 0.5, `heading changes gently, got ${maxJump.toFixed(2)}° per 10 cm`);
  assert.deepEqual(route, original, 'the Unity control points are not edited');
  assert.deepEqual([path[0].x, path[0].z], [route[0].x, route[0].z]);
  assert.deepEqual([path.at(-1).x, path.at(-1).z], [route.at(-1).x, route.at(-1).z]);
});

test('the front wheels of each car model are cut out on pivots at the wheel centres and steer', async () => {
  const loader = new GLTFLoader();
  for (const name of ['WEB_Sedan', 'HK_Kei_Tall', 'HK_Kei_Hatch']) {
    const bytes = fs.readFileSync(new URL(`../data/models/impressionist/${name}.glb`, import.meta.url));
    const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    gltf.scene.updateMatrixWorld(true);
    const parts = [];
    gltf.scene.traverse(o => { if (o.isMesh) parts.push({ geometry: o.geometry, material: o.material, matrix: o.matrixWorld.clone() }); });
    registerModel(name, parts);
    const split = frontWheels(name);
    assert.equal(split.wheels.length, 2, name);
    for (const w of split.wheels) {
      assert.ok(w.center.z > 0.8 && Math.abs(w.radius - w.center.y) < 0.03, `${name}: a front wheel standing on the ground`);
      const box = new THREE.Box3().setFromBufferAttribute(w.geometry.getAttribute('position'));
      assert.ok(box.max.y - box.min.y > 2 * w.radius - 0.02 && box.getCenter(new THREE.Vector3()).length() < 0.06, `${name}: centred tyre`);
    }
    assert.ok(Math.sign(split.wheels[0].center.x) !== Math.sign(split.wheels[1].center.x), 'left and right');
    const count = list => list.reduce((n, p) => n + (p.geometry.index ? p.geometry.index.count : p.geometry.getAttribute('position').count) / 3, 0);
    const moved = split.wheels.reduce((n, w) => n + w.geometry.getAttribute('position').count / 3, 0);
    assert.equal(count(split.body) + moved, count(parts), `${name}: no triangle lost or doubled`);
    const car = instance(name, new Map(), { steerable: true });
    car.userData.steer(20);
    const pivots = car.children.filter(c => c.isGroup);
    assert.equal(pivots.length, 2);
    assert.ok(pivots.every(p => Math.abs(p.rotation.y + 20 * Math.PI / 180) < 1e-9), 'steer right = clockwise from above');
  }
});
