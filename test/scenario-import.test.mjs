import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseScenario, normalize, serialize, validateStructure } from '../src/simulation/core/scenario.ts';
import { createScenarioReader } from '../src/data/scenario-import.ts';

const text = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const map = JSON.parse(text('data/map.json'));
const fixture = text('events/builtin-01.json');

test('all browser events, BOM and supported extensions survive the shared import boundary', async () => {
  let loads = 0;
  const read = createScenarioReader(async () => { loads++; return map; });
  assert.equal(loads, 0, 'normal startup does not request the validation map');
  for (let id = 1; id <= 10; id++) {
    const source = text(`events/builtin-${String(id).padStart(2, '0')}.json`);
    const actual = await read('\uFEFF' + source);
    assert.deepEqual(actual, normalize(JSON.parse(source)));
    assert.equal(serialize(parseScenario(serialize(actual))), serialize(actual), 'the centimetre-precision export remains stable');
  }
  assert.equal(loads, 1, 'file and editor handoffs reuse the successful map request');
});

test('optional null text and driver overrides keep their existing fallback semantics', async () => {
  const source = JSON.parse(fixture);
  source.nameEn = null; source.point = null;
  source.vehicles[0].body = null; source.vehicles[0].entrySpeedKmh = null; source.vehicles[0].noStop = null;
  source.vehicles[0].driver = { reactionTimeSeconds: null, behavior: null };
  const actual = await createScenarioReader(() => map)(JSON.stringify(source));
  assert.equal(actual.nameEn, null); assert.equal(actual.point, null);
  assert.deepEqual(actual.vehicles[0].driver, source.vehicles[0].driver);
  assert.equal(actual.vehicles[0].body, null);
  assert.equal(actual.vehicles[0].entrySpeedKmh, null); assert.equal(actual.vehicles[0].noStop, null);
});

test('concurrent imports share the map request', async () => {
  let loads = 0, complete;
  const read = createScenarioReader(() => { loads++; return new Promise(resolve => { complete = resolve; }); });
  const a = read(fixture), b = read(fixture);
  await new Promise(setImmediate);
  assert.equal(loads, 1); complete(map);
  assert.deepEqual(await a, await b);
});

test('malformed fields report their paths before any map request', async () => {
  let loads = 0;
  const read = createScenarioReader(() => { loads++; return map; });
  for (const [source, path] of [['null', '$'], ['[]', '$'], ['{', '$'],
    ['{"name":2}', 'name'], ['{"id":null}', 'id'], ['{"vehicles":{}}', 'vehicles'],
    ['{"vehicles":[null]}', 'vehicles[0]'], ['{"vehicles":[{"route":[null]}]}', 'vehicles[0].route[0]'],
    ['{"spawn":{"x":"40"}}', 'spawn.x'], ['{"version":1e999}', 'version'],
    ['{"vehicles":[{"accident":"false"}]}', 'vehicles[0].accident']]) {
    await assert.rejects(read(source), error => error.code === 'INVALID_SCENARIO' && error.status === 400
      && error.problems.some(problem => problem.path === path));
  }
  assert.equal(loads, 0);
});

test('an editor can still parse and repair a semantically invalid draft', () => {
  const draft = parseScenario('{"id":"Needs repair","name":"Draft"}');
  assert.equal(draft.id, 'Needs repair');
  assert.equal(draft.vehicles.length, 0);
  assert.ok(validateStructure(draft).some(problem => problem.message.startsWith('id ')));
});

test('the reader checks the real road surfaces instead of accepting a structurally valid water spawn', async () => {
  const scenario = JSON.parse(fixture); scenario.spawn = { x: 0, z: 60 };
  await assert.rejects(createScenarioReader(() => map)(JSON.stringify(scenario)), error =>
    error.code === 'INVALID_SCENARIO' && error.problems.some(problem => problem.target?.kind === 'spawn'));
});

test('a failed map download can be retried with the same scenario', async () => {
  let loads = 0;
  const read = createScenarioReader(() => { if (++loads === 1) throw new Error('offline'); return map; });
  await assert.rejects(read(fixture), { code: 'SCENARIO_MAP_UNAVAILABLE' });
  assert.equal((await read(fixture)).id, 'builtin-01');
  assert.equal(loads, 2);
});

test('an incomplete wall-only map is reported as infrastructure failure and is not cached', async () => {
  let loads = 0;
  const read = createScenarioReader(() => ++loads === 1 ? JSON.parse(text('data/walls.json')) : map);
  await assert.rejects(read(fixture), error => error.code === 'SCENARIO_MAP_UNAVAILABLE' && /surfaces/.test(error.cause.message));
  assert.equal((await read(fixture)).id, 'builtin-01');
  assert.equal(loads, 2);
});
