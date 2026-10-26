import type {CollisionGrid, Footprint, TrafficCar} from '../../types/simulation.ts';
type Box = {x: number; z: number; s: number; c: number; hw: number; hl: number};
// What the participant's body cannot pass through, in Unity coordinates (x, z): the town at body
// height (data/collision.json, built by tools/build_collision.mjs from the models) and the parked
// vehicles of the scenario (oriented boxes). The map's invisible walls are separate
// (shared/scenario.js crossesWall). Pure logic (node:test).

export const CELL = 0.2;                 // m, grid of the map rectangle
export const BAND_LOW = 0.3;             // m above the ground: lower parts (kerbs, steps, plinths) are stepped over
export const BAND_HIGH = 1.8;            // m above the ground: higher parts (eaves, tree crowns) pass over the head

/** Bit set → run lengths, alternating free / blocked, starting with free (compact JSON). */
export function encodeBits(bits: Uint8Array) {
  const runs = [];
  let value = 0, length = 0;
  for (let k = 0; k < bits.length * 8; k++) {
    const b = bits[k >> 3] >> (k & 7) & 1;
    if (b === value) length++;
    else { runs.push(length); value = b; length = 1; }
  }
  runs.push(length);
  return runs;
}

export function decodeBits(runs: number[], size: number) {
  const bits = new Uint8Array(Math.ceil(size / 8));
  let k = 0, value = 0;
  for (const length of runs) {
    if (value) for (let i = k; i < k + length && i < size; i++) bits[i >> 3] |= 1 << (i & 7);
    k += length; value ^= 1;
  }
  return bits;
}

export class Obstacles {
  declare grid: (Omit<CollisionGrid, 'bits'> & {bits: Uint8Array}) | null;
  declare fixed: Box[]; declare parked?: Box[]; declare boxes: Box[]; declare traffic: TrafficCar[];
  constructor(collision: CollisionGrid | null) {
    this.grid = collision ? { ...collision, bits: decodeBits(collision.bits, collision.width * collision.height) } : null;
    this.fixed = [];                     // always there (the signal posts)
    this.boxes = [];
    this.traffic = [];
  }

  /** Oriented boxes that stay for every run (same form as setParked). */
  setFixed(list: Footprint[]) {
    this.fixed = list.map(Obstacles.box);
    this.boxes = [...this.fixed, ...this.parked ?? []];
  }

  static box({ x, z, yaw, size }: Footprint) {
    const a = yaw * Math.PI / 180;
    return { x, z, s: Math.sin(a), c: Math.cos(a), hw: size[0] / 2, hl: size[1] / 2 };
  }

  /** Parked vehicles: centre, yaw (Unity degrees) and footprint [width, length] in metres. */
  setParked(list: Footprint[]) {
    this.parked = list.map(Obstacles.box);
    this.boxes = [...this.fixed, ...this.parked];
  }

  /** Live array, retained in place by Traffic. Stopped cars are solid like parked cars. */
  setTraffic(cars: TrafficCar[]) { this.traffic = cars; }

  cell(i: number, j: number) {
    const g = this.grid!;
    if (i < 0 || j < 0 || i >= g.width || j >= g.height) return false;
    const k = j * g.width + i;
    return (g.bits[k >> 3] >> (k & 7) & 1) === 1;
  }

  /** Conservative body-height sight line for drivers, using the collision grid and parked boxes.
   * This is a 2D visibility approximation, independent of render culling and camera direction. */
  clearSight(from: {x: number; z: number}, to: {x: number; z: number}) {
    const dx = to.x - from.x, dz = to.z - from.z, length = Math.hypot(dx, dz);
    const steps = Math.ceil(length / (this.grid?.cell ?? CELL));
    for (let i = 1; i < steps; i++) {
      const t = i / steps, x = from.x + dx * t, z = from.z + dz * t;
      if (this.grid && this.cell(Math.floor((x - this.grid.xMin) / this.grid.cell), Math.floor((z - this.grid.zMin) / this.grid.cell))) return false;
      for (const b of this.boxes) {
        const ox = x - b.x, oz = z - b.z;
        if (Math.abs(ox * b.c - oz * b.s) < b.hw && Math.abs(ox * b.s + oz * b.c) < b.hl) return false;
      }
    }
    return true;
  }

  /** Does a body of radius r standing at (x, z) touch anything solid? */
  blocked(x: number, z: number, r: number) { return this.clearance(x, z, r) < r; }

  /**
   * Distance from (x, z) to the nearest solid thing, looking no further than r (returns r when
   * nothing is that close). A body that starts touching something (a custom spawn next to a
   * façade or a lamp post) may still move as long as the clearance does not shrink.
   */
  clearance(x: number, z: number, r: number) {
    let best = r * r;
    for (const b of this.boxes) {
      // into the vehicle's frame: right = (cos, -sin), forward = (sin, cos)
      const dx = x - b.x, dz = z - b.z;
      const side = dx * b.c - dz * b.s, along = dx * b.s + dz * b.c;
      const ex = Math.max(0, Math.abs(side) - b.hw), ez = Math.max(0, Math.abs(along) - b.hl);
      best = Math.min(best, ex * ex + ez * ez);
    }
    for (const car of this.traffic) {
      if (!car.alive || car.currentSpeed >= 0.1) continue;
      const a = car.yaw * Math.PI / 180, dx = x - car.x, dz = z - car.z;
      const side = dx * Math.cos(a) - dz * Math.sin(a), along = dx * Math.sin(a) + dz * Math.cos(a);
      const ex = Math.max(0, Math.abs(side) - car.size[0] / 2 - 0.06);
      const ez = Math.max(0, Math.abs(along) - car.size[2] / 2 - 0.06);
      best = Math.min(best, ex * ex + ez * ez);
    }
    const g = this.grid;
    if (g) {
      const i0 = Math.floor((x - r - g.xMin) / g.cell), i1 = Math.floor((x + r - g.xMin) / g.cell);
      const j0 = Math.floor((z - r - g.zMin) / g.cell), j1 = Math.floor((z + r - g.zMin) / g.cell);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        if (!this.cell(i, j)) continue;
        const cx = g.xMin + i * g.cell, cz = g.zMin + j * g.cell;
        const ex = Math.max(cx - x, 0, x - cx - g.cell), ez = Math.max(cz - z, 0, z - cz - g.cell);
        best = Math.min(best, ex * ex + ez * ez);
      }
    }
    return Math.sqrt(best);
  }

  /** May a body of radius r step from a to b? Yes when b is clear or no closer to anything than a. */
  allows(ax: number, az: number, bx: number, bz: number, r: number) {
    const after = this.clearance(bx, bz, r);
    return after >= r || after >= this.clearance(ax, az, r) - 1e-9;
  }
}
