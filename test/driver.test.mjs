import test from 'node:test';
import assert from 'node:assert/strict';
import { Traffic } from '../src/simulation/traffic/Traffic.ts';
import { normalize, serialize, validateStructure } from '../src/simulation/core/scenario.ts';
import { Obstacles } from '../src/simulation/collision/Obstacles.ts';

const settings = { reactionTimeSeconds: 0.5, desiredSpeedKmh: 36, maxBrakingMps2: 8,
  accelerationMps2: 2.4, timeHeadwaySeconds: 1.5 };
const vehicle = extra => ({ route: [{ x: 0, z: 100 }, { x: 190, z: 100 }],
  speedKmh: 36, entrySpeedKmh: 36, driver: { ...settings }, ...extra });
const scenario = (extra = {}, v = vehicle()) => normalize({ id: 'drivers',
  spawn: { x: 20, z: 90 }, goal: { x: 20, z: 110 }, vehicles: [v], ...extra });

function approach({ reaction = 0.5, braking = 8, environment, canSee } = {}) {
  const t = new Traffic(scenario({ environment }, vehicle({ driver: { ...settings,
    reactionTimeSeconds: reaction, maxBrakingMps2: braking } })), { canSee });
  const q = { x: 25, z: 100, vx: 0, vz: 0 }, states = new Set();
  let hit = false, car;
  for (let i = 0; i < 300; i++) {
    t.step(1 / 60, q); car = t.cars[0];
    states.add(car.driver.state);
    if (t.hit(q.x, q.z)) { hit = true; break; }
  }
  return { t, q, car, hit, states };
}

test('early detection brakes to a real stop, then resumes when the pedestrian leaves', () => {
  const { t, car, hit, states } = approach();
  assert.equal(hit, false);
  assert.equal(car.currentSpeed, 0);
  assert.ok(car.x < 25 - car.size[2] / 2 - 0.3);
  assert.ok(states.has('reacting') && states.has('braking') && states.has('waiting'));
  const before = car.distance;
  t.step(2, { x: 25, z: 110, vx: 0, vz: 0 });
  assert.ok(car.distance > before + 1 && car.currentSpeed > 1, 'cleared hazard cannot deadlock a driver');
});

test('reaction delay and bounded braking can produce a collision without moving the route', () => {
  const fast = approach(), slow = approach({ reaction: 2.5 });
  assert.equal(fast.hit, false);
  assert.equal(slow.hit, true);
  assert.ok(slow.car.currentSpeed > 5, 'no teleport to a safe stopping position');
  const t = new Traffic(scenario({}, vehicle({ driver: { ...settings, reactionTimeSeconds: 2.5 } })));
  const q = { x: 25, z: 100 };
  t.step(1, q);
  assert.equal(t.cars[0].currentSpeed, 10, 'driver keeps travelling during reaction');
  assert.ok(Math.abs(t.cars[0].distance - 10) < 1e-8);
});

test('visibility, occlusion and road grip change detection and stopping outcomes', () => {
  assert.equal(approach({ environment: { visibilityMeters: 7 } }).hit, true);
  assert.equal(approach({ canSee: () => false }).hit, true);
  assert.equal(approach({ environment: { roadGrip: 0.2 } }).hit, true);
  assert.equal(approach().hit, false);
});

test('stepping into a lane changes driver reaction while waiting at the kerb leaves traffic alone', () => {
  const waiting = new Traffic(scenario()), crossing = new Traffic(scenario());
  let reacted = false, braked = false, hit = false;
  for (let i = 0; i < 240; i++) {
    const q = { x: 20, z: 95 + i / 60 * 2.4, vx: 0, vz: 2.4 };
    waiting.step(1 / 60, { x: 20, z: 95, vx: 0, vz: 0 });
    crossing.step(1 / 60, q);
    reacted ||= crossing.cars[0].driver.state === 'reacting';
    braked ||= crossing.cars[0].driver.acceleration < 0;
    hit ||= !!crossing.hit(q.x, q.z);
  }
  assert.equal(reacted, true); assert.equal(braked, true); assert.equal(hit, false);
  assert.equal(waiting.cars[0].driver.state, 'cruising');
  assert.ok(Math.abs(waiting.cars[0].distance - 40) < 1e-7);
  assert.equal(waiting.cars[0].born, crossing.cars[0].born, 'the participant cannot retime departure');
});

test('every integration step respects its driver acceleration and braking limits', () => {
  const t = new Traffic(scenario({}, vehicle({ entrySpeedKmh: 0 }))), q = { x: 40, z: 100 };
  let previous = 0;
  for (let i = 0; i < 600; i++) {
    t.step(1 / 60, q);
    const car = t.cars[0], delta = (car.currentSpeed - previous) * 60;
    assert.ok(delta <= settings.accelerationMps2 + 1e-8 && delta >= -settings.maxBrakingMps2 - 1e-8);
    previous = car.currentSpeed;
  }
});

test('seeded repeated vehicles have independent persistent drivers and independent departures', () => {
  const s = scenario({}, vehicle({ driver: undefined, entrySpeedKmh: 0,
    repeatMinSeconds: 5, repeatMaxSeconds: 6, launch: 'meet' }));
  const a = new Traffic(s, { seed: 42 }), b = new Traffic(s, { seed: 42 });
  // Different player progress and goal lines must not schedule, adopt or retime an accident car.
  b.scenario = { ...s, spawn: { x: 100, z: -50 }, goal: { x: -50, z: 50 } };
  for (let i = 0; i < 600; i++) {
    a.step(1 / 30, { x: 0, z: -50, vx: 0, vz: 0 });
    b.step(1 / 30, { x: 90, z: -50, vx: 2.4, vz: 0 });
  }
  assert.deepEqual(a.cars, b.cars);
  assert.ok(a.cars.length >= 3);
  assert.notEqual(a.cars[0].driver.reactionTimeSeconds, a.cars[1].driver.reactionTimeSeconds);
  const last = a.cars.at(-1), first = last.driver, reaction = first.reactionTimeSeconds;
  a.step(1);
  assert.equal(a.cars.find(car => car.id === last.id).driver, first);
  assert.equal(first.reactionTimeSeconds, reaction);
});

test('driver and environment settings survive serialization and reject invalid parameters', () => {
  const s = scenario({ environment: { visibilityMeters: 35, roadGrip: 0.6 } });
  const saved = normalize(JSON.parse(serialize(s)));
  assert.deepEqual(saved.vehicles[0].driver, settings);
  assert.deepEqual(saved.environment, s.environment);
  assert.equal(saved.vehicles[0].entrySpeedKmh, 36);
  assert.deepEqual(validateStructure(saved), []);
  saved.vehicles[0].driver.maxBrakingMps2 = -1;
  saved.environment.roadGrip = 2;
  assert.equal(validateStructure(saved).length, 2);
});

test('contact freezes every driver and noStop keeps its recorded departure motion', () => {
  const t = new Traffic(scenario({}, vehicle({ noStop: true })));
  t.step(0.5); const car = t.cars[0], distance = car.distance;
  t.freeze(); t.step(1);
  assert.ok(Math.abs(car.distance - distance - 10) < 1e-8);
  const stopped = new Traffic(scenario()); stopped.step(0.5);
  const before = stopped.cars[0].distance;
  stopped.freeze(); stopped.step(1);
  assert.equal(stopped.cars[0].distance, before);
});

test('stopped traffic blocks movement without reporting a zero-speed collision and permits retreat', () => {
  const t = new Traffic(scenario({}, vehicle({ entrySpeedKmh: 0 })));
  t.step(1 / 60); const car = t.cars[0]; car.currentSpeed = 0;
  const obstacles = new Obstacles(); obstacles.setTraffic(t.cars);
  assert.equal(obstacles.allows(car.x + 3, car.z, car.x + 2.4, car.z, 0.25), false);
  assert.equal(obstacles.allows(car.x, car.z, car.x + 0.3, car.z, 0.25), true);
  assert.equal(t.hit(car.x, car.z), null);
  car.currentSpeed = 1;
  assert.equal(t.hit(car.x, car.z), car, 'a moving car can still strike a participant');
});

test('drivers yield to intersecting traffic, then continue after the gap opens', () => {
  const s = scenario({ vehicles: [vehicle(), vehicle({ route: [{ x: 20, z: 88 }, { x: 20, z: 145 }] })] });
  const t = new Traffic(s);
  let yielded = false, overlap = false;
  for (let i = 0; i < 480; i++) {
    t.step(1 / 60);
    const [a, b] = t.cars;
    if (!a || !b) break;
    yielded ||= a.driver.reason === 'junction';
    overlap ||= Math.abs(a.x - b.x) < (a.size[2] + b.size[0]) / 2
      && Math.abs(a.z - b.z) < (a.size[0] + b.size[2]) / 2;
  }
  assert.equal(yielded, true);
  assert.equal(overlap, false);
  assert.ok(t.cars[0].x > 30, 'yielding must not deadlock the intersection');
});

test('parked bodies and the collision grid can hide a hazard until it emerges', () => {
  const obstacles = new Obstacles();
  obstacles.setParked([{ x: 10, z: 100, yaw: 0, size: [3, 7] }]);
  assert.equal(obstacles.clearSight({ x: 0, z: 100 }, { x: 25, z: 100 }), false);
  assert.equal(obstacles.clearSight({ x: 0, z: 110 }, { x: 25, z: 110 }), true);
});
