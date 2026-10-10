// Builds data/collision.json: where a walking or riding body cannot go, from the town models.
//   node tools/build_collision.mjs
// Run after the models or the layout change (build_impressionist.py, sync.mjs). Generated; never
// hand-edit the output.
//
// Every solid model (houses, storehouses, walls, stone walls, gates, the castle, trees, hedges,
// fences, lamp and sign posts, the bridge's railings) is cut at body height: the parts between
// 0.3 m and 1.8 m above the ground under them are marked on a 0.2 m grid of the map rectangle
// (Unity x, z). Roads, ground, water and terrain are walked on, not walls. What hangs above head
// height (eaves, tree crowns, the gatehouses' upper floors) does not block. Parked vehicles of a
// scenario are added at run time (src/obstacles.js); the map's invisible walls stay in map.json.
import fs from 'node:fs';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('../vendor/three/three.module.js', import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: new URL(`../vendor/three/addons/${specifier.slice(13)}`, import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const THREE = await import('three');
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const { placement } = await import('../src/coords.js');
const { Ground } = await import('../src/ground.js');
const { CELL, BAND_LOW, BAND_HIGH, encodeBits } = await import('../src/obstacles.js');

const data = new URL('../data/', import.meta.url);
const read = name => JSON.parse(fs.readFileSync(new URL(name, data)));
const layout = read('layout.json'), map = read('map.json');
const ground = new Ground(read('road_tiles.json'));
const NOT_SOLID = /^HK_(Road|Ground|Water|Terrain)/;

const { xMin, zMin, xMax, zMax } = map.world;
const width = Math.ceil((xMax - xMin) / CELL), height = Math.ceil((zMax - zMin) / CELL);
const bits = new Uint8Array(Math.ceil(width * height / 8));
const mark = (x, z) => {
  const i = Math.floor((x - xMin) / CELL), j = Math.floor((z - zMin) / CELL);
  if (i < 0 || j < 0 || i >= width || j >= height) return;
  const k = j * width + i;
  bits[k >> 3] |= 1 << (k & 7);
};

const loader = new GLTFLoader();
const cache = new Map();
async function parts(name) {
  if (!cache.has(name)) {
    const bytes = fs.readFileSync(new URL(`models/impressionist/${name}.glb`, data));
    const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    gltf.scene.updateMatrixWorld(true);
    const list = [];
    gltf.scene.traverse(o => { if (o.isMesh) list.push({ geometry: o.geometry, matrix: o.matrixWorld.clone() }); });
    cache.set(name, list);
  }
  return cache.get(name);
}

// Clips a triangle (Unity coordinates) to the band lo..hi in y and marks points spread over what is
// left, closer than a cell apart, so thin upright walls (a line seen from above) are marked too.
const STEP = CELL * 0.45;
function clipY(poly, y, keepAbove) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ina = keepAbove ? a[1] >= y : a[1] <= y, inb = keepAbove ? b[1] >= y : b[1] <= y;
    if (ina) out.push(a);
    if (ina !== inb) { const t = (y - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * t, y, a[2] + (b[2] - a[2]) * t]); }
  }
  return out;
}
function markTriangle(a, b, c) {
  const g = ground.heightAt((a[0] + b[0] + c[0]) / 3, (a[2] + b[2] + c[2]) / 3);
  let poly = clipY([a, b, c], g + BAND_LOW, true);
  if (poly.length >= 3) poly = clipY(poly, g + BAND_HIGH, false);
  for (let k = 1; k + 1 < poly.length; k++) {
    const p = poly[0], q = poly[k], r = poly[k + 1];
    const n = Math.max(1, Math.ceil(Math.max(Math.hypot(q[0] - p[0], q[2] - p[2]), Math.hypot(r[0] - p[0], r[2] - p[2]), Math.hypot(r[0] - q[0], r[2] - q[2])) / STEP));
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
      const u = i / n, v = j / n, w = 1 - u - v;
      mark(p[0] * w + q[0] * u + r[0] * v, p[2] * w + q[2] * u + r[2] * v);
    }
  }
}

const m = new THREE.Matrix4(), world = new THREE.Matrix4(), v = new THREE.Vector3();
let objects = 0;
for (const item of layout.items) {
  if (NOT_SOLID.test(item.a)) continue;
  objects++;
  placement(...item.p, item.r, item.s, m);
  for (const { geometry, matrix } of await parts(item.a)) {
    world.multiplyMatrices(m, matrix);
    const pos = geometry.attributes.position, index = geometry.index;
    const count = index ? index.count : pos.count;
    const corner = k => { v.fromBufferAttribute(pos, index ? index.getX(k) : k).applyMatrix4(world); return [-v.x, v.y, v.z]; };   // three → Unity
    for (let k = 0; k < count; k += 3) markTriangle(corner(k), corner(k + 1), corner(k + 2));
  }
}

let blocked = 0;
for (let k = 0; k < width * height; k++) if (bits[k >> 3] >> (k & 7) & 1) blocked++;
const out = { format: 'hikone-collision', version: 1, cell: CELL, band: [BAND_LOW, BAND_HIGH],
  xMin, zMin, width, height, bits: encodeBits(bits) };
fs.writeFileSync(new URL('collision.json', data), JSON.stringify(out) + '\n');
console.log(`collision: ${objects} objects, ${width}×${height} cells of ${CELL} m, ${blocked} blocked (${(blocked / (width * height) * 100).toFixed(1)} %)`);
