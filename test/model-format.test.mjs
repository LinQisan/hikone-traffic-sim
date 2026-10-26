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
