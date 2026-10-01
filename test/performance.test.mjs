import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('../vendor/three/three.module.js', import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: new URL(`../vendor/three/addons/${specifier.slice(13)}`, import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const THREE = await import('three');
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const { environmentInstances, LOD_FAR, LOD_NEAR } = await import('../src/environment-instances.js');
const { PigmentPalette } = await import('../src/style.js');
const { placement } = await import('../src/coords.js');
const { buildLight } = await import('../src/world.js');
const { packPigments } = await import('../src/geometry-budget.js');

test('the instanced city keeps every placement and triangle, draws in few calls and switches detail', async () => {
  const layout = JSON.parse(await fs.readFile(new URL('../data/layout.json', import.meta.url)));
  const loader = new GLTFLoader();
  const definitions = await Promise.all([...new Set(layout.items.map(i => i.a))].map(async asset => {
    const parts = async suffix => {
      const bytes = await fs.readFile(new URL(`../data/models/impressionist/${asset}${suffix}.glb`, import.meta.url));
      const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
      const parts = [];
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse(o => { if (o.isMesh) parts.push({ geometry: o.geometry, material: o.material, matrix: o.matrixWorld.clone() }); });
      return parts;
    };
    return { asset, items: layout.items.filter(i => i.a === asset), high: await parts(''), low: await parts('.lod') };
  }));
  const palette = new PigmentPalette();
  const noShadow = asset => /^HK_(Road|Ground|Water|Terrain|Sign|Bollard|Guardrail|ChainFence)/.test(asset);
  const environment = environmentInstances(definitions, palette, asset => !noShadow(asset));
  const shared = new Set(environment.root.children.map(m => m.material));
  assert.ok(shared.size <= 3 && [...shared].every(m => m.name === 'HikonePigments'), 'one shared pigment shader (two depth biases)');

  // every layout item is drawn exactly once, at its simulator placement
  const expected = new THREE.Matrix4();
  const placed = environment.assets.flatMap(a => a.placements);
  const cellAssets = new Set(environment.cells.map(c => c.asset));
  assert.equal(placed.length + cellAssets.size, layout.items.length);
  for (const p of placed) {
    placement(...p.item.p, p.item.r, p.item.s, expected);
    p.matrix.elements.forEach((v, i) => assert.ok(Math.abs(v - expected.elements[i]) < 1e-4, 'placement remains aligned with the simulator'));
  }

  // the cells of a large asset hold exactly its triangles and pigments
  const signature = triangles => createHash('sha256').update(triangles.sort().join('\n')).digest('hex');
  const road = definitions.find(d => d.asset === 'HK_RoadRaised'), point = new THREE.Vector3();
  placement(...road.items[0].p, road.items[0].r, road.items[0].s, expected);
  for (const [detail, key] of [['high', 'highMesh'], ['low', 'lowMesh']]) {
    const source = [];
    for (const part of road[detail]) {
      const m = part.matrix.clone().premultiply(expected), g = part.geometry, row = palette.row(part.material);
      for (let i = 0; i < g.index.count; i += 3) source.push(row + '/' + [0, 1, 2].map(j =>
        point.fromBufferAttribute(g.attributes.position, g.index.getX(i + j)).applyMatrix4(m).toArray().map(v => v.toFixed(3)).join(',')).join(';'));
    }
    const cut = [];
    for (const cell of environment.cells.filter(c => c.asset === road.asset && c[key])) {
      const g = cell[key].geometry;
      for (let i = 0; i < g.index.count; i += 3) cut.push(g.attributes.hkPigment.getX(g.index.getX(i)) + '/' + [0, 1, 2].map(j =>
        point.fromBufferAttribute(g.attributes.position, g.index.getX(i + j)).toArray().map(v => v.toFixed(3)).join(',')).join(';'));
    }
    assert.equal(signature(cut), signature(source), `road ${detail}: every triangle and pigment survives the cut`);
  }

  // a street view: few draws, objects behind the viewer culled, shadow casters behind kept
  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.08, 500);
  camera.position.set(-55, 2.15, 23); camera.lookAt(0, 2.8, 27);
  const sun = new THREE.DirectionalLight();
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 220 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.target.position.set(-55, 0, 23); sun.position.set(-55 + 45, 61, 23 - 26);
  sun.updateMatrixWorld(); sun.target.updateMatrixWorld(); sun.shadow.updateMatrices(sun);
  const shadowCamera = sun.shadow.camera, shadowFrustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(shadowCamera.projectionMatrix, shadowCamera.matrixWorldInverse));
  assert.equal(environment.updateLOD(camera, null, shadowCamera), true);
  const visible = environment.root.children.filter(m => m.visible).length;
  assert.ok(visible < 180, `draw budget: ${visible}`);
  const drawn = a => [a.high, a.low].flatMap(m => Array.from({ length: m.count }, (_, i) => m.instanceMatrix.array[i * 16 + 12]));
  const tree = environment.assets.find(a => a.asset === 'HK_Tree_Cedar');
  const behind = tree.placements.filter(p => p.center.x < camera.position.x - 80
    && !shadowFrustum.intersectsSphere(new THREE.Sphere(p.center, p.radius + 1.5)));
  assert.ok(behind.length > 0 && behind.every(p => !drawn(tree).includes(p.matrix.elements[12])), 'far behind the viewer: not drawn');
  const lamp = environment.assets.find(a => a.asset === 'HK_StreetLamp');
  const shading = lamp.placements.find(p => p.center.x < camera.position.x - 3 && shadowFrustum.containsPoint(p.center));
  assert.ok(shading && drawn(lamp).includes(shading.matrix.elements[12]), 'a caster behind the viewer still casts its shadow');
  assert.ok(lamp.high.userData.shadowCount + lamp.low.userData.shadowCount < lamp.high.count + lamp.low.count,
    'the shadow pass draws only the casters inside the shadow camera');

  // stationary views do not rebuild; detail switches with hysteresis
  const builds = environment.builds;
  assert.equal(environment.updateLOD(camera, null, shadowCamera), false);
  assert.equal(environment.builds, builds, 'stationary camera does not rewrite instance lists');
  const first = lamp.placements[0];
  const at = distance => {
    camera.position.copy(first.center).add(new THREE.Vector3(first.radius + distance, 0, 0));
    camera.updateMatrixWorld();
    environment.updateLOD(camera, null, shadowCamera);
    return first.low;
  };
  assert.equal(at(10), false);
  assert.equal(at(LOD_FAR - 3), false);
  assert.equal(at(LOD_FAR + 3), true);
  assert.equal(at((LOD_FAR + LOD_NEAR) / 2), true, 'LOD hysteresis avoids flickering around the threshold');
  assert.equal(at(LOD_NEAR - 3), false);
  for (const mesh of environment.root.children) mesh.geometry.dispose();
});

test('packed normals/colours reduce bandwidth while preserving positions and pigment precision', () => {
  const geometry = new THREE.SphereGeometry(1, 16, 12);
  const count = geometry.attributes.position.count, values = new Float32Array(count * 4);
  for (let i = 0; i < values.length; i++) values[i] = i % 4 === 3 ? 1 : (i % 53) / 53;
  geometry.setAttribute('color', new THREE.BufferAttribute(values, 4));
  const normal = geometry.attributes.normal.clone(), position = geometry.attributes.position;
  packPigments(geometry);
  assert.equal(geometry.attributes.position, position, 'position buffer is untouched');
  assert.ok(geometry.attributes.normal.array instanceof Int8Array && geometry.attributes.normal.normalized);
  assert.ok(geometry.attributes.color.array instanceof Uint8Array && geometry.attributes.color.normalized);
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < 3; c++) assert.ok(Math.abs(normal.getComponent(i, c) - geometry.attributes.normal.getComponent(i, c)) <= 1 / 254 + 1e-6);
    for (let c = 0; c < 4; c++) assert.ok(Math.abs(values[i * 4 + c] - geometry.attributes.color.getComponent(i, c)) <= 1 / 510 + 1e-6);
  }
  geometry.dispose();
});

test('cached shadows still update for moving cars, camera motion and scene changes', () => {
  let skyRenders = 0;
  const renderer = { coordinateSystem: THREE.WebGLCoordinateSystem, xr: { enabled: true },
    getRenderTarget: () => null, getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
    setRenderTarget() {}, render() { skyRenders++; } };
  const scene = new THREE.Scene(), light = buildLight(scene, renderer, { direction: [1, -1, 1], intensity: 1 });
  assert.equal(skyRenders, 6, 'sky is rendered to a cubemap once');
  assert.ok(scene.background.isCubeTexture && !scene.environment, 'no per-frame sky or diffuse PBR environment pass');
  const position = new THREE.Vector3(0, 0, 0), shadow = light.sun.shadow;
  light.follow(position, false, 0);
  shadow.needsUpdate = false; // A render has consumed the invalidation.
  light.follow(position, false, 1000);
  assert.equal(shadow.needsUpdate, false, 'static scene reuses its shadow map');
  light.follow(position, true, 1001);
  assert.equal(shadow.needsUpdate, true, 'moving cars cannot freeze their shadows');
  shadow.needsUpdate = false;
  light.follow(position, true, 1010);
  assert.equal(shadow.needsUpdate, false, 'shadow refresh is capped independently of head tracking');
  light.follow(position, true, 1060);
  assert.equal(shadow.needsUpdate, true);
  shadow.needsUpdate = false;
  light.follow(new THREE.Vector3(1, 0, 0), false, 1100);
  assert.equal(shadow.needsUpdate, false, 'small steps keep the cached map (no re-centring every step)');
  light.follow(new THREE.Vector3(5, 0, 0), false, 1150);
  assert.equal(shadow.needsUpdate, true, 'shadow box follows a moving participant');
  shadow.needsUpdate = false; light.invalidate();
  assert.equal(shadow.needsUpdate, true, 'adding/removing cars explicitly invalidates shadows');
  assert.equal(skyRenders, 6);
});

test('desktop resolution steps down on a slow GPU, recovers with headroom and does not oscillate', async () => {
  const { AdaptiveResolution } = await import('../src/resolution.js');
  const r = new AdaptiveResolution();
  const run = (fps, seconds, start) => { let changed = 0; for (let t = 0; t < seconds; t += 1 / fps) if (r.frame(1 / fps, start + t * 1000)) changed++; return changed; };
  run(30, 4, 0);
  assert.ok(r.scale < 0.6 && r.scale >= 0.5, `steps down to the floor: ${r.scale}`);
  const low = r.scale;
  run(60, 3, 5000);
  assert.ok(r.scale <= low / 0.85 * 0.95 + 1e-9, 'raising is capped below the last slow step while it is recent');
  run(60, 20, 30000);
  assert.equal(r.scale, 1, 'headroom restores the full resolution');
  assert.equal(r.frame(1 / 20, 60000, true), false, 'VR or hidden tabs never change it');
  assert.equal(r.frame(2, 60000), false, 'stalls are ignored');
  const fixed = new AdaptiveResolution({ enabled: false });
  for (let i = 0; i < 100; i++) fixed.frame(1 / 10, i * 100);
  assert.equal(fixed.scale, 1);
});
