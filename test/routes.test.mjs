import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inspectRoutes } from '../tools/check_routes.mjs';
import { newVehicle } from '../src/shared/scenario.js';

const data = new URL('../data/', import.meta.url);
const map = JSON.parse(fs.readFileSync(new URL('map.json', data)));
const entries = JSON.parse(fs.readFileSync(new URL('scenarios/index.json', data))).filter(e => e.template);

test('a clear centreline still fails when a car body overhangs the kerb', () => {
  const vehicle = newVehicle({ route: [{ x: 52, z: 22.4 }, { x: 62, z: 22.4 }] });
  const [result] = inspectRoutes({ id: 'body-overhang', vehicles: [vehicle] }, map);
  assert.ok(result.violations > 0);
  assert.equal(result.first.kind, 'editor', 'the authored line is clear; the body is not');
});

test('route indexing retains tolerance on positive/negative cell edges and observes edited maps', () => {
  const lo = -16 + 1e-9, hi = 16 - 1e-9;
  const surface = { kind: 'carriageway', triangles: [lo,-20,hi,-20,hi,20, lo,-20,hi,20,lo,20] };
  const local = { surfaces: [surface] };
  const scenario = { id: 'cell-edge', vehicles: [-15.1,15.1].map(x => ({
    ...newVehicle({ route: [{ x, z: -2 }, { x, z: 2 }] }), accident: true,
  })) };
  assert.ok(inspectRoutes(scenario, local).every(r => r.violations === 0), 'editor body corners on both cell boundaries keep the existing edge tolerance');
  surface.triangles = surface.triangles.map((v, i) => i % 2 ? v : v + 200);
  assert.ok(inspectRoutes(scenario, local).every(r => r.violations > 0), 'changing the same map object cannot leave a cached road underneath the cars');
});

test('all ten built-ins are covered by the carriageway check', () => assert.equal(entries.length, 10));
for (const entry of entries) {
  test(`${entry.id}: route segments and complete car bodies stay on the carriageway`, () => {
    const scenario = JSON.parse(fs.readFileSync(new URL('scenarios/' + entry.file, data)));
    const bad = inspectRoutes(scenario, map).filter(r => r.violations);
    assert.deepEqual(bad, [], JSON.stringify(bad));
  });
}
