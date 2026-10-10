// Editor server (server/editor-api.mjs, needs the VRLearn project): list, read, save (with path
// safety), delete, play request, and the guards for other computers and other sites.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { handle, SCENARIOS, available } from '../server/editor-api.mjs';

const skip = !available && 'the VRLearn project is not next to this one (VRLEARN_ROOT)';

async function withServer(run) {
  const server = http.createServer(handle);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await run(base); } finally { server.close(); }
}

test('lists templates, saves, reloads, deletes to .trash and requests play', { skip }, async () => withServer(async base => {
  const list = await (await fetch(base + '/api/scenarios')).json();
  assert.equal(list.filter(e => e.template).length, 10);
  assert.ok(list.filter(e => e.template).every(e => e.errors === 0));

  const template = await (await fetch(base + '/api/scenario?path=templates/builtin-01.json')).json();
  const id = 'zz-server-test';
  const saved = await fetch(base + '/api/scenarios/' + id, { method: 'PUT', body: JSON.stringify({ ...template, id }) });
  assert.equal(saved.status, 200);
  const file = path.join(SCENARIOS, id + '.json');
  try {
    const text = await fs.readFile(file, 'utf8');
    assert.equal(JSON.parse(text).id, id);
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

test('refuses unsafe paths, template ids and mismatched ids', { skip }, async () => withServer(async base => {
  assert.equal((await fetch(base + '/api/scenario?path=../AGENTS.md')).status, 400);
  assert.equal((await fetch(base + '/api/scenario?path=' + encodeURIComponent('../../etc/passwd'))).status, 400);
  assert.equal((await fetch(base + '/api/scenarios/builtin-01', { method: 'PUT', body: '{}' })).status, 400);
  assert.equal((await fetch(base + '/api/scenarios/Bad!', { method: 'PUT', body: '{}' })).status, 400);
  assert.equal((await fetch(base + '/api/scenarios/abc', { method: 'PUT', body: JSON.stringify({ id: 'other' }) })).status, 400);
  assert.equal((await fetch(base + '/api/play', { method: 'POST', body: JSON.stringify({ path: '../AGENTS.md' }) })).status, 400);
}));

test('reports the server, leaves other paths to the static site and refuses other sites', { skip }, async () => withServer(async base => {
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
