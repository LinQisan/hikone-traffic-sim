// node --test test/   (no packages) — the pure parts of the port against the exported data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as S from '../src/shared/scenario.js';
import { Traffic, BODY_SIZE } from '../src/traffic.js';
import { Ground } from '../src/ground.js';
import { Recorder, accidentAnalysis, crossingAnalysis, accidentVerdict, deltaYaw, yawTo } from '../src/analysis.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const data = f => JSON.parse(fs.readFileSync(path.join(root, 'data', f), 'utf8'));
const scenario = id => S.normalize(data(`scenarios/${id}.json`));

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

test('ground heights match the Unity road colliders', () => {
  const g = new Ground(data('road_tiles.json'));
  assert.ok(Math.abs(g.heightAt(32, 10) - 0.01) < 1e-3, 'carriageway 0.01');
  assert.ok(Math.abs(g.heightAt(40, 14) - 0.41) < 1e-3, 'sidewalk 0.41');
  assert.ok(Math.abs(g.heightAt(60, 26) - 0.01) < 1e-3, 'Route 25');
  assert.equal(Ground.fallback(32, 45), 0.01, 'bridge deck carriageway');
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
  t.step(0.1, { x: s.spawn.x, z: s.spawn.z + 0.3, vx: 0, vz: 2.4 });
  assert.ok(t.cars.some(c => c.accident), 'as soon as they walk on towards the road');
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
