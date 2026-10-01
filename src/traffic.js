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
import { distanceAt, pointAlong, START_TRIGGER, isRepeating } from './shared/scenario.js';

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

  step(dt) {
    if (this.frozen) return;
    this.time += dt;
    for (const p of this.plans) {
      while (!p.done && p.next != null && p.next <= this.time) {
        if (p.stopAfter != null && p.next > p.stopAfter) { p.done = true; break; }
        this.spawn(p, p.next);
        if (isRepeating(p.v)) {
          const { repeatMinSeconds: lo, repeatMaxSeconds: hi } = p.v;
          p.next += lo + (hi - lo) * this.random();
        } else {
          p.done = true;
        }
      }
    }
    for (const car of this.cars) this.move(car);
    this.cars = this.cars.filter(c => c.alive);
  }

  spawn(plan, at) {
    const v = plan.v;
    const body = this.bodyFor(v);
    const car = {
      id: this.nextId++, vehicle: plan.index, name: v.name, accident: !!v.accident, body,
      size: BODY_SIZE[body] ?? BODY_SIZE.sedan, born: at, speed: v.speedKmh / 3.6,
      x: v.route[0].x, z: v.route[0].z, yaw: 0, currentSpeed: 0, alive: true, distance: 0
    };
    this.move(car);
    if (v.overrideYaw && car.distance < 0.01) car.yaw = v.yaw;
    this.cars.push(car);
    return car;
  }

  move(car) {
    const t = this.time - car.born;
    const d = distanceAt(t, car.speed);
    const at = pointAlong(this.scenario.vehicles[car.vehicle].route, d);
    if (!at) { car.alive = false; return; }
    car.currentSpeed = Math.min(car.speed, Math.max(0, t) * 8);
    car.distance = d;
    car.x = at.x; car.z = at.z;
    if (d > 0.01) car.yaw = at.yaw;
  }

  /** Freeze all traffic (contact). */
  freeze() { this.frozen = true; }

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
