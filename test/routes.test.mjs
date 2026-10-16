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

test('all ten built-ins are covered by the carriageway check', () => assert.equal(entries.length, 10));
for (const entry of entries) {
  test(`${entry.id}: route segments and complete car bodies stay on the carriageway`, () => {
    const scenario = JSON.parse(fs.readFileSync(new URL('scenarios/' + entry.file, data)));
    const bad = inspectRoutes(scenario, map).filter(r => r.violations);
    assert.deepEqual(bad, [], JSON.stringify(bad));
  });
}
