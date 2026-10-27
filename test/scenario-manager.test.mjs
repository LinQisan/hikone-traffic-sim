// Open-world encounter lifecycle: eligibility, hidden admission, conflict groups, contact, slots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalize } from '../src/simulation/core/scenario.ts';
import { resolveWorld, worldScenario } from '../src/world/scenes/world.ts';
import { Traffic, makeRandom } from '../src/simulation/traffic/Traffic.ts';
import { ScenarioManager, bodyGap } from '../src/simulation/events/ScenarioManager.ts';

const read = path => JSON.parse(fs.readFileSync(new URL('../' + path, import.meta.url)));
const events = fs.readdirSync(new URL('../events/', import.meta.url)).filter(f => /^builtin-\d+\.json$/.test(f)).sort()
  .map(f => normalize(read('events/' + f)));
const world = resolveWorld(read('world/hikone.json'), events);

function session(mode, { random = makeRandom(3), lineOfSight = () => true } = {}) {
  const traffic = new Traffic(worldScenario(world, mode), { seed: 7, builtInMix: true, maxCars: world.maxCars });
  const log = [];
  const manager = new ScenarioManager(world, traffic, { random, lineOfSight, log: (type, data) => log.push({ type, ...data }) });
  return { traffic, manager, log };
}
const step = ({ traffic, manager }, q, mode, seconds) => {
  for (let t = 0; t < seconds; t += 1 / 30) {
    traffic.step(1 / 30, q);
    manager.update(1 / 30, { participant: q, mode, rules: traffic.participantRules });
  }
};

test('an encounter starts only on entry, in its mode and direction of approach', () => {
  const always = () => 0;                      // every roll succeeds and picks the first template
  const north = { x: 44.5, z: 18, vx: 0, vz: 1.2, yaw: 0 };
  const bike = session('bicycle', { random: always });
  step(bike, { ...north }, 'bicycle', 1);
  assert.equal(bike.log.filter(e => e.type === 'encounter-start').length, 0, 'walking events never start for a cyclist');
  const backwards = session('walking', { random: always });
  step(backwards, { ...north, vz: -1.2, yaw: 180 }, 'walking', 1);
  assert.ok(!backwards.log.some(e => e.type === 'encounter-start' && ['builtin-01', 'builtin-02'].includes(e.event)));
  const s = session('walking', { random: always });
  step(s, { ...north }, 'walking', 1);
  const started = s.log.filter(e => e.type === 'encounter-start');
  assert.equal(started.length, 1, 'one encounter per conflict group');
  step(s, { ...north }, 'walking', 5);
  assert.equal(s.log.filter(e => e.type === 'encounter-start').length, 1, 'standing inside does not roll again');
});

test('cars are admitted upstream at points hidden from the participant, never beside them', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const s = session('walking', { random: makeRandom(seed) });
    const q = { x: 62.6, z: 21, vx: 0, vz: 1, yaw: 0 };
    step(s, q, 'walking', 2);
    for (const e of s.log.filter(e => e.type === 'car-admitted')) {
      const d = Math.hypot(e.x - q.x, e.z - q.z);
      const facing = Math.abs(((Math.atan2(e.x - q.x, e.z - q.z) * 180 / Math.PI) + 540) % 360 - 180);
      assert.ok(d > world.hidden.farMeters || d >= world.hidden.nearMeters && facing > world.hidden.viewHalfAngle,
        `seed ${seed}: admitted ${d.toFixed(1)} m away at ${facing.toFixed(0)}°`);
    }
  }
});

test('a skipped roll admits nothing; risky behaviour raises the chance to certainty', () => {
  const unlucky = session('walking', { random: () => 0.99 });
  step(unlucky, { x: 44.5, z: 18, vx: 0, vz: 1.2, yaw: 0 }, 'walking', 2);
  assert.ok(unlucky.log.some(e => e.type === 'encounter-skipped'));
  assert.ok(!unlucky.log.some(e => e.type === 'car-admitted'));
  const risky = session('walking', { random: () => 0.99 });
  risky.traffic.participantRules.score = 1;
  risky.manager.consider({ participant: { x: 44.5, z: 18, vx: 0, vz: 1.2, yaw: 0 }, mode: 'walking', rules: { score: 1 } });
  assert.equal(risky.manager.active.length, 1);
});

test('contact is an input: it ends the owning encounter once and releases its cars', () => {
  const s = session('walking', { random: () => 0 });
  const q = { x: 62.6, z: 21, vx: 0, vz: 1, yaw: 0 };
  step(s, q, 'walking', 1);
  const inst = s.manager.active[0];
  assert.ok(inst?.cars.length, 'a car was admitted');
  const car = inst.cars[0];
  assert.equal(s.manager.onContact(car), inst);
  assert.equal(s.manager.onContact(car), null, 'a second report finds no owner');
  assert.equal(car.owner, null);
  assert.deepEqual(s.manager.outcomes.map(o => o.outcome), ['contact']);
  assert.ok(car.alive, 'the car stays in traffic');
});

test('the parking-exit car leaves its slot and returns only out of sight', () => {
  const s = session('bicycle', { random: () => 0 });
  const q = { x: -86, z: 23, vx: -2.4, vz: 0, yaw: 270 };
  step(s, q, 'bicycle', 1);
  const slot = s.manager.slots.get('parking-exit');
  assert.equal(slot.occupied, false);
  const car = s.manager.active[0].cars[0];
  assert.ok(Math.hypot(car.x - slot.x, car.z - slot.z) < 0.5, 'the car starts where the parked car stood');
  step(s, q, 'bicycle', 40);
  assert.equal(slot.occupied, false, 'not restored while the slot is in view');
  step(s, { x: -10, z: 22, vx: 0, vz: 0, yaw: 90 }, 'bicycle', 1);
  assert.equal(slot.occupied, true, 'restored once out of sight');
});

test('body gap measures from the car outline', () => {
  const car = { x: 0, z: 0, yaw: 0, size: [2, 1.5, 4] };
  assert.ok(Math.abs(bodyGap(car, 3, 0, 0) - 2) < 1e-9);
  assert.ok(Math.abs(bodyGap(car, 0, 4, 0.3) - 1.7) < 1e-9);
  assert.ok(bodyGap(car, 0, 0) < 0);
});

function redCrossing(mode = 'walking') {
  const s = session(mode, { random: () => 0.99 });
  const q = { x: 44.3, z: 21.5, vx: 0, vz: 0, yaw: 0 };
  // A previous approach lottery was skipped; entering on red must still get its own response.
  if (mode === 'walking') s.manager.consider({ participant: { ...q, z: 18, vz: 2.4 }, mode, rules: { score: 0 } });
  let contact = null;
  const advance = (seconds, vz = 0) => {
    for (let t = 0; t < seconds; t += 1 / 60) {
      q.vz = vz; q.z += vz / 60;
      s.traffic.step(1 / 60, q);
      s.manager.update(1 / 60, { participant: q, mode, rules: s.traffic.participantRules });
      contact ??= s.traffic.hit(q.x, q.z);
    }
    return contact;
  };
  advance(1 / 60);
  return { ...s, q, advance };
}

test('a red crossing immediately admits a bounded blind response despite a skipped approach lottery', () => {
  const s = redCrossing();
  assert.ok(s.log.some(e => e.type === 'encounter-skipped'));
  s.advance(0.24, 2.4);
  assert.equal(s.traffic.participantRules.redEntries, 1);
  const admitted = s.log.filter(e => e.type === 'red-entry-car');
  assert.ok(admitted.length > 0 && admitted.length <= world.redEntryResponse.maxVehicles);
  assert.equal(s.traffic.hit(s.q.x, s.q.z), null, 'admission itself is not contact');
  for (const e of admitted) {
    const car = s.traffic.cars.find(c => c.id === e.car);
    assert.ok(car && car.currentSpeed > 0);
    assert.ok(Math.hypot(e.x - s.q.x, e.z - s.q.z) >= world.hidden.nearMeters - 0.1);
    assert.ok(s.manager.hidden(e, s.q), 'the admission point is outside the view or occluded');
    assert.ok(world.flows.some(f => f.route === car.spec.route), 'the response keeps an existing road route');
    assert.equal(car.driver.reactionTimeSeconds, world.redEntryResponse.reactionTimeSeconds);
  }
  s.advance(2);
  assert.equal(s.log.filter(e => e.type === 'red-entry-response').length, 1, 'standing inside never rerolls the response');
  assert.equal(s.log.filter(e => e.type === 'red-entry-car').length, admitted.length);
});

test('red responses cannot spawn in a visible or occupied lane; retries drop crossed lanes and end with the crossing', () => {
  for (const blocked of [false, true]) {
    const s = redCrossing();
    if (blocked) s.traffic.clearAt = () => false;
    else s.manager.world = { ...world, hidden: { ...world.hidden, farMeters: 1e6, viewHalfAngle: 180 } };
    s.advance(0.5, 2.4);
    const lanes = s.manager.redResponse?.pending.length;
    assert.equal(lanes, 2, 'both lanes ahead keep retrying while the participant is on the crossing');
    s.advance(2, 2.4);
    assert.ok(s.manager.redResponse?.pending.length < lanes, 'a lane already crossed is dropped');
    s.advance(2, 2.4);
    assert.equal(s.traffic.participantRules.crossing, -1);
    assert.equal(s.manager.redResponse, null, 'leaving the crossing ends the response');
    assert.ok(s.log.some(e => e.type === 'red-entry-response'));
    assert.equal(s.log.filter(e => e.type === 'red-entry-car').length, 0);
  }
});

test('drivers expect a waiting pedestrian at a red crosswalk and react late to one walking out against it', () => {
  const lane = { x: 44.3, z: 26.3 }, run = (walk, entered) => {
    const traffic = new Traffic({ id: 't', map: 'm', playerMode: 'walking', vehicles: [] }, { seed: 1 });
    traffic.signalCycle.at(walk === 'green' ? 70 : 10);
    const car = traffic.admit({ ...world.flows.find(f => f.id === 'west'), driver: { behavior: 'lawful', reactionTimeSeconds: 1 } },
      { distance: 0, entryKmh: 36 });
    // The car 17 m upstream of the east crosswalk meets a 2.4 m/s walk off the kerb in its lane.
    const path = car.path, at = path.find(p => Math.hypot(p.x - lane.x, p.z - lane.z) < 2).s;
    car.distance = at - 17; traffic.move(car, 0);
    const q = entered ? { x: 44.3, z: 22.3, vx: 0, vz: 2.4, yaw: 0 } : { x: 44.3, z: 20.6, vx: 0, vz: 2.4, yaw: 0 };
    if (entered) { traffic.participantRules.wasOnRoad = false; traffic.participantRules.step(1 / 60, { ...q, z: 21.9 }, traffic.signalCycle.state); }
    traffic.participantRules.step(1 / 60, q, traffic.signalCycle.state);
    traffic.participant = q;
    for (let t = 0; t < 1.2; t += 1 / 60) traffic.decide(car, 1 / 60);     // longer than the 1 s base reaction
    return { rules: traffic.participantRules, driver: car.driver };
  };
  const waiting = run('red', false);
  assert.ok(waiting.rules.kerbExpected && !Number.isFinite(waiting.driver.hazardDistance), 'no extrapolation off the kerb on red');
  const green = run('green', false);
  assert.ok(!green.rules.kerbExpected && Number.isFinite(green.driver.hazardDistance), 'on the walk signal drivers anticipate the walk');
  const out = run('red', true);
  assert.ok(out.rules.againstSignal && Number.isFinite(out.driver.hazardDistance), 'a participant on the road is seen');
  assert.equal(out.driver.state, 'reacting', 'after 1.2 s the surprise delay still holds back the brakes');
});

test('walking into the junction interior on red is a red entry; the diagonal walk on green is not', () => {
  for (const [time, expected] of [[10, 1], [70, 0]]) {
    const s = session('walking');
    s.traffic.signalCycle.at(time);
    const rules = s.traffic.participantRules, q = { x: 22, z: 20, vx: 2, vz: 1.2, yaw: 60 };
    for (let i = 0; i < 60; i++) { q.x += q.vx / 60; q.z += q.vz / 60; rules.step(1 / 60, q, s.traffic.signalCycle.state); }
    assert.equal(rules.redEntries, expected);
    assert.equal(rules.againstSignal, expected === 1);
  }
});

test('only new red entries respond; waiting, a risk score and a later phase change do not', () => {
  const s = session('walking', { random: () => 0.99 });
  const q = { x: 44.3, z: 22.2, vx: 0, vz: 0, yaw: 0 };
  const rules = { score: 1, redEntries: 0, crossing: 1 };
  s.traffic.signalCycle.at(62);
  s.manager.update(1, { participant: q, mode: 'walking', rules });
  s.traffic.signalCycle.at(0);
  s.manager.update(1, { participant: { ...q, vz: 2.4 }, mode: 'walking', rules });
  assert.ok(!s.log.some(e => e.type === 'red-entry-response' || e.type === 'red-entry-car'));
});

test('blind response cars can physically hit a continuing red crossing while retreat still avoids them', () => {
  for (const mode of ['walking', 'bicycle']) {
    const onward = redCrossing(mode);
    const hit = onward.advance(4, 2.4);
    assert.ok(hit?.spec.redEntry, `${mode}: contact comes from the admitted car body`);
    assert.ok(hit.currentSpeed > 0 && hit.driver.maxBrakingMps2 > 0);
    const retreat = redCrossing(mode);
    retreat.advance(0.24, 2.4);
    assert.ok(retreat.log.some(e => e.type === 'red-entry-car'));
    assert.equal(retreat.advance(0.24, -2.4), null);
    assert.equal(retreat.advance(4), null, `${mode}: leaving the road avoids the fixed routes`);
  }
});
