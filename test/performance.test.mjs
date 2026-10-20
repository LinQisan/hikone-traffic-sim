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
const { registerModel, material: resolveMaterial } = await import('../src/world.js');
const { instance } = await import('../src/vehicles.js');
const { environmentInstances, LOD_FAR, LOD_NEAR } = await import('../src/environment-instances.js');
const { PigmentPalette, pigmentOf } = await import('../src/style.js');
const { placement } = await import('../src/coords.js');
const { buildLight, ENVIRONMENT_CELLS } = await import('../src/world.js');
const { packPigments, geometryBytes } = await import('../src/geometry-budget.js');
const { webLayout } = await import('../src/web-layout.js');
const { PerformanceProbe } = await import('../src/performance.js');

test('benchmark reset excludes warmup again and samples current resources rather than stale details', () => {
  const element = { dataset: {} }, renderer = { info: { render: { calls: 3, triangles: 12 },
    memory: { geometries: 2, textures: 1 }, programs: [{}] }, domElement: { width: 1280, height: 720 },
    extensions: { has: () => false } };
  let buffers = 10;
  const probe = new PerformanceProbe(element, renderer, true, () => ({ geometryBytes: buffers }));
  for (let i = 0; i < 700; i++) probe.frame(1 / 60, 0.2);
  assert.equal(probe.report.calls, 3);
  assert.equal(probe.report.geometryBytes, 10);
  assert.equal(probe.report.textures, 1);
  buffers = 20; renderer.info.render.calls = 4;
  probe.reset();
  assert.equal(element.dataset.benchmark, undefined);
  probe.frame(1, 10); probe.frame(1, 10);
  assert.equal(probe.samples.length, 0);
  for (let i = 0; i < 600; i++) probe.frame(1 / 60, 0.1);
  assert.equal(probe.report.calls, 4);
  assert.equal(probe.report.geometryBytes, 20);
  assert.ok(probe.report.updateMs < 0.11, 'the second warmup did not enter the result');
});

test('resident buffer accounting counts shared geometry once and includes optional instance storage', () => {
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshBasicMaterial();
  const root = new THREE.Group(), view = new THREE.InstancedMesh(geometry, material, 5);
  const shadow = new THREE.InstancedMesh(geometry, material, 5);
  root.add(view, shadow, new THREE.Mesh(geometry, material));
  const bytes = geometry.index.array.byteLength + Object.values(geometry.attributes).reduce((sum, a) => sum + a.array.byteLength, 0);
  assert.equal(geometryBytes(root), bytes);
  assert.equal(geometryBytes(root, true), bytes + 2 * 5 * 16 * 4);
  geometry.dispose(); material.dispose(); view.dispose(); shadow.dispose();
});

test('view changes preserve ordered instance buffers until visibility or LOD actually changes', () => {
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshLambertMaterial({ name: 'Box' });
  const parts = [{ geometry, material, matrix: new THREE.Matrix4() }];
  const environment = environmentInstances([{ asset: 'Box', high: parts, low: parts,
    items: [0, 1, 2].map(x => ({ p: [x, 0, -10], r: 0, s: [1, 1, 1] })) }], new PigmentPalette(), () => false);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  environment.updateLOD(camera);
  const mesh = environment.assets[0].high, version = mesh.instanceMatrix.version;
  camera.position.x = 0.5;
  environment.updateLOD(camera);
  assert.equal(environment.builds, 2, 'the moved view is checked');
  assert.equal(mesh.count, 3);
  assert.equal(mesh.instanceMatrix.version, version, 'identical ordered lists do not upload again');
  camera.rotation.y = Math.PI;
  environment.updateLOD(camera);
  assert.equal(mesh.count, 0);
  camera.rotation.y = 0;
  environment.updateLOD(camera);
  assert.equal(mesh.count, 3, 'returning to the view restores the cached list');
  const m = new THREE.Matrix4();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m);
    assert.deepEqual(m.elements, environment.assets[0].placements[i].matrix.elements);
  }
});

test('dense assets can use a shorter detail range with hysteresis and the nearest eye', () => {
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshLambertMaterial({ name: 'Box' });
  const parts = [{ geometry, material, matrix: new THREE.Matrix4() }];
  const definition = { items: [{ p: [0, 0, -20], r: 0, s: [1, 1, 1] }], high: parts, low: parts };
  const env = environmentInstances([{ ...definition, asset: 'Leaves', lodFar: 18 },
    { ...definition, asset: 'Building' }], new PigmentPalette(), () => false);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200), leaves = env.assets[0], building = env.assets[1];
  env.updateLOD(camera);
  assert.equal(leaves.low.count, 1, 'leaves use the light mesh beyond their own range');
  assert.equal(building.high.count, 1, 'ordinary geometry retains its existing detail range');
  camera.position.z = -4; env.updateLOD(camera);
  assert.equal(leaves.high.count, 1, 'approaching restores the nearby leaves');
  camera.position.z = -2; env.updateLOD(camera);
  assert.equal(leaves.high.count, 1, 'moving out inside the hysteresis band keeps detail');
  camera.position.z = 0; env.updateLOD(camera);
  camera.position.z = -2; env.updateLOD(camera);
  assert.equal(leaves.low.count, 1, 'moving back inside the same band keeps the light mesh');
  const otherEye = camera.clone(); otherEye.position.z = -5;
  env.updateLOD(camera, otherEye);
  assert.equal(leaves.high.count, 1, 'a nearby second eye keeps the full crown');
  for (const mesh of env.root.children) mesh.dispose?.();
  geometry.dispose(); material.dispose();
});

test('culling refreshes for camera roll, second-eye projection and shadow projection changes', () => {
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshLambertMaterial({ name: 'Box' });
  const parts = [{ geometry, material, matrix: new THREE.Matrix4() }];
  const environment = environmentInstances([{ asset: 'Box', high: parts, low: parts,
    items: [{ p: [0, 0, -10], r: 0, s: [1, 1, 1] }] }], new PigmentPalette(), () => true);
  const camera = new THREE.PerspectiveCamera(60, 2, 0.1, 100), second = camera.clone();
  const shadow = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 100);
  environment.updateLOD(camera, second, shadow);
  const builds = environment.builds;
  camera.rotation.z = Math.PI / 2;
  environment.updateLOD(camera, second, shadow);
  assert.equal(environment.builds, builds + 1, 'roll changes the rectangular frustum');
  second.fov = 90; second.updateProjectionMatrix();
  environment.updateLOD(camera, second, shadow);
  assert.equal(environment.builds, builds + 2);
  shadow.far = 5; shadow.updateProjectionMatrix();
  assert.equal(environment.updateLOD(camera, second, shadow), true);
  assert.equal(environment.assets[0].shadowMesh.count, 0, 'the resized shadow volume excludes the old caster');
});

test('transparent panes survive city merging and follow frame LOD without becoming opaque shadow casters', () => {
  const frame = { geometry: new THREE.BoxGeometry(), material: new THREE.MeshLambertMaterial({ name: 'Frame' }), matrix: new THREE.Matrix4() };
  const glass = new THREE.MeshStandardMaterial({ name: 'ClearPane', transparent: true, opacity: 0.12, side: THREE.DoubleSide });
  const pane = { geometry: new THREE.PlaneGeometry(), material: glass, matrix: new THREE.Matrix4() };
  const parts = [frame, pane];
  const environment = environmentInstances([{ asset: 'Case', high: parts, low: parts,
    items: [{ p: [0, 0, -10], r: 0, s: [1, 1, 1] }] }], new PigmentPalette(), () => true);
  const a = environment.assets[0], high = a.transparent[0][0], low = a.transparent[1][0];
  assert.equal(a.high.geometry.index.count, frame.geometry.index.count, 'opaque merge excludes glazing');
  assert.equal(a.shadowMesh.geometry.index.count, frame.geometry.index.count, 'glass does not become a solid shadow');
  assert.equal(high.material, glass, 'glass retains alpha and its original surface');
  assert.equal(resolveMaterial(new Map([['ClearPane', frame.material]]), glass), glass, 'standalone preview also retains the glass');
  assert.equal(glass.depthWrite, false, 'glass does not hide panes and objects behind it');
  assert.equal(glass.forceSinglePass, true, 'a thin double-sided pane needs one draw');
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
  environment.updateLOD(camera);
  assert.ok(high.visible && !low.visible);
  assert.equal(high.count, a.high.count);
  assert.equal(high.instanceMatrix, a.high.instanceMatrix, 'placement upload is shared with the frame');
  camera.position.z = 80;
  environment.updateLOD(camera);
  assert.ok(low.visible && !high.visible, 'far glazing follows frame LOD');
  assert.equal(low.instanceMatrix, a.low.instanceMatrix);
  camera.rotation.y = Math.PI;
  environment.updateLOD(camera);
  assert.ok(!low.visible && !high.visible, 'culled glazing cannot remain floating in view');
  environment.casters(true);
  assert.ok(!high.castShadow && !low.castShadow);
  camera.rotation.y = 0; camera.position.z = 0;
  environment.updateLOD(camera);
  assert.ok(high.visible && !low.visible, 'returning restores the near glass');
});

test('a broad background composite keeps detail local to either eye and independent shadow casters', () => {
  const geometry = new THREE.BoxGeometry(4, 4, 4), material = new THREE.MeshLambertMaterial({ name: 'ART_Concrete' });
  const parts = Array.from({ length: 10 }, (_, i) => ({ geometry, material, matrix: new THREE.Matrix4().makeTranslation(10 + i * 200, 2, -10) }));
  const palette = new PigmentPalette(), environment = environmentInstances([{
    asset: 'Campus', high: parts, low: parts, items: [{ p: [0, 0, 0], r: 0, s: [1, 1, 1] }],
    background: true, batched: true, cellSize: 64,
  }], palette, () => true);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 900);
  environment.updateLOD(camera);
  const cells = environment.cells.slice().sort((a, b) => a.bounds.min.x - b.bounds.min.x);
  assert.equal(cells.length, 10);
  assert.deepEqual(cells.map(c => c.low), cells.map((c, i) => i !== 0), 'being beside one building does not promote the whole campus');
  for (const c of cells) {
    assert.equal(c.highMesh.material, palette.material(THREE.FrontSide, false, 0.55), 'near cells retain landmark atmosphere');
    assert.equal(c.lowMesh.material, palette.material(THREE.FrontSide, true, 0.55), 'far cells retain atmosphere and seam depth bias');
    assert.equal(c.highMesh.castShadow, false);
    assert.equal(c.lowMesh.castShadow, true);
  }
  for (const key of ['highMesh', 'lowMesh'])
    assert.equal(cells.reduce((n, c) => n + c[key].geometry.index.count, 0), parts.length * geometry.index.count, 'partitioning retains every triangle at each level');
  const second = camera.clone(); second.position.x = 410;
  environment.updateLOD(camera, second);
  assert.deepEqual(cells.map(c => c.low), cells.map((c, i) => i !== 0 && i !== 2), 'the other eye also selects nearby detail');
  environment.casters(true);
  assert.ok(cells.every(c => c.lowMesh.visible), 'offscreen cells remain available for the light frustum');
  cells[0].lowMesh.onBeforeShadow();
  assert.equal(cells[0].lowMesh.geometry.drawRange.count, Infinity);
  cells[0].lowMesh.onBeforeRender();
  assert.equal(cells[0].lowMesh.geometry.drawRange.count, 0, 'the near cell is not drawn twice in the view pass');
  environment.casters(false);
  assert.deepEqual(cells.map(c => c.lowMesh.visible), cells.map((c, i) => i !== 0 && i !== 2));
  const region = environment.regions[0];
  for (const c of cells) for (const attribute of Object.keys(c.lowMesh.geometry.attributes))
    assert.equal(c.lowMesh.geometry.attributes[attribute], region.farMesh.geometry.attributes[attribute], 'the distant proxy shares low vertex buffers');
  for (const eye of [camera, second]) {
    eye.position.set(900, 2, 2000); eye.lookAt(900, 2, -10);
    eye.fov = 90; eye.far = 3000; eye.updateProjectionMatrix();
  }
  environment.updateLOD(camera, second);
  environment.casters(false);
  assert.equal(region.farMesh.visible, true, 'the whole distant silhouette takes one draw');
  assert.ok(cells.every(c => !c.highMesh.visible && !c.lowMesh.visible), 'local cells do not duplicate the distant view');
  environment.casters(true);
  assert.ok(cells.every(c => c.lowMesh.visible), 'distant-proxy selection leaves local shadow casters available');
  for (const c of cells) {
    c.lowMesh.onBeforeShadow();
    assert.equal(c.lowMesh.geometry.drawRange.count, Infinity);
    c.lowMesh.onBeforeRender();
    assert.equal(c.lowMesh.geometry.drawRange.count, 0, 'the distant proxy is not duplicated on shadow frames');
  }
  camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0);
  camera.fov = 70; camera.updateProjectionMatrix();
  environment.updateLOD(camera);
  environment.casters(false);
  assert.equal(region.farMesh.visible, false, 'returning restores local detail');
  assert.equal(cells[0].highMesh.visible, true);
  for (const mesh of environment.root.children) mesh.geometry.dispose();
  geometry.dispose(); material.dispose();
  for (const material of palette.materials.values()) material.dispose();
  palette.texture.dispose();
});

test('cell culling rejects a broad flat cell behind the camera and respects root transforms', () => {
  const geometry = new THREE.BoxGeometry(200, 1, 2), material = new THREE.MeshLambertMaterial({ name: 'ART_Concrete' });
  const parts = [{ geometry, material, matrix: new THREE.Matrix4().makeTranslation(0, 0, 10) }];
  const palette = new PigmentPalette(), environment = environmentInstances([{
    asset: 'Paving', high: parts, low: parts, items: [{ p: [0, 0, 0], r: 0, s: [1, 1, 1] }], cellSize: 512,
  }], palette, () => false);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 900);
  camera.updateMatrixWorld(); environment.root.updateMatrixWorld(true);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(camera.projectionMatrix);
  const mesh = environment.cells[0].highMesh;
  assert.equal(frustum.intersectsObject(mesh), true, 'the default sphere reaches behind the camera');
  assert.equal(mesh.intersectsFrustum(frustum), false, 'the actual cell box stays behind the near plane');
  environment.root.position.z = -30; environment.root.updateMatrixWorld(true);
  assert.equal(mesh.intersectsFrustum(frustum), true, 'bounds follow the world transform');
  for (const mesh of environment.root.children) mesh.geometry.dispose();
  geometry.dispose(); material.dispose();
  for (const material of palette.materials.values()) material.dispose();
  palette.texture.dispose();
});

test('the instanced city keeps every placement and triangle, draws in few calls and switches detail', async () => {
  const layout = webLayout(JSON.parse(await fs.readFile(new URL('../data/layout.json', import.meta.url))));
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
    const items = layout.items.filter(i => i.a === asset);
    return { asset, items, high: await parts(''), low: await parts('.lod'),
      background: items.every(i => i.g === 'WebLandmark') || ['ART_ShigaCampus', 'ART_WestMoat', 'ART_CastleApproach'].includes(asset),
      cellSize: ENVIRONMENT_CELLS[asset], batched: asset === 'ART_CastleApproach' };
  }));
  const palette = new PigmentPalette();
  const noShadow = asset => /^(HK_(Road|Ground|Water|Terrain|Sign|Bollard|Guardrail|ChainFence)|ART_(PavingDetails|MoatRoad|Kyobashi(Roads|Land|Water)))/.test(asset);
  const environment = environmentInstances(definitions, palette, asset => !noShadow(asset));
  const shared = new Set(environment.root.children.map(m => m.material));
  const opaque = [...shared].filter(m => !m.transparent), glass = [...shared].filter(m => m.transparent);
  assert.ok(opaque.length <= 4 && opaque.every(m => m.name === 'HikonePigments'), 'shared pigment shader with ground depth biases and a distant-atmosphere variant');
  assert.deepEqual([...new Set(glass.map(m => m.name))], ['ART_DisplayGlass'], 'both LODs keep the separate display glass');

  // every layout item is drawn exactly once, at its simulator placement
  const expected = new THREE.Matrix4();
  const placed = environment.assets.flatMap(a => a.placements);
  const cellAssets = new Set(environment.cells.map(c => c.asset));
  assert.equal(placed.length + cellAssets.size, layout.items.length);
  for (const p of placed) {
    placement(...p.item.p, p.item.r, p.item.s, expected);
    p.matrix.elements.forEach((v, i) => assert.ok(Math.abs(v - expected.elements[i]) < 1e-4, 'placement remains aligned with the simulator'));
  }

  // Cells retain triangle winding and pigment rows, at the Float32 precision uploaded to the GPU.
  const signature = triangles => createHash('sha256').update(triangles.sort().join('\n')).digest('hex');
  const point = new THREE.Vector3();
  for (const name of ['ART_KyobashiRoads', 'ART_KyobashiLand']) {
    const definition = definitions.find(d => d.asset === name);
    placement(...definition.items[0].p, definition.items[0].r, definition.items[0].s, expected);
    for (const [detail, key] of [['high', 'highMesh'], ['low', 'lowMesh']]) {
      const source = [];
      for (const part of definition[detail]) {
        const m = part.matrix.clone().premultiply(expected), g = part.geometry, row = palette.row(part.material);
        for (let i = 0; i < g.index.count; i += 3) source.push(row + '/' + [0, 1, 2].map(j =>
          point.fromBufferAttribute(g.attributes.position, g.index.getX(i + j)).applyMatrix4(m).toArray().map(v => Math.fround(v).toFixed(3)).join(',')).join(';'));
      }
      const cut = [];
      for (const cell of environment.cells.filter(c => c.asset === definition.asset && c[key])) {
        const g = cell[key].geometry;
        for (let i = 0; i < g.index.count; i += 3) cut.push(g.attributes.hkPigment.getX(g.index.getX(i)) + '/' + [0, 1, 2].map(j =>
          point.fromBufferAttribute(g.attributes.position, g.index.getX(i + j)).toArray().map(v => v.toFixed(3)).join(',')).join(';'));
      }
      assert.equal(signature(cut), signature(source), `${name} ${detail}: every triangle and pigment survives the cut`);
    }
  }
  for (const cell of environment.cells) for (const mesh of [cell.highMesh, cell.lowMesh]) {
    if (mesh && mesh.geometry.attributes.position.count <= 65535)
      assert.ok(mesh.geometry.index.array instanceof Uint16Array, 'a small cell uses compact indices even when its source needs 32 bits');
  }
  for (const name of Object.keys(ENVIRONMENT_CELLS)) {
    const definition = definitions.find(d => d.asset === name), cells = environment.cells.filter(c => c.asset === name);
    assert.ok(cells.length > 1, `${name}: the real composite uses local LOD`);
    for (const [detail, key] of [['high', 'highMesh'], ['low', 'lowMesh']])
      assert.equal(cells.reduce((n, c) => n + (c[key]?.geometry.index.count ?? 0), 0),
        definition[detail].reduce((n, part) => n + part.geometry.index.count, 0), `${name}: ${detail} loses no triangles`);
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
  assert.ok(environment.assets.find(a => a.asset === 'ART_HikoneKeep').placements[0].low,
    'the distant keep uses its light silhouette from the practice street');
  assert.ok(environment.cells.filter(c => c.asset === 'HK_Terrain_Hikone').every(c => c.low),
    'the distant hill cells use their light silhouettes from the practice street');
  environment.root.updateMatrixWorld(true);
  const viewFrustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const visible = environment.root.children.filter(m => m.visible && !(m.isInstancedMesh && m.userData.shadowOnly)
    && (!m.frustumCulled || m.intersectsFrustum(viewFrustum))).length;
  assert.ok(visible < 180, `draw budget: ${visible}`);
  const drawn = a => [a.high, a.low].flatMap(m => Array.from({ length: m.count }, (_, i) => m.instanceMatrix.array[i * 16 + 12]));
  const tree = environment.assets.find(a => a.asset === 'ART_CastleGrove');
  const behind = tree.placements.filter(p => p.center.x < camera.position.x - 80
    && !shadowFrustum.intersectsSphere(new THREE.Sphere(p.center, p.radius + 1.5)));
  assert.ok(behind.length > 0 && behind.every(p => !drawn(tree).includes(p.matrix.elements[12])), 'far behind the viewer: not drawn');
  const lamp = environment.assets.find(a => a.asset === 'ART_PathLamp');
  // instance buffers are Float32; compare placements at that precision
  const key = (array, i) => Math.fround(array[i * 16 + 12]) + ',' + Math.fround(array[i * 16 + 14]);
  const casters = a => new Set(Array.from({ length: a.shadowMesh.userData.shadowCount }, (_, i) => key(a.shadowMesh.instanceMatrix.array, i)));
  const inView = a => new Set([a.high, a.low].flatMap(m => Array.from({ length: m.count }, (_, i) => key(m.instanceMatrix.array, i))));
  const own = p => key(p.matrix.elements, 0);
  const shading = lamp.placements.find(p => p.center.x < camera.position.x - 3 && shadowFrustum.containsPoint(p.center));
  assert.ok(shading && casters(lamp).has(own(shading)) && !inView(lamp).has(own(shading)),
    'a caster behind the viewer still casts its shadow (from the shadow list, not drawn in view)');
  const listed = lamp.placements.filter(p => casters(lamp).has(own(p)));
  assert.ok(listed.length > 0 && listed.length < lamp.placements.length && listed.every(p => shadowFrustum.intersectsSphere(new THREE.Sphere(p.center, p.radius + 1.5))),
    'the shadow pass draws only the casters inside the shadow camera');
  // only the light LOD casts, from its own mesh; the view meshes never cast
  for (const a of environment.assets.filter(a => a.shadow)) {
    assert.ok(a.shadowMesh.castShadow && a.shadowMesh.geometry === a.low.geometry, `${a.asset}: shadow from the light LOD`);
    assert.ok(!a.high.castShadow && !a.low.castShadow, `${a.asset}: view meshes do not cast`);
  }
  // the shadow-only mesh draws nothing in the view pass, and is ready again for the next shadow pass
  const caster = lamp.shadowMesh, n = caster.count;
  caster.onBeforeRender(); assert.equal(caster.count, 0);
  caster.onAfterRender(); assert.equal(caster.count, n);
  environment.casters(false);
  assert.ok(environment.assets.every(a => !a.shadowMesh?.visible), 'casters hidden on ordinary frames (no view-pass cost)');
  environment.casters(true);
  assert.ok(lamp.shadowMesh.visible, 'and present on a frame that redraws the shadow map');
  environment.casters(false);

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
  // walking past LOD thresholds never changes the shadow casters: no shadow redraw while the box stays
  camera.position.set(-55, 2.15, 23); camera.updateMatrixWorld();
  environment.updateLOD(camera, null, shadowCamera);
  let redraws = 0;
  for (let x = -55; x < 35; x += 0.5) {
    camera.position.set(x, 2.15, 23); camera.updateMatrixWorld();
    if (environment.updateLOD(camera, null, shadowCamera)) redraws++;
  }
  assert.equal(redraws, 0, 'LOD switches along a 90 m walk leave the shadow map alone');
  for (const mesh of environment.root.children) mesh.geometry.dispose();
});

test('compact pigment rows retain linear colours, brush family, water identity and HDR emissive light', () => {
  const palette = new PigmentPalette();
  for (const name of ['HK_Asphalt', 'HK_Sakura', 'HK_Water', 'HK_Leaf', 'ART_SignalPole', 'ART_SignalRed', 'ART_LampGlow']) {
    const material = new THREE.MeshLambertMaterial({ name, emissive: 0xffa840, emissiveIntensity: 2 });
    const row = palette.row(material), pigment = pigmentOf(name), base = row * 12;
    const linear = value => new THREE.Color().setRGB(...value, THREE.SRGBColorSpace).toArray();
    const actual = Array.from(palette.data.slice(base, base + 12));
    const expected = [...linear(pigment.warm), pigment.dab, ...linear(pigment.cool), name === 'HK_Water' ? 1 : 0,
      ...material.emissive.clone().multiplyScalar(2).toArray(), pigment.surface];
    expected.forEach((v, i) => assert.ok(Math.abs(v - actual[i]) < 1e-7, `${name}: palette component ${i}`));
    assert.equal(palette.row(material), row, 'reused source material keeps its row');
  }
  assert.equal(palette.texture.image.width, 3);
  assert.equal(palette.texture.image.data.byteLength, 3072);
  palette.texture.dispose();
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

test('the shadow map holds only still things: redrawn on re-centring and changes, never for motion', () => {
  let skyRenders = 0;
  const renderer = { coordinateSystem: THREE.WebGLCoordinateSystem, xr: { enabled: true },
    getRenderTarget: () => null, getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
    setRenderTarget() {}, render() { skyRenders++; } };
  const scene = new THREE.Scene(), light = buildLight(scene, renderer, { direction: [1, -1, 1], intensity: 1 });
  assert.equal(skyRenders, 6, 'sky is rendered to a cubemap once');
  assert.ok(scene.background.isCubeTexture && !scene.environment, 'no per-frame sky or diffuse PBR environment pass');
  const position = new THREE.Vector3(0, 0, 0), shadow = light.sun.shadow;
  const clip = new THREE.Vector3(30, 0, -80).applyMatrix4(shadow.camera.projectionMatrix);
  assert.ok(Math.abs(clip.x) < 1, 'the initial projection includes casters beyond the default 5 m half-width');
  light.follow(position);
  shadow.needsUpdate = false; // A render has consumed the invalidation.
  for (let i = 0; i < 100; i++) light.follow(position);
  assert.equal(shadow.needsUpdate, false, 'standing still (cars passing or not) reuses the shadow map');
  const skyRotation = scene.backgroundRotation.y;
  for (let i = 0; i < 60; i++) light.animate(1 / 60);
  assert.ok(scene.backgroundRotation.y > skyRotation, 'clouds drift using the baked cube texture');
  assert.equal(shadow.needsUpdate, false, 'water/cloud animation does not redraw sun shadows');
  light.follow(new THREE.Vector3(1, 0, 0));
  assert.equal(shadow.needsUpdate, false, 'small steps keep the cached map (no re-centring every step)');
  light.follow(new THREE.Vector3(5, 0, 0));
  assert.equal(shadow.needsUpdate, true, 'shadow box follows a moving participant');
  shadow.needsUpdate = false; light.invalidate();
  assert.equal(shadow.needsUpdate, true, 'scene changes (a run starts, LOD switches) invalidate explicitly');
  assert.equal(skyRenders, 6);
});

test('moving vehicles do not cast into the shadow map: they carry a shadow pool; parked ones cast', () => {
  registerModel('WEB_Sedan', [{ geometry: new THREE.BoxGeometry(1.76, 1.45, 4.6), material: new THREE.MeshLambertMaterial({ name: 'Box' }), matrix: new THREE.Matrix4() }]);
  const moving = instance('WEB_Sedan', new Map(), { moving: true }), parked = instance('WEB_Sedan', new Map());
  const casts = o => { let c = false; o.traverse(m => { if (m.isMesh && m.castShadow) c = true; }); return c; };
  assert.equal(casts(moving), false);
  const pool = moving.children.find(c => c.name === 'BlobShadow');
  assert.ok(pool && pool.scale.x > 1.76 && pool.scale.z > 4.6 && pool.position.y < 0.05, 'a pool a little larger than the car, on the ground');
  assert.equal(casts(parked), true);
  assert.ok(!parked.children.some(c => c.name === 'BlobShadow'));
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
  // a GPU that manages 60 fps below 0.9 but only 45 fps above: the scale must settle, not see-saw
  // (each change resizes the canvas, a hitch) — the block grows each time a raise is undone
  const borderline = new AdaptiveResolution();
  let changes = 0, high = 0, frames = 0;
  for (let t = 0; t < 600; t += 1 / 60) {
    const fps = borderline.scale > 0.9 ? 45 : 60;
    if (borderline.frame(1 / fps, t * 1000)) changes++;
    frames++; if (borderline.scale > 0.9) high++;
  }
  assert.ok(changes <= 30, `10 minutes on a borderline GPU: ${changes} resizes (the fixed 15 s block made 194)`);
  assert.ok(high / frames < 0.1, `rarely at the level the GPU cannot hold: ${(100 * high / frames).toFixed(1)} %`);
  const fixed = new AdaptiveResolution({ enabled: false });
  for (let i = 0; i < 100; i++) fixed.frame(1 / 10, i * 100);
  assert.equal(fixed.scale, 1);
});
