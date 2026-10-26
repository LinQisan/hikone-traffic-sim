import test from 'node:test';
import assert from 'node:assert/strict';
import './editor-project.mjs';
import { createServer } from 'vite';

test('Vite serves all entries and mounts the guarded editor API on the same origin', async () => {
  const server = await createServer({ server: { port: 0 }, logLevel: 'silent' });
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  try {
    for (const url of ['/', '/editor/', '/docs/', '/docs/tutorial.html']) {
      const response = await fetch(base + url);
      assert.equal(response.status, 200, url);
      assert.match(await response.text(), /@vite\/client/, 'the HTML is transformed by Vite');
    }
    for (const url of ['/server/editor-api.mjs', '/tools/sync.mjs', '/.git/config']) {
      assert.equal((await fetch(base + url)).status, 403, 'development must not expose ' + url);
    }
    const status = await (await fetch(base + '/api/status')).json();
    if (status.server) {
      const templates = await (await fetch(base + '/api/scenarios')).json();
      assert.equal(templates.filter(entry => entry.template).length, 10);
      const denied = await fetch(base + '/api/scenarios/zz-vite-cross-site', {
        method: 'PUT', headers: { Origin: 'https://example.com' }, body: '{}',
      });
      assert.equal(denied.status, 403);
    } else assert.equal(status.error, 'no editor server');
  } finally { await server.close(); }
});
