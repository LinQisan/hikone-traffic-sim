import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inflateSync } from 'node:zlib';
import { toMapPixel, fromMapPixel, coordinateGrid, coordinateText, containsPoint, imagePlacement } from '../src/editor/map-coordinates.ts';

const map = JSON.parse(fs.readFileSync(new URL('../data/map.json', import.meta.url)));

test('map coordinates identify the same scenario point before and after pan and zoom', () => {
  const point = { x: 47.2, z: 16.1 }, pixel = toMapPixel(map, point.x, point.z);
  assert.ok(pixel[0] > 0 && pixel[0] < map.imageWidth && pixel[1] > 0 && pixel[1] < map.imageHeight);
  for (const view of [{ scale: 0.15, tx: 90, ty: -45 }, { scale: 2.7, tx: -1200, ty: 600 }]) {
    const screen = pixel.map((p, i) => p * view.scale + (i ? view.ty : view.tx));
    const result = fromMapPixel(map, (screen[0] - view.tx) / view.scale, (screen[1] - view.ty) / view.scale);
    assert.ok(Math.abs(result.x - point.x) < 1e-9 && Math.abs(result.z - point.z) < 1e-9);
  }
  assert.ok(toMapPixel(map, point.x, point.z + 1)[1] < pixel[1], 'positive Z points up');
  assert.ok(toMapPixel(map, point.x + 1, point.z)[0] > pixel[0], 'positive X points right');
});

test('visible coordinate ticks remain sparse and registered to the scene across zoom levels', () => {
  for (const scale of [0.15, 0.7, 2, 12]) {
    const origin = toMapPixel(map, 32, 26), width = 800, height = 600;
    const view = { scale, tx: width / 2 - origin[0] * scale, ty: height / 2 - origin[1] * scale };
    const grid = coordinateGrid(map, view, width, height);
    assert.ok(grid.step * scale * map.pixelsPerMeter >= 80);
    assert.ok(grid.x.length <= 11 && grid.z.length <= 9, 'zooming out never creates thousands of grid nodes');
    for (const tick of grid.x) {
      const x = fromMapPixel(map, (tick.pixel - view.tx) / scale, 0).x;
      assert.ok(Math.abs(x - tick.value) < 1e-9);
    }
    for (const tick of grid.z) assert.ok(tick.pixel >= -1e-9 && tick.pixel <= height + 1e-9);
  }
});

test('shared coordinates preserve signed metres and reject invalid locations', () => {
  assert.equal(coordinateText({ x: -12.345, z: 16.1 }), 'x=-12.35, z=16.10 (m)');
  assert.equal(coordinateText({ x: -0.001, z: 0 }), 'x=0.00, z=0.00 (m)');
  assert.ok(containsPoint(map, { x: 47.2, z: 16.1 }));
  assert.ok(!containsPoint(map, { x: Infinity, z: 16.1 }));
  assert.ok(!containsPoint(map, { x: map.world.xMin - 1, z: 16.1 }));
});

function readPng(file) {
  const bytes = fs.readFileSync(new URL('../data/' + file, import.meta.url)), chunks = [];
  let width, height;
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'IHDR') {
      width = bytes.readUInt32BE(offset + 8); height = bytes.readUInt32BE(offset + 12);
      assert.equal(bytes[offset + 16], 8); assert.equal(bytes[offset + 17], 2);
    }
    if (type === 'IDAT') chunks.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * 3, pixels = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => { const p = a + b - c, x = Math.abs(p - a), y = Math.abs(p - b), z = Math.abs(p - c); return x <= y && x <= z ? a : y <= z ? b : c; };
  for (let y = 0; y < height; y++) {
    const type = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x, a = x >= 3 ? pixels[at - 3] : 0, b = y ? pixels[at - stride] : 0;
      const c = y && x >= 3 ? pixels[at - stride - 3] : 0;
      pixels[at] = raw[y * (stride + 1) + 1 + x] + [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][type];
    }
  }
  return { width, height, sample(region, x, z) {
    const [px, py] = toMapPixel(region, x, z).map(Math.floor), offset = (py * width + px) * 3;
    assert.ok(px >= 0 && px < width && py >= 0 && py < height, 'sample lies inside the actual bitmap');
    return Array.from(pixels.subarray(offset, offset + 3));
  } };
}

test('the overview covers the collision world, including castle and university coordinates', () => {
  const c = JSON.parse(fs.readFileSync(new URL('../data/collision.json', import.meta.url)));
  assert.deepEqual(map.world, { xMin: c.xMin, zMin: c.zMin, xMax: c.xMin + c.width * c.cell, zMax: c.zMin + c.height * c.cell });
  assert.ok(containsPoint(map, { x: -700, z: 200 }), 'the university is inside both the bitmap and coordinate picker');
  assert.ok(containsPoint(map, { x: -264, z: 396 }), 'the castle is inside the bitmap');
  const image = readPng('map.png');
  assert.equal(image.width, map.imageWidth); assert.equal(image.height, map.imageHeight);
  const water = image.sample(map, 0, 50), roof = image.sample(map, -645, 208);
  assert.ok(water[2] > water[0], 'the moat is rendered at its registered position');
  assert.notDeepEqual(roof, water, 'the campus building has its own rendered geometry');
  assert.notDeepEqual(roof, image.sample(map, -645, 230), 'the auditorium roof is distinguishable from the ground beside it');
});

test('the sharp practice image registers every point to the same overview coordinates', () => {
  const detail = map.detail, image = readPng(detail.file), rect = imagePlacement(map, detail);
  assert.equal(image.width, detail.imageWidth); assert.equal(image.height, detail.imageHeight);
  assert.ok(detail.pixelsPerMeter > map.pixelsPerMeter, 'the wider overview does not reduce local map detail');
  for (const point of [{x:47.2,z:16.1}, {x:32,z:26}, {x:-220,z:165}]) {
    const local = toMapPixel(detail, point.x, point.z), global = toMapPixel(map, point.x, point.z);
    assert.ok(Math.abs(rect.x + local[0] * rect.width / detail.imageWidth - global[0]) < 1e-9);
    assert.ok(Math.abs(rect.y + local[1] * rect.height / detail.imageHeight - global[1]) < 1e-9);
  }
  assert.notDeepEqual(image.sample(detail, 32, 26), image.sample(detail, 0, 50), 'road and water remain distinct in the local image');
});
