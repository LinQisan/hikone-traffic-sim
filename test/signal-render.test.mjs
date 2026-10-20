import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';

const modelCache = 'data:text/javascript,' + encodeURIComponent(`
  import { loadedModel, material } from '${new URL('../src/world.js', import.meta.url).href}';
  export const model = async name => loadedModel(name);
  export { material };
`);
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('../vendor/three/three.module.js', import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: new URL(`../vendor/three/addons/${specifier.slice(13)}`, import.meta.url).href, shortCircuit: true };
  if (specifier === './world.js' && context.parentURL?.endsWith('/src/signals.js'))
    return { url: modelCache, shortCircuit: true };
  return next(specifier, context);
} });
const THREE = await import('three');
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const { registerModel } = await import('../src/world.js');
const { buildSignals } = await import('../src/signals.js');

test('actual signal optics switch together without changing shared models or reuploading stable states', async () => {
  const loader = new GLTFLoader(), sources = [];
  for (const asset of ['ART_Signal_Car', 'ART_Signal_Pedestrian']) {
    const bytes = fs.readFileSync(new URL(`../data/models/impressionist/${asset}.glb`, import.meta.url));
    const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const parts = []; gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(o => { if (o.isMesh) {
      parts.push({ geometry: o.geometry, material: o.material, matrix: o.matrixWorld.clone() });
      sources.push({ geometry: o.geometry, material: o.material, emissive: o.material.emissive.clone() });
    } });
    registerModel(asset, parts);
  }
  // Only plate drawing needs a canvas; the actual exported optics and instancing run unmocked.
  const previous = globalThis.document;
  const context = new Proxy({}, { get: (target, name) => target[name] ?? (() => {}) });
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  try {
    const signals = await buildSignals(new THREE.Scene(), new Map());
    const optics = signals.root.children.filter(m => m.geometry?.getAttribute('signalLit'));
    const lit = (asset, colour) => {
      const mesh = optics.find(m => m.name === `${asset}/ART_Signal${colour}`);
      return [...mesh.geometry.getAttribute('signalLit').array].reduce((a, b) => a + b, 0);
    };
    for (const [time, carGreen, carRed, walkGreen, walkRed] of [[0, 4, 2, 0, 8], [34, 2, 4, 0, 8],
      [60, 0, 6, 8, 0], [78.6, 0, 6, 0, 0], [84, 0, 6, 0, 8]]) {
      signals.update(time);
      assert.deepEqual([lit('ART_Signal_Car', 'Green'), lit('ART_Signal_Car', 'Red'),
        lit('ART_Signal_Pedestrian', 'Green'), lit('ART_Signal_Pedestrian', 'Red')],
      [carGreen, carRed, walkGreen, walkRed], 'all eight walk heads and both reverse car heads follow the shared phase');
      const figures = optics.find(m => m.name === 'ART_Signal_Pedestrian/ART_SignalGlyph').geometry;
      for (const [attribute, count] of [['signalLit', walkRed], ['signalGreenLit', walkGreen]])
        assert.equal([...figures.getAttribute(attribute).array].reduce((a, b) => a + b, 0), count,
          'standing/walking figures extinguish with their own lens instead of staying white');
    }
    signals.update(60.1);
    const attributes = optics.map(m => m.geometry.getAttribute('signalLit'));
    const versions = attributes.map(a => a.version);
    signals.update(60.2);
    assert.deepEqual(attributes.map(a => a.version), versions, 'unchanged states upload no instance buffers');
    for (const source of sources) {
      assert.equal(source.geometry.getAttribute('signalLit'), undefined, 'vehicle/replay geometry is untouched');
      assert.deepEqual(source.material.emissive, source.emissive, 'shared vehicle/replay lighting is untouched');
    }
  } finally { globalThis.document = previous; }
});
