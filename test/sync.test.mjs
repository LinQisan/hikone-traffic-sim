import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

test('event-only rebuild needs no Unity project and preserves custom scenarios and local assets', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hikone-event-sync-'));
  try {
    await fs.mkdir(path.join(root, 'tools'));
    await fs.copyFile(new URL('../tools/sync.mjs', import.meta.url), path.join(root, 'tools', 'sync.mjs'));
    await fs.cp(new URL('../events/', import.meta.url), path.join(root, 'events'), { recursive: true });
    const scenarios = path.join(root, 'data', 'scenarios');
    await fs.mkdir(scenarios, { recursive: true });
    const custom = { file: 'custom-test.json', id: 'custom-test', template: false };
    await fs.writeFile(path.join(scenarios, 'index.json'), JSON.stringify([custom]));
    await fs.writeFile(path.join(scenarios, custom.file), 'custom scenario contents');
    await fs.writeFile(path.join(root, 'data', 'map.json'), 'local map contents');
    await fs.mkdir(path.join(root, 'src', 'shared'), { recursive: true });
    await fs.writeFile(path.join(root, 'src', 'shared', 'scenario.js'), 'local scenario model');

    await promisify(execFile)(process.execPath, [path.join(root, 'tools', 'sync.mjs'), '--events-only'],
      { env: { ...process.env, VRLEARN_ROOT: path.join(root, 'missing-unity') } });

    const event = await fs.readFile(new URL('../events/builtin-01.json', import.meta.url), 'utf8');
    assert.equal(await fs.readFile(path.join(scenarios, 'builtin-01.json'), 'utf8'), event);
    assert.equal(await fs.readFile(path.join(root, 'data', 'editor', 'templates', 'builtin-01.json'), 'utf8'), event);
    const index = JSON.parse(await fs.readFile(path.join(scenarios, 'index.json'), 'utf8'));
    assert.deepEqual(index.find(entry => entry.id === custom.id), custom);
    assert.equal(await fs.readFile(path.join(scenarios, custom.file), 'utf8'), 'custom scenario contents');
    assert.equal(await fs.readFile(path.join(root, 'data', 'map.json'), 'utf8'), 'local map contents');
    assert.equal(await fs.readFile(path.join(root, 'src', 'shared', 'scenario.js'), 'utf8'), 'local scenario model');
    const unity = path.join(root, 'fake-unity');
    await fs.mkdir(path.join(unity, 'ProjectSettings'), { recursive: true });
    for (const file of ['Assets/_Project/Hikone/Layout/hikone_layout.json', 'Art/Hikone/road_tiles_geometry.json',
      'Scenarios/maps/hikone-kyobashi/map.json', 'Scenarios/maps/hikone-kyobashi/map.png', 'ScenarioModel/scenario.js']) {
      const target = path.join(unity, file);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, file.endsWith('.json') ? '{}' : 'upstream content');
    }
    await promisify(execFile)(process.execPath, [path.join(root, 'tools', 'sync.mjs')],
      { env: { ...process.env, VRLEARN_ROOT: unity } });
    assert.equal(await fs.readFile(path.join(root, 'src', 'shared', 'scenario.js'), 'utf8'), 'local scenario model',
      'a full sync must preserve browser driver/environment extensions too');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
