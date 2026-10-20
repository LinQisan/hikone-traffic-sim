import test from 'node:test';
import assert from 'node:assert/strict';
import { SignalCycle, SIGNAL_PERIOD } from '../src/signal-cycle.js';
import { Traffic } from '../src/traffic.js';
import { normalize } from '../src/shared/scenario.js';

test('the junction cycle separates both vehicle axes and the single shared pedestrian phase', () => {
  const cycle = new SignalCycle(), state = cycle.state, seen = new Set();
  for (let t = 0; t < SIGNAL_PERIOD * 2; t += 0.125) {
    const s = cycle.at(t);
    assert.equal(s, state, 'sampling reuses its state rather than allocating each frame');
    assert.ok(s.eastWest === 'red' || s.northSouth === 'red', 'conflicting vehicle axes never open together');
    if (s.walk !== 'red') assert.ok(s.eastWest === 'red' && s.northSouth === 'red', 'every vehicle is red during walk and clearance flashing');
    seen.add(s.id);
    const snapshot = { ...s };
    assert.deepEqual(cycle.at(t + SIGNAL_PERIOD), snapshot, 'replay and repeated cycles use the same time mapping');
  }
  assert.equal(seen.size, 9, 'both yellows, three clearance intervals and pedestrian flashing are included');
  for (const time of [28, 31, 34, 54, 57, 60, 78, 84, 87]) {
    const before = { ...cycle.at(time - 0.001) }, after = cycle.at(time);
    assert.notEqual(before.id, after.id, 'the new phase owns the exact boundary');
    if (after.eastWest === 'green' || after.northSouth === 'green' || after.walk === 'green')
      assert.ok(before.eastWest === 'red' && before.northSouth === 'red' && before.walk === 'red', 'a green starts only after all-red clearance');
  }
  assert.equal(cycle.at(78.1).walkOn, true);
  assert.equal(cycle.at(78.6).walkOn, false);
  assert.equal(cycle.at(79.1).walkOn, true, 'pedestrian flashing is one hertz');
  assert.equal(cycle.at(NaN).id, 'east-west', 'an invalid inspection time falls back to the initial phase');
});

const approaches = [
  { route: [{ x: 0, z: 27.8 }, { x: 110, z: 27.8 }], coordinate: 'x', line: 16.4, direction: 1 },
  { route: [{ x: 70, z: 23.4 }, { x: -60, z: 23.4 }], coordinate: 'x', line: 47.6, direction: -1 },
  { route: [{ x: 29.95, z: -10 }, { x: 29.95, z: 80 }], coordinate: 'z', line: 14.1, direction: 1 },
  { route: [{ x: 34.1, z: 65 }, { x: 34.1, z: -40 }], coordinate: 'z', line: 37.75, direction: -1 },
];
function traffic(approach, extra = {}) {
  return new Traffic(normalize({ format: 'vrlearn-scenario', version: 1, id: 'signal-test',
    spawn: { x: -20, z: 15 }, goal: { x: -20, z: 20 }, vehicles: [{ route: approach.route,
      speedKmh: 36, delaySeconds: 0, start: 'begin', ...extra }] }));
}

test('all four approaches stop before their painted bars and resume on their own green', () => {
  for (const approach of approaches) for (const body of ['sedan', 'kei-tall', 'kei-hatch']) {
    const t = traffic(approach, { body }); t.time = 60;
    t.step(14);
    const car = t.cars[0], front = car[approach.coordinate] + approach.direction * car.size[2] / 2;
    assert.equal(car.currentSpeed, 0, `${body}: waits through the common walk phase`);
    assert.ok((approach.line - front) * approach.direction >= 0.4, 'the whole vehicle stays behind the bar');
    assert.equal(car.nextSignal, 0, 'waiting at the bar does not accidentally release the gate');
    t.step(approach.coordinate === 'x' ? 16 : 50);
    assert.ok(car[approach.coordinate] * approach.direction > approach.line * approach.direction,
      'the car passes only after its vehicle axis receives green');
  }
});

test('yellow stops a distant car but lets a car too close to brake clear the junction', () => {
  const far = traffic(approaches[0]); far.time = 28; far.step(3);
  assert.ok(far.cars[0].x + far.cars[0].size[2] / 2 < 16.4);
  assert.equal(far.cars[0].currentSpeed, 0);
  const near = traffic(approaches[0]); near.step(0.1);
  const car = near.cars[0]; car.distance = 12; car.currentSpeed = 10;
  near.time = 28; near.step(0.05);
  assert.equal(car.signalCommitted, true);
  near.step(0.95);
  assert.ok(car.x > 16.4 && car.currentSpeed > 9, 'no sudden stop inside the junction');
});

test('a red-light queue does not overlap and an authored accident car retains its hazardous motion', () => {
  const t = traffic(approaches[0], { repeatMinSeconds: 2, repeatMaxSeconds: 2 }); t.time = 60;
  t.step(15);
  const cars = [...t.cars].sort((a, b) => b.x - a.x);
  assert.ok(cars.length >= 2);
  for (let i = 1; i < cars.length; i++)
    assert.ok(cars[i - 1].x - cars[i].x > (cars[i - 1].size[2] + cars[i].size[2]) / 2 + 1.8);
  const hazard = traffic(approaches[0], { accident: true }); hazard.time = 60; hazard.step(5);
  assert.ok(hazard.cars[0].x > 16.4, 'the explicit accident flag preserves the preauthored violation');
  const inside = traffic({ route: [{ x: 30, z: 27.8 }, { x: 80, z: 27.8 }] });
  inside.time = 60; inside.step(3);
  assert.ok(inside.cars[0].x > 40, 'a car already inside clears instead of stopping at an unrelated outgoing bar');
});

test('a yellow clearance decision expires if a queue stops the car before it enters', () => {
  const t = traffic(approaches[0]); t.step(0.1);
  const car = t.cars[0]; car.distance = 12; car.currentSpeed = 10;
  t.time = 28; t.step(0.05);
  assert.ok(car.signalCommitted);
  car.currentSpeed = 0; // Another stopped road user prevents completing the yellow clearance.
  t.time = 31; t.step(1.5);
  assert.ok(car.x + car.size[2] / 2 < 16.4,
    'after the queue clears, the car can reach the bar but cannot reuse yellow clearance to enter on red');
  assert.equal(car.currentSpeed, 0);
});
