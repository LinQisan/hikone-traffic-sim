import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import { CROWS, WATER_BIRDS, WATER_LEVEL, birdPose } from '../src/wildlife-layout.js';
import { AmbientMotion } from '../src/ambient-motion.js';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('../vendor/three/three.module.js', import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: new URL(`../vendor/three/addons/${specifier.slice(13)}`, import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const THREE = await import('three');
const { buildWildlife } = await import('../src/wildlife.js');
const { geometryBytes } = await import('../src/geometry-budget.js');

function inside(x, z, p) {
  let hit = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2)
    if ((p[i + 1] > z) !== (p[j + 1] > z) && x < (p[j] - p[i]) * (z - p[i + 1]) / (p[j + 1] - p[i + 1]) + p[i]) hit = !hit;
  return hit;
}
test('every swimming orbit and expanding wake stays in the exported moat rather than crossing land or bridges', () => {
  const walls = JSON.parse(fs.readFileSync(new URL('../data/walls.json', import.meta.url))).walls
    .filter(w => /water|moat/i.test(w.name));
  const pose = {};
  for (const route of WATER_BIRDS) for (let i = 0; i < 360; i++) {
    assert.equal(birdPose(route, i / 360 * Math.PI * 2 / route.speed, pose), pose);
    assert.equal(pose.y, WATER_LEVEL);
    for (let j = 0; j < 8; j++) {
      const a = j / 8 * Math.PI * 2, x = pose.x + Math.cos(a) * 1.8, z = pose.z + Math.sin(a) * 1.8;
      assert.ok(walls.some(w => inside(x, z, w.polygon)), `${route.species} and wake have water at ${x},${z}`);
    }
  }
  for (const route of [...CROWS, ...WATER_BIRDS]) {
    const a = birdPose(route, 18, {}), b = birdPose(route, 18.001, {});
    const heading = Math.atan2(b.x - a.x, b.z - a.z);
    assert.ok(Math.abs(Math.sin(heading - a.yaw)) < .001, 'bird faces its actual travel direction');
  }
});

test('crows cross the whole flight corridor at fixed speed/heading and reset only while concealed', () => {
  const wildlife = buildWildlife(new THREE.Scene()), crow = wildlife.birds.find(b => b.species === 'crow').mesh;
  const matrix = new THREE.Matrix4(), centre = new THREE.Vector3();
  for (const route of CROWS) {
    const start = (.12 - route.phase) * route.duration;
    const a = birdPose(route,start,{}), b = birdPose(route,start+4,{}), c = birdPose(route,start+8,{});
    const ab = new THREE.Vector3(b.x-a.x,b.y-a.y,b.z-a.z), bc = new THREE.Vector3(c.x-b.x,c.y-b.y,c.z-b.z);
    assert.ok(ab.distanceTo(bc)<1e-9, 'successive equal intervals have the same straight displacement');
    assert.ok(Math.abs(ab.length()/4-route.speed)<1e-9, 'flight speed is in map metres per second');
    assert.equal(a.yaw,b.yaw); assert.equal(b.yaw,c.yaw);
    assert.equal(a.y,b.y); assert.equal(b.y,c.y); assert.equal(a.visibility,1);
    const wrap = (1-route.phase)*route.duration;
    for (const time of [wrap-1e-5,wrap,wrap+1e-5])
      assert.ok(birdPose(route,time,{}).visibility<1e-8, 'the far-end reset has no visible teleport or turn');
    for (let i=0;i<=64;i++) {
      wildlife.update((i/64-route.phase)*route.duration);
      for (let k=0;k<crow.count;k++) {
        crow.getMatrixAt(k,matrix); centre.setFromMatrixPosition(matrix);
        assert.ok(crow.boundingSphere.containsPoint(centre), 'culling contains the entire corridor, including both reset ends');
      }
    }
  }
});

test('wildlife freezes with the decorative clock, resumes, and reuses its render buffers without sun casters', () => {
  const scene = new THREE.Scene(), wildlife = buildWildlife(scene), clock = new AmbientMotion();
  const meshes = [...wildlife.birds.map(b => b.mesh), wildlife.ripples];
  const buffers = meshes.map(m => m.instanceMatrix.array);
  const snapshot = () => meshes.map(m => Array.from(m.instanceMatrix.array));
  wildlife.update(0); const before = snapshot();
  clock.advance(.1); wildlife.update(clock.time.value);
  assert.notDeepEqual(snapshot(), before, 'flight, swimming and emitted rings advance');
  const moving = snapshot(), versions = meshes.map(m => m.instanceMatrix.version);
  clock.setReducedMotion(true);
  for (let i = 0; i < 20; i++) { clock.advance(.1); wildlife.update(clock.time.value); }
  assert.deepEqual(snapshot(), moving, 'reduced motion freezes birds and wakes at the current pose');
  assert.deepEqual(meshes.map(m => m.instanceMatrix.version), versions, 'frozen frames do not re-upload instance buffers');
  clock.setReducedMotion(false); clock.advance(.1); wildlife.update(clock.time.value);
  assert.notDeepEqual(snapshot(), moving);
  assert.equal(meshes.length, 4, 'species and wakes stay batched');
  assert.ok(geometryBytes(wildlife.root, true) < 400000, 'wildlife has a small fixed buffer budget');
  meshes.forEach((m, i) => {
    assert.equal(m.instanceMatrix.array, buffers[i]);
    assert.equal(m.castShadow, false, 'moving animals never invalidate the static sun shadow');
    const matrix = new THREE.Matrix4(), centre = new THREE.Vector3();
    for (let k = 0; k < m.count; k++) {
      m.getMatrixAt(k, matrix); centre.setFromMatrixPosition(matrix);
      assert.ok(m.boundingSphere.containsPoint(centre), 'animated instance remains inside its conservative culling bound');
    }
  });
  const fade = wildlife.ripples.geometry.getAttribute('instanceOpacity');
  assert.equal(wildlife.ripples.material.forceSinglePass, true, 'flat rings need no second transparent back-face pass');
  assert.ok(Array.from(fade.array).every(a => a >= 0 && a <= 1), 'wake opacity stays bounded');
});
