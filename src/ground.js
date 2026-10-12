// Ground height in Unity coordinates from the original road meshes (Art/Hikone/road_tiles_geometry.json,
// the collision truth of the Unity scene: carriageway 0.01, sidewalk 0.41, corner ramps), with the
// town ground (0.40) and the Kyobashi deck elsewhere — all with the browser's lower kerbs (kerb.js:
// pavement 0.16, town ground 0.15). Pure logic (node:test).
import { kerbY } from './kerb.js';
const CELL = 4;
const TOWN_Z = 39.6;

export class Ground {
  constructor(roadTiles) {
    this.cells = new Map();
    // { tile: [[ax, ay, az, bx, by, bz, cx, cy, cz], ...] }
    for (const tris of Object.values(roadTiles)) {
      for (let t of tris) {
        const [ax, ay0, az, bx, by0, bz, cx, cy0, cz] = t;
        const ay = kerbY(ay0), by = kerbY(by0), cy = kerbY(cy0);
        t = [ax, ay, az, bx, by, bz, cx, cy, cz];
        const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const len = Math.hypot(nx, ny, nz);
        if (len < 1e-9 || Math.abs(ny) / len < 0.6) continue;     // curb faces are not ground
        const x0 = Math.floor(Math.min(ax, bx, cx) / CELL), x1 = Math.floor(Math.max(ax, bx, cx) / CELL);
        const z0 = Math.floor(Math.min(az, bz, cz) / CELL), z1 = Math.floor(Math.max(az, bz, cz) / CELL);
        for (let gx = x0; gx <= x1; gx++)
          for (let gz = z0; gz <= z1; gz++) {
            const key = gx + ',' + gz;
            if (!this.cells.has(key)) this.cells.set(key, []);
            this.cells.get(key).push(t);
          }
      }
    }
  }

  /** Highest road surface under (x, z), else the fallback ground. */
  heightAt(x, z) {
    return this.roadHeightAt(x, z) ?? Ground.fallback(x, z);
  }

  /** Height of the road surface (carriageway, pavement, ramps) at (x, z), or null off the roads. */
  roadHeightAt(x, z) {
    const tris = this.cells.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL));
    let best = -Infinity;
    if (tris) {
      for (const [ax, ay, az, bx, by, bz, cx, cy, cz] of tris) {
        const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        if (Math.abs(d) < 1e-12) continue;
        const w1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
        const w2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
        const w3 = 1 - w1 - w2;
        if (w1 < -1e-6 || w2 < -1e-6 || w3 < -1e-6) continue;
        const y = w1 * ay + w2 * by + w3 * cy;
        if (y > best) best = y;
      }
    }
    return best > -Infinity ? best : null;
  }

  static fallback(x, z) {
    // the bridge deck (carriageway 8 m, sidewalks either side) and the masugata road beyond it
    if (z > TOWN_Z && z < 52 && x > 25 && x < 39) return kerbY(Math.abs(x - 32) < 4 ? 0.01 : 0.41);
    return kerbY(0.4);
  }
}
