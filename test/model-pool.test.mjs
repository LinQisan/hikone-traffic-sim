import test from 'node:test';
import assert from 'node:assert/strict';
import { ModelWorkerPool } from '../src/three/assets/ModelWorkerPool.ts';

function workers(limit) {
  const created = [];
  const pool = new ModelWorkerPool(() => {
    const worker = { sent: [], postMessage(job) { this.sent.push(job); }, terminate() { this.terminated = true; },
      reply(index, extra = {}) { this.onmessage({ data: { id: this.sent[index].id, ...extra } }); } };
    created.push(worker); return worker;
  }, limit);
  return { pool, created };
}

test('bounded model workers route out-of-order completions to the correct request', async () => {
  const { pool, created } = workers(2);
  const a = pool.run({ url: 'a' }), b = pool.run({ url: 'b' }), c = pool.run({ url: 'c' });
  assert.equal(created.length, 2);
  created[0].reply(1, { name: 'c' }); created[1].reply(0, { name: 'b' }); created[0].reply(0, { name: 'a' });
  assert.deepEqual((await Promise.all([a, b, c])).map(v => v.name), ['a', 'b', 'c']);
  const d = pool.run({ url: 'd' });
  assert.equal(created.length, 2, 'completed workers are reused');
  created[0].reply(2, { name: 'd' }); assert.equal((await d).name, 'd');
  pool.dispose();
});

test('a worker failure leaves other workers running and the next job can replace it', async () => {
  const { pool, created } = workers(2);
  const a = pool.run({ url: 'a' }), b = pool.run({ url: 'b' });
  const failed = assert.rejects(a, /failed/);
  created[0].onerror({ message: 'failed' }); await failed;
  created[1].reply(0, { name: 'b' }); assert.equal((await b).name, 'b');
  const c = pool.run({ url: 'c' }), d = pool.run({ url: 'd' });
  assert.equal(created.length, 3);
  created[1].reply(1, { name: 'c' }); created[2].reply(0, { name: 'd' });
  assert.deepEqual((await Promise.all([c, d])).map(v => v.name), ['c', 'd']);
  pool.dispose();
});

test('the single-worker path stays bounded and disposal rejects every pending request', async () => {
  const { pool, created } = workers(1);
  const a = pool.run({ url: 'a' }), b = pool.run({ url: 'b' });
  const rejected = Promise.all([assert.rejects(a, /disposed/), assert.rejects(b, /disposed/)]);
  assert.equal(created.length, 1); pool.dispose(); await rejected;
  assert.equal(created[0].terminated, true);
});
