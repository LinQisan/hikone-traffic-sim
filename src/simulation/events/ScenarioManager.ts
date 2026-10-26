import type {Point, PlayerMode, DrivingSpec} from '../../types/scenario.ts';
import type {Participant, TrafficCar, PathPoint, PathPose, PreparedRoute, DriverState} from '../../types/simulation.ts';
import type {ResolvedWorld, Binding, Candidate, EncounterRecord, EncounterOutcome, WorldSlot} from '../../types/world.ts';
import type {Traffic} from '../traffic/Traffic.ts';
import type {ParticipantRules} from './ParticipantRules.ts';
type BindingState = {phase: string; until: number; inside: boolean; entries: number};
export interface EncounterInstance {id: string; binding: Binding; start: number; pending: Candidate[]; cars: TrafficCar[]; minGap: number; gapSpeed: number; yielded: boolean; contact: boolean; behaviors: Map<number, string>}
interface Context {participant: Participant; mode: PlayerMode; rules?: ParticipantRules}
interface RedResponse {entry: number; started: number; crossing: number; pending: {flow: ResolvedWorld['flows'][number]; prepared: PreparedRoute; at: number}[]; admitted: number}
interface ManagerOptions {random?: () => number; lineOfSight?: (from: Point, to: Point) => boolean; log?: (type: string, data: object) => void; onOutcome?: (record: EncounterRecord, binding: Binding) => void}
// Open-world encounters: decides when one of the ten built-in events may take place around the
// participant, admits its cars through hidden, clear points of their own routes, and observes how
// it ends. Red crossing entries can also admit a bounded pair of slow-reacting crossing drivers.
// It never places the participant, retimes an existing car, or reports contact itself:
// contact is an input from the physical check (onContact). Pure logic (node:test).
import { pointInArea } from '../core/scenario.ts';
import { pathAt, PLAYER_RADIUS } from '../traffic/Traffic.ts';
import { deltaYaw, yawTo } from '../metrics/analysis.ts';

export const EVALUATION_INTERVAL = 0.25;     // s between eligibility/admission decisions
export const ADMISSION_PATIENCE = 6;         // s an encounter waits for a hidden, clear admission point
export const NEAR_MISS_GAP = 1.0;            // m between body edges, with the car still moving
export const NEAR_MISS_SPEED = 1.5;          // m/s
export const ENCOUNTER_TIMEOUT = 60;         // s
export const OUTCOME_LABELS = {
  contact: '接触', 'near-miss': 'ヒヤリ', yielded: '車が止まった', passed: '無事に通過', deferred: '見送り', left: '離れた',
};

/** Gap between a car body and a participant circle (negative: overlapping). */
export function bodyGap(car: TrafficCar, x: number, z: number, r = PLAYER_RADIUS) {
  const a = car.yaw * Math.PI / 180, dx = x - car.x, dz = z - car.z;
  const lx = Math.abs(dx * Math.cos(a) - dz * Math.sin(a)) - car.size[0] / 2;
  const lz = Math.abs(dx * Math.sin(a) + dz * Math.cos(a)) - car.size[2] / 2;
  return (lx > 0 || lz > 0 ? Math.hypot(Math.max(lx, 0), Math.max(lz, 0)) : Math.max(lx, lz)) - r;
}

/** Distance along a smoothed path closest to (x, z). */
export function projectOnPath(path: PathPoint[], x: number, z: number) {
  let best = Infinity, s = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
    if (l2 < 1e-9) continue;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
    const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
    if (d < best) { best = d; s = a.s + (b.s - a.s) * t; }
  }
  return { s, distance: best };
}

export class ScenarioManager {
  declare world: ResolvedWorld; declare traffic: Traffic; declare random: () => number;
  declare lineOfSight: NonNullable<ManagerOptions['lineOfSight']>; declare log: NonNullable<ManagerOptions['log']>; declare onOutcome: NonNullable<ManagerOptions['onOutcome']>;
  declare time: number; declare clock: number; declare serial: number;
  declare state: Map<string, BindingState>; declare groups: Map<string, EncounterInstance>;
  declare active: EncounterInstance[]; declare outcomes: EncounterRecord[];
  declare slots: Map<string, WorldSlot & {occupied: boolean; paintSeed: number}>;
  declare point: PathPose; declare redEntries: number; declare nextRedResponse: number; declare redResponse: RedResponse | null;
  /**
   * world: resolveWorld(); traffic: the session's Traffic; random: seeded () → [0, 1);
   * lineOfSight(from, to): static sight line (Obstacles.clearSight); log(type, data): session log.
   */
  constructor(world: ResolvedWorld, traffic: Traffic, { random, lineOfSight = () => true, log = () => {}, onOutcome = () => {} }: ManagerOptions = {}) {
    this.world = world; this.traffic = traffic; this.random = random!;
    this.lineOfSight = lineOfSight; this.log = log; this.onOutcome = onOutcome;
    this.time = 0; this.clock = 0; this.serial = 0;
    this.state = new Map(world.events.map(b => [b.id, { phase: 'dormant', until: 0, inside: false, entries: 0 }]));
    this.groups = new Map();                  // group → active instance
    this.active = [];
    this.outcomes = [];
    this.slots = new Map([...world.slots].map(([id, s]) => [id, { ...s, occupied: true, paintSeed: 101 + id.length }]));
    this.point = {} as PathPose;
    this.redEntries = 0; this.nextRedResponse = 0; this.redResponse = null;
  }

  /** Is map point p out of the participant's sight (distance, view direction, buildings)? */
  hidden(p: Point, q: Participant) {
    const h = this.world.hidden, d = Math.hypot(p.x - q.x, p.z - q.z);
    if (d > h.farMeters) return true;
    if (d < h.nearMeters) return false;
    if (Number.isFinite(q.yaw) && Math.abs(deltaYaw(q.yaw!, yawTo(q.x, q.z, p.x, p.z))) > h.viewHalfAngle) return true;
    return !this.lineOfSight(q, p);
  }

  /** Direction of travel (or of the head while standing) agrees with the binding's approach. */
  approaching(b: Binding, q: Participant) {
    if (b.heading == null) return true;
    const speed = Math.hypot(q.vx ?? 0, q.vz ?? 0);
    const yaw = speed > 0.3 ? Math.atan2(q.vx!, q.vz!) * 180 / Math.PI : q.yaw;
    return Number.isFinite(yaw) && Math.abs(deltaYaw(b.heading, yaw!)) <= b.headingTolerance;
  }

  /** ctx: { participant: { x, z, vx, vz, yaw }, mode, rules: ParticipantRules }. */
  update(dt: number, ctx: Context) {
    this.time += dt;
    const q = ctx.participant;
    if (!q) return;
    this.respondToRedEntry(ctx);
    for (const inst of this.active) this.observe(inst, q);
    this.clock += dt;
    if (this.clock < EVALUATION_INTERVAL) return;
    this.clock = 0;
    for (const inst of [...this.active]) this.advance(inst, q);
    this.restoreSlots(q);
    this.consider(ctx);
  }

  /** One response per new red entry, independent of the earlier encounter lottery. */
  respondToRedEntry({ participant: q, rules }: Pick<Context, 'participant' | 'rules'>) {
    const config = this.world.redEntryResponse;
    if (!config) return;
    const entries = rules?.redEntries ?? 0;
    if (entries > this.redEntries) {
      this.redEntries = entries;
      if (this.time >= this.nextRedResponse && this.traffic.signalCycle.state.walk !== 'green') {
        const heading = Math.atan2(q.vx ?? 0, q.vz ?? 0) * 180 / Math.PI;
        const flows: RedResponse['pending'] = [];
        for (const flow of this.world.flows) {
          if (!config.flows.includes(flow.id)) continue;
          const prepared = this.traffic.prepared(flow.route), at = projectOnPath(prepared.path, q.x, q.z);
          const pose = pathAt(prepared.path, at.s, this.point), turn = Math.abs(deltaYaw(heading, pose.yaw));
          if (at.distance <= 8 && turn >= 55 && turn <= 125) flows.push({ flow, prepared, at: at.s });
        }
        this.redResponse = { entry: entries, started: this.time, crossing: rules!.crossing, pending: flows, admitted: 0 };
        this.nextRedResponse = this.time + config.cooldownSeconds;
        this.log('red-entry-response', { entry: entries, x: round(q.x), z: round(q.z), flows: flows.map(f => f.flow.id) });
      }
    }
    const response = this.redResponse;
    if (!response) return;
    if (this.time - response.started > config.timeoutSeconds || rules!.crossing !== response.crossing
      || response.admitted >= config.maxVehicles) { this.redResponse = null; return; }
    for (let i = response.pending.length - 1; i >= 0; i--) {
      if (this.traffic.cars.length >= this.world.maxCars + config.maxVehicles) break;
      const candidate = response.pending[i], { flow, prepared } = candidate;
      for (let distance = Math.max(0, candidate.at - 6); distance >= Math.max(0, candidate.at - this.world.hidden.searchMeters); distance -= 2) {
        const p = pathAt(prepared.path, distance, this.point);
        if (this.world.noAdmission.some(a => pointInArea([p.x, p.z], a))) continue;
        if (!this.hidden(p, q) || !this.traffic.clearAt(flow.route, distance)) continue;
        const stop = prepared.signalStops.find(s => s.distance >= distance);
        const behavior = stop && this.traffic.signalCycle.state[stop.axis] === 'green' ? 'failure-to-yield' : 'red-light';
        const spec: DrivingSpec = { ...flow, accident: true, speedKmh: config.speedKmh, redEntry: response.entry,
          driver: { behavior, desiredSpeedKmh: config.speedKmh, reactionTimeSeconds: config.reactionTimeSeconds,
            maxBrakingMps2: config.maxBrakingMps2 } };
        // These deliberately hazardous drivers may approach a stop bar; normal admissions keep
        // their stop-line buffer. Lane geometry, hidden/clear admission and finite braking remain.
        const car = this.traffic.admit(spec, { distance, entryKmh: config.speedKmh });
        this.log('red-entry-car', { entry: response.entry, flow: flow.id, car: car.id, x: round(car.x), z: round(car.z),
          kmh: round(car.currentSpeed * 3.6), driver: driverRecord(car.driver) });
        response.pending.splice(i, 1); response.admitted++;
        break;
      }
      if (response.admitted >= config.maxVehicles) break;
    }
    if (!response.pending.length) this.redResponse = null;
  }

  consider({ participant: q, mode, rules }: Context) {
    const entering = new Map<string, Binding[]>();               // group → bindings newly eligible on this entry
    for (const b of this.world.events) {
      const st = this.state.get(b.id)!;
      if (st.phase === 'cooldown' && this.time >= st.until) st.phase = 'dormant';
      const inside = b.modes.includes(mode) && pointInArea([q.x, q.z], b.zone)
        && (b.requires !== 'wrongWay' || !!rules?.wrongWay) && this.approaching(b, q);
      const entered = inside && !st.inside;
      st.inside = inside;
      if (!entered || st.phase !== 'dormant' || this.groups.has(b.group)) continue;
      if (!entering.has(b.group)) entering.set(b.group, []);
      entering.get(b.group)!.push(b);
    }
    for (const [group, list] of entering) {
      // One encounter per conflict group: the least used eligible template, ties broken by the seed.
      const fewest = Math.min(...list.map(b => this.state.get(b.id)!.entries));
      const pool = list.filter(b => this.state.get(b.id)!.entries === fewest);
      const b = pool[Math.floor(this.random() * pool.length) % pool.length];
      const st = this.state.get(b.id)!;
      st.entries++;
      // Practice exposure rises with the participant's recent risky behaviour; never zero.
      const score = rules?.score ?? 0, chance = Math.min(1, b.chance + (1 - b.chance) * score), roll = this.random();
      if (roll >= chance) {
        this.log('encounter-skipped', { event: b.id, chance: round(chance), roll: round(roll), riskScore: round(score) });
        st.phase = 'cooldown'; st.until = this.time + Math.min(20, b.cooldown);
        continue;
      }
      const inst: EncounterInstance = { id: `${b.id}#${++this.serial}`, binding: b, start: this.time, pending: [...b.candidates],
        cars: [], minGap: Infinity, gapSpeed: 0, yielded: false, contact: false, behaviors: new Map() };
      this.active.push(inst);
      this.groups.set(group, inst);
      st.phase = 'active';
      this.log('encounter-start', { instance: inst.id, event: b.id, chance: round(chance), roll: round(roll), riskScore: round(score) });
    }
  }

  /** Admit pending cars (in order) and decide whether the encounter has finished. */
  advance(inst: EncounterInstance, q: Participant) {
    if (inst.pending.length) {
      const car = this.admit(inst, inst.pending[0], q);
      if (car) inst.pending.shift();
      else if (this.time - inst.start > ADMISSION_PATIENCE) inst.pending.length = 0;
    }
    if (inst.pending.length) return;
    const zone = inst.binding.zone, away = Math.hypot(q.x - zone.x, q.z - zone.z) - Math.hypot(zone.width, zone.depth) / 2;
    const done = inst.contact || !inst.cars.length || this.time - inst.start > ENCOUNTER_TIMEOUT
      || inst.cars.every(c => !c.alive || c.passed) || away > 60;
    if (done) this.finish(inst, inst.cars.length ? null : 'deferred');
  }

  admit(inst: EncounterInstance, candidate: Candidate, q: Participant) {
    const traffic = this.traffic, spec = candidate.spec, world = this.world;
    if (candidate.kind === 'slot') {
      const slot = this.slots.get(candidate.slot)!;
      if (!slot.occupied || !traffic.clearAt(spec.route, 0, 7)) return null;
      slot.occupied = false;
      return this.own(inst, traffic.admit(spec, { distance: 0, entryKmh: 0, owner: inst.id, paintSeed: slot.paintSeed }), 0);
    }
    const prepared = traffic.prepared(spec.route), path = prepared.path;
    const anchor = candidate.anchor === 'participant' ? q : candidate.anchor;
    let from = projectOnPath(path, anchor.x, anchor.z).s;
    if (candidate.anchor === 'participant') from -= world.hidden.nearMeters;
    // A following car of the same encounter joins behind the ones already on its route.
    for (const car of inst.cars) if (car.path === path) from = Math.min(from, car.distance - 12);
    const h = world.hidden, stops = prepared.signalStops, p = this.point;
    for (let s = Math.max(0, from); s >= Math.max(0, from - h.searchMeters); s -= 2) {
      pathAt(path, s, p);
      if (world.noAdmission.some(a => pointInArea([p.x, p.z], a))) continue;
      if (stops.some(stop => stop.distance > s && stop.distance <= s + h.stopLineMargin)) continue;
      if (!this.hidden(p, q) || !traffic.clearAt(spec.route, s)) continue;
      return this.own(inst, traffic.admit(spec, { distance: s, entryKmh: spec.speedKmh, owner: inst.id }), s);
      // the first (closest) hidden, clear point upstream of the encounter
    }
    return null;
  }

  own(inst: EncounterInstance, car: TrafficCar, distance: number) {
    inst.cars.push(car);
    this.log('car-admitted', { instance: inst.id, car: car.id, distance: round(distance), x: round(car.x), z: round(car.z),
      kmh: round(car.currentSpeed * 3.6), body: car.body, driver: driverRecord(car.driver) });
    return car;
  }

  observe(inst: EncounterInstance, q: Participant) {
    for (const car of inst.cars) {
      if (!car.alive) continue;
      const gap = bodyGap(car, q.x, q.z);
      if (gap < inst.minGap) { inst.minGap = gap; inst.gapSpeed = car.currentSpeed; car.closest = gap; }
      else if (gap > (car.closest ?? Infinity) + 15) car.passed = true;
      const d = car.driver;
      if (d.reason === 'participant' || ['braking', 'emergency-braking', 'waiting'].includes(d.state) && Number.isFinite(d.hazardDistance))
        inst.yielded = true;
      if (inst.behaviors.get(car.id) !== d.behavior) {
        if (inst.behaviors.has(car.id) || d.behavior !== 'pending')
          this.log('driver-resolved', { instance: inst.id, car: car.id, behavior: d.behavior, probability: d.decisionProbability });
        inst.behaviors.set(car.id, d.behavior);
      }
    }
  }

  /** Physical contact reported by the session; returns the encounter that owned the car, if any. */
  onContact(car: TrafficCar) {
    const inst = this.active.find(i => i.id === car.owner);
    if (!inst) return null;
    inst.contact = true;
    this.finish(inst, 'contact');
    return inst;
  }

  finish(inst: EncounterInstance, forced?: EncounterOutcome | null) {
    const b = inst.binding;
    const outcome = forced ?? (inst.contact ? 'contact'
      : inst.minGap < NEAR_MISS_GAP && inst.gapSpeed > NEAR_MISS_SPEED ? 'near-miss'
      : inst.yielded ? 'yielded' : 'passed');
    this.active.splice(this.active.indexOf(inst), 1);
    if (this.groups.get(b.group) === inst) this.groups.delete(b.group);
    const st = this.state.get(b.id)!;
    st.phase = 'cooldown'; st.until = this.time + (outcome === 'deferred' ? Math.min(20, b.cooldown) : b.cooldown);
    for (const car of inst.cars) car.owner = null;          // the cars drive on as ordinary traffic
    const record = { instance: inst.id, event: b.id, outcome, time: round(this.time), duration: round(this.time - inst.start),
      minGap: Number.isFinite(inst.minGap) ? round(inst.minGap) : null, cars: inst.cars.map(c => c.id),
      behaviors: inst.cars.map(c => c.driver.behavior), violations: inst.cars.map(c => c.violation) };
    this.outcomes.push(record);
    this.log('encounter-end', record);
    this.onOutcome(record, b);
  }

  /** A parked car returns to its slot only when the slot is free and out of sight. */
  restoreSlots(q: Participant) {
    for (const slot of this.slots.values()) {
      if (slot.occupied || this.active.some(i => i.binding.candidates.some(c => c.slot === slot.id))) continue;
      if (this.traffic.cars.some(c => Math.hypot(c.x - slot.x, c.z - slot.z) < 7)) continue;
      if (this.hidden(slot, q)) slot.occupied = true;
    }
  }

  summary() {
    const counts: Partial<Record<EncounterOutcome, number>> = {};
    for (const o of this.outcomes) counts[o.outcome] = (counts[o.outcome] ?? 0) + 1;
    return { counts, outcomes: this.outcomes };
  }
}

const round = (v: number) => Number.isFinite(v) ? Math.round(v * 100) / 100 : v;
const driverRecord = (d: DriverState) => ({ reaction: round(d.reactionTimeSeconds), desiredKmh: round(d.desiredSpeedKmh),
  braking: round(d.maxBrakingMps2), behavior: d.behavior });
