import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inspectRoutes } from '../tools/check_routes.mjs';
import { newVehicle } from '../src/simulation/core/scenario.ts';

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

test('practice cars pass the midblock trucks of their own event without touching them', async () => {
  const { parkedFor } = await import('../src/world/generators/parked-layout.js');
  const { smoothRoute, carPose, BODY_SIZE, WHEELBASE } = await import('../src/simulation/traffic/Traffic.ts');
  // Truck footprints [length along x, width] measured from the models in the browser (Obstacles boxes).
  const SIZE = { HK_Truck_Large: [12, 3.06], HK_Truck_Medium: [8.8, 2.88] };
  const scene = JSON.parse(fs.readFileSync(new URL('scene.json', data)));
  for (const entry of entries) {
    const builtIn = Number(entry.id.replace('builtin-', '')) - 1;
    const trucks = parkedFor(scene, builtIn).filter(p => p.kind === 'truck').map(p => ({
      x0: p.x - SIZE[p.model][0] / 2, x1: p.x + SIZE[p.model][0] / 2, z0: p.z - SIZE[p.model][1] / 2, z1: p.z + SIZE[p.model][1] / 2 }));
    if (!trucks.length) continue;
    const scenario = JSON.parse(fs.readFileSync(new URL('scenarios/' + entry.file, data)));
    for (const vehicle of scenario.vehicles) {
      const path = smoothRoute(vehicle.route);
      for (const body of vehicle.accident ? ['sedan'] : Object.keys(BODY_SIZE)) {
        const [width, , length] = BODY_SIZE[body];
        for (let d = 0; d <= path.at(-1).s; d += 0.1) {
          const p = carPose(path, d, WHEELBASE[body]), a = p.yaw * Math.PI / 180;
          for (const u of [-width / 2, 0, width / 2]) for (const f of [-length / 2, -length / 4, 0, length / 4, length / 2]) {
            const x = p.x + u * Math.cos(a) + f * Math.sin(a), z = p.z - u * Math.sin(a) + f * Math.cos(a);
            for (const t of trucks) assert.ok(!(x > t.x0 && x < t.x1 && z > t.z0 && z < t.z1),
              `${entry.id} ${vehicle.name} (${body}) touches a truck at ${x.toFixed(2)}, ${z.toFixed(2)}`);
          }
        }
      }
    }
  }
});
