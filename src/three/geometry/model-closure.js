// Ground is authored as sheets at different heights: road 0.01, kerb caps 0.16, plots 0.15. A sheet
// has no riser, so from street level a sight line ran under a raised edge and out to the sky, which
// a plan view can never show. Every open edge of a ground sheet gets a downward face, and the same
// faces hide any step between two sheets of different detail.
import * as THREE from 'three';

export const SKIRT_DEPTH = 0.6;                  // bridges and raised decks carry pavement: keep it short
export const BANK_DEPTH = 3;                     // a bank edge stands over the moat, which lies deeper
const BANK = /^(HK_(Grass|Soil)|ART_(Sand|Gravel))$/;
export const GROUND_SHEET = /^(HK_(Sidewalk|Asphalt|Grass|Curb|Soil)|ART_(Sand|Gravel|ApronAsphalt))$/;
const WELD = 1000;                                // mm: authored neighbours stay distinct, repeats meet
const UP = 0.5;                                   // a sheet faces up; walls and banks close themselves
const STROKE = 1;                                 // m²: brush strokes lie on a sheet, every real sheet is larger
const RISER_SHADE = 0.86;

/** Open edges of the up-facing triangles in `parts`, welded across parts of one asset. */
export function openEdges(parts, isGround = name => GROUND_SHEET.test(name)) {
  const ids = new Map(), edges = new Map(), parent = [], areas = [];
  const id = (x, y, z) => {
    const key = Math.round(x * WELD) + ',' + Math.round(y * WELD) + ',' + Math.round(z * WELD);
    let value = ids.get(key);
    if (value === undefined) { ids.set(key, value = ids.size); parent[value] = value; areas[value] = 0; }
    return value;
  };
  const rootOf = vertex => {
    while (parent[vertex] !== vertex) vertex = parent[vertex] = parent[parent[vertex]];
    return vertex;
  };
  const join = (a, b) => {
    a = rootOf(a); b = rootOf(b);
    if (a !== b) { parent[b] = a; areas[a] += areas[b]; }
  };
  const keyOf = (a, b) => a < b ? a * 0x4000000 + b : b * 0x4000000 + a;
  parts.forEach((part, partIndex) => {
    const p = part.geometry.attributes.position.array, index = part.geometry.index.array;
    const upward = isGround(part.material.name);
    for (let t = 0; t < index.length; t += 3) {
      const a = index[t] * 3, b = index[t + 1] * 3, c = index[t + 2] * 3;
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, length = Math.hypot(nx, ny, nz);
      const sheet = upward && length > 0 && Math.abs(ny) / length > UP;
      if (!sheet) continue;
      const i = id(p[a], p[a + 1], p[a + 2]), j = id(p[b], p[b + 1], p[b + 2]), k = id(p[c], p[c + 1], p[c + 2]);
      join(i, j); join(i, k);
      areas[rootOf(i)] += length / 2;
      for (const [from, to, across] of [[i, j, 2], [j, k, 0], [k, i, 1]]) {
        const key = keyOf(from, to), edge = edges.get(key);
        if (edge) edge.count++;
        else edges.set(key, { count: 1, part: partIndex, t, across, vertex: from });
      }
    }
  });
  // A wall or bank meeting the edge closes it, in any material of the asset.
  parts.forEach(part => {
    const p = part.geometry.attributes.position.array, index = part.geometry.index.array;
    const known = (x, y, z) => ids.get(Math.round(x * WELD) + ',' + Math.round(y * WELD) + ',' + Math.round(z * WELD));
    for (let t = 0; t < index.length; t += 3) {
      const corners = [index[t] * 3, index[t + 1] * 3, index[t + 2] * 3].map(o => known(p[o], p[o + 1], p[o + 2]));
      for (let e = 0; e < 3; e++) {
        const a = corners[e], b = corners[(e + 1) % 3];
        if (a === undefined || b === undefined) continue;
        const edge = edges.get(keyOf(a, b));
        if (edge) edge.touching = (edge.touching ?? 0) + 1;
      }
    }
  });
  return [...edges.values()].filter(edge => edge.count === 1 && edge.touching === 1 && areas[rootOf(edge.vertex)] >= STROKE);
}

/** Appends the risers to each part's geometry, keeping the pigment of the sheet above. */
export function addSkirts(parts, isGround = name => GROUND_SHEET.test(name)) {
  const open = openEdges(parts, isGround), byPart = new Map();
  for (const edge of open) {
    if (!byPart.has(edge.part)) byPart.set(edge.part, []);
    byPart.get(edge.part).push(edge);
  }
  let added = 0;
  for (const [partIndex, edges] of byPart) {
    const part = parts[partIndex], geometry = part.geometry, source = geometry.attributes;
    const p = source.position.array, c = source.color.array, index = geometry.index.array;
    const depth = BANK.test(part.material.name) ? BANK_DEPTH : SKIRT_DEPTH;
    const start = source.position.count, count = start + edges.length * 4;
    const position = new Float32Array(count * 3), normal = new Int8Array(count * 3), color = new Uint8Array(count * 3);
    position.set(p); normal.set(source.normal.array); color.set(c);
    const faces = new Uint32Array(index.length + edges.length * 6);
    faces.set(index);
    let vertex = start, at = index.length;
    for (const { t, across } of edges) {
      let a = index[t + (across + 1) % 3], b = index[t + (across + 2) % 3];
      const far = index[t + across];
      // Scene pigments are single-sided: the riser must wind to face away from its sheet.
      if ((p[b * 3 + 2] - p[a * 3 + 2]) * (p[far * 3] - p[a * 3]) - (p[b * 3] - p[a * 3]) * (p[far * 3 + 2] - p[a * 3 + 2]) > 0) [a, b] = [b, a];
      const dx = p[b * 3] - p[a * 3], dz = p[b * 3 + 2] - p[a * 3 + 2], length = Math.hypot(dx, dz) || 1;
      const nx = dz / length, nz = -dx / length;
      const first = vertex;
      for (const [corner, drop] of [[a, 0], [b, 0], [b, depth], [a, depth]]) {
        position[vertex * 3] = p[corner * 3];
        position[vertex * 3 + 1] = p[corner * 3 + 1] - drop;
        position[vertex * 3 + 2] = p[corner * 3 + 2];
        normal[vertex * 3] = Math.round(nx * 127); normal[vertex * 3 + 2] = Math.round(nz * 127);
        for (let k = 0; k < 3; k++) color[vertex * 3 + k] = c[corner * 3 + k] * RISER_SHADE;
        vertex++;
      }
      faces.set([first, first + 1, first + 2, first, first + 2, first + 3], at); at += 6;
    }
    const closed = new THREE.BufferGeometry();
    closed.setAttribute('position', new THREE.BufferAttribute(position, 3));
    closed.setAttribute('normal', new THREE.BufferAttribute(normal, 3, true));
    closed.setAttribute('color', new THREE.BufferAttribute(color, 3, true));
    closed.setIndex(new THREE.BufferAttribute(faces, 1));
    closed.computeBoundingBox(); closed.computeBoundingSphere();
    part.geometry = closed;
    added += edges.length * 2;
  }
  return added;
}
