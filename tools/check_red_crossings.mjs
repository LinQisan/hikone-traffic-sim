// Monte Carlo of open-world red-light crossings: how often a participant who walks or rides
// straight across a Kyobashi crosswalk against the signal, without looking, is physically hit.
// Practice-model statistics for tuning, not real-world crash probabilities.
//   node tools/check_red_crossings.mjs [trials-per-crossing] [walking|bicycle] [gaze offset °]
// Results are grouped by the crossed road's own signal: crossing a road whose cars have green is
// the dangerous case; a red road usually holds a queue that no driver can pass.
import fs from 'node:fs';
import { normalize } from '../src/simulation/core/scenario.ts';
import { resolveWorld, worldScenario } from '../src/world/scenes/world.ts';
import { Traffic, makeRandom } from '../src/simulation/traffic/Traffic.ts';
import { ScenarioManager } from '../src/simulation/events/ScenarioManager.ts';
import { Obstacles } from '../src/simulation/collision/Obstacles.ts';
import { SIGNAL_PERIOD } from '../src/simulation/traffic/SignalCycle.ts';
const MOVE_SPEED = 2.4;                       // m/s, Player.MOVE_SPEED (walking; riding eases up to it)

const read = path => JSON.parse(fs.readFileSync(new URL('../' + path, import.meta.url)));
const events = fs.readdirSync(new URL('../events/', import.meta.url)).filter(f => /^builtin-\d+\.json$/.test(f)).sort()
  .map(f => normalize(read('events/' + f)));
const world = resolveWorld(read('world/hikone.json'), events);
const obstacles = new Obstacles(read('data/collision.json'));
const trials = Number(process.argv[2]) || 40, mode = process.argv[3] ?? 'walking', gaze = Number(process.argv[4] ?? 0);
const STEP = 1 / 60;

// Straight walks across the four junction crosswalks, both directions (map metres).
const CROSSINGS = [
  { name: '東側（東西の道路を横断）', axis: 'eastWest', from: { x: 44.3, z: 20.6 }, to: { x: 44.3, z: 31.6 } },
  { name: '西側（東西の道路を横断）', axis: 'eastWest', from: { x: 19.7, z: 20.6 }, to: { x: 19.7, z: 31.6 } },
  { name: '南側（南北の道路を横断）', axis: 'northSouth', from: { x: 26.6, z: 17.7 }, to: { x: 37.5, z: 17.7 } },
  { name: '北側（南北の道路を横断）', axis: 'northSouth', from: { x: 26.6, z: 34.4 }, to: { x: 37.5, z: 34.4 } },
  { name: '対角（交差点の中央を斜めに横断）', axis: 'any', from: { x: 22.2, z: 20.2 }, to: { x: 41.8, z: 31.9 } },
].flatMap(c => [c, { ...c, name: c.name + '・逆', from: c.to, to: c.from }]);

export function crossOnce(crossing, seed, phaseOffset) {
  const traffic = new Traffic(worldScenario(world, mode), { seed, builtInMix: true, maxCars: world.maxCars,
    canSee: (car, q) => obstacles.clearSight(car, q) });
  const log = [];
  const manager = new ScenarioManager(world, traffic, { random: makeRandom(seed ^ 0x5bd1e995),
    lineOfSight: (a, b) => obstacles.clearSight(a, b), log: (type, data) => log.push({ type, ...data }) });
  const { from, to } = crossing, length = Math.hypot(to.x - from.x, to.z - from.z);
  const ux = (to.x - from.x) / length, uz = (to.z - from.z) / length, yaw = Math.atan2(ux, uz) * 180 / Math.PI + gaze;
  const q = { x: from.x - ux * 1.5, z: from.z - uz * 1.5, vx: 0, vz: 0, yaw };
  const tick = () => {
    traffic.step(STEP, q);
    manager.update(STEP, { participant: q, mode, rules: traffic.participantRules });
    return traffic.hit(q.x, q.z);
  };
  // Wait on the pavement until the chosen moment of a red walk signal, then go without looking.
  const warm = 60 + phaseOffset;
  while (traffic.time < warm || traffic.signalCycle.state.walk === 'green') tick();
  const signal = traffic.signalCycle.state, phase = signal.id;
  const road = crossing.axis === 'any' ? (signal.eastWest !== 'red' ? signal.eastWest : signal.northSouth) : signal[crossing.axis];
  const speed = MOVE_SPEED;
  let hit = null, travelled = 0;
  while (travelled < length + 2.5 && !hit) {
    q.vx = ux * speed; q.vz = uz * speed; q.x += q.vx * STEP; q.z += q.vz * STEP; travelled += speed * STEP;
    hit = tick();
  }
  q.vx = q.vz = 0;
  for (let t = 0; t < 3 && !hit; t += STEP) hit = tick();
  const response = log.filter(e => e.type === 'red-entry-car').length;
  return { phase, road: road === 'red' ? 'red' : 'green', hit: !!hit, source: hit ? hit.spec.redEntry ? 'response' : 'background' : null,
    response, requested: log.some(e => e.type === 'red-entry-response'), kmh: hit ? hit.currentSpeed * 3.6 : 0 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const groups = { green: { n: 0, hit: 0 }, red: { n: 0, hit: 0 } }, sources = { response: 0, background: 0 };
  for (const crossing of CROSSINGS) {
    let local = 0;
    for (let i = 0; i < trials; i++) {
      const r = crossOnce(crossing, 1000 + i * 7919, (i / trials) * SIGNAL_PERIOD);
      const g = groups[r.road]; g.n++;
      if (r.hit) { g.hit++; local++; sources[r.source]++; }
    }
    console.log(`${crossing.name}: ${local}/${trials}`);
  }
  const pct = g => g.n ? `${g.hit}/${g.n} (${(100 * g.hit / g.n).toFixed(0)}%)` : '-';
  console.log(`\n${mode}, gaze ${gaze}°: crossed road green/yellow ${pct(groups.green)} · red ${pct(groups.red)} · response cars ${sources.response}, other cars ${sources.background}`);
}
