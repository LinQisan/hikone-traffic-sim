// Road lines come from src/world/generators/road-markings.ts; these read the generated layer.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { Ground } from '../src/simulation/collision/Ground.ts';
import { APPROACH_DATA } from '../src/world/generators/castle-approach.js';
import { castleX } from '../src/world/generators/road-layout.js';
import { UNIVERSITY_DATA } from '../src/world/generators/university-layout.js';

import { roadMarkingCommands } from '../src/world/generators/road-markings.ts';

const commands = roadMarkingCommands();
const faces = commands.filter(c => c[1] === 'HK_WhitePaint').map(c => c[2].map(p => [p[0], p[2]]));
const inside = (ring, x, z) => {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[i], [cx, cz] = ring[j];
    if ((az > z) !== (cz > z) && x < (cx - ax) * (z - az) / (cz - az) + ax) hit = !hit;
  }
  return hit;
};
const painted = (x, z) => faces.some(ring => inside(ring, x, z));

test('every mark is a finite upward triangle at road level, in a declared paint', () => {
  assert.ok(commands.length > 6000);
  for (const [kind, material, points, pigment] of commands) {
    assert.equal(kind, 'face');
    assert.ok(/Paint|PathGreen|SignBlue/.test(material) && pigment.length === 3);
    assert.equal(points.length, 3);
    assert.ok(points.flat().every(Number.isFinite));
    assert.ok(points.every(p => p[1] > .01 && p[1] < .03), `height ${points[0]}`);
    const [a, b, c] = points;
    assert.ok((b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]) < 0, `winding ${points}`);
  }
});

test('Castle Road has edge lines and no centre line', () => {
  for (const z of [-130, -50, -30]) {
    assert.ok(painted(castleX(z) + 3.55, z), `edge line at z ${z}`);
    assert.equal(painted(castleX(z), z), false, `centre at z ${z}`);
  }
});

test('Route 25 keeps a five-metre dash rhythm across the practice-area seam', () => {
  const stripes = faces.filter(q => q.every(([x, z]) => x > 90 && x < 196 && Math.abs(z - 26) < 1));
  assert.ok(stripes.length > 8, 'east approach is painted');
  assert.ok(stripes.every(q => Math.max(...q.map(p => p[0])) - Math.min(...q.map(p => p[0])) < 6.5), 'no long centre segment');
  assert.ok(faces.some(q => q.some(([x]) => x > 200 && x < 215)), 'the east map continues the lines at the seam');
});

test('marked corridors keep edge lines through car-park mouths while the narrow tennis lane stays unmarked', () => {
  const west = UNIVERSITY_DATA.road, link = UNIVERSITY_DATA.link, inner = APPROACH_DATA.innerRoad;
  const beside = ([ax, az], [cx, cz], offset) => {
    const length = Math.hypot(cx - ax, cz - az), x = (ax + cx) / 2, z = (az + cz) / 2;
    return [x - (cz - az) / length * offset, z + (cx - ax) / length * offset];
  };
  for (const side of [-1, 1]) {
    assert.ok(painted(...beside(west[4], west[5], side * 3.55)), 'Route 25 west of the practice area');
    assert.equal(painted(...beside(link[8], link[9], side * 2.32)), false, 'IMG_1074: no invented continuous edge line beside the tennis lot');
  }
  for (const side of [-1, 1]) assert.ok(painted(...beside(inner.at(-2), inner.at(-1), side * 2.77)), 'the inner road beyond the survey photos');
  assert.ok(painted(-97, 26 - 3.55), 'the Kyobashi car park mouth');
  assert.ok(commands.some(c => c[1] === 'ART_PathGreen' && Math.min(...c[2].map(p => p[0])) < 150 && Math.max(...c[2].map(p => p[0])) > 150 && c[2].every(p => p[2] > 420 && p[2] < 440)), 'north road moat margin');
});

test('the Nishi crossing lays zebra stripes along the road, west of a wide blue cycle band', () => {
  const near = ring => ring.every(([x, z]) => x > -585 && x < -579 && z > 246 && z < 256);
  const stripes = commands.filter(c => c[1] === 'HK_WhitePaint').map(c => c[2]).filter(t => near(t.map(p => [p[0], p[2]])));
  const span = axis => Math.max(...stripes[0].map(p => p[axis])) - Math.min(...stripes[0].map(p => p[axis]));
  assert.ok(stripes.length >= 16 && span(0) > 3 * span(2), 'each stripe is long along the road');
  const blue = commands.filter(c => c[1] === 'HK_SignBlue').flatMap(c => c[2]);
  const xs = blue.map(p => p[0]);
  assert.ok(Math.min(...xs) > -580 && Math.max(...xs) < -575 && Math.max(...xs) - Math.min(...xs) > 2, 'blue band');
});

test('inner-moat edge lines stay on the sampled carriageway through its bends', () => {
  const ground = new Ground(JSON.parse(fs.readFileSync(new URL('../data/road_tiles.json', import.meta.url))));
  const line = faces.filter(q => q.every(([x, z]) => x > -210 && x < -20 && z > 100 && z < 260));
  assert.ok(line.length > 40, 'audits the rendered line');
  for (const [x, z] of line.flat()) assert.notEqual(ground.roadHeightAt(x, z), null, `off the road at ${x}, ${z}`);
});
