// Editor server (server/editor-api.mjs, isolated project fixture): list, read, save (with path
// safety), delete, play request, and the guards for other computers and other sites.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import './editor-project.mjs';
import { handle, SCENARIOS, available } from '../server/editor-api.mjs';

assert.ok(available, 'the isolated editor project fixture must be available');

async function withServer(run) {
  const server = http.createServer(handle);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await run(base); } finally { server.close(); }
}

test('malformed input returns actionable 400 errors without overwriting a saved scenario', async () => withServer(async base => {
  const scenario = { ...await (await fetch(base + '/api/scenario?path=templates/builtin-01.json')).json(), id: 'zz-input' };
  const target = base + '/api/scenarios/zz-input';
  await fetch(target, { method: 'PUT', body: JSON.stringify(scenario) });
  const file = path.join(SCENARIOS, 'zz-input.json'), before = await fs.readFile(file, 'utf8');
  try {
    for (const body of ['{', JSON.stringify({ ...scenario, vehicles: {} }), JSON.stringify({ ...scenario, name: 2 })]) {
      const response = await fetch(target, { method: 'PUT', body });
      assert.equal(response.status, 400);
      const problem = await response.json();
      assert.equal(problem.code, 'INVALID_SCENARIO'); assert.ok(problem.problems[0].path);
      assert.equal(await fs.readFile(file, 'utf8'), before);
    }
  } finally { await fs.rm(file, { force: true }); }
}));

test('lists templates, saves, reloads, deletes to .trash and requests play', async () => withServer(async base => {
  const list = await (await fetch(base + '/api/scenarios')).json();
  assert.equal(list.filter(e => e.template).length, 10);
  assert.ok(list.filter(e => e.template).every(e => e.errors === 0));

  const template = await (await fetch(base + '/api/scenario?path=templates/builtin-01.json')).json();
  template.vehicles[0].driver = { reactionTimeSeconds: 1.4, maxBrakingMps2: 5, behavior: 'red-light' };
  template.environment = { visibilityMeters: 40, roadGrip: 0.7 };
  template.hazardPolicy = { safeProbability: 0.05, unsafeProbability: 0.75 };
  const id = 'zz-server-test';
  const saved = await fetch(base + '/api/scenarios/' + id, { method: 'PUT', body: JSON.stringify({ ...template, id }) });
  assert.equal(saved.status, 200);
  const file = path.join(SCENARIOS, id + '.json');
  try {
    const text = await fs.readFile(file, 'utf8');
    assert.equal(JSON.parse(text).id, id);
    const reopened = await (await fetch(base + '/api/scenario?path=' + id + '.json')).json();
    assert.deepEqual(reopened.vehicles[0].driver, template.vehicles[0].driver);
    assert.deepEqual(reopened.environment, template.environment);
    assert.deepEqual(reopened.hazardPolicy, template.hazardPolicy);
    const play = await fetch(base + '/api/play', { method: 'POST', body: JSON.stringify({ path: id + '.json' }) });
    assert.equal(play.status, 200);
    assert.equal((await (await fetch(base + '/api/play')).json()).pending, true);
    await fs.rm(path.join(SCENARIOS, '.play-request.json'), { force: true });

    const removed = await fetch(base + '/api/scenarios/' + id, { method: 'DELETE' });
    assert.equal(removed.status, 200);
    await assert.rejects(fs.access(file));
  } finally {
    await fs.rm(file, { force: true });
    const trash = path.join(SCENARIOS, '.trash');
    for (const n of await fs.readdir(trash).catch(() => [])) if (n.startsWith(id)) await fs.rm(path.join(trash, n));
    await fs.rm(path.join(SCENARIOS, '.play-request.json'), { force: true });
  }
}));

test('refuses unsafe paths, template ids and mismatched ids', async () => withServer(async base => {
  assert.equal((await fetch(base + '/api/scenario?path=../AGENTS.md')).status, 400);
  assert.equal((await fetch(base + '/api/scenario?path=' + encodeURIComponent('../../etc/passwd'))).status, 400);
  assert.equal((await fetch(base + '/api/scenarios/builtin-01', { method: 'PUT', body: '{}' })).status, 400);
  assert.equal((await fetch(base + '/api/scenarios/Bad!', { method: 'PUT', body: '{}' })).status, 400);
  assert.equal((await fetch(base + '/api/scenarios/abc', { method: 'PUT', body: JSON.stringify({ id: 'other' }) })).status, 400);
  assert.equal((await fetch(base + '/api/play', { method: 'POST', body: JSON.stringify({ path: '../AGENTS.md' }) })).status, 400);
}));

test('the local editor opens the same built-in events as the browser-only editor', async () => withServer(async base => {
  const map = await (await fetch(base + '/api/map')).json();
  const source = JSON.parse(await fs.readFile(new URL('../data/map.json', import.meta.url)));
  assert.deepEqual(map.world, source.world, 'the API serves the regenerated overview registration');
  assert.deepEqual(map.detail, source.detail, 'the sharp practice image retains the same registration in both backends');
  const lanes = JSON.parse(await fs.readFile(new URL('../data/editor/lanes.json', import.meta.url)));
  assert.deepEqual(map.lanes, lanes, 'the server must use the browser lane presets and snapping guides');
  const templates = (await (await fetch(base + '/api/scenarios')).json()).filter(e => e.template);
  assert.equal(templates.length, 10);
  for (const entry of templates) {
    const scenario = await (await fetch(base + '/api/scenario?path=' + entry.path)).json();
    const event = JSON.parse(await fs.readFile(new URL('../events/' + entry.id + '.json', import.meta.url)));
    assert.deepEqual(scenario, event, entry.path);
  }
}));

test('reports the server, leaves other paths to the static site and refuses other sites', async () => withServer(async base => {
  assert.equal((await (await fetch(base + '/api/status')).json()).server, true);
  assert.equal((await fetch(base + '/api/map/image')).headers.get('content-type'), 'image/png');
  const put = await fetch(base + '/api/scenarios/zz-cross-site', { method: 'PUT', body: '{}', headers: { Origin: 'https://example.com' } });
  assert.equal(put.status, 403);
  const quest = await fetch(base + '/api/quest/sync', { method: 'POST', body: '{}', headers: { Origin: 'https://example.com' } });
  assert.equal(quest.status, 403);
  const res = { writeHead() { throw new Error('answered'); }, end() {} };
  assert.equal(await handle({ url: '/editor/index.html', method: 'GET', headers: {}, socket: { remoteAddress: '127.0.0.1' } }, res), false);
}));

test('answers no API to other computers on the network', async () => {
  let status = 0;
  const res = { writeHead(code) { status = code; }, end() {} };
  assert.equal(await handle({ url: '/api/scenarios', method: 'GET', headers: {}, socket: { remoteAddress: '192.168.1.20' } }, res), true);
  assert.equal(status, 404);
});
