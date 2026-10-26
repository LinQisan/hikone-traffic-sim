import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const previewLoader = 'data:text/javascript,export const model = name => globalThis.__propPreviewLoad(name);';
const signalPreviewLoader = 'data:text/javascript,export const buildSignals = (...args) => globalThis.__signalPreviewBuild(...args);';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === './world.js' && context.parentURL?.endsWith('/src/three/scene/prop-review.js'))
    return { url: previewLoader, shortCircuit: true };
  if (specifier === './signals.js' && context.parentURL?.endsWith('/src/three/scene/prop-review.js'))
    return { url: signalPreviewLoader, shortCircuit: true };
  return next(specifier, context);
} });
const THREE = await import('three');
const { loadedModel, registerModel } = await import('../src/three/scene/world.js');
const { propReview } = await import('../src/three/scene/prop-review.js');

test('standalone inspection awaits an uncached prop before creating its render meshes', async () => {
  const requests = [], geometry = new THREE.BoxGeometry(), material = new THREE.MeshLambertMaterial({ name: 'PreviewSurface' });
  globalThis.__propPreviewLoad = async name => {
    await Promise.resolve();
    requests.push(name);
    registerModel(name, [{ geometry, material, matrix: new THREE.Matrix4() }]);
  };
  try {
    for (const [view, asset] of [['utility-pole', 'ART_UtilityPole'], ['path-lamp', 'ART_PathLamp'],
      ['storefront', 'ART_CornerShop'], ['display-kiosk', 'ART_DisplayKiosk']]) {
      assert.throws(() => loadedModel(asset), /not preloaded/);
      const scene = new THREE.Scene();
      const camera = await propReview(view, scene, new Map([[material.name, material]]));
      assert.equal(requests.at(-1), asset);
      assert.ok(camera.length >= 6);
      const root = scene.getObjectByName('PropReview');
      assert.equal(root.children.length, 2, 'ground and the requested prop both exist');
      assert.ok(root.children[1].children.some(mesh => mesh.geometry === geometry), 'the asynchronously loaded geometry is rendered');
      root.children[0].geometry.dispose(); root.children[0].material.dispose();
    }
    assert.equal(requests.length, 4);
  } finally {
    delete globalThis.__propPreviewLoad;
    geometry.dispose(); material.dispose();
  }
});

test('standalone signal inspection keeps every attached head beside its selected recentered mast', async () => {
  let inspected;
  globalThis.__signalPreviewBuild = async (root, materials, rigs) => { inspected = rigs[0]; };
  try {
    for (const [view, id] of [['signals-double', 'town-west'], ['signals-double-back', 'town-west'],
      ['signals', 'bridge-east'], ['signals-back', 'bridge-east'], ['signals-name', 'bridge-east'],
      ['signals-walk-detail', 'bridge-east'], ['signals-walk-side', 'bridge-east'],
      ['signals-bridge-west', 'bridge-west']]) {
      await propReview(view, new THREE.Scene(), new Map());
      assert.equal(inspected.id, id, 'the view selects its intended installation');
      assert.deepEqual(inspected.pole, { x: 0, z: 0 });
      assert.equal(inspected.extraHeads.length, ['town-west', 'bridge-east'].includes(id) ? 1 : 0);
      assert.equal(inspected.pedestrians.length, 2, 'both adjacent crosswalk heads are retained');
      for (const p of [inspected.head, ...inspected.extraHeads.map(e => e.head),
        ...inspected.pedestrians.map(w => w.head)])
        assert.ok(Math.hypot(p.x, p.z) < 6, 'every attached head stays near the inspected mast, not its original world position');
    }
  } finally {
    delete globalThis.__signalPreviewBuild;
  }
});
