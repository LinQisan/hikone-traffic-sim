import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { readNativeProgram, nativeModelURL } from '../src/three/assets/model-format.ts';
import { packModels } from '../tools/pack_models.mjs';

const program = { format: 'hikone-native-model', version: 1, name: 'Demo', commands: [] };

test('native transport reads plain, gzip and HTTP-decoded gzip as the same construction program', async () => {
  const text = JSON.stringify(program);
  for (const response of [new Response(text), new Response(gzipSync(text)),
    new Response(text, { headers: { 'Content-Encoding': 'gzip' } })]) {
    assert.deepEqual((await readNativeProgram(response)).program, program);
  }
  const entry = { url: 'models/packed/hash.json.gz', rawUrl: 'models/Demo.json?v=hash' };
  assert.equal(nativeModelURL(entry, false), entry.rawUrl, 'browsers without decompression retain the JSON path');
  assert.equal(nativeModelURL(entry, true), entry.url);
});

test('all packaged recipes decode byte-for-byte to their authoritative source', async () => {
  // Packed files are disposable and absent in a fresh checkout, including on CI.
  await packModels();
  const root = new URL('../models/', import.meta.url);
  const runtime = JSON.parse(await fs.readFile(new URL('runtime.json', root)));
  for (const [key, entry] of Object.entries(runtime.files)) {
    if (!entry.url) continue;                     // a far level exists only as a baked file
    const packed = await fs.readFile(new URL('../' + entry.url, root));
    const source = await fs.readFile(new URL('../' + entry.rawUrl.split('?')[0], root));
    assert.ok(gunzipSync(packed).equals(source), key + ': compression must not change modeling instructions');
    assert.equal(packed.length, entry.compressedBytes, key);
    assert.equal(source.length, entry.sourceBytes, key);
  }
});

test('packaging changes the content URL when a recipe changes and keeps other detail levels stable', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hikone-model-pack-'));
  try {
    await fs.writeFile(path.join(root, 'index.json'), JSON.stringify({ models: ['Demo'] }));
    for (const suffix of ['', '.lod']) await fs.writeFile(path.join(root, `Demo${suffix}.json`), JSON.stringify(program));
    await packModels(root);
    const before = JSON.parse(await fs.readFile(path.join(root, 'runtime.json')));
    await fs.writeFile(path.join(root, 'Demo.json'), JSON.stringify({ ...program, name: 'Revised' }));
    await packModels(root);
    const after = JSON.parse(await fs.readFile(path.join(root, 'runtime.json')));
    assert.notEqual(after.files['Demo/high'].url, before.files['Demo/high'].url);
    assert.equal(after.files['Demo/low'].url, before.files['Demo/low'].url);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('a baked model decodes to its program\'s triangles within the transport precision', async () => {
  const { buildNativeModel } = await import('../src/three/geometry/model-builder.js');
  const { addSkirts } = await import('../src/three/geometry/model-closure.js');
  const { readBakedModel, POSITION_UNIT } = await import('../src/three/assets/baked-model.js');
  await packModels();
  const root = new URL('../models/', import.meta.url), runtime = JSON.parse(await fs.readFile(new URL('runtime.json', root)));
  for (const name of ['ART_ClippedHedge', 'ART_MoatBankPatch']) {
    const source = buildNativeModel(JSON.parse(await fs.readFile(new URL(name + '.json', root))));
    addSkirts(source);
    const { parts } = await readBakedModel(new Response(await fs.readFile(new URL('../' + runtime.files[name + '/high'].baked.url, root))));
    assert.equal(parts.length, source.length, name);
    for (const part of parts) {
      const original = source.find(p => p.material.name === part.material.name).geometry;
      assert.equal(part.index.length, original.index.count, name + ': every triangle survives');
      const corners = (p, index) => Array.from(index, i => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]].map(v => Math.round(v * POSITION_UNIT)).join()).sort();
      assert.deepEqual(corners(part.attributes.position.array, part.index), corners(original.attributes.position.array, original.index.array));
    }
  }
});

test('every far level holds geometry', async () => {
  const { files } = JSON.parse(await fs.readFile(new URL('../models/runtime.json', import.meta.url)));
  const far = Object.entries(files).filter(([key]) => key.endsWith('/far'));
  assert.ok(far.length > 5);
  for (const [key, { baked }] of far) assert.ok(baked.bytes > 200, key);
});
