// Decorative routes in imported map coordinates; no traffic or collision state is involved.
export const WATER_LEVEL = -1.35;
const smooth = v => { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); };
const pools = [
  [-44, 52, 7, 4], [89, 51, 10, 4], [-144, 57, 9, 6], [-666, 300, 7, 10],
];
export const WATER_BIRDS = pools.flatMap(([x, z, rx, rz], group) => [
  ...[0, 1, 2].map(i => ({ species: 'duck', x, z, rx: rx - i * .55, rz: rz - i * .25,
    phase: group * 1.7 + i * .31, speed: .037 + group * .002, size: .94 + i * .06 })),
  { species: 'swan', x, z, rx: rx - 1.3, rz: rz - 1, phase: group * 1.7 + 2.8,
    speed: .029, size: 1 },
]);
export const CROWS = Array.from({ length: 8 }, (_, i) => {
  const height = 32 + (i % 3) * 2.6, offset = (i % 5) * 7;
  // Long, level corridors stay above the low town/campus and clear of the castle summit.
  const from = i < 5 ? [-680, height, 10 + offset] : [-900 + offset, height + 5, -400];
  const to = i < 5 ? [680, height, 110 + offset] : [-540 + offset, height + 5, 1200];
  const speed = 8 + (i % 3) * .6;
  return { from, to, speed, duration: Math.hypot(to[0]-from[0], to[2]-from[2]) / speed,
    phase: i < 5 ? .48 + i * .018 : .34 + (i - 5) * .045,
    wingPhase: i * 1.13, size: .91 + (i % 3) * .07 };
});

/** Reuses out, including for historical wake emission points. Heading follows the tangent. */
export function birdPose(route, time, out) {
  if (route.from) {
    const u = ((time / route.duration + route.phase) % 1 + 1) % 1;
    out.x = route.from[0] + (route.to[0] - route.from[0]) * u;
    out.y = route.from[1] + (route.to[1] - route.from[1]) * u;
    out.z = route.from[2] + (route.to[2] - route.from[2]) * u;
    out.yaw = Math.atan2(route.to[0] - route.from[0], route.to[2] - route.from[2]);
    // Reset only at the distant ends, with zero-sized endpoints beyond ordinary street fog.
    out.visibility = smooth(u / .06) * smooth((1 - u) / .06);
    return out;
  }
  const a = route.phase + time * route.speed;
  out.x = route.x + Math.cos(a) * route.rx;
  out.z = route.z + Math.sin(a) * route.rz;
  out.y = WATER_LEVEL;
  out.yaw = Math.atan2(-Math.sin(a) * route.rx, Math.cos(a) * route.rz);
  out.visibility = 1;
  return out;
}
