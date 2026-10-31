// Generated files are written by long pipelines on a working disk. A truncated write or a NUL page
// otherwise surfaces far away, as a parse error in whichever test reaches that model first.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const jsonIn = dir => fs.readdirSync(new URL(dir, root)).filter(name => name.endsWith('.json')).map(name => dir + name);

test('generated JSON is whole: no NUL page and every file parses', () => {
  const files = [...jsonIn('models/'), ...jsonIn('data/')];
  assert.ok(files.length > 100, 'the scan found the generated files');
  for (const file of files) {
    const bytes = fs.readFileSync(new URL(file, root));
    assert.equal(bytes.indexOf(0), -1, `${file}: contains a NUL byte`);
    assert.doesNotThrow(() => JSON.parse(bytes), file);
  }
});

test('every indexed model has its programs and reference GLBs', () => {
  const { models } = JSON.parse(fs.readFileSync(new URL('models/index.json', root)));
  assert.ok(models.length);
  for (const name of models) for (const suffix of ['', '.lod']) {
    assert.ok(fs.statSync(new URL(`models/${name}${suffix}.json`, root)).size > 0, `${name}${suffix} program`);
    assert.ok(fs.statSync(new URL(`data/models/impressionist/${name}${suffix}.glb`, root)).size > 0, `${name}${suffix} GLB`);
  }
});
