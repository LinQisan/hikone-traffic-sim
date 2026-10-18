// Vehicle schedule and motion of one scenario, in Unity world coordinates (x, z; yaw clockwise from
// above, 0 = +z). Pure logic: no three.js, so it runs under node:test.
//
// Mirrors the Unity side as far as the scenario file describes it: each vehicle appears at route[0]
// (after delaySeconds from the start, or from entering the trigger), accelerates at 8 m/s² to its
// cruise speed (scenario.js distanceAt, the same model as the web editor's timing), drives the route
// and disappears at its end. Repeating vehicles appear again every repeatMin..repeatMax seconds and
// stop when the trigger fires if stopOnTrigger. Everything freezes at contact.
// Not modelled (as in the file format): the code-only behaviours of built-in 06-08, signals, car
// following.
//
// Web event timing (optional vehicle fields; the Unity app ignores them):
//   launch: "meet"      the car leaves (or appears) when a participant going on towards the goal at
//                       the app's normal pace would reach the point where its route crosses their
//                       path at the same moment as the car. It then drives its route at cruise speed:
//                       whoever goes on without looking meets it; whoever slows down or stops sees it
//                       cross in front of them (it never adapts to chase anyone). Launches only while
//                       the participant moves towards the goal, once its start condition is met.
//   meetOffsetSeconds   arrive this much later (+) or earlier (−) than the participant (−1.6: the car
//                       that passes just before them)
//   entrySpeedKmh       appears already moving (traffic coming round a corner), not from standstill
//   hold: true          stands at route[0] from its start time (waiting at a junction) until launch
//   noStop: true        after contact this car does not stop with the rest of the traffic: it drives
//                       on (the replay shows it leaving)
//   launchAfterTriggerSeconds  goes anyway this long after the participant entered the trigger area
//                       (someone who waits at the kerb then sees it pass instead of waiting forever)
//   holdMaxSeconds      a holding car goes anyway this long after it appeared (someone who waits for
//                       it at the kerb then sees it turn in front of them)
import { START_TRIGGER, isRepeating } from './shared/scenario.js';

const NORMAL_PACE = 2.4;      // m/s: walking and riding in the app (player.js MOVE_SPEED)

/** Seconds to cover d metres, entering at v0 and accelerating at 8 m/s² to the cruise speed. */
export function travelTime(d, v0, cruise) {
  if (v0 >= cruise) return d / cruise;
  const ta = (cruise - v0) / 8, da = (v0 + cruise) / 2 * ta;
  if (d <= da) return (-v0 + Math.sqrt(v0 * v0 + 16 * d)) / 8;
  return ta + (d - da) / cruise;
}

/**
 * Where a route crosses the participant's straight path spawn → goal: route distance, the point,
 * and how far along the path it lies. The first crossing along the route; else the closest point.
 */
export function meetPoint(route, spawn, goal) {
  const len = Math.hypot(goal.x - spawn.x, goal.z - spawn.z) || 1;
  const dir = { x: (goal.x - spawn.x) / len, z: (goal.z - spawn.z) / len };
  let best = null, travelled = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i], seg = Math.hypot(b.x - a.x, b.z - a.z);
    for (let k = 0; k <= Math.ceil(seg / 0.2); k++) {
      const f = Math.min(1, k * 0.2 / (seg || 1)), x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f;
      const s = (x - spawn.x) * dir.x + (z - spawn.z) * dir.z, off = Math.abs((x - spawn.x) * dir.z - (z - spawn.z) * dir.x);
      const score = off + (s < -1 || s > len + 1 ? 100 : 0);
      if (!best || score < best.score - 1e-6) best = { score, distance: travelled + f * seg, x, z, s };
      if (off < 0.15 && s >= -1 && s <= len + 1) return { ...best, dir };
    }
    travelled += seg;
  }
  return { ...best, dir };
}

// ------------------------------------------------------------------ turning like a car
// A route is a polyline: its corners are rounded into arcs (radius up to TURN_RADIUS, never more
// than ~half of the neighbouring segments) so that the heading changes continuously. The car's
// rear and front axles both run on that path; the body points from the rear axle to the front one
// (it swings into a turn behind its front wheels), and the front wheels steer along the path at
// the front axle (they turn in before the body follows).
export const TURN_RADIUS = 12;
export const WHEELBASE = { sedan: 2.7, 'kei-tall': 2.52, 'kei-hatch': 2.52 };
export const MAX_STEER = 38;                 // degrees

/** Remove sub-30 cm polyline noise before rounding; endpoints and genuine bends stay put. */
function routeKnots(route) {
  const pts = route.filter((p, i) => i === 0 || Math.hypot(p.x - route[i - 1].x, p.z - route[i - 1].z) > 1e-6);
  const keep = new Set([0, pts.length - 1]);
  function split(first, last) {
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
export function smoothRoute(route) {
  const pts = routeKnots(route);
  const out = [{ x: pts[0].x, z: pts[0].z }];
  const seg = i => Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
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
  out.push({ x: pts.at(-1).x, z: pts.at(-1).z });
  let total = 0;
  out.forEach((p, i) => { if (i) total += Math.hypot(p.x - out[i - 1].x, p.z - out[i - 1].z); p.s = total; });
  return out;
}

/** Point and heading at distance d along a smoothed path; beyond either end it goes on straight. */
export function pathAt(path, d, out = {}) {
  let lo = 0, hi = path.length - 1;
  if (d <= 0 || d >= path[hi].s) {
    const [a, b] = d <= 0 ? [path[0], path[1]] : [path[hi - 1], path[hi]];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1, ux = (b.x - a.x) / l, uz = (b.z - a.z) / l;
    const from = d <= 0 ? path[0] : path[hi], extra = d <= 0 ? d : d - path[hi].s;
    out.x = from.x + ux * extra; out.z = from.z + uz * extra; out.yaw = Math.atan2(ux, uz) * 180 / Math.PI;
    return out;
  }
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (path[mid].s <= d) lo = mid; else hi = mid; }
  const a = path[lo], b = path[hi], f = (d - a.s) / Math.max(1e-9, b.s - a.s);
  out.x = a.x + (b.x - a.x) * f; out.z = a.z + (b.z - a.z) * f; out.yaw = Math.atan2(b.x - a.x, b.z - a.z) * 180 / Math.PI;
  return out;
}

const rearPoint = {}, frontPoint = {}, nextPoint = {}, centrePoint = {};

/**
 * Where a car with its centre at distance d stands: centre between the axles, heading from rear
 * to front axle, front-wheel steer angle (degrees, + = to the right). The steer is atan(L / R) for
 * the path's radius R around the front axle (the bicycle model), averaged over one wheelbase so
 * the wheels turn in smoothly as the front axle nears a bend and straighten as it leaves it.
 */
export function carPose(path, d, wheelbase, out = {}) {
  const rear = pathAt(path, d - wheelbase / 2, rearPoint), front = pathAt(path, d + wheelbase / 2, frontPoint);
  const yaw = Math.atan2(front.x - rear.x, front.z - rear.z) * 180 / Math.PI;
  const turn = ((pathAt(path, d + wheelbase, nextPoint).yaw - pathAt(path, d, centrePoint).yaw + 540) % 360) - 180;   // over L, centred on the front axle
  const steer = Math.max(-MAX_STEER, Math.min(MAX_STEER, Math.atan(turn * Math.PI / 180) * 180 / Math.PI));
  out.x = (rear.x + front.x) / 2; out.z = (rear.z + front.z) / 2; out.yaw = yaw; out.steer = steer;
  return out;
}

/** Outer size (width, height, length) per body; the web sedan stands in for the Unity prefabs' car. */
export const BODY_SIZE = {
  sedan: [1.76, 1.45, 4.6],
  'kei-tall': [1.475, 1.79, 3.395],
  'kei-hatch': [1.475, 1.525, 3.395],
};
export const KEI_TRAFFIC_SHARE = { 'kei-tall': 0.25, 'kei-hatch': 0.15 };
export const PLAYER_RADIUS = 0.3;

/** Seeded random (mulberry32): the same seed gives the same traffic. */
export function makeRandom(seed) {
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
  /**
   * @param scenario a normalized scenario (scenario.js normalize)
   * @param options.builtInMix built-in scenario: ordinary traffic mixes kei cars in like Unity does
   *        (accident cars stay sedans); files use each vehicle's body
   */
  constructor(scenario, { seed = 1, builtInMix = false } = {}) {
    this.scenario = scenario;
    this.random = makeRandom(seed);
    this.builtInMix = builtInMix;
    this.cars = [];
    this.nextId = 1;
    this.time = 0;
    this.triggerTime = null;
    this.frozen = false;
    this.plans = scenario.vehicles
      .map((v, index) => ({ v, index, next: v.start === START_TRIGGER ? null : v.delaySeconds, done: false }))
      .filter(p => p.v.route && p.v.route.length >= 2);
    for (const p of this.plans) {
      p.path = smoothRoute(p.v.route);                       // what the cars actually drive
      if (p.v.launch === 'meet') p.meet = meetPoint(p.path, scenario.spawn, scenario.goal);
    }
    this.participant = null;
  }

  /** Where the participant is along their path to the goal and how fast they move towards it. */
  progress(meet) {
    const q = this.participant;
    if (!q) return null;
    const { spawn } = this.scenario;
    const s = (q.x - spawn.x) * meet.dir.x + (q.z - spawn.z) * meet.dir.z;
    const forward = (q.vx ?? 0) * meet.dir.x + (q.vz ?? 0) * meet.dir.z;
    return { remaining: meet.s - s, forward };
  }

  /** The participant entered the trigger area (first time only). */
  trigger() {
    if (this.triggerTime != null) return;
    this.triggerTime = this.time;
    for (const p of this.plans) {
      if (p.v.start === START_TRIGGER && p.next == null && !p.done) p.next = this.time + p.v.delaySeconds;
      if (p.v.stopOnTrigger && isRepeating(p.v)) p.stopAfter = this.time;
    }
  }

  bodyFor(v) {
    if (!this.builtInMix) return v.body || 'sedan';
    if (v.accident) return 'sedan';
    let roll = this.random();
    for (const [id, share] of Object.entries(KEI_TRAFFIC_SHARE)) {
      if (roll < share) return id;
      roll -= share;
    }
    return 'sedan';
  }

  /** `participant` {x, z, vx, vz}: Unity metres and m/s (needed by `launch: "meet"` vehicles). */
  step(dt, participant = null) {
    if (this.frozen) {
      // contact: everything stops except a car that does not (noStop), which drives on
      for (const car of this.cars) if (this.scenario.vehicles[car.vehicle].noStop) this.move(car, dt);
      this.removeDead();
      return;
    }
    if (dt > 1 / 30 + 1e-9) {                 // long steps (tests, tab switches): in small pieces
      const n = Math.ceil(dt * 30);
      for (let i = 0; i < n; i++) this.step(dt / n, participant);
      return;
    }
    this.time += dt;
    if (participant) this.participant = participant;
    for (const p of this.plans) {
      if (p.meet) { this.stepMeet(p); continue; }
      while (!p.done && p.next != null && p.next <= this.time) {
        if (p.stopAfter != null && p.next > p.stopAfter) { p.done = true; break; }
        // the spawn point is still occupied: appear a moment later, never inside another car
        if (this.blocked(p.v)) { p.next = this.time + dt; break; }
        this.spawn(p, p.next);
        if (isRepeating(p.v)) {
          const { repeatMinSeconds: lo, repeatMaxSeconds: hi } = p.v;
          p.next += lo + (hi - lo) * this.random();
        } else {
          p.done = true;
        }
      }
    }
    // a car born during this step drives only the part of the step since it appeared
    for (const car of this.cars) this.move(car, Math.max(0, Math.min(dt, this.time - car.born)));
    this.removeDead();
  }

  removeDead() {
    let count = 0;
    for (let i = 0; i < this.cars.length; i++) if (this.cars[i].alive) this.cars[count++] = this.cars[i];
    this.cars.length = count;
  }

  /** Is a car within a car length of this vehicle's first route point? */
  blocked(v) {
    const start = v.route[0];
    return this.cars.some(c => Math.hypot(c.x - start.x, c.z - start.z) < c.size[2] + 1.5);
  }

  /** A `launch: "meet"` vehicle: appear (hold), then launch when the participant's timing fits. */
  stepMeet(p) {
    if (p.done || p.next == null || p.next > this.time) return;
    const v = p.v, cruise = v.speedKmh / 3.6, entry = v.hold ? 0 : Math.min(cruise, (v.entrySpeedKmh ?? 0) / 3.6);
    if (v.hold && !p.car) { p.car = this.spawn(p, this.time, { speed0: 0, launched: false }); p.heldSince = this.time; }
    if (p.car && v.holdMaxSeconds > 0 && this.time - p.heldSince >= v.holdMaxSeconds) { this.launch(p); return; }
    const late = v.launchAfterTriggerSeconds != null && this.triggerTime != null && this.time >= this.triggerTime + v.launchAfterTriggerSeconds;
    if (late && p.car) { this.launch(p); return; }
    if (late && !this.blocked(v)) { this.spawn(p, this.time, { speed0: entry, launched: true }); this.launch(p, true); return; }
    const at = this.progress(p.meet);
    if (!at) return;
    if (at.remaining < -0.5) { p.done = true; return; }               // they are already across
    if (at.forward < 0.5) return;                                       // launch only on the way
    const wanted = at.remaining / NORMAL_PACE + (v.meetOffsetSeconds ?? 0);
    if (wanted > travelTime(p.meet.distance, entry, cruise)) return;
    // a car of the ordinary traffic already on its way across the same spot at about that time
    // takes the part (two cars must not share the lane), its speed trimmed a little
    const adopt = !v.hold && this.cars.find(c => {
      if (c.accident || c.meet || !c.crossing) return false;          // ordinary traffic only
      const left = c.crossing.distance - c.distance;
      return left > 0 && Math.hypot(c.crossing.x - p.meet.x, c.crossing.z - p.meet.z) < 2
        && Math.abs(left / Math.max(c.currentSpeed, 1) - wanted) < 1.6;
    });
    if (adopt) {
      const left = adopt.crossing.distance - adopt.distance;
      Object.assign(adopt, { accident: true, name: v.name, speed: Math.max(0.8 * adopt.speed, Math.min(1.2 * adopt.speed, left / Math.max(0.3, wanted))) });
    } else if (p.car) { this.launch(p); return; }
    else if (this.blocked(v)) return;                                   // wait for the spot to clear
    else this.spawn(p, this.time, { speed0: entry, launched: true });
    this.launch(p, true);
  }

  launch(p, launched = false) {
    if (p.car && !launched) p.car.launched = true;
    p.done = true;
    // the launch commits the participant: ordinary streams stop like on the trigger
    for (const other of this.plans) if (other.v.stopOnTrigger && isRepeating(other.v) && other.stopAfter == null) other.stopAfter = this.time;
  }

  spawn(plan, at, meet = null) {
    const v = plan.v;
    const body = this.bodyFor(v);
    const wheelbase = WHEELBASE[body] ?? WHEELBASE.sedan;
    const start = carPose(plan.path, 0, wheelbase);
    const car = {
      id: this.nextId++, vehicle: plan.index, name: v.name, accident: !!v.accident, body,
      size: BODY_SIZE[body] ?? BODY_SIZE.sedan, born: at, speed: v.speedKmh / 3.6, path: plan.path, wheelbase,
      x: start.x, z: start.z, yaw: v.overrideYaw && !meet ? v.yaw : start.yaw, steer: start.steer,
      currentSpeed: meet ? meet.speed0 : 0, launched: meet ? meet.launched : true, alive: true, distance: 0,
      // where this route crosses the participant's path (lets an accident launch adopt the car)
      crossing: plan.crossing ??= meetPoint(plan.path, this.scenario.spawn, this.scenario.goal),
    };
    if (car.crossing.score > 1.5) car.crossing = null;
    if (meet) car.meet = plan.meet;
    this.cars.push(car);
    return car;
  }

  /**
   * Drives on along the route: up to cruise speed at 8 m/s², and no closer to a car ahead in the
   * same lane than about a second plus a car length (so a faster car queues instead of driving
   * through a slower one).
   */
  move(car, dt) {
    let target = car.launched ? car.speed : 0;
    const a = car.yaw * Math.PI / 180, fx = Math.sin(a), fz = Math.cos(a);
    for (const other of this.cars) {
      if (other === car || !other.alive) continue;
      const dx = other.x - car.x, dz = other.z - car.z, along = dx * fx + dz * fz;
      if (along <= 0 || along > 40 || Math.abs(dx * fz - dz * fx) > 1.4) continue;
      const turn = Math.abs(((other.yaw - car.yaw + 540) % 360) - 180);
      if (turn > 40) continue;
      const gap = along - (car.size[2] + other.size[2]) / 2;
      target = Math.min(target, Math.max(0, (gap - 2) / 0.9));
    }
    const change = target - car.currentSpeed, before = car.currentSpeed;
    car.currentSpeed = Math.max(0, car.currentSpeed + Math.max(-8 * dt, Math.min(8 * dt, change)));
    car.distance += (before + car.currentSpeed) / 2 * dt;
    if (car.distance > car.path.at(-1).s) { car.alive = false; return; }
    if (car.distance > 0.01) carPose(car.path, car.distance, car.wheelbase, car);
    if (car.swerve) {
      car.lateral = Math.min(1.8, car.lateral + 3 * dt);
      const a = car.yaw * Math.PI / 180;
      car.x += Math.cos(a) * car.lateral * car.swerve; car.z -= Math.sin(a) * car.lateral * car.swerve;
    }
  }

  /** Freeze all traffic (contact). A noStop car swerves away from the participant and drives on. */
  freeze() {
    this.frozen = true;
    const q = this.participant;
    for (const car of this.cars) {
      if (!this.scenario.vehicles[car.vehicle].noStop || !q) continue;
      const a = car.yaw * Math.PI / 180, right = (q.x - car.x) * Math.cos(a) - (q.z - car.z) * Math.sin(a);
      car.swerve = right > 0 ? -1 : 1;                 // away from the side the participant is on
      car.lateral = 0;
    }
  }

  /** The car whose body touches a participant of radius r standing at (x, z), or null. */
  hit(x, z, r = PLAYER_RADIUS) {
    for (const car of this.cars) {
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
