// What the participant's body cannot pass through, in Unity coordinates (x, z): the town at body
// height (data/collision.json, built by tools/build_collision.mjs from the models) and the parked
// vehicles of the scenario (oriented boxes). The map's invisible walls are separate
// (shared/scenario.js crossesWall). Pure logic (node:test).

export const CELL = 0.2;                 // m, grid of the map rectangle
export const BAND_LOW = 0.3;             // m above the ground: lower parts (kerbs, steps, plinths) are stepped over
export const BAND_HIGH = 1.8;            // m above the ground: higher parts (eaves, tree crowns) pass over the head

/** Bit set → run lengths, alternating free / blocked, starting with free (compact JSON). */
export function encodeBits(bits) {
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

export function decodeBits(runs, size) {
  const bits = new Uint8Array(Math.ceil(size / 8));
  let k = 0, value = 0;
  for (const length of runs) {
    if (value) for (let i = k; i < k + length && i < size; i++) bits[i >> 3] |= 1 << (i & 7);
    k += length; value ^= 1;
  }
  return bits;
}

export class Obstacles {
  constructor(collision) {
    this.grid = collision ? { ...collision, bits: decodeBits(collision.bits, collision.width * collision.height) } : null;
    this.boxes = [];
  }

  /** Parked vehicles: centre, yaw (Unity degrees) and footprint [width, length] in metres. */
  setParked(list) {
    this.boxes = list.map(({ x, z, yaw, size }) => {
      const a = yaw * Math.PI / 180;
      return { x, z, s: Math.sin(a), c: Math.cos(a), hw: size[0] / 2, hl: size[1] / 2 };
    });
  }

  cell(i, j) {
    const g = this.grid;
    if (i < 0 || j < 0 || i >= g.width || j >= g.height) return false;
    const k = j * g.width + i;
    return (g.bits[k >> 3] >> (k & 7) & 1) === 1;
  }

  /** Does a body of radius r standing at (x, z) touch anything solid? */
  blocked(x, z, r) {
    for (const b of this.boxes) {
      // into the vehicle's frame: right = (cos, -sin), forward = (sin, cos)
      const dx = x - b.x, dz = z - b.z;
      const side = dx * b.c - dz * b.s, along = dx * b.s + dz * b.c;
      const ex = Math.max(0, Math.abs(side) - b.hw), ez = Math.max(0, Math.abs(along) - b.hl);
      if (ex * ex + ez * ez < r * r) return true;
    }
    const g = this.grid;
    if (!g) return false;
    const i0 = Math.floor((x - r - g.xMin) / g.cell), i1 = Math.floor((x + r - g.xMin) / g.cell);
    const j0 = Math.floor((z - r - g.zMin) / g.cell), j1 = Math.floor((z + r - g.zMin) / g.cell);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (!this.cell(i, j)) continue;
      const cx = g.xMin + i * g.cell, cz = g.zMin + j * g.cell;
      const ex = Math.max(cx - x, 0, x - cx - g.cell), ez = Math.max(cz - z, 0, z - cz - g.cell);
      if (ex * ex + ez * ez < r * r) return true;
    }
    return false;
  }
}
