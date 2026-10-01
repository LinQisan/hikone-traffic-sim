// Every built-in event does what it is for (tools/check_events.mjs, with the real city for sight lines):
// whoever goes on without looking meets the event's accident car; whoever stops and looks sees it
// coming and gets across; cars appear out of sight (or are there from the start).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const out = execFileSync(process.execPath, [new URL('../tools/check_events.mjs', import.meta.url).pathname, '--dir', 'data/scenarios', '--json'],
  { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8', maxBuffer: 64 << 20 });
const results = JSON.parse(out.slice(out.lastIndexOf('JSON ') + 5));

test('all ten built-in events are checked', () => assert.equal(results.length, 10));
for (const r of results) {
  test(`${r.id} ${r.name}`, () => {
    for (const key of ['naive', 'naiveLate', 'naiveSeed']) {
      assert.ok(r[key].contact, `${key}: going on without looking ends in contact`);
      assert.ok(r[key].contact.accident, `${key}: with the event's accident car, not other traffic (${r[key].contact.name})`);
      assert.ok(r[key].contact.kmh >= 15, `${key}: at a speed that matters`);
    }
    assert.ok(r.careful.reached && !r.careful.contact, 'stopping and looking gets the participant across');
    assert.ok(Object.values(r.careful.seenBefore).some(s => s > 0.5), 'the careful participant sees the accident car before it passes');
    for (const e of r.naive.spawns) assert.ok(e.t <= 0.2 || !e.visible || e.dist >= 60, `${e.name} appears out of sight`);
  });
}
