// Checks complete browser event routes against the exported carriageway, including the car body.
// node tools/check_routes.mjs [--dir events|data/scenarios]
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BODY_SIZE, WHEELBASE, smoothRoute, carPose } from '../src/traffic.js';

/** A bounded driveway crossing is intentional in 07/08; travel along the pavement is not. */
function driveway(scenario, vehicle, x, z) {
  return ['builtin-07', 'builtin-08'].includes(scenario.id) && vehicle.accident
    && x >= -69 && x <= -63 && z >= 14 && z <= 22.05;
}

export function inspectRoutes(scenario, map) {
  const triangles = [];
  for (const surface of map.surfaces) {
    if (surface.kind !== 'carriageway') continue;
    const t = surface.triangles;
    for (let i = 0; i < t.length; i += 6) {
      const [ax, az, bx, bz, cx, cz] = t.slice(i, i + 6);
      if (Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax)) < 1e-7) continue;
      triangles.push({ ax, az, bx, bz, cx, cz,
        xMin: Math.min(ax, bx, cx), xMax: Math.max(ax, bx, cx),
        zMin: Math.min(az, bz, cz), zMax: Math.max(az, bz, cz) });
    }
  }
  const contains = (x, z) => triangles.some(t => {
    if (x < t.xMin - 1e-6 || x > t.xMax + 1e-6 || z < t.zMin - 1e-6 || z > t.zMax + 1e-6) return false;
    const a = (t.bx - t.ax) * (z - t.az) - (t.bz - t.az) * (x - t.ax);
    const b = (t.cx - t.bx) * (z - t.bz) - (t.cz - t.bz) * (x - t.bx);
    const c = (t.ax - t.cx) * (z - t.cz) - (t.az - t.cz) * (x - t.cx);
    return !((a < -1e-6 || b < -1e-6 || c < -1e-6) && (a > 1e-6 || b > 1e-6 || c > 1e-6));
  });
  return scenario.vehicles.map((vehicle, index) => {
    const result = { index, name: vehicle.name, violations: 0, first: null };
    const check = (x, z, kind) => {
      if (contains(x, z) || driveway(scenario, vehicle, x, z)) return;
      result.violations++;
      result.first ??= { kind, x: +x.toFixed(2), z: +z.toFixed(2) };
    };
    const bodyAt = (pose, width, length, kind) => {
      const yaw = pose.yaw * Math.PI / 180, sin = Math.sin(yaw), cos = Math.cos(yaw);
      // Corners, edge midpoints and centre catch both overhang and a path cutting an island.
      for (const u of [-width / 2, 0, width / 2]) for (const f of [-length / 2, 0, length / 2])
        check(pose.x + u * cos + f * sin, pose.z - u * sin + f * cos, kind);
    };
    // The editor draws the authored segments; check between their vertices as well.
    for (let i = 1; i < vehicle.route.length; i++) {
      const a = vehicle.route[i - 1], b = vehicle.route[i];
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25));
      for (let k = 0; k <= steps; k++) check(a.x + (b.x - a.x) * k / steps, a.z + (b.z - a.z) * k / steps, 'route');
      // The editor's preview follows each authored segment with its 4.4 × 1.8 m car rectangle.
      for (let k = 0; k <= steps; k++) bodyAt({
        x: a.x + (b.x - a.x) * k / steps, z: a.z + (b.z - a.z) * k / steps,
        yaw: Math.atan2(b.x - a.x, b.z - a.z) * 180 / Math.PI
      }, 1.8, 4.4, 'editor');
    }
    if (vehicle.route.length < 2) return result;
    const path = smoothRoute(vehicle.route), end = path.at(-1).s;
    // Ordinary built-in traffic mixes all bodies. Accident cars are sedans.
    for (const body of vehicle.accident ? ['sedan'] : Object.keys(BODY_SIZE)) {
      const [width, , length] = BODY_SIZE[body];
      const steps = Math.max(1, Math.ceil(end / 0.25));
      for (let k = 0; k <= steps; k++) {
        const pose = carPose(path, end * k / steps, WHEELBASE[body]);
        bodyAt(pose, width, length, body);
      }
    }
    return result;
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dirIndex = process.argv.indexOf('--dir');
  const dir = new URL('../' + (dirIndex >= 0 ? process.argv[dirIndex + 1] : 'data/scenarios') + '/', import.meta.url);
  const map = JSON.parse(fs.readFileSync(new URL('../data/map.json', import.meta.url)));
  let failed = 0, checked = 0;
  for (const file of fs.readdirSync(dir).filter(f => /^builtin-\d+\.json$/.test(f)).sort()) {
    const scenario = JSON.parse(fs.readFileSync(new URL(file, dir)));
    for (const r of inspectRoutes(scenario, map)) {
      checked++;
      if (r.violations) { failed++; console.error(`${scenario.id} ${r.name}: ${r.violations} off-road samples; first ${JSON.stringify(r.first)}`); }
      else console.log(`${scenario.id} ${r.name}: clear`);
    }
  }
  console.log(`${checked} vehicle routes checked; ${failed} failed`);
  process.exitCode = failed || !checked ? 1 : 0;
}
