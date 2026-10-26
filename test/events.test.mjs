// Built-in autonomous traffic: delayed departures can change outcomes, cautious participants can
// finish, and cars do not appear visibly nearby. Physics-specific contacts live in driver.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const out = execFileSync(process.execPath, [new URL('../tools/check_events.mjs', import.meta.url).pathname, '--dir', 'data/scenarios', '--json'],
  { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8', maxBuffer: 64 << 20 });
const results = JSON.parse(out.slice(out.lastIndexOf('JSON ') + 5));

test('all ten built-in events are checked', () => assert.equal(results.length, 10));
for (const r of results) {
  test(`${r.id} ${r.name}`, () => {
    for (const key of ['naive', 'naiveLate', 'naiveSeed', 'careful']) {
      assert.ok(r[key].reached || r[key].contact || r[key].waitingForTraffic, `${key}: reaches a physical outcome`);
      for (const e of r[key].spawns)
        assert.ok(e.t <= 0.2 || !e.visible || e.dist >= 60, `${key}: ${e.name} appears out of sight`);
    }
    assert.ok(r.referenceCareful.reached && !r.referenceCareful.contact, 'cautious traversal through ordinary drivers reaches the goal');
    assert.ok(r.referenceCareful.decisions.every(d => d.behavior === 'lawful'), 'ordinary reference never samples a violator');
    for (const d of r.careful.decisions) assert.ok(d.probability >= 0.03 && d.probability <= 0.6);
    assert.ok(r.naive.spawns.length > 0 && r.careful.states.length > 0, 'real traffic was exercised');
  });
}
