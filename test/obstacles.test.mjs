import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('../vendor/three/three.module.js', import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: new URL(`../vendor/three/addons/${specifier.slice(13)}`, import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const THREE = await import('three');
const { Obstacles, encodeBits, decodeBits } = await import('../src/obstacles.js');
const { Player, BODY_RADIUS } = await import('../src/player.js');
const S = await import('../src/shared/scenario.js');

const read = name => JSON.parse(fs.readFileSync(new URL('../data/' + name, import.meta.url)));
const collision = read('collision.json');
const town = new Obstacles(collision);

function makePlayer(obstacles) {
  const original = globalThis.addEventListener;
  globalThis.addEventListener = () => {};
  try {
    return new Player(new THREE.PerspectiveCamera(), { domElement: { addEventListener() {} } }, { walls: [] }, { heightAt: () => 0.01 }, obstacles);
  } finally { globalThis.addEventListener = original; }
}

test('the collision grid survives its run-length encoding', () => {
  const bits = new Uint8Array(40);
  for (const k of [0, 1, 2, 77, 78, 200, 319]) bits[k >> 3] |= 1 << (k & 7);
  assert.deepEqual(decodeBits(encodeBits(bits), 320), bits);
});

test('houses, storehouses and walls of the town are solid at body height', () => {
  const layout = read('layout.json');
  // the grid covers the map rectangle (the play area inside the invisible walls)
  const { xMin, xMax, zMin, zMax } = read('map.json').world;
  const inside = ([x, , z]) => x > xMin + 5 && x < xMax - 5 && z > zMin + 5 && z < zMax - 5;
  const solid = layout.items.filter(i => /^HK_(Machiya|Kura)/.test(i.a) && inside(i.p));
  assert.ok(solid.length > 40, `${solid.length} buildings`);
  // a building's origin is on its street front: it is solid within a step of it
  for (const item of solid) assert.ok(town.blocked(item.p[0], item.p[2], 1), `${item.a} at ${item.p[0]}, ${item.p[2]}`);
});

test('every scenario starts on free ground and its straight way to the goal is not built over', () => {
  const dirs = ['scenarios', 'editor/templates'];
  let n = 0;
  for (const dir of dirs) for (const f of fs.readdirSync(new URL('../data/' + dir, import.meta.url)).filter(f => f.endsWith('.json') && f !== 'index.json')) {
    const s = S.normalize(read(`${dir}/${f}`));
    const a = s.spawn, b = s.goal, steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1);
    for (let i = 0; i <= steps; i++) {
      const x = a.x + (b.x - a.x) * i / steps, z = a.z + (b.z - a.z) * i / steps;
      assert.ok(!town.blocked(x, z, BODY_RADIUS), `${dir}/${f}: blocked at ${x.toFixed(1)}, ${z.toFixed(1)}`);
    }
    n++;
  }
  assert.ok(n >= 20);
});

test('a parked vehicle is an oriented box the body stays out of', () => {
  const o = new Obstacles(null);
  o.setParked([{ x: 10, z: 0, yaw: 90, size: [2, 5] }]);          // lying along x: 7.5..12.5, -1..1
  assert.ok(o.blocked(12.6, 0, 0.25) && o.blocked(10, 1.2, 0.25));
  assert.ok(!o.blocked(12.8, 0, 0.25) && !o.blocked(10, 1.3, 0.25));
});

test('walking into a parked vehicle stops at its side; sliding along it still works', () => {
  const o = new Obstacles(null);
  o.setParked([{ x: 0, z: 3, yaw: 90, size: [2, 6] }]);           // across the way ahead: z 2..4
  const player = makePlayer(o);
  player.place(0, 0, 0, 170);
  player.enabled = true;
  player.stick = [0, 1];
  for (let i = 0; i < 120; i++) player.update(1 / 60);
  assert.ok(player.z < 2 - BODY_RADIUS + 0.01 && player.z > 1.5, `stopped at ${player.z}`);
  player.stick = [1, 1];                                           // forward and right: slides right along it
  for (let i = 0; i < 60; i++) player.update(1 / 60);
  assert.ok(player.x > 0.5 && player.z < 2 - BODY_RADIUS + 0.01);
  player.bicycle.dispose();
});

test('a bicycle stops with its front wheel at a parked vehicle and can back away', () => {
  const o = new Obstacles(null);
  o.setParked([{ x: 0, z: 6, yaw: 90, size: [2, 6] }]);           // z 5..7
  const player = makePlayer(o);
  player.place(0, 0, 0, 170, 'bicycle');
  player.enabled = true;
  player.keys.add('KeyW');
  for (let i = 0; i < 300; i++) player.update(1 / 60);
  assert.ok(player.z + 0.8 + 0.2 <= 5.01 && player.z > 3.5, `front wheel at ${player.z + 0.8}`);
  player.keys.clear(); player.keys.add('KeyS');
  for (let i = 0; i < 180; i++) player.update(1 / 60);
  assert.ok(player.rideSpeed <= 0 && player.z < 3.9, 'pushed back');
  player.bicycle.dispose();
});
