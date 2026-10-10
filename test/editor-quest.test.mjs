// "Questに送る" (server/editor-api.mjs): mirror valid scenarios onto the headset through adb (a fake adb here).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle, SCENARIOS, packageId, available } from '../server/editor-api.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const skip = !available && 'the VRLearn project is not next to this one (VRLEARN_ROOT)';

test('sync pushes valid scenarios, skips broken ones and removes stale files', { skip }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fake-quest-'));
  process.env.ADB = path.join(here, 'fake-adb.mjs');
  process.env.FAKE_ADB_ROOT = root;
  const pkg = await packageId();
  const remote = path.join(root, 'sdcard', 'Android', 'data', pkg, 'files', 'Scenarios');
  await fs.mkdir(remote, { recursive: true });
  await fs.writeFile(path.join(remote, 'zz-old-on-quest.json'), '{}');

  const template = JSON.parse(await fs.readFile(path.join(SCENARIOS, 'templates', 'builtin-01.json'), 'utf8'));
  const good = path.join(SCENARIOS, 'zz-quest-good.json');
  const bad = path.join(SCENARIOS, 'zz-quest-bad.json');
  await fs.writeFile(good, JSON.stringify({ ...template, id: 'zz-quest-good' }));
  await fs.writeFile(bad, JSON.stringify({ ...template, id: 'zz-quest-bad', name: '' }));
  const server = http.createServer(handle);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const status = await (await fetch(base + '/api/quest')).json();
    assert.equal(status.package, 'com.moxuanxuerain.vrlearn');
    assert.deepEqual(status.devices.map(d => [d.serial, d.state, d.model]), [['1WMHH000000000', 'device', 'Quest 3']]);

    const response = await fetch(base + '/api/quest/sync', { method: 'POST', body: '{}' });
    assert.equal(response.status, 200);
    const report = await response.json();
    const [result] = report.results;
    assert.equal(result.error, null);
    assert.ok(result.pushed.includes('zz-quest-good'));
    assert.ok(!result.pushed.includes('zz-quest-bad'));
    assert.deepEqual(report.skipped.filter(s => s.id.startsWith('zz-')).map(s => s.id), ['zz-quest-bad']);
    assert.deepEqual(result.removed, ['zz-old-on-quest']);
    assert.ok(result.pushed.every(id => !id.startsWith('builtin-')), 'templates are built into the app already');
    assert.equal(JSON.parse(await fs.readFile(path.join(remote, 'zz-quest-good.json'), 'utf8')).id, 'zz-quest-good');
    await assert.rejects(fs.access(path.join(remote, 'zz-old-on-quest.json')));
    assert.equal(report.remote, `/sdcard/Android/data/${pkg}/files/Scenarios`);

    process.env.FAKE_ADB_INSTALLED = '0';
    const missing = await (await fetch(base + '/api/quest/sync', { method: 'POST', body: '{}' })).json();
    assert.match(missing.results[0].error, /入っていません/);
  } finally {
    delete process.env.FAKE_ADB_INSTALLED;
    server.close();
    await fs.rm(good, { force: true });
    await fs.rm(bad, { force: true });
    await fs.rm(root, { recursive: true, force: true });
    delete process.env.ADB;
  }
});
