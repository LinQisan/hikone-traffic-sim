// Browser-only storage of the scenario editor (editor/store.js): the same answers as the server,
// kept in localStorage, with the map and the Unity templates read from data/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const memory = new Map();
globalThis.localStorage = {
  getItem: k => memory.get(k) ?? null,
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: k => memory.delete(k),
};
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const u = new URL(url);
  if (u.protocol !== 'file:') return realFetch(url, options);
  try { return new Response(await fs.readFile(fileURLToPath(u))); }
  catch { return new Response('', { status: 404, statusText: 'Not Found' }); }
};
const { request } = await import('../editor/store.js');

test('lists the ten Unity templates without errors and opens one', async () => {
  const map = await request('/api/map');
  assert.ok(map.surfaces?.length || map.roads || map.image, 'map.json is read');
  assert.match(map.imageUrl, /data\/map\.png$/);
  const list = await request('/api/scenarios');
  const templates = list.filter(e => e.template);
  assert.equal(templates.length, 10);
  assert.ok(templates.every(e => e.errors === 0), JSON.stringify(templates.filter(e => e.errors)));
  const one = await request('/api/scenario?path=templates/builtin-01.json');
  assert.equal(one.id, 'builtin-01');
});

test('saves, lists, reopens and deletes my scenarios in the browser', async () => {
  const template = await request('/api/scenario?path=templates/builtin-03.json');
  const body = JSON.stringify({ ...template, id: 'zz-store' });
  const saved = await request('/api/scenarios/zz-store', { method: 'PUT', body });
  assert.equal(saved.path, 'zz-store.json');
  assert.equal(saved.problems.filter(p => p.level === 'error').length, 0);
  const mine = (await request('/api/scenarios')).filter(e => !e.template);
  assert.deepEqual(mine.map(e => [e.path, e.errors]), [['zz-store.json', 0]]);
  assert.equal((await request('/api/scenario?path=zz-store.json')).id, 'zz-store');
  await request('/api/scenarios/zz-store', { method: 'DELETE' });
  assert.equal((await request('/api/scenarios')).filter(e => !e.template).length, 0);
  assert.equal(JSON.parse(localStorage.getItem('vrlearn.editor.trash'))[0].id, 'zz-store');
});

test('refuses what the server refuses and has no Unity or Quest', async () => {
  const fails = async (path, options, pattern) => {
    await assert.rejects(request(path, options), e => pattern.test(e.message) || assert.fail(e.message));
  };
  await fails('/api/scenarios/builtin-01', { method: 'PUT', body: '{}' }, /ひな形用/);
  await fails('/api/scenarios/Bad!', { method: 'PUT', body: '{}' }, /英小文字/);
  await fails('/api/scenarios/abc', { method: 'PUT', body: JSON.stringify({ id: 'other' }) }, /一致しません/);
  await fails('/api/scenario?path=../AGENTS.md', {}, /not found/);
  await fails('/api/play', { method: 'POST', body: '{}' }, /serve\.mjs/);
  await fails('/api/quest', {}, /serve\.mjs/);
  assert.deepEqual(await request('/api/status'), { server: false });
});
