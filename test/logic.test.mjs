// node --test test/   (no packages) — the pure parts of the port against the exported data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as S from '../src/shared/scenario.js';
import { Traffic, BODY_SIZE } from '../src/traffic.js';
import { Ground } from '../src/ground.js';
import { Recorder, accidentAnalysis, crossingAnalysis, accidentVerdict, deltaYaw, yawTo, sample } from '../src/analysis.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const data = f => JSON.parse(fs.readFileSync(path.join(root, 'data', f), 'utf8'));
const scenario = id => S.normalize(data(`scenarios/${id}.json`));

test('track lookup preserves angular interpolation, duplicate-time boundaries and endpoint tolerance', () => {
  const track = [{ t: 0, x: 0, z: 0, yaw: 350, steer: 0 },
    { t: 1, x: 2, z: 4, yaw: 10, steer: 20 },
    { t: 1, x: 3, z: 5, yaw: 20, steer: 30 },
    { t: 2, x: 5, z: 7, yaw: 40, steer: 10 }];
  assert.deepEqual(sample(track, 0.5), { t: 0.5, x: 1, z: 2, yaw: 360, steer: 10 });
  assert.equal(sample(track, 1).x, 2, 'the first key at a duplicated timestamp wins');
  assert.equal(sample(track, 1.5).x, 4);
  assert.equal(sample(track, 2 + 0.5e-6), track.at(-1));
  assert.equal(sample(track, -2e-6), null);
  assert.equal(sample(track, 2 + 2e-6), null);
  assert.equal(sample([], 0), null);
  assert.equal(sample([track[0]], 0), track[0]);
});

test('the exported data is complete', () => {
  const scene = data('scene.json');
  assert.equal(scene.format, 'vrlearn-web-scene');
  assert.equal(scene.scenarios.length, 10);
  const layout = data('layout.json');
  const missing = [...new Set(layout.items.map(i => i.a))].filter(a => !fs.existsSync(path.join(root, 'data', 'models', a + '.glb')));
  assert.deepEqual(missing, [], 'every layout asset has a .glb');
  for (const m of ['WEB_Sedan', 'HK_Kei_Tall', 'HK_Kei_Hatch', 'HK_Truck_Large', 'HK_Truck_Medium'])
    assert.ok(fs.existsSync(path.join(root, 'data', 'models', m + '.glb')), m);
  const signals = data('signals.json');
  assert.ok(signals.parts.length > 0 && signals.parts.every(p => signals.meshes[p.mesh] && p.matrix.length === 16), 'signal meshes');
  assert.equal(data('scenarios/index.json').filter(e => e.template).length, 10);
});

test('ground heights match the browser road plan', () => {
  const g = new Ground(data('road_tiles.json'));
  assert.ok(Math.abs(g.heightAt(32, 10) - 0.01) < 1e-3, 'carriageway 0.01');
  assert.ok(Math.abs(g.heightAt(40, 14) - 0.01) < 1e-3, 'footway is flush with the carriageway');
  assert.ok(Math.abs(g.heightAt(60, 26) - 0.01) < 1e-3, 'Route 25');
  assert.equal(Ground.fallback(32, 45), 0.01, 'bridge deck carriageway');
  for (const x of [26.2, 37.8]) for (const z of [44, 56, 70]) {
    assert.ok(Math.abs(g.heightAt(x, z) - 0.01) < 1e-4, 'bridge margins are flush with the deck');
    assert.equal(Ground.fallback(x, z), 0.01, 'partially loaded ground keeps the same deck level');
  }
});

test('cars appear on time, accelerate at 8 m/s² and leave at the end of their route', () => {
  const s = scenario('builtin-01');
  const t = new Traffic(s, { seed: 3 });
  t.step(4.9);
  assert.equal(t.cars.length, 0, 'background traffic waits 5 s');
  t.step(0.2);
  assert.equal(t.cars.length, 2);
  const car = t.cars[0];
  t.step(1);
  assert.ok(Math.abs(car.distance - S.distanceAt(car.speed > 0 ? 1.1 : 0, car.speed)) < 0.2);
  // the accident car of 01 leaves when the participant sets off towards the road (traffic.js "meet")
  t.step(20, { x: s.spawn.x, z: s.spawn.z, vx: 0, vz: 0 });
  assert.ok(!t.cars.some(c => c.accident), 'not while the participant stands and looks');
  const len = Math.hypot(s.goal.x - s.spawn.x, s.goal.z - s.spawn.z);
  const dir = { x: (s.goal.x - s.spawn.x) / len, z: (s.goal.z - s.spawn.z) / len };
  let launched = false;
  for (let i = 1; i <= 6 && !launched; i++) {
    t.step(0.1, { x: s.spawn.x + dir.x * 0.24 * i, z: s.spawn.z + dir.z * 0.24 * i, vx: dir.x * 2.4, vz: dir.z * 2.4 });
    launched = t.cars.some(c => c.accident);
  }
  assert.ok(launched, 'as soon as they walk on towards the road (within 0.6 s at the normal pace)');
  assert.ok(t.cars.every(c => c.body === 'sedan'), 'files use their own body (the templates say sedan)');
});

test('built-in scenarios mix kei cars into the ordinary traffic, never into the accident car', () => {
  const s = scenario('builtin-01');
  const t = new Traffic(s, { seed: 11, builtInMix: true });
  const bodies = [];
  for (let i = 0; i < 400; i++) bodies.push(t.bodyFor(s.vehicles[0]));
  const kei = bodies.filter(b => b !== 'sedan').length;
  assert.ok(kei > 110 && kei < 210, `about 40 % kei cars (${kei}/400)`);
  for (let i = 0; i < 50; i++) assert.equal(t.bodyFor(s.vehicles.find(v => v.accident)), 'sedan');
});

test('contact uses the body outline plus the participant radius', () => {
  const t = new Traffic(scenario('builtin-01'));
  t.cars.push({ id: 1, x: 0, z: 0, yaw: 90, size: BODY_SIZE['kei-tall'], alive: true });
  assert.ok(t.hit(1.9, 0), 'in front of the bumper (heading +x)');
  assert.equal(t.hit(2.2, 0), null);
  assert.ok(t.hit(0, 1.0), 'beside the door');
  assert.equal(t.hit(0, 1.2), null);
});

test('analysis measures a moving car that appeared less than a second before contact', () => {
  const frames = Array.from({ length: 25 }, (_, i) => {
    const t = i / 20;
    return { t, head: { x: 0, z: t * 2.4, yaw: 0 },
      cars: i >= 8 ? [{ id: 1, x: (t - 0.4) * 10, z: 4, yaw: 90 }] : [] };
  });
  const result = accidentAnalysis(frames, 1.2, 1);
  assert.ok(Math.abs(result.vehicleKmh - 36) < 1e-6, 'uses the available moving track instead of reporting zero');
  assert.ok(Math.abs(result.participantKmh - 8.64) < 1e-6, 'keeps the full window for the participant');
});

test('analysis: looking toward the car, side checks, verdicts and the placement cut', () => {
  assert.equal(deltaYaw(350, 10), 20);
  assert.equal(yawTo(0, 0, 1, 0), 90);
  const r = new Recorder();
  // 1 s somewhere else, then placed at (0, 0) facing +z; a car approaches from +x
  for (let i = 0; i < 20; i++) r.capture(i * 0.05, { x: 50, z: 50, yaw: 0 }, []);
  for (let i = 20; i <= 100; i++) {
    const t = i * 0.05;
    const yaw = t > 2 && t < 3 ? 90 : 0;           // looks right (at the car) for one second
    r.capture(t, { x: 0, z: (t - 1) * 1.2, yaw }, [{ id: 7, x: 30 - (t - 1) * 6, z: 4.8, yaw: -90, body: 'sedan' }]);
  }
  const frames = r.window(0, 5, 5);
  assert.ok(frames[0].t >= 1 - 1e-9, 'the replay starts where the participant was placed');
  const a = accidentAnalysis(frames, 5, 7);
  assert.ok(a.secondsLooking > 0.8 && a.secondsLooking < 1.2, String(a.secondsLooking));
  assert.ok(a.lastLookBeforeImpact > 1.9 && a.lastLookBeforeImpact < 2.1);
  assert.match(accidentVerdict(a), /確認のあとも/);
  assert.ok(Math.abs(a.vehicleKmh - 21.6) < 0.5, 'car at 6 m/s');
  const c = crossingAnalysis(frames);
  assert.ok(c.checkedRight && !c.checkedLeft);
});

test('flush footways and separate 15 cm kerbs: placements follow the road plan', async () => {
  const { webLayout } = await import('../src/web-layout.js');
  const layout = JSON.parse(fs.readFileSync(new URL('../data/layout.json', import.meta.url)));
  const shown = webLayout(layout);
  const g = new Ground(JSON.parse(fs.readFileSync(new URL('../data/road_tiles.json', import.meta.url))));
  assert.ok(Math.abs(g.heightAt(60, 30.6) - g.heightAt(60, 26)) < 1e-6, 'the walking surface is level with the road');
  assert.ok(Math.abs(g.heightAt(60, 30.10) - g.heightAt(60, 30.6) - 0.15) < 2e-3, 'only the narrow kerb cap is raised');
  for (const x of [19.7, 44.3]) for (const z of [21.9, 22.1, 29.9, 30.1])
    assert.ok(Math.abs(g.heightAt(x, z) - 0.01) < 1e-6, 'crossing openings have no raised lip');
  // every house stands on the ground (not floating, not sunk) and keeps VRLearn's height
  for (const h of shown.items.filter(i => /^HK_(Machiya|Kura)/.test(i.a)).slice(0, 40))
    assert.ok(Math.abs(g.heightAt(h.p[0], h.p[2]) - h.p[1]) < 0.03, `${h.a} at ${h.p[0]}, ${h.p[2]}: ground ${g.heightAt(h.p[0], h.p[2]).toFixed(3)}, base ${h.p[1].toFixed(3)}`);
  for (const item of shown.items.filter(i => i.g === 'WebStreet'))
    assert.ok(Math.abs(g.heightAt(item.p[0], item.p[2]) - item.p[1]) < 0.02, `${item.a} rests on the pavement`);
});

test('road height is known on the roads only (ground models are pressed under it)', () => {
  const g = new Ground(JSON.parse(fs.readFileSync(new URL('../data/road_tiles.json', import.meta.url))));
  assert.ok(Math.abs(g.roadHeightAt(32, 37) - 0.01) < 1e-3, 'carriageway at the bridge approach');
  assert.equal(g.roadHeightAt(0, -500), null, 'far off the roads');
  assert.equal(g.heightAt(0, -500), Ground.fallback(0, -500));
});

test('the overhead road plan connects the long bridge and through streets without the old return roads', () => {
  const g = new Ground(data('road_tiles.json'));
  for (const [x, z] of [[180, 42.73], [32, 65], [22, 88], [36.16, -64], [-100, -64], [-28, -20]])
    assert.ok(Math.abs(g.roadHeightAt(x, z) - 0.01) < 1e-4, `connected carriageway at ${x},${z}`);
  for (const [x, z] of [[92, 4], [10, 11], [55, 62], [10, -6]])
    assert.equal(g.roadHeightAt(x, z), null, `obsolete grid road at ${x},${z} is gone`);
  const map = data('map.json');
  assert.ok(S.crossesWall(map, { x: 20, z: 38 }, { x: 20, z: 50 }), 'the moat cannot be walked across');
  assert.ok(!S.crossesWall(map, { x: 32, z: 38 }, { x: 32, z: 75 }), 'the longer bridge remains open');
});
