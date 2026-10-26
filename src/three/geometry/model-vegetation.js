// Parametric folded leaves and scalloped foliage. Recipes supply dimensions and a deterministic
// random tape, so both LODs retain the authored envelope without storing individual leaf meshes.
import { Vector3 } from 'three';
const vector = p => new Vector3(...p);
const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
function random(tape) {
  let i = 0, j = 0;
  return { uniform: (a, b) => a + (b - a) * tape.values[i++], choice: values => values[tape.choices[j++]] };
}
function fit(points, reference) {
  for (const axis of ['x', 'y', 'z']) {
    const lo = Math.min(...reference.map(p => p[axis])), hi = Math.max(...reference.map(p => p[axis]));
    const oldLo = Math.min(...points.map(p => p[axis])), oldHi = Math.max(...points.map(p => p[axis]));
    for (const p of points) p[axis] = lo + (p[axis] - oldLo) * (hi - lo) / (oldHi - oldLo);
  }
}

export function leafSpray({ center, size, angle, season, fine, distant, random: tape }, emit) {
  const rng = random(tape), ca = Math.cos(angle), sa = Math.sin(angle);
  const palette = [[0.23, 0.36, 0.25], [0.42, 0.51, 0.22], [0.89, 0.73, 0.23],
    [0.98, 0.67, 0.19], [0.85, 0.35, 0.15]];
  const offsets = fine ? [[-0.43, 0.03, -0.15], [0.39, 0.13, -0.20], [-0.12, 0.35, 0.25], [0.13, -0.27, 0.22]]
    : [[-0.28, 0.10, -0.12], [0.28, -0.05, 0.18]];
  for (const [dx, dy, dz] of offsets) {
    const origin = new Vector3(center[0] + (dx * ca - dz * sa) * size[0], center[1] + dy * size[1],
      center[2] + (dx * sa + dz * ca) * size[2]);
    const radii = new Vector3(size[0] * 0.63, size[1] * 0.86, size[2] * 0.63);
    const phase = rng.uniform(0, Math.PI * 2);
    const heat = Math.max(0, Math.min(0.999, season + rng.uniform(-0.13, 0.13))) * (palette.length - 1);
    const tone = mix(palette[Math.floor(heat)], palette[Math.floor(heat) + 1], heat % 1), blades = [];
    const count = fine ? 24 : 4;
    for (let i = 0; i < count; i++) {
      const a = phase + i * 2.39996, y = 1 - 2 * (i + 0.5) / count, r = Math.sqrt(1 - y * y);
      const at = new Vector3(Math.cos(a) * radii.x * r, y * radii.y, Math.sin(a) * radii.z * r)
        .multiplyScalar(rng.uniform(0.50, 0.96));
      const heading = a + rng.uniform(-0.8, 0.8), tilt = rng.uniform(-0.85, 0.85);
      const length = Math.min(radii.x, radii.z) * (fine ? 0.62 : 1.30) * rng.uniform(0.75, 1.2);
      const u = new Vector3(Math.cos(heading), tilt, Math.sin(heading)).normalize().multiplyScalar(length);
      const v = new Vector3(-Math.sin(heading), rng.uniform(-0.30, 0.30), Math.cos(heading)).normalize().multiplyScalar(length * 0.34);
      const normal = u.clone().cross(v).normalize();
      const p = (x, y, z = 0) => at.clone().addScaledVector(u, x).addScaledVector(v, y).addScaledVector(normal, z * length);
      let leaf = [p(-0.55, 0, fine ? -0.07 : 0), p(-0.23, 0.80), p(0.17, 1),
        p(0.55, 0, fine ? -0.07 : 0), p(0.17, -1), p(-0.23, -0.80)];
      if (!fine) leaf = [leaf[0], leaf[1].clone().add(leaf[2]).multiplyScalar(0.5), leaf[3],
        leaf[4].clone().add(leaf[5]).multiplyScalar(0.5), p(0, 0, 0.07), p(0, 0, -0.04)];
      blades.push(leaf.map(q => new Vector3(q.x * ca - q.z * sa, q.y, q.x * sa + q.z * ca)));
    }
    let chosen = blades;
    if (distant) {
      chosen = (fine ? [0, Math.floor(count / 3), Math.floor(count * 2 / 3)] : [0, Math.floor(count / 2)])
        .map(i => blades[i].map(q => q.clone().multiplyScalar(1.70)));
      fit(chosen.flat(), blades.flat());
    }
    const faces = fine ? [[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 5], [1, 5, 4], [1, 4, 2], [0, 5, 1], [3, 2, 4]]
      : [[4, 1, 0], [5, 0, 1], [4, 2, 1], [5, 1, 2], [4, 3, 2], [5, 2, 3], [4, 0, 3], [5, 3, 0]];
    chosen.forEach((blade, i) => {
      const pigment = mix(tone, [0.99, 0.79, 0.31], 0.08 + (i % 7) * 0.035);
      const points = blade.map(q => q.clone().add(origin));
      for (const face of faces) emit(face.map(i => points[i].toArray()), pigment, true);
    });
  }
}

export function tuft({ center, size: [rx, ry, rz], angle, material, seed, fine, distant, random: tape }, emit) {
  const rng = random(tape), ca = Math.cos(angle), sa = Math.sin(angle), phase = seed * 0.071;
  const point = (lat, theta) => {
    const r = Math.cos(lat), lobe = 1 + 0.075 * Math.sin(theta * 3 + phase + lat) + 0.045 * Math.cos(theta * 5 - phase);
    const u = rx * r * Math.cos(theta) * lobe, v = rz * r * Math.sin(theta) * lobe;
    const h = ry * (Math.sin(lat) + 0.065 * r * Math.sin(theta * 2 + phase));
    return new Vector3(center[0] + u * ca - v * sa, center[1] + h, center[2] + u * sa + v * ca);
  };
  const reference = [point(-Math.PI / 2, 0), ...[-0.85, 0, 0.85].flatMap(lat =>
    Array.from({ length: 12 }, (_, i) => point(lat, i * Math.PI * 2 / 12))), point(Math.PI / 2, 0)];
  let points = reference;
  const faces = [];
  if (distant) {
    const t = (1 + Math.sqrt(5)) / 2;
    points = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t],
      [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
      .map(p => vector(p).normalize()).map(v => point(Math.asin(v.y), Math.atan2(v.z, v.x)));
    fit(points, reference);
    faces.push(...[[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4],
      [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]]);
  } else for (let i = 0; i < 12; i++) {
    const j = (i + 1) % 12;
    faces.push([0, 1 + i, 1 + j]);
    for (let ring = 0; ring < 2; ring++) {
      const a = 1 + ring * 12, b = 1 + (ring + 1) * 12;
      faces.push([a + i, b + i, b + j, a + j]);
    }
    faces.push([points.length - 1, 25 + j, 25 + i]);
  }
  const tones = points.map(p => {
    const q = p.clone().sub(vector(center));
    const light = Math.max(0, Math.min(1, 0.50 + q.y / ry * 0.30 - q.x / rx * 0.13 + q.z / rz * 0.10));
    const drift = 0.018 * Math.sin(q.x * 2.1 + q.y * 1.8 + phase) - (material === 'HK_LeafDark' ? 0.025 : 0);
    return mix([0.32, 0.45, 0.37], [0.62, 0.68, 0.37], light).map(c => c + drift);
  });
  const hull = [];
  for (const indices of faces) {
    const p = indices.map(i => points[i]), colours = indices.map(i => tones[i]);
    const normal = p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0]));
    if (normal.dot(p.reduce((sum, p) => sum.add(p), new Vector3()).divideScalar(p.length).sub(vector(center))) < 0) {
      p.reverse(); colours.reverse();
    }
    emit(p.map(p => p.toArray()), colours, true); hull.push(p);
  }
  if (!fine || distant) return;
  const eligible = hull.filter(p => p.reduce((sum, p) => sum + p.y, 0) / p.length > center[1] - ry * 0.25);
  const palette = [[0.64, 0.69, 0.39], [0.53, 0.63, 0.37], [0.40, 0.54, 0.42], [0.63, 0.60, 0.39]];
  for (let i = 0; i < 2; i++) {
    const [a, c, d] = rng.choice(eligible), edge = c.clone().sub(a);
    const normal = edge.clone().cross(d.clone().sub(a)).normalize();
    const origin = a.clone().add(c).add(d).divideScalar(3).addScaledVector(normal, 0.004);
    const u = edge.clone().normalize().multiplyScalar(Math.min(edge.length() * 0.12, rx * 0.09));
    const v = normal.clone().cross(u).multiplyScalar(0.48);
    emit(Array.from({ length: 6 }, (_, k) => origin.clone().addScaledVector(u, Math.cos(k * Math.PI * 2 / 6))
      .addScaledVector(v, Math.sin(k * Math.PI * 2 / 6)).toArray()), palette[(seed + i) % palette.length], false);
  }
}
