import test from 'node:test';
import assert from 'node:assert/strict';
import { ParticipantRules, hazardProbability } from '../src/simulation/events/ParticipantRules.ts';
import { createDriver, chooseDriverBehavior } from '../src/simulation/traffic/driver.ts';
import { Traffic, makeRandom } from '../src/simulation/traffic/Traffic.ts';
import { normalize, serialize, validateStructure } from '../src/simulation/core/scenario.ts';
import { Recorder } from '../src/simulation/metrics/analysis.ts';

const lane = [[{ x: 0, z: 23.4 }, { x: 190, z: 23.4 }]];
const settings = { reactionTimeSeconds: 0.5, desiredSpeedKmh: 36, maxBrakingMps2: 8,
  accelerationMps2: 2.4, timeHeadwaySeconds: 1.5 };
const sampleScenario = (behavior = 'adaptive', extra = {}) => normalize({ id: 'risk',
  spawn: { x: 40, z: 14 }, goal: { x: 44.3, z: 32 },
  vehicles: [{ route: [{ x: 0, z: 100 }, { x: 190, z: 100 }], speedKmh: 36,
    entrySpeedKmh: 36, driver: { ...settings, behavior }, ...extra }] });
const look = (rules, yaw, seconds = 0.3) => rules.step(seconds, { x: 44.3, z: 20, yaw }, { walk: 'green' });

test('checking both directions and starting on green keeps the nonzero baseline probability', () => {
  const rules = new ParticipantRules(lane, 'walking');
  look(rules, 90); look(rules, 270);
  rules.step(1 / 30, { x: 44.3, z: 22.2, vz: 2.4, yaw: 0 }, { walk: 'green' });
  assert.equal(rules.redEntries, 0); assert.equal(rules.uncheckedEntries, 0);
  assert.equal(rules.probability, 0.03);
});

test('red entry sharply raises probability; a later signal change during crossing is not a new violation', () => {
  const rules = new ParticipantRules(lane, 'walking');
  look(rules, 90); look(rules, 270);
  rules.step(1 / 30, { x: 44.3, z: 22.2, vz: 2.4, yaw: 0 }, { walk: 'red' });
  assert.equal(rules.redEntries, 1); assert.equal(rules.probability, 0.6);
  rules.step(1 / 30, { x: 44.3, z: 23, vz: 2.4, yaw: 0 }, { walk: 'red' });
  assert.equal(rules.redEntries, 1);
  const green = new ParticipantRules(lane, 'walking');
  look(green, 90); look(green, 270);
  green.step(1 / 30, { x: 44.3, z: 22.2, vz: 2.4, yaw: 0 }, { walk: 'green' });
  green.step(1 / 30, { x: 44.3, z: 23, vz: 2.4, yaw: 0 }, { walk: 'red' });
  assert.equal(green.redEntries, 0, 'finishing a crossing is different from entering on red');
});

test('missing or stale direction checks raise risk; waiting alone never creates a violation', () => {
  const unchecked = new ParticipantRules(lane, 'walking');
  unchecked.step(1, { x: 44.3, z: 20, yaw: 0 }, { walk: 'green' });
  assert.equal(unchecked.score, 0);
  unchecked.step(1 / 30, { x: 44.3, z: 22.2, vz: 2.4, yaw: 0 }, { walk: 'green' });
  assert.equal(unchecked.uncheckedEntries, 1); assert.ok(unchecked.probability > 0.35);
  const stale = new ParticipantRules(lane, 'walking');
  look(stale, 90); look(stale, 270); look(stale, 0, 7);
  stale.step(1 / 30, { x: 44.3, z: 22.2, vz: 2.4, yaw: 0 }, { walk: 'green' });
  assert.equal(stale.uncheckedEntries, 1);
});

test('the built-in diagonal crossing is observed even when it enters beside the painted stripes', () => {
  const rules = new ParticipantRules(lane, 'walking');
  rules.step(1 / 30, { x: 41.7, z: 21.5, vx: 0.55, vz: 2.35, yaw: 13 }, { walk: 'red' });
  rules.step(1 / 30, { x: 41.9, z: 22.2, vx: 0.55, vz: 2.35, yaw: 13 }, { walk: 'red' });
  assert.equal(rules.redEntries, 1);
});

test('wrong-way cycling uses actual travel direction, independently of looking over a shoulder', () => {
  const wrong = new ParticipantRules(lane, 'bicycle'), right = new ParticipantRules(lane, 'bicycle');
  for (let i = 0; i < 120; i++) {
    wrong.step(1 / 60, { x: 60, z: 23.4, vx: -2.4, yaw: 90 }, { walk: 'red' });
    right.step(1 / 60, { x: 60, z: 23.4, vx: 2.4, yaw: 270 }, { walk: 'red' });
  }
  assert.ok(wrong.wrongWaySeconds > 1.9); assert.equal(wrong.probability, 0.6);
  assert.equal(right.wrongWaySeconds, 0); assert.equal(right.probability, 0.03);
});

test('risk decays with compliant observation and gives the same result across frame rates', () => {
  const run = dt => {
    const r = new ParticipantRules(lane, 'bicycle');
    for (let t = 0; t < 3 - 1e-8; t += dt) r.step(dt, { x: 60, z: 23.4, vx: -2.4 }, { walk: 'red' });
    for (let t = 0; t < 15 - 1e-8; t += dt) r.step(dt, { x: 60, z: 20 }, { walk: 'red' });
    return r;
  };
  const a = run(1 / 30), b = run(1 / 60);
  assert.ok(Math.abs(a.score - 0.5) < 1e-8 && Math.abs(a.score - b.score) < 1e-8);
  assert.ok(a.probability < 0.6 && a.probability > 0.03);
});

test('saved draws give a small compliant hazard chance and a much larger unsafe chance', () => {
  const random = makeRandom(123), hazards = makeRandom(456);
  let safe = 0, unsafe = 0;
  for (let i = 0; i < 4000; i++) {
    const d = createDriver({ speedKmh: 36 }, random, hazards);
    safe += chooseDriverBehavior(hazardProbability(0), d.behaviorRoll, d.behaviorKind) !== 'lawful';
    unsafe += chooseDriverBehavior(hazardProbability(1), d.behaviorRoll, d.behaviorKind) !== 'lawful';
  }
  assert.ok(safe > 75 && safe < 170, `baseline sample: ${safe}/4000`);
  assert.ok(unsafe > 2200 && unsafe < 2600 && unsafe > safe * 12, `unsafe sample: ${unsafe}/4000`);
  assert.equal(chooseDriverBehavior(0.03, 0.02, 0), 'red-light', 'compliance cannot eliminate hazards');
  assert.equal(chooseDriverBehavior(0.6, 0.95, 0), 'lawful', 'unsafe behavior does not force a hazard');
});

test('a resolved driver is never rerolled or redirected when participant risk later changes', () => {
  const t = new Traffic(sampleScenario());
  t.step(0.001);
  const car = t.cars[0], path = car.path;
  car.driver.behaviorRoll = 0.3; car.driver.behaviorKind = 0;
  t.step(1 / 30, { x: 10, z: 90 });
  assert.equal(car.driver.behavior, 'lawful');
  t.participantRules.step(1 / 30, { x: 44.3, z: 20 }, { walk: 'red' });
  t.participantRules.step(1 / 30, { x: 44.3, z: 22.2, vz: 2.4 }, { walk: 'red' });
  assert.equal(t.participantRules.probability, 0.6);
  t.step(1, { x: 10, z: 90 });
  assert.equal(car.driver.behavior, 'lawful'); assert.equal(car.path, path); assert.equal(car.born, 0);
});

test('an unresolved driver uses observed unsafe behavior for its single decision', () => {
  const t = new Traffic(sampleScenario()); t.step(0.001);
  const car = t.cars[0]; car.driver.behaviorRoll = 0.3; car.driver.behaviorKind = 0;
  t.participantRules.step(1 / 30, { x: 44.3, z: 20 }, { walk: 'red' });
  t.participantRules.step(1 / 30, { x: 44.3, z: 22.2, vz: 2.4 }, { walk: 'red' });
  t.step(1 / 30, { x: 10, z: 90 });
  assert.equal(car.driver.behavior, 'red-light');
  assert.ok(car.driver.decisionProbability > 0.59);
});

test('red-light drivers physically cross red while ordinary drivers stop before the bar', () => {
  const run = behavior => {
    const s = sampleScenario(behavior, { route: [{ x: 0, z: 27.8 }, { x: 110, z: 27.8 }] });
    const t = new Traffic(s); t.time = 60; t.step(5); return t.cars[0];
  };
  const ordinary = run('lawful'), red = run('red-light');
  assert.ok(ordinary.x + ordinary.size[2] / 2 < 16.4); assert.equal(ordinary.currentSpeed, 0);
  assert.ok(red.x > 30 && red.currentSpeed > 5); assert.equal(red.violation, 'red-light');
});

test('speeding accelerates above the route limit; failure to yield still uses finite braking', () => {
  const speeding = new Traffic(sampleScenario('speeding', { entrySpeedKmh: 0 })); speeding.step(8);
  assert.ok(speeding.cars[0].currentSpeed * 3.6 > 45 && speeding.cars[0].currentSpeed * 3.6 < 50);
  const late = new Traffic(sampleScenario('failure-to-yield'));
  let hit = null, previous = 10;
  for (let i = 0; i < 300 && !hit; i++) {
    late.step(1 / 60, { x: 25, z: 100 });
    const car = late.cars[0];
    assert.ok((car.currentSpeed - previous) * 60 >= -settings.maxBrakingMps2 - 1e-8);
    previous = car.currentSpeed; hit = late.hit(25, 100);
  }
  assert.ok(hit && hit.currentSpeed > 0); assert.equal(hit.violation, 'failure-to-yield');
});

test('hazard policy and explicit driver behavior survive save/reload and reject invalid values', () => {
  const s = sampleScenario('red-light'); s.hazardPolicy = { safeProbability: 0.05, unsafeProbability: 0.75 };
  const saved = normalize(JSON.parse(serialize(s)));
  assert.deepEqual(saved.hazardPolicy, s.hazardPolicy); assert.equal(saved.vehicles[0].driver.behavior, 'red-light');
  assert.deepEqual(validateStructure(saved), []);
  saved.hazardPolicy.safeProbability = 0.8; saved.vehicles[0].driver.behavior = 'chase';
  assert.equal(validateStructure(saved).length, 2);
  const optional = sampleScenario(); optional.hazardPolicy = null;
  assert.equal(new Traffic(optional).participantRules.probability, 0.03, 'null optional settings use defaults');
  optional.hazardPolicy = 'invalid';
  assert.equal(validateStructure(optional).length, 1);
});

test('recorded traffic retains its actual violation for replay inspection', () => {
  const traffic = new Traffic(sampleScenario('red-light', { route: [{ x: 0, z: 27.8 }, { x: 110, z: 27.8 }] }));
  traffic.time = 60; traffic.step(5);
  const recorder = new Recorder(); recorder.capture(5, { x: 20, z: 90, yaw: 0 }, traffic.cars);
  assert.equal(recorder.frames[0].cars[0].driverBehavior, 'red-light');
  assert.equal(recorder.frames[0].cars[0].violation, 'red-light');
  const quiet = new Traffic(sampleScenario('red-light')); quiet.step(1);
  assert.equal(quiet.cars[0].violation, null, 'a tendency alone is not an observed violation');
});
