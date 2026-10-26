import type {Point, VehicleSpec, BodyId, DrivingSpec} from '../../types/scenario.ts';
import type {RandomSource, DriverReason, PathPoint, PathPose, Crossing, PreparedRoute, DeparturePlan, Participant, TrafficCar, TrafficScenario} from '../../types/simulation.ts';
// Autonomous traffic in Unity metres. Routes describe lane geometry; each driver's state decides
// speed. Departures never depend on the participant's position, goal, or predicted arrival time.
import { START_TRIGGER, isRepeating } from '../core/scenario.ts';
import { SignalCycle, junctionStops } from './SignalCycle.ts';
import { createDriver, safeSpeed, chooseDriverBehavior } from './driver.ts';
import { ParticipantRules } from '../events/ParticipantRules.ts';

/** Route/path intersection used only for event inspection, never for vehicle control. */
export function meetPoint(route: Point[], spawn: Point, goal: Point): Crossing {
  const len = Math.hypot(goal.x - spawn.x, goal.z - spawn.z) || 1;
  const dir = { x: (goal.x - spawn.x) / len, z: (goal.z - spawn.z) / len };
  let best: Omit<Crossing, 'dir'> | null = null, travelled = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i], seg = Math.hypot(b.x - a.x, b.z - a.z);
    for (let k = 0; k <= Math.ceil(seg / 0.2); k++) {
      const f = Math.min(1, k * 0.2 / (seg || 1)), x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f;
      const s = (x - spawn.x) * dir.x + (z - spawn.z) * dir.z, off = Math.abs((x - spawn.x) * dir.z - (z - spawn.z) * dir.x);
      const score = off + (s < -1 || s > len + 1 ? 100 : 0);
      if (!best || score < best.score - 1e-6) best = { score, distance: travelled + f * seg, x, z, s };
      if (off < 0.15 && s >= -1 && s <= len + 1) return { ...best!, dir };
    }
    travelled += seg;
  }
  return { ...best!, dir };
}

// ------------------------------------------------------------------ turning like a car
// A route is a polyline: its corners are rounded into arcs (radius up to TURN_RADIUS, never more
// than ~half of the neighbouring segments) so that the heading changes continuously. The car's
// rear and front axles both run on that path; the body points from the rear axle to the front one
// (it swings into a turn behind its front wheels), and the front wheels steer along the path at
// the front axle (they turn in before the body follows).
export const TURN_RADIUS = 12;
export const WHEELBASE: Record<string, number> = { sedan: 2.7, 'kei-tall': 2.52, 'kei-hatch': 2.52 };
export const MAX_STEER = 38;                 // degrees

/** Remove sub-30 cm polyline noise before rounding; endpoints and genuine bends stay put. */
function routeKnots(route: Point[]): Point[] {
  const pts = route.filter((p, i) => i === 0 || Math.hypot(p.x - route[i - 1].x, p.z - route[i - 1].z) > 1e-6);
  const keep = new Set([0, pts.length - 1]);
  function split(first: number, last: number) {
    const a = pts[first], b = pts[last], dx = b.x - a.x, dz = b.z - a.z;
    const length2 = dx * dx + dz * dz;
    let farthest = -1, maxDistance2 = 0.3 * 0.3;
    for (let i = first + 1; i < last; i++) {
      const p = pts[i], before = pts[i - 1], after = pts[i + 1];
      // A route that turns back on itself is deliberate, even if all its points are collinear.
      if ((p.x - before.x) * (after.x - p.x) + (p.z - before.z) * (after.z - p.z) < -1e-6) { farthest = i; break; }
      const t = length2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / length2)) : 0;
      const distance2 = (p.x - a.x - t * dx) ** 2 + (p.z - a.z - t * dz) ** 2;
      if (distance2 > maxDistance2) { maxDistance2 = distance2; farthest = i; }
    }
    if (farthest < 0) return;
    keep.add(farthest);
    split(first, farthest);
    split(farthest, last);
  }
  if (pts.length > 2) split(0, pts.length - 1);
  return pts.filter((_, i) => keep.has(i));
}

/** The route with rounded corners, as a dense polyline with cumulative distances (s). */
export function smoothRoute(route: Point[]): PathPoint[] {
  const pts = routeKnots(route);
  const out: (Point & {s?: number})[] = [{ x: pts[0].x, z: pts[0].z }];
  const seg = (i: number) => Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const ux = (b.x - a.x) / seg(i - 1), uz = (b.z - a.z) / seg(i - 1);
    const vx = (c.x - b.x) / seg(i), vz = (c.z - b.z) / seg(i);
    const turn = Math.acos(Math.max(-1, Math.min(1, ux * vx + uz * vz)));
    if (turn < 0.02) { out.push({ x: b.x, z: b.z }); continue; }
    const t = Math.min(TURN_RADIUS * Math.tan(turn / 2), 0.45 * seg(i - 1), 0.45 * seg(i));
    const r = t / Math.tan(turn / 2);
    const p0 = { x: b.x - ux * t, z: b.z - uz * t };
    const side = Math.sign(ux * vz - uz * vx);              // centre on the inside of the turn
    const cx = p0.x - uz * r * side, cz = p0.z + ux * r * side;
    const a0 = Math.atan2(p0.x - cx, p0.z - cz);
    const steps = Math.max(2, Math.ceil(turn * r / 0.4));
    for (let k = 0; k <= steps; k++) {
      const ang = a0 - side * turn * k / steps;
      out.push({ x: cx + r * Math.sin(ang), z: cz + r * Math.cos(ang) });
    }
  }
  out.push({ x: pts.at(-1)!.x, z: pts.at(-1)!.z });
  let total = 0;
  out.forEach((p, i) => { if (i) total += Math.hypot(p.x - out[i - 1].x, p.z - out[i - 1].z); p.s = total; });
  return out as PathPoint[];
}

/** Point and heading at distance d along a smoothed path; beyond either end it goes on straight. */
export function pathAt<T extends Partial<PathPose>>(path: PathPoint[], d: number, out: T = {} as T): T & PathPose {
  let lo = 0, hi = path.length - 1;
  if (d <= 0 || d >= path[hi].s) {
    const a = d <= 0 ? path[0] : path[hi - 1], b = d <= 0 ? path[1] : path[hi];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1, ux = (b.x - a.x) / l, uz = (b.z - a.z) / l;
    const from = d <= 0 ? path[0] : path[hi], extra = d <= 0 ? d : d - path[hi].s;
    out.x = from.x + ux * extra; out.z = from.z + uz * extra; out.yaw = Math.atan2(ux, uz) * 180 / Math.PI;
    return out as T & PathPose;
  }
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (path[mid].s <= d) lo = mid; else hi = mid; }
  const a = path[lo], b = path[hi], f = (d - a.s) / Math.max(1e-9, b.s - a.s);
  out.x = a.x + (b.x - a.x) * f; out.z = a.z + (b.z - a.z) * f; out.yaw = Math.atan2(b.x - a.x, b.z - a.z) * 180 / Math.PI;
  return out as typeof out & PathPose;
}

const rearPoint: Partial<PathPose> = {}, frontPoint: Partial<PathPose> = {}, nextPoint: Partial<PathPose> = {}, centrePoint: Partial<PathPose> = {};

/**
 * Where a car with its centre at distance d stands: centre between the axles, heading from rear
 * to front axle, front-wheel steer angle (degrees, + = to the right). The steer is atan(L / R) for
 * the path's radius R around the front axle (the bicycle model), averaged over one wheelbase so
 * the wheels turn in smoothly as the front axle nears a bend and straighten as it leaves it.
 */
export function carPose<T extends Partial<PathPose>>(path: PathPoint[], d: number, wheelbase: number, out: T = {} as T): T & Required<PathPose> {
  const rear = pathAt(path, d - wheelbase / 2, rearPoint), front = pathAt(path, d + wheelbase / 2, frontPoint);
  const yaw = Math.atan2(front.x - rear.x, front.z - rear.z) * 180 / Math.PI;
  const turn = ((pathAt(path, d + wheelbase, nextPoint).yaw - pathAt(path, d, centrePoint).yaw + 540) % 360) - 180;   // over L, centred on the front axle
  const steer = Math.max(-MAX_STEER, Math.min(MAX_STEER, Math.atan(turn * Math.PI / 180) * 180 / Math.PI));
  out.x = (rear.x + front.x) / 2; out.z = (rear.z + front.z) / 2; out.yaw = yaw; out.steer = steer;
  return out as typeof out & Required<PathPose>;
}

/** Outer size (width, height, length) per body; the web sedan stands in for the Unity prefabs' car. */
export const BODY_SIZE: Record<string, number[]> = {
  sedan: [1.76, 1.45, 4.6],
  'kei-tall': [1.475, 1.79, 3.395],
  'kei-hatch': [1.475, 1.525, 3.395],
};
export const KEI_TRAFFIC_SHARE = { 'kei-tall': 0.25, 'kei-hatch': 0.15 };
export const PLAYER_RADIUS = 0.3;

/** Seeded random (mulberry32): the same seed gives the same traffic. */
export function makeRandom(seed: number): RandomSource {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Traffic {
  declare scenario: TrafficScenario;
  declare random: RandomSource; declare driverRandom: RandomSource; declare hazardRandom: RandomSource;
  declare builtInMix: boolean; declare canSee: ((car: TrafficCar, point: Participant) => boolean) | null;
  declare maxCars: number; declare visibility: number; declare grip: number;
  declare nextId: number; declare time: number; declare frozen: boolean;
  declare signalCycle: SignalCycle; declare participantRules: ParticipantRules;
  declare cars: TrafficCar[];
  declare plans: DeparturePlan[];
  declare paths: WeakMap<Point[], PreparedRoute>;
  declare triggerTime: number | null;
  declare participant: Participant | null;
  constructor(scenario: TrafficScenario, { seed = 1, builtInMix = false, canSee = null, maxCars = Infinity }: {seed?: number; builtInMix?: boolean; canSee?: ((car: TrafficCar, point: Participant) => boolean) | null; maxCars?: number} = {}) {
    this.scenario = scenario;
    this.random = makeRandom(seed);
    this.driverRandom = makeRandom(seed ^ 0x9e3779b9);
    this.hazardRandom = makeRandom(seed ^ 0x85ebca6b);
    this.builtInMix = builtInMix;
    this.canSee = canSee;
    this.maxCars = maxCars;               // repeating departures wait while this many cars are on the road
    this.paths = new WeakMap();           // route array → { path, signalStops }, shared by admissions
    this.visibility = Math.max(5, Math.min(150, scenario.environment?.visibilityMeters ?? 80));
    this.grip = Math.max(0.2, Math.min(1, scenario.environment?.roadGrip ?? 1));
    this.cars = [];
    this.nextId = 1;
    this.time = 0;
    this.triggerTime = null;
    this.frozen = false;
    this.signalCycle = new SignalCycle();
    this.plans = scenario.vehicles
      .map((v, index) => ({ v, index, next: v.start === START_TRIGGER ? null : v.delaySeconds, done: false }))
      .filter(p => p.v.route && p.v.route.length >= 2) as DeparturePlan[];
    for (const p of this.plans) {
      Object.assign(p, this.prepared(p.v.route));
      p.crossing = scenario.spawn && scenario.goal ? meetPoint(p.path, scenario.spawn, scenario.goal) : null;
    }
    this.participantRules = new ParticipantRules(this.plans.map(p => p.path), scenario.playerMode, scenario.hazardPolicy);
    this.participant = null;
  }

  /** Smoothed path and stop lines of a route, computed once per route array. */
  prepared(route: Point[]): PreparedRoute {
    let p = this.paths.get(route);
    if (!p) {
      const path = smoothRoute(route);
      p = { path, signalStops: junctionStops(path) };
      this.paths.set(route, p);
    }
    return p;
  }

  /** Legacy custom-file scheduling only; built-ins use independent departure clocks. */
  trigger() {
    if (this.triggerTime != null) return;
    this.triggerTime = this.time;
    for (const p of this.plans) {
      if (p.v.start === START_TRIGGER && p.next == null && !p.done) p.next = this.time + p.v.delaySeconds;
      if (p.v.stopOnTrigger && isRepeating(p.v)) p.stopAfter = this.time;
    }
  }

  bodyFor(v: DrivingSpec): BodyId {
    if (!this.builtInMix) return (v.body || 'sedan') as BodyId;
    if (v.accident) return 'sedan';
    let roll = this.random();
    for (const [id, share] of Object.entries(KEI_TRAFFIC_SHARE)) {
      if (roll < share) return id as BodyId;
      roll -= share;
    }
    return 'sedan';
  }

  /** Participant velocity is used for perception, never to schedule or redirect traffic. */
  step(dt: number, participant: Participant | null = null) {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    if (dt > 1 / 30 + 1e-9) {
      const n = Math.ceil(dt * 30);
      for (let i = 0; i < n; i++) this.step(dt / n, participant);
      return;
    }
    if (this.frozen) {
      for (const car of this.cars) if (car.spec.noStop) this.move(car, dt);
      this.removeDead();
      return;
    }
    this.participant = participant;
    this.time += dt;
    this.signalCycle.at(this.time);
    this.participantRules.step(dt, participant, this.signalCycle.state);
    for (const p of this.plans) {
      while (!p.done && p.next != null && p.next <= this.time) {
        if (p.stopAfter != null && p.next > p.stopAfter) { p.done = true; break; }
        if (this.blocked(p.v) || this.cars.length >= this.maxCars) { p.next = this.time + dt; break; }
        this.spawn(p, p.next);
        if (isRepeating(p.v)) {
          const { repeatMinSeconds: lo, repeatMaxSeconds: hi } = p.v;
          p.next += lo + (hi - lo) * this.random();
        } else p.done = true;
      }
    }
    // Every decision sees the same traffic snapshot, before any car integrates its motion.
    for (const car of this.cars) this.decide(car, Math.max(0, Math.min(dt, this.time - car.born)));
    for (const car of this.cars) this.move(car, Math.max(0, Math.min(dt, this.time - car.born)));
    this.removeDead();
  }

  removeDead() {
    let count = 0;
    for (let i = 0; i < this.cars.length; i++) if (this.cars[i].alive) this.cars[count++] = this.cars[i];
    this.cars.length = count;
  }

  blocked(v: VehicleSpec) {
    const start = v.route[0];
    return this.cars.some(c => Math.hypot(c.x - start.x, c.z - start.z) < c.size[2] + 2);
  }

  spawn(plan: DeparturePlan, at: number) {
    return this.place(plan.v, plan, at, 0, plan.index);
  }

  /**
   * Admit one car of `spec` (a vehicle definition) on its route at `distance` metres, already moving
   * at `entryKmh` (default: the route's entry speed). Used by the open-world ScenarioManager: the
   * caller chooses a hidden, clear admission point; nothing here aims the car at the participant.
   */
  admit(spec: DrivingSpec, { distance = 0, entryKmh = spec.entrySpeedKmh, owner = null, paintSeed = null }: {distance?: number; entryKmh?: number | null; owner?: string | null; paintSeed?: number | null} = {}) {
    const car = this.place(spec, this.prepared(spec.route), this.time, distance, -1, entryKmh);
    car.owner = owner; car.paintSeed = paintSeed;
    // stop lines already behind the admission point do not apply
    while (car.signalStops[car.nextSignal] && car.signalStops[car.nextSignal].distance < distance) car.nextSignal++;
    return car;
  }

  /** No car body within `gap` metres of the pose at `distance` along the route (admission spacing). */
  clearAt(route: Point[], distance: number, gap = 9) {
    const p = pathAt(this.prepared(route).path, distance, {});
    return !this.cars.some(c => Math.hypot(c.x - p.x, c.z - p.z) < gap);
  }

  place(v: DrivingSpec, prepared: PreparedRoute, at: number, distance: number, index: number, entryKmh = v.entrySpeedKmh): TrafficCar {
    const body = this.bodyFor(v), driver = createDriver(v, this.driverRandom, this.hazardRandom);
    const wheelbase = WHEELBASE[body] ?? WHEELBASE.sedan;
    const start = carPose(prepared.path, distance, wheelbase);
    const speed = Math.min(v.speedKmh, driver.desiredSpeedKmh) / 3.6;
    const car: TrafficCar = {
      id: this.nextId++, vehicle: index, spec: v, name: v.name, accident: !!v.accident, body, driver,
      size: BODY_SIZE[body] ?? BODY_SIZE.sedan, born: at, speed, path: prepared.path, wheelbase,
      x: start.x, z: start.z, yaw: v.overrideYaw && !distance ? v.yaw! : start.yaw, steer: start.steer,
      currentSpeed: Math.min(speed, (entryKmh ?? 0) / 3.6), alive: true, distance,
      violation: null,
      signalStops: prepared.signalStops, nextSignal: 0, signalCommitted: false, yellowChecked: false,
      crossing: prepared.crossing && prepared.crossing.score <= 1.5 ? prepared.crossing : null, probe: {} as PathPose,
    };
    this.cars.push(car);
    return car;
  }

  /** Visibility is bounded by weather, static obstacles and intervening traffic bodies. */
  sees(car: TrafficCar, q: Participant) {
    const dx = q.x - car.x, dz = q.z - car.z, distance = Math.hypot(dx, dz);
    if (distance > this.visibility || this.canSee && !this.canSee(car, q)) return false;
    for (const other of this.cars) {
      if (other === car || other === q || !other.alive) continue;
      const a = other.yaw * Math.PI / 180, s = Math.sin(a), c = Math.cos(a);
      const ox = car.x - other.x, oz = car.z - other.z;
      const x = ox * c - oz * s, z = ox * s + oz * c;
      const vx = dx * c - dz * s, vz = dx * s + dz * c;
      let lo = 0.05, hi = 0.95;
      for (let axis = 0; axis < 2; axis++) {
        const v = axis ? vz : vx, p = axis ? z : x, h = other.size[axis ? 2 : 0] / 2;
        if (Math.abs(v) < 1e-9) { if (Math.abs(p) > h) hi = -1; }
        else { const t0 = (-h - p) / v, t1 = (h - p) / v; lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1)); }
      }
      if (lo <= hi) return false;
    }
    return true;
  }

  decide(car: TrafficCar, dt: number) {
    const d = car.driver, braking = d.maxBrakingMps2 * this.grip;
    // Resolve the saved draw at the first real traffic decision, or after eight seconds on the road.
    // Once resolved, later player actions cannot transform or retarget this driver.
    if (d.behavior === 'pending') {
      const q = this.participant, stop = car.signalStops[car.nextSignal];
      const range = Math.max(15, car.currentSpeed * 3);
      if (this.time - car.born >= 8 || stop && stop.distance - car.distance < range
        || q && Math.hypot(q.x - car.x, q.z - car.z) < range) {
        d.decisionProbability = this.participantRules.probability;
        d.behavior = chooseDriverBehavior(d.decisionProbability!, d.behaviorRoll, d.behaviorKind);
      }
    }
    car.speed = Math.min(d.behavior === 'speeding' ? 80 : car.spec.speedKmh,
      d.desiredSpeedKmh * (d.behavior === 'speeding' ? 1.35 : 1)) / 3.6;
    if (d.behavior === 'speeding' && car.currentSpeed > car.spec.speedKmh / 3.6 + 0.1)
      car.violation = 'speeding';
    let target = car.speed; let reason: DriverReason = null;
    // Anticipate curvature along the lane, slowing before the body reaches a bend.
    const horizon = Math.min(45, car.currentSpeed ** 2 / (2 * braking) + car.currentSpeed * 2 + 8);
    for (let ahead = 0; ahead <= horizon; ahead += 2) {
      const p = pathAt(car.path, car.distance + ahead, car.probe), yaw = p.yaw;
      pathAt(car.path, car.distance + ahead + 3, p);
      const curvature = Math.abs(((p.yaw - yaw + 540) % 360) - 180) * Math.PI / 540;
      if (curvature < 0.001) continue;
      const cornerSpeed = Math.sqrt(2 * this.grip / curvature);
      const limit = safeSpeed(ahead, braking * 0.6, 0, cornerSpeed);
      if (limit < target) { target = limit; reason = 'turn'; }
    }
    let stop = car.signalStops[car.nextSignal];
    const front = car.size[2] / 2 + 0.45;
    if (stop && d.behavior === 'red-light' && car.distance + car.size[2] / 2 >= stop.distance
      && this.signalCycle.state[stop.axis] === 'red') car.violation = 'red-light';
    while (stop && car.distance > stop.distance - car.size[2] / 2 + 0.05) {
      car.nextSignal++; car.signalCommitted = false; car.yellowChecked = false;
      stop = car.signalStops[car.nextSignal];
    }
    if (stop && car.signalCommitted && car.currentSpeed < 0.05) car.signalCommitted = false;
    if (stop && !car.signalCommitted && d.behavior !== 'red-light') {
      const colour = this.signalCycle.state[stop.axis], remaining = stop.distance - front - car.distance;
      if (colour !== 'yellow') car.yellowChecked = false;
      if (colour === 'yellow' && !car.yellowChecked) {
        car.yellowChecked = true;
        car.signalCommitted = remaining < car.currentSpeed ** 2 / (2 * braking) + car.currentSpeed * d.reactionTimeSeconds;
      }
      if (colour !== 'green' && !car.signalCommitted) {
        const limit = safeSpeed(remaining - 0.2, braking * 0.55);
        if (limit < target) { target = limit; reason = 'signal'; }
      }
    }
    const a = car.yaw * Math.PI / 180, fx = Math.sin(a), fz = Math.cos(a);
    for (const other of this.cars) {
      if (other === car || !other.alive) continue;
      const dx = other.x - car.x, dz = other.z - car.z, along = dx * fx + dz * fz;
      if (along <= 0 || along > this.visibility) continue;
      const turn = Math.abs(((other.yaw - car.yaw + 540) % 360) - 180);
      if (turn < 40 && Math.abs(dx * fz - dz * fx) < (car.size[0] + other.size[0]) / 2 + 0.2) {
        const gap = along - (car.size[2] + other.size[2]) / 2;
        const limit = safeSpeed(gap - 2.2, braking * 0.65, d.timeHeadwaySeconds, other.currentSpeed);
        if (limit < target) { target = limit; reason = 'traffic'; }
      } else if (turn > 40 && turn < 140 && other.currentSpeed > 0.3) {
        // Gap acceptance at intersecting lanes: earlier arrivals go first; id breaks equal arrivals.
        const b = other.yaw * Math.PI / 180, ox = Math.sin(b), oz = Math.cos(b);
        const cross = fx * oz - fz * ox;
        if (Math.abs(cross) < 0.1) continue;
        const ours = (dx * oz - dz * ox) / cross, theirs = (dx * fz - dz * fx) / cross;
        const ourTime = ours / Math.max(car.currentSpeed, 1), theirTime = theirs / other.currentSpeed;
        if (ours < 0 || theirs < -other.size[2] || ourTime > 5 || theirTime > 5
          || Math.abs(ourTime - theirTime) > 1.8 || !this.sees(car, other)) continue;
        if (theirTime > ourTime + 0.4 || Math.abs(theirTime - ourTime) <= 0.4 && other.id > car.id) continue;
        const limit = safeSpeed(ours - front - other.size[0] / 2 - 1, braking * 0.65);
        if (d.behavior === 'failure-to-yield') { if (limit < target) car.violation = 'failure-to-yield'; continue; }
        if (limit < target) { target = limit; reason = 'junction'; }
      }
    }
    // Predict a conflict with the actual participant velocity along the upcoming curved lane.
    // This does not inspect spawn/goal/trigger, or modify the route to create a collision.
    const q = this.participant;
    let hazard = Infinity;
    if (q && this.sees(car, q)) {
      const speed = Math.max(car.currentSpeed, 1), look = Math.min(this.visibility, speed * (d.reactionTimeSeconds + 4) + front);
      const radius = car.size[0] / 2 + PLAYER_RADIUS + 0.25;
      for (let ahead = 0; ahead <= look; ahead += 0.75) {
        const p = pathAt(car.path, car.distance + ahead, car.probe);
        const time = Math.min(4, Math.max(0, (ahead - car.size[2] / 2) / speed));
        const px = q.x + (q.vx ?? 0) * time, pz = q.z + (q.vz ?? 0) * time;
        if (Math.hypot(px - p.x, pz - p.z) <= radius) { hazard = Math.max(0, ahead - front - PLAYER_RADIUS); break; }
      }
    }
    if (Number.isFinite(hazard)) {
      d.hazardSeconds += dt; d.clearSeconds = 0; d.hazardDistance = car.distance + hazard;
    } else if (Number.isFinite(d.hazardDistance)) {
      d.hazardSeconds += dt; d.clearSeconds += dt;
      if (d.clearSeconds > 0.6) { d.hazardDistance = Infinity; d.hazardSeconds = 0; }
    }
    if (Number.isFinite(d.hazardDistance)) {
      const reaction = d.reactionTimeSeconds + (d.behavior === 'failure-to-yield' ? 1.5 : 0);
      if (d.behavior === 'failure-to-yield' && d.hazardSeconds >= d.reactionTimeSeconds
        && car.currentSpeed > safeSpeed(d.hazardDistance - car.distance - 0.3, braking * 0.65)) car.violation = 'failure-to-yield';
      if (d.hazardSeconds + 1e-9 < reaction) d.state = 'reacting';
      else {
        const remaining = d.hazardDistance - car.distance;
        const limit = safeSpeed(remaining - 0.3, braking * 0.65);
        if (limit < target) { target = limit; reason = 'participant'; }
        d.state = car.currentSpeed < 0.05 ? 'waiting' : remaining < car.currentSpeed ** 2 / (2 * braking * 0.65) ? 'emergency-braking' : 'braking';
      }
    } else d.state = car.currentSpeed < 0.05 && target < 0.05 ? 'waiting'
      : reason === 'traffic' ? 'following' : reason === 'signal' || reason === 'junction' ? 'yielding'
      : target < car.currentSpeed - 0.1 ? 'braking' : 'cruising';
    d.reason = reason;
    d.targetSpeed = target;
    const change = (target - car.currentSpeed) / Math.max(dt, 1e-9);
    d.acceleration = Math.max(-braking, Math.min(d.accelerationMps2, change));
  }

  /** Integrate bounded acceleration. No position clamp can conceal insufficient stopping distance. */
  move(car: TrafficCar, dt: number) {
    const before = car.currentSpeed, acceleration = this.frozen ? 0 : car.driver.acceleration;
    const duration = acceleration < 0 ? Math.min(dt, before / -acceleration) : dt;
    car.currentSpeed = Math.max(0, before + acceleration * duration);
    car.distance += before * duration + acceleration * duration * duration / 2;
    if (car.distance > car.path.at(-1)!.s) { car.alive = false; return; }
    if (car.distance > 0.01) carPose(car.path, car.distance, car.wheelbase, car);
    if (car.swerve) {
      car.lateral = Math.min(1.8, car.lateral! + 3 * dt);
      const a = car.yaw * Math.PI / 180;
      car.x += Math.cos(a) * car.lateral * car.swerve; car.z -= Math.sin(a) * car.lateral * car.swerve;
    }
  }

  /** Freeze all traffic (contact). A noStop car swerves away from the participant and drives on. */
  freeze() {
    this.frozen = true;
    const q = this.participant;
    for (const car of this.cars) {
      if (!car.spec.noStop || !q) continue;
      const a = car.yaw * Math.PI / 180, right = (q.x - car.x) * Math.cos(a) - (q.z - car.z) * Math.sin(a);
      car.swerve = right > 0 ? -1 : 1;                 // away from the side the participant is on
      car.lateral = 0;
    }
  }

  /** The car whose body touches a participant of radius r standing at (x, z), or null. */
  hit(x: number, z: number, r = PLAYER_RADIUS) {
    for (const car of this.cars) {
      if (car.currentSpeed < 0.1) continue; // stopped cars block movement through Obstacles
      const a = car.yaw * Math.PI / 180;
      const dx = x - car.x, dz = z - car.z;
      // into the car's frame: local +z = heading (sin a, cos a), local +x = (cos a, -sin a)
      const lx = dx * Math.cos(a) - dz * Math.sin(a);
      const lz = dx * Math.sin(a) + dz * Math.cos(a);
      if (Math.abs(lx) <= car.size[0] / 2 + r && Math.abs(lz) <= car.size[2] / 2 + r) return car;
    }
    return null;
  }
}
