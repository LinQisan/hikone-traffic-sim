import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';

const modelCache = 'data:text/javascript,' + encodeURIComponent(`
  import { loadedModel, material } from '${new URL('../src/three/scene/world.js', import.meta.url).href}';
  export const model = async name => loadedModel(name);
  export { material };
`);
registerHooks({ resolve(specifier, context, next) {
  if (specifier === './world.js' && context.parentURL?.endsWith('/src/three/scene/signals.js'))
    return { url: modelCache, shortCircuit: true };
  return next(specifier, context);
} });
const THREE = await import('three');
const { buildNativeModel } = await import('../src/three/assets/models.js');
const { registerModel } = await import('../src/three/scene/world.js');
const { buildSignals } = await import('../src/three/scene/signals.js');

test('actual signal optics switch together without changing shared models or reuploading stable states', async () => {
  const sources = [];
  for (const asset of ['ART_Signal_Car', 'ART_Signal_Pedestrian']) {
    const parts = buildNativeModel(JSON.parse(fs.readFileSync(new URL(`../models/${asset}.json`, import.meta.url))));
    for (const { geometry, material } of parts) sources.push({ geometry, material, emissive: material.emissive.clone() });
    registerModel(asset, parts);
  }
  // Only plate drawing needs a canvas; the actual native optics and instancing run unmocked.
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
    const preview = await buildSignals(new THREE.Scene(), new Map(), [signals.rigs[0]]);
    preview.update(34);
    for (const mesh of optics) {
      const source = sources.find(s => s.material.name === mesh.material.name
        && s.geometry.attributes.position.count === mesh.geometry.attributes.position.count);
      assert.ok(source, 'the optic retains its native model');
      assert.equal(mesh.geometry.index, source.geometry.index, 'immutable triangle indices are shared');
      for (const [name, attribute] of Object.entries(source.geometry.attributes))
        assert.equal(mesh.geometry.getAttribute(name), attribute, `immutable ${name} buffer is shared`);
      const other = preview.root.children.find(m => m.name === mesh.name);
      assert.notEqual(other.geometry.getAttribute('signalLit'), mesh.geometry.getAttribute('signalLit'),
        'an inspection assembly owns independent mutable light state');
    }
    assert.deepEqual(attributes.map(a => a.version), versions, 'changing the preview leaves live optic uploads untouched');
    assert.equal(lit('ART_Signal_Pedestrian', 'Green'), 8, 'preview vehicle phase cannot extinguish live walk lights');
    for (const source of sources) {
      assert.equal(source.geometry.getAttribute('signalLit'), undefined, 'vehicle/replay geometry is untouched');
      assert.deepEqual(source.material.emissive, source.emissive, 'shared vehicle/replay lighting is untouched');
    }
  } finally { globalThis.document = previous; }
});
