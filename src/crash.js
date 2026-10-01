// How the participant is thrown in the replay, from where the car hit them. Educational
// presentation, not accident reconstruction (like the Unity app): a few readable kinds of motion.
//   front  — the bonnet hits: a short lean onto the car, thrown ahead along the car's travel,
//            airborne at speed, lands on the side/back facing away, slides
//   corner — a front corner clips: thrown outwards and spun round
//   side   — the car's flank sweeps past: pushed sideways, spun, no flight
//   bump   — the car (nearly) stands: the participant walks/rides into it and falls back
// All values are in Unity coordinates (x, z on the ground) and seconds after contact.

const smooth = u => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
const easeOut = u => { u = Math.max(0, Math.min(1, u)); return 1 - (1 - u) * (1 - u); };
const norm = (x, z) => { const l = Math.hypot(x, z) || 1; return { x: x / l, z: z / l }; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * person {x, z}, personVelocity {x, z} (m/s), car {x, z, yaw}, carVelocity {x, z}, size [width, height, length].
 * Returns the crash description used by crashMotion.
 */
export function classifyCrash({ person, personVelocity = { x: 0, z: 0 }, car, carVelocity, size = [1.76, 1.45, 4.6], bicycle = false }) {
  const a = car.yaw * Math.PI / 180;
  const f = { x: Math.sin(a), z: Math.cos(a) }, r = { x: Math.cos(a), z: -Math.sin(a) };
  const dx = person.x - car.x, dz = person.z - car.z;
  const lz = dx * f.x + dz * f.z, lx = dx * r.x + dz * r.z;
  const halfW = size[0] / 2, halfL = size[2] / 2;
  const speed = Math.hypot(carVelocity.x, carVelocity.z);
  const side = lx >= 0 ? 1 : -1;                                   // +1: the participant is right of the car
  let kind, dir, thrown, lift, spin;
  if (speed < 1.2) {
    kind = 'bump';
    // walked or rode into a standing car: back off the way one came, or straight away from it
    const back = Math.hypot(personVelocity.x, personVelocity.z) > 0.3 ? norm(-personVelocity.x, -personVelocity.z) : norm(dx, dz);
    dir = back; thrown = bicycle ? 0.6 : 0.35; lift = 0; spin = 0;
  } else if (lz > halfL - 0.35) {
    const corner = Math.abs(lx) > halfW * 0.6;
    kind = corner ? 'corner' : 'front';
    const out = corner ? 0.6 * side : 0.25 * clamp(lx / halfW, -1, 1);
    dir = norm(f.x + r.x * out, f.z + r.z * out);
    thrown = clamp(0.04 * speed * speed + 0.4, 0.4, 7) * (corner ? 0.75 : 1);
    lift = clamp(0.01 * speed * speed, 0.05, 0.9) * (corner ? 0.6 : 1);
    spin = corner ? side * (1.6 + 0.12 * speed) : side * Math.min(1.2, 0.08 * speed);
  } else {
    kind = 'side';
    dir = norm(r.x * side + f.x * 0.5, r.z * side + f.z * 0.5);
    thrown = clamp(0.02 * speed * speed + 0.3, 0.3, 2.5);
    lift = 0;
    spin = side * (1.2 + 0.05 * speed);
  }
  if (bicycle && kind !== 'bump') { thrown *= 1.1; lift += 0.25; }
  const flight = lift > 0.04 ? 0.18 + 0.03 * speed : 0;
  const landing = kind === 'bump' ? 0.6 : Math.max(0.35, flight + 0.1);
  const total = Math.min(1.5, landing + 0.25 + thrown * 0.08);
  return { kind, dir, speed, thrown, lift, spin, flight, landing, total, side, wrap: kind === 'front' && speed > 4, bicycle };
}

/**
 * The body at `s` seconds after contact: ground offset {x, z} and height y (metres), tilt towards
 * `dir` (radians, π/2 = lying), spin about the vertical (radians), limb flail 0..1.
 */
export function crashMotion(c, s) {
  if (s <= 0) return { x: 0, y: 0, z: 0, tilt: 0, spin: 0, flail: 0 };
  const travel = c.thrown * easeOut(s / c.total);
  let tilt;
  if (c.wrap && s < 0.1) tilt = -0.35 * smooth(s / 0.1);           // onto the bonnet first
  else tilt = (c.wrap ? -0.35 : 0) + (Math.PI / 2 + (c.wrap ? 0.35 : 0)) * smooth((s - (c.wrap ? 0.1 : 0)) / c.landing);
  let y = 0;
  if (c.flight > 0 && s < c.flight) y = c.lift * Math.sin(Math.PI * s / c.flight);
  else if (c.flight > 0 && s < c.flight + 0.18) y = c.lift * 0.15 * Math.sin(Math.PI * (s - c.flight) / 0.18);   // bounce
  const flail = s < c.landing ? Math.min(1, s / 0.08) : 1 - smooth((s - c.landing) / 0.45);   // slack once down
  return { x: c.dir.x * travel, y, z: c.dir.z * travel, tilt, spin: c.spin * easeOut(s / c.total), flail };
}

/** The bicycle after contact: pushed less far, topples onto its side towards `dir`, slides. */
export function bicycleMotion(c, s) {
  if (s <= 0) return { x: 0, y: 0, z: 0, tilt: 0, spin: 0 };
  const travel = c.thrown * 0.45 * easeOut(s / c.total);
  return { x: c.dir.x * travel, y: 0, z: c.dir.z * travel, tilt: Math.PI / 2 * smooth(s / 0.5), spin: c.spin * 0.3 * easeOut(s / c.total) };
}
