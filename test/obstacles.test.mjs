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
const { webLayout } = await import('../src/web-layout.js');

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
  const layout = webLayout(read('layout.json'));
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

test('authored street furniture is included in the same collision grid the browser uses', () => {
  const furniture = webLayout(read('layout.json')).items.filter(i => i.g === 'WebStreet');
  assert.ok(furniture.some(i => i.a === 'ART_UtilityPole') && furniture.some(i => i.a === 'ART_PathLamp'));
  for (const item of furniture) assert.ok(town.blocked(item.p[0], item.p[2], BODY_RADIUS), `${item.a}: solid at its rendered position`);
});

test('stone railings and raised banks leave both bridge margins open', () => {
  for (const x of [26.4, 37.6]) for (let z = 41; z <= 72; z += 0.25)
    assert.ok(!town.blocked(x, z, BODY_RADIUS), `bridge walking margin at ${x}, ${z}`);
});

test('parking frontage hedges leave both driveways open across the pavement', () => {
  for (const entry of [-97, -28]) for (const dx of [-1, 0, 1]) for (let z = 10; z <= 22; z += 0.25)
    assert.ok(!town.blocked(entry + dx, z, BODY_RADIUS), `parking driveway at ${entry + dx}, ${z}`);
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

test('a body that starts touching something (a custom spawn by a façade) can step away, not further in', () => {
  const o = new Obstacles(null);
  o.setParked([{ x: 0, z: 1.1, yaw: 90, size: [2, 6] }]);         // z 0.1..2.1: 0.1 m ahead of the spawn
  const player = makePlayer(o);
  player.place(0, 0, 0, 170);
  player.enabled = true;
  player.stick = [0, 1];                                           // into it: refused
  for (let i = 0; i < 30; i++) player.update(1 / 60);
  assert.ok(player.z <= 1e-9, `went in to ${player.z}`);
  player.stick = [0, -1];                                          // away from it: allowed
  for (let i = 0; i < 30; i++) player.update(1 / 60);
  assert.ok(player.z < -0.5, `stepped back to ${player.z}`);
  player.bicycle.dispose();
});

test('a bicycle that starts with a wheel against something rides away from it', () => {
  const o = new Obstacles(null);
  o.setParked([{ x: 0, z: -1.5, yaw: 90, size: [2, 6] }]);        // z -2.5..-0.5: the rear wheel (z -0.8) is inside
  const player = makePlayer(o);
  player.place(0, 0, 0, 170, 'bicycle');
  player.enabled = true;
  player.keys.add('KeyW');
  for (let i = 0; i < 120; i++) player.update(1 / 60);
  assert.ok(player.z > 1, `rode to ${player.z}`);
  player.bicycle.dispose();
});

test('the real town: a valid custom spawn on the pavement against a house front can walk off', async () => {
  const player = makePlayer(town);
  player.place(42.58, 15.5, 0, 170);                               // passes validation, touches the house behind
  assert.ok(town.blocked(42.58, 15.5, BODY_RADIUS));
  player.enabled = true;
  player.stick = [0, 1];                                           // towards the road (+z)
  for (let i = 0; i < 60; i++) player.update(1 / 60);
  assert.ok(player.z > 16.5, `walked to ${player.z}`);
  player.bicycle.dispose();
});

test('the signal posts are solid but stand clear of every scenario\'s way to the goal', async () => {
  const { signalRigs, POLE } = await import('../src/signal-layout.js');
  const posts = new Obstacles(null);
  posts.setFixed(signalRigs().map(r => ({ x: r.pole.x, z: r.pole.z, yaw: 0, size: [POLE[r.kind].base * 2, POLE[r.kind].base * 2] })));
  assert.equal(posts.fixed.length, 5);
  for (const p of posts.fixed) assert.ok(!town.blocked(p.x, p.z, p.hw), 'a signal pole is not inside an existing building or prop');
  for (const p of read('signals.json').parts.filter(p => p.name === 'Pole2' && p.group.includes('/TrafficLight_Walk@')))
    assert.ok(!posts.blocked(p.matrix[12], p.matrix[14], BODY_RADIUS), 'removed standalone walk poles no longer block the pavement');
  assert.ok(posts.blocked(posts.fixed[0].x, posts.fixed[0].z, BODY_RADIUS));
  for (const dir of ['scenarios', 'editor/templates'])
    for (const f of fs.readdirSync(new URL('../data/' + dir, import.meta.url)).filter(f => f.endsWith('.json') && f !== 'index.json')) {
      const s = S.normalize(read(`${dir}/${f}`)), a = s.spawn, b = s.goal, steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1);
      for (let i = 0; i <= steps; i++)
        assert.ok(!posts.blocked(a.x + (b.x - a.x) * i / steps, a.z + (b.z - a.z) * i / steps, BODY_RADIUS), `${dir}/${f}`);
    }
});
