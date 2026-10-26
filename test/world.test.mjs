// Open-world manifest (world/hikone.json) against the ten built-in events and the carriageway.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalize } from '../src/simulation/core/scenario.ts';
import { resolveWorld } from '../src/world/scenes/world.ts';
import { inspectRoutes } from '../tools/check_routes.mjs';
import { smoothRoute, carPose, BODY_SIZE } from '../src/simulation/traffic/Traffic.ts';

const read = path => JSON.parse(fs.readFileSync(new URL('../' + path, import.meta.url)));
const events = fs.readdirSync(new URL('../events/', import.meta.url)).filter(f => /^builtin-\d+\.json$/.test(f)).sort()
  .map(f => normalize(read('events/' + f)));
const manifest = read('world/hikone.json');
const world = resolveWorld(manifest, events);
const routes = [...world.flows.map(f => ({ name: f.id, route: f.route })),
  ...world.events.flatMap(b => b.candidates.filter(c => c.kind !== 'flow').map(c => ({ name: b.id, route: c.spec.route })))];

test('the world binds exactly the ten built-in events, each in its own mode', () => {
  assert.deepEqual(world.events.map(b => b.id).sort(), events.map(e => e.id));
  for (const b of world.events) {
    const event = events.find(e => e.id === b.id);
    assert.deepEqual(b.modes, [event.playerMode], b.id);
    assert.ok(b.candidates.length > 0, b.id);
  }
});

test('shared flows and composed encounter routes stay on the carriageway', () => {
  const map = read('data/map.json');
  const results = inspectRoutes({ id: 'world', vehicles: routes.map(r => ({ name: r.name, route: r.route, accident: false })) }, map);
  assert.equal(results.length, routes.length);
  for (const r of results) assert.equal(r.violations, 0, `${r.name}: ${JSON.stringify(r.first)}`);
});

test('no route drives through the permanently parked trucks', () => {
  // Footprints measured from the truck models in the browser (Obstacles boxes), at the world poses.
  const trucks = [{ x0: 49.35, x1: 61.35, z0: 22.12, z1: 25.18 }, { x0: 63.9, x1: 72.7, z0: 22.21, z1: 25.09 }];
  assert.deepEqual(world.parked.map(p => p.x.toFixed(2)), ['55.35', '68.31']);
  const [width, , length] = BODY_SIZE.sedan;
  for (const { name, route } of routes) {
    const path = smoothRoute(route), end = path.at(-1).s;
    for (let d = 0; d <= end; d += 0.5) {
      const pose = carPose(path, d, 2.7), a = pose.yaw * Math.PI / 180;
      for (const u of [-width / 2, width / 2]) for (const f of [-length / 2, 0, length / 2]) {
        const x = pose.x + u * Math.cos(a) + f * Math.sin(a), z = pose.z - u * Math.sin(a) + f * Math.cos(a);
        for (const t of trucks) assert.ok(!(x > t.x0 && x < t.x1 && z > t.z0 && z < t.z1), `${name} at ${x.toFixed(1)}, ${z.toFixed(1)}`);
      }
    }
  }
});

// Beside the trucks the road narrows to about 0.4 m between opposing bodies. Traffic does not model
// giving way at a narrowing, so the lanes themselves must keep the bodies apart.
test('opposing flows pass the parked trucks without overlapping each other', () => {
  const lane = id => {
    const path = smoothRoute(world.flows.find(f => f.id === id).route), samples = [];
    for (let d = 0; d <= path.at(-1).s; d += 0.25) samples.push(carPose(path, d, 2.7));
    return x => samples.reduce((a, b) => Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a).z;
  };
  const east = lane('east'), west = lane('west'), half = BODY_SIZE.sedan[0] / 2;
  for (let x = 53; x <= 75; x += 1) assert.ok(east(x) - west(x) > 2 * half + 0.3, `x ${x}: ${west(x)} / ${east(x)}`);
});

test('the default starts are outside every encounter zone', () => {
  const inside = (p, a) => Math.abs(p.x - a.x) <= a.width / 2 && Math.abs(p.z - a.z) <= a.depth / 2;
  for (const [mode, start] of Object.entries(world.starts))
    for (const b of world.events) if (b.modes.includes(mode)) assert.ok(!inside(start, b.zone), `${mode} start in ${b.id}`);
});

test('invalid references are reported instead of silently dropped', () => {
  const broken = structuredClone(manifest);
  broken.flows[0].route = [{ event: 'builtin-99', vehicle: 0 }];
  broken.events[0].candidates = [{ flow: 'missing', vehicle: 0, anchor: { x: 0, z: 0 } }];
  assert.throws(() => resolveWorld(broken, events), /builtin-99[\s\S]*missing/);
});

test('red-entry response settings validate flow references and finite driver limits', () => {
  for (const patch of [{ flows: ['missing'] }, { speedKmh: 81 }, { reactionTimeSeconds: 0 },
    { maxBrakingMps2: 0 }, { maxVehicles: 1.5 }, { timeoutSeconds: -1 }]) {
    const broken = structuredClone(manifest);
    Object.assign(broken.redEntryResponse, patch);
    assert.throws(() => resolveWorld(broken, events), /redEntryResponse/);
  }
  const legacy = structuredClone(manifest);
  delete legacy.redEntryResponse;
  assert.equal(resolveWorld(legacy, events).redEntryResponse, null, 'older worlds do not enable reactive admission implicitly');
});
