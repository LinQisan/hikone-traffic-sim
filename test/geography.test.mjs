// Exercise the generated road/collision outputs, not just the authored reference coordinates.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TOWN_STREETS, TOWN_CROSSINGS, castleX} from '../src/world/generators/road-layout.js';
import {Ground} from '../src/simulation/collision/Ground.ts';
import {Obstacles} from '../src/simulation/collision/Obstacles.ts';
import {inspectRoutes} from '../tools/check_routes.mjs';
import {inEastExtension} from '../src/world/generators/east-layout.ts';

const read = name => JSON.parse(fs.readFileSync(new URL('../data/' + name, import.meta.url)));
const map = read('map.json'), tiles = read('road_tiles.json');
const ground = new Ground(tiles), obstacles = new Obstacles(read('collision.json'));

test('reviewed town streets carry full vehicle bodies where they remain in the retained corridor', () => {
  // Side streets outside the event corridors are now the mapped OSM streets (docs/geography.md).
  for (const street of TOWN_STREETS) {
    const route = street.points.map(([x, z]) => ({x, z})).filter(p => !inEastExtension(p.x, p.z));
    if (route.length < 2) continue;
    // A car centre cannot stop at the very end of a clipped street: its rear/front extends
    // beyond the represented road. Keep four metres for the largest tested body at each end.
    const driving = route.map(point => ({...point}));
    for (const [end, next] of [[0, 1], [driving.length - 1, driving.length - 2]]) {
      const a = driving[end], b = driving[next], length = Math.hypot(b.x - a.x, b.z - a.z);
      a.x += (b.x - a.x) * 4 / length; a.z += (b.z - a.z) * 4 / length;
    }
    const [result] = inspectRoutes({id: 'geography-review', vehicles: [{name: street.id, route: driving}]}, map);
    assert.equal(result.violations, 0, `${street.id}: ${JSON.stringify(result.first)}`);
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1], b = route[i], steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.2);
      for (let k = 0; k <= steps; k++) {
        const x = a.x + (b.x - a.x) * k / steps, z = a.z + (b.z - a.z) * k / steps;
        assert.ok(Math.abs(ground.heightAt(x, z) - 0.01) < 1e-6, `${street.id}: continuous road ground`);
        assert.ok(!obstacles.blocked(x, z, 0.8), `${street.id}: no building/tree at ${x}, ${z}`);
      }
    }
  }
  const roads = new Ground({'Kyobashi carriageway': tiles['Kyobashi carriageway']});
  assert.equal(roads.roadHeightAt(134, -38), null, 'the former displaced alley is not retained as a phantom road');
});

test('new zebras have continuous flush walking approaches across both kerbs', () => {
  for (const crossing of TOWN_CROSSINGS) {
    for (let dx = -5.5; dx <= 5.5; dx += 0.1) for (const dz of [-0.6, 0, 0.6]) {
      const x = castleX(crossing.z) + dx, z = crossing.z + dz;
      assert.ok(Math.abs(ground.heightAt(x, z) - 0.01) < 1e-6, `${crossing.id}: no raised cap at ${x}, ${z}`);
      assert.ok(!obstacles.blocked(x, z, 0.25), `${crossing.id}: clear walking corridor at ${x}, ${z}`);
    }
  }
});
