// Every painted road mark, as its own native program (tools/build_road_markings.mjs): changing a
// line rebuilds this layer alone, in seconds and without Blender. Roads, kerbs and lettering
// stay with their authors. Junction gaps and stop bars come from shared OSM nodes; they are
// generated estimates of common practice, not observations of each junction.
import { APPROACH_DATA } from './castle-approach.js';
import { castleX, moatBend, TOWN_CROSSINGS, TOWN_STREETS } from './road-layout.js';
import { UNIVERSITY_DATA } from './university-layout.js';
import east from '../../../world/east-hikone.json' with { type: 'json' };
import eastStreet from '../../../world/east-street.json' with { type: 'json' };
import field from '../../../world/field-observations.json' with { type: 'json' };
import frame from '../../../world/geographic-frame.json' with { type: 'json' };
import higashi from '../../../world/higashi-frontage.json' with { type: 'json' };
import rules from '../../../world/road-markings.json' with { type: 'json' };
import schoolRoad from '../../../world/school-road.json' with { type: 'json' };

type Point = readonly [number, number];
type Line = readonly Point[];
type Cut = readonly [number, number];
type Offset = number | ((x: number, z: number) => number);
type Material = keyof typeof PIGMENT;
type Road = { id: string; name: string | null; kind: string; width: number; oneway: string | null;
  tunnel: string | null; points: Point[]; nodes: string[] };
type Chain = Road & { ids: Set<string> };
type Facility = { id: string; x: number; z: number; tags: Record<string, string>; road?: string; controlled?: boolean; direction?: number[] };
type Profile = { centre: string; edge: boolean; green?: { side: string; xMin: number; xMax: number } };
export type MarkingFace = ['face', Material, [number, number, number][], number[], false];

const PIGMENT = {
  HK_WhitePaint: [0.9346115, 0.8969828, 0.7740965],
  ART_PathGreen: [0.1383492, 0.4683492, 0.3383492],
  HK_SignBlue: [0.22, 0.42, 0.74],
};
const PAINT = 0.022, GREEN = 0.023;
const JOINT_MARGIN = 2.5;       // Kerb return beyond a crossing road's edge.
const STOP_WIDTH = 0.45;
const STOP_SETBACK = 2;         // From a zebra's near edge.
const ZEBRA_HALF = 1.3, ZEBRA_CLEARANCE = 0.5, CROSSING_APPROACH = 12;
const { line: LINE_WIDTH, dash: DASH, gap: GAP } = rules.standard;

const dist = (a: Point, c: Point) => Math.hypot(c[0] - a[0], c[1] - a[1]);

class Paint {
  faces: MarkingFace[] = [];

  triangle(a: Point, b: Point, c: Point, y: number, material: Material) {
    const turn = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(turn) < 1e-9) return;
    const [p, q] = turn < 0 ? [b, c] : [c, b];   // Upward normal in the mirrored map frame.
    this.faces.push(['face', material, [a, p, q].map(([x, z]) => [x, y, z] as [number, number, number]), PIGMENT[material], false]);
  }

  /** A convex ring or a strip quad; each triangle is wound independently, so folds stay visible. */
  ring(points: Line, y = PAINT, material: Material = 'HK_WhitePaint') {
    for (let i = 1; i + 1 < points.length; i++) this.triangle(points[0], points[i], points[i + 1], y, material);
  }
}

function stations(points: Line) {
  const out = [0];
  for (let i = 1; i < points.length; i++) out.push(out[i - 1] + dist(points[i - 1], points[i]));
  return out;
}

function at(points: Line, s: number, marks = stations(points)): Point {
  for (let i = 1; i < points.length; i++) if (s <= marks[i] && marks[i] > marks[i - 1]) {
    const t = Math.max(0, (s - marks[i - 1]) / (marks[i] - marks[i - 1]));
    return [points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t, points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t];
  }
  return points[points.length - 1];
}

function tangent(points: Line, s: number, marks = stations(points)): Point {
  let a = points[points.length - 2], c = points[points.length - 1];
  for (let i = 1; i < points.length; i++) if (s <= marks[i] && dist(points[i - 1], points[i]) > 0) {
    a = points[i - 1]; c = points[i]; break;
  }
  const length = dist(a, c);
  return [(c[0] - a[0]) / length, (c[1] - a[1]) / length];
}

function sliceLine(points: Line, lo: number, hi: number, marks = stations(points)): Point[] {
  const out: Point[] = [at(points, lo, marks)];
  points.forEach((p, i) => { if (marks[i] > lo && marks[i] < hi) out.push(p); });
  out.push(at(points, hi, marks));
  return out.filter((p, i) => i === 0 || dist(out[i - 1], p) > 1e-6);
}

/** The parts of [0, length] outside the cut intervals. */
function spans(length: number, cuts: readonly Cut[]) {
  const out: [number, number][] = [];
  let s = 0;
  for (const [lo, hi] of [...cuts].sort((a, c) => a[0] - c[0])) {
    if (lo > s) out.push([s, Math.min(lo, length)]);
    s = Math.max(s, hi);
  }
  if (s < length) out.push([s, length]);
  return out.filter(([a, c]) => c - a > 0.05);
}

function value(offset: Offset, p: Point) { return typeof offset === 'function' ? offset(p[0], p[1]) : offset; }

/** The band between two offsets left of the line's direction. */
function strip(paint: Paint, points: Line, lo: Offset, hi: Offset, y = PAINT, material: Material = 'HK_WhitePaint') {
  const edges = points.map((p, i) => {
    const a = points[Math.max(0, i - 1)], c = points[Math.min(points.length - 1, i + 1)];
    const length = dist(a, c), nx = -(c[1] - a[1]) / length, nz = (c[0] - a[0]) / length;
    const l = value(lo, p), h = value(hi, p);
    return [[p[0] + nx * l, p[1] + nz * l], [p[0] + nx * h, p[1] + nz * h]] as const;
  });
  for (let i = 1; i < edges.length; i++) paint.ring([edges[i - 1][0], edges[i - 1][1], edges[i][1], edges[i][0]], y, material);
}

function band(paint: Paint, points: Line, lo: Offset, hi: Offset, cuts: readonly Cut[] = [], y = PAINT, material: Material = 'HK_WhitePaint') {
  const marks = stations(points);
  for (const [a, c] of spans(marks[marks.length - 1], cuts)) strip(paint, sliceLine(points, a, c, marks), lo, hi, y, material);
}

/** A band stopped where its own surface meets `blocked`, so oblique junctions cut each side apart. */
function maskedBand(paint: Paint, points: Line, lo: Offset, hi: Offset, blocked: (p: Point) => boolean, y = PAINT, material: Material = 'HK_WhitePaint') {
  const marks = stations(points), length = marks[marks.length - 1], step = 0.5;
  const free = (s: number) => {
    const p = at(points, s, marks), [ux, uz] = tangent(points, s, marks);
    return [value(lo, p), value(hi, p)].every(offset => !blocked([p[0] - uz * offset, p[1] + ux * offset]));
  };
  let start: number | null = null;
  for (let s = 0; s <= length + step; s += step) {
    const open = s <= length && free(s);
    if (open && start === null) start = s;
    if (!open && start !== null) {
      if (s - step > start) strip(paint, sliceLine(points, start, Math.min(s - step, length), marks), lo, hi, y, material);
      start = null;
    }
  }
}

function solid(paint: Paint, points: Line, offset = 0, cuts: readonly Cut[] = [], width = LINE_WIDTH) {
  band(paint, points, offset - width / 2, offset + width / 2, cuts);
}

/** Dashes measured along the whole line, so bends and vertices never restart the rhythm. */
function dashed(paint: Paint, points: Line, cuts: readonly Cut[] = []) {
  const marks = stations(points), period = DASH + GAP;
  for (const [lo, hi] of spans(marks[marks.length - 1], cuts))
    for (let n = Math.floor(lo / period); n * period < hi; n++) {
      const start = Math.max(lo, n * period), end = Math.min(hi, n * period + DASH);
      if (end - start > 0.3) strip(paint, sliceLine(points, start, end, marks), -LINE_WIDTH / 2, LINE_WIDTH / 2);
    }
}

function segment(paint: Paint, a: Point, c: Point, width: number = LINE_WIDTH) {
  strip(paint, [a, c], -width / 2, width / 2);
}

/** A straight transverse bar, between two offsets left of the direction `along`. */
function bar(paint: Paint, point: Point, along: Point, lo: number, hi: number) {
  const nx = -along[1], nz = along[0], u = along[0] * STOP_WIDTH / 2, v = along[1] * STOP_WIDTH / 2;
  const a: Point = [point[0] + nx * lo, point[1] + nz * lo], c: Point = [point[0] + nx * hi, point[1] + nz * hi];
  paint.ring([[a[0] - u, a[1] - v], [c[0] - u, c[1] - v], [c[0] + u, c[1] + v], [a[0] + u, a[1] + v]]);
}

/** The crossing-ahead rhombus: an outline, longer along the lane than across it. */
function diamond(paint: Paint, point: Point, along: Point) {
  const nx = -along[1], nz = along[0];
  const rhombus = (u: number, v: number): Point[] => [[1, 0], [0, 1], [-1, 0], [0, -1]].map(([s, t]) =>
    [point[0] + along[0] * s * u + nx * t * v, point[1] + along[1] * s * u + nz * t * v]);
  const outer = rhombus(2.5, 0.75), inner = rhombus(2.05, 0.55);
  outer.forEach((p, i) => { const j = (i + 1) % 4; paint.ring([p, outer[j], inner[j], inner[i]]); });
}

/** Cubic centreline through control points, the same curve the carriageways are cut from. */
function sample(points: Line, step = 2): Point[] {
  const out: Point[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
    const n = Math.max(1, Math.ceil(dist(p1, p2) / step));
    const axis = (t: number, k: 0 | 1) => { const a = p0[k], b = p1[k], c = p2[k], d = p3[k];
      return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t ** 3); };
    for (let j = 0; j < n; j++) out.push([axis(j / n, 0), axis(j / n, 1)]);
  }
  out.push(points[points.length - 1]);
  return out;
}

const INNER_ROAD = sample(APPROACH_DATA.innerRoad as unknown as Line), SCHOOL_ROAD = sample(APPROACH_DATA.schoolRoad as unknown as Line);
const INNER_ROAD_END = 438;       // Short of the corner with the north road, which owns the turn.
const NISHI = schoolRoad.crossing;
const ROUTE_25_REACH = 5.5;       // Along a side road, from Route 25's centre to its kerb return.
const EAST_SOUTH = 'way/59265940', EAST_SOUTH_EDGE = 1.75, EAST_SOUTH_STOP = 50, EAST_SOUTH_CENTRE = 28;
const PUBLIC_SIDE_ROADS = (east.roads as unknown as Road[]).filter(r => r.kind !== 'service' && r.kind !== 'corridor' && r.width >= 3);

/** The mapped east street from Route 25's side of the survey up to where the surveyed section starts. */
function eastSouth() {
  const way = (east.roads as unknown as Road[]).find(r => r.id === EAST_SOUTH)!;
  return way.points.filter(p => p[1] < eastStreet.street.from).sort((a, c) => c[1] - a[1]) as Point[];
}

/** Each side's gaps where a public road meets `line`; driveways and car parks never break an edge line. */
function sideCuts(line: Line, ...extra: Line[]) {
  const marks = stations(line), left: Cut[] = [], right: Cut[] = [];
  const meet = (end: Point, next: Point, half: number) => {
    const s = project(line, marks, end), p = at(line, s, marks);
    if (dist(p, end) > 6) return;
    const [ux, uz] = tangent(line, s, marks);
    (ux * (next[1] - end[1]) - uz * (next[0] - end[0]) > 0 ? left : right).push([s - half - JOINT_MARGIN, s + half + JOINT_MARGIN]);
  };
  for (const r of PUBLIC_SIDE_ROADS) for (const [a, c] of [[0, 1], [r.points.length - 1, r.points.length - 2]])
    meet(r.points[a], r.points[c], r.width / 2);
  for (const road of extra) meet(road[0], road[1], 3);
  return { left, right };
}

function northSample() {
  const old = sample(APPROACH_DATA.retainedNorth as unknown as Line), north = APPROACH_DATA.north as unknown as Line;
  const i = old.findIndex(p => p[1] >= 145), a = old[i - 1], c = old[i], t = (145 - a[1]) / (c[1] - a[1]);
  const landing: Point = [a[0] + (c[0] - a[0]) * t, 145];
  return [...old.filter(p => p[1] < 145), ...sample([landing, ...north.slice(north.findIndex(p => p[1] >= 152))])];
}

function nearLine(point: Point, line: Line, reach: number) {
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], c = line[i], dx = c[0] - a[0], dz = c[1] - a[1], length = dx * dx + dz * dz;
    const t = length ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / length)) : 0;
    if (Math.hypot(point[0] - a[0] - dx * t, point[1] - a[1] - dz * t) < reach) return true;
  }
  return false;
}

/** Intervals of a line where `blocked` holds, stepped finely enough for a line's visible end. */
function maskCuts(points: Line, blocked: (p: Point) => boolean, step = 1) {
  const marks = stations(points), length = marks[marks.length - 1], cuts: Cut[] = [];
  let start: number | null = null;
  for (let s = 0; s <= length; s += step) {
    const stop = blocked(at(points, s, marks));
    if (stop && start === null) start = s;
    else if (!stop && start !== null) { cuts.push([start - step / 2, s + step / 2]); start = null; }
  }
  if (start !== null) cuts.push([start - step / 2, length + 1]);
  return cuts;
}

function covered(x: number, z: number) {
  const ring = frame.east.coverage;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[i], [cx, cz] = ring[j];
    if ((az > z) !== (cz > z) && x < ax + (z - az) * (cx - ax) / (cz - az)) inside = !inside;
  }
  return inside;
}

/** Sutherland-Hodgman against a convex outline. */
function clipConvex(subject: Line, outline: Line) {
  const signed = outline.reduce((sum, a, i) => { const c = outline[(i + 1) % outline.length]; return sum + a[0] * c[1] - c[0] * a[1]; }, 0);
  let out: Point[] = [...subject];
  outline.forEach((a, i) => {
    const c = outline[(i + 1) % outline.length];
    const side = (p: Point) => Math.sign(signed) * ((c[0] - a[0]) * (p[1] - a[1]) - (c[1] - a[1]) * (p[0] - a[0]));
    const kept: Point[] = [];
    out.forEach((p, k) => {
      const q = out[(k + 1) % out.length], sp = side(p), sq = side(q);
      if (sp >= 0) kept.push(p);
      if (sp >= 0 !== sq >= 0) { const t = sp / (sp - sq); kept.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    });
    out = kept;
  });
  return out;
}

const WALK_CROSSINGS = [19.7, 44.3], STOP_BARS = [16.4, 47.6];

function kyobashiCrossings(paint: Paint) {
  for (let i = 0; i < 9; i++) {
    const z = 22.5 + i * 0.85, x = 28.4 + i * 0.85;
    for (const c of WALK_CROSSINGS) paint.ring([[c - 1.3, z], [c + 1.3, z], [c + 1.3, z + 0.43], [c - 1.3, z + 0.43]]);
    paint.ring([[x, 16.4], [x + 0.43, 16.4], [x + 0.43, 19], [x, 19]]);
    paint.ring([[x, 33.1], [x + 0.43, 33.1], [x + 0.43, 35.7], [x, 35.7]]);
    for (const crossing of TOWN_CROSSINGS) {
      const half = crossing.depth / 2, left = castleX(crossing.z) - 3.6 + i * 0.85;
      paint.ring([[left, crossing.z - half], [left + 0.43, crossing.z - half], [left + 0.43, crossing.z + half], [left, crossing.z + half]]);
    }
  }
}

function route25(paint: Paint) {
  const main: Point[] = [];
  for (let x = -220; x <= 200; x += 2) main.push([x, 26 + moatBend(x)]);
  const marks = stations(main), along = (x: number) => { const i = Math.max(0, Math.min(main.length - 2, Math.floor((x + 220) / 2)));
    return marks[i] + (marks[i + 1] - marks[i]) * ((x + 220) / 2 - i); };
  const junction: Cut = [along(WALK_CROSSINGS[0] - 1.3), along(WALK_CROSSINGS[1] + 1.3)];
  const alley = TOWN_STREETS[0].points[0][0];
  const sides = ([[alley - 3.5, alley + 3.5]] as const).map(([lo, hi]) => [along(lo), along(hi)] as Cut);
  // The geographic map owns the road past the practice area and continues these lines.
  const owned = maskCuts(main, p => covered(p[0], p[1]));
  solid(paint, main, 3.55, [junction, ...owned]);
  solid(paint, main, -3.55, [junction, ...sides, ...owned]);
  solid(paint, sliceLine(main, along(-20), along(STOP_BARS[0]), marks));
  solid(paint, sliceLine(main, along(STOP_BARS[1]), along(54), marks));
  dashed(paint, main, [[along(-130), along(84)], ...owned]);

  // The western parking frontage has a tapered central hatch, visible in Street View.
  const hatch: Point[] = [[-130, 26], [-116, 25.4], [-48, 25.4], [-20, 26.15], [-48, 26.6], [-116, 26.6]];
  hatch.forEach((a, i) => segment(paint, a, hatch[(i + 1) % hatch.length]));
  for (let x = -126; x < -23; x += 3) {
    const d = Math.SQRT1_2 * 0.1;
    paint.ring(clipConvex([[x - 1 + d, 25 - d], [x + 1 + d, 27 - d], [x + 1 - d, 27 + d], [x - 1 - d, 25 + d]], hatch));
  }
  // A tapered guide area between the two traffic envelopes on the east approach.
  const wedge: Point[] = [[54, 26.4], [69, 24.95], [81, 25.95], [69, 26.75]];
  wedge.forEach((a, i) => segment(paint, a, wedge[(i + 1) % wedge.length]));
  for (let i = 0; i < 17; i++) {
    const v = 80 + i * 1.7, d = 0.0525, c: Point = [v / 2 + 0.0525, v / 2 + 0.0525];
    paint.ring(clipConvex([[c[0] - 30 + d, c[1] + 30 + d], [c[0] + 30 + d, c[1] - 30 + d], [c[0] + 30 - d, c[1] - 30 - d], [c[0] - 30 - d, c[1] + 30 - d]], wedge));
  }
  // Stop bars stand behind the crosswalks, leaving the crossing surfaces intact.
  segment(paint, [STOP_BARS[1], 22.5], [STOP_BARS[1], 25.85], STOP_WIDTH);
  segment(paint, [STOP_BARS[0], 26.15], [STOP_BARS[0], 29.5], STOP_WIDTH);
  segment(paint, [28.5, 14.1], [31.85, 14.1], STOP_WIDTH);
  segment(paint, [32.15, 37.75], [35.5, 37.75], STOP_WIDTH);
  const arrow = (x: number, z: number, dx: number, dz: number, turn = false) => {
    const local = (u: number, v: number): Point => [x + dx * u - dz * v, z + dz * u + dx * v];
    paint.ring([local(-1.45, -0.1), local(0.6, -0.1), local(0.6, 0.1), local(-1.45, 0.1)]);
    paint.ring([local(0.6, -0.43), local(1.45, 0), local(0.6, 0.43)]);
    if (!turn) return;
    paint.ring([local(-0.35, 0), local(-0.35, -0.65), local(-0.13, -0.65), local(-0.13, 0)]);
    paint.ring([local(0.2, -0.65), local(-0.25, -1.12), local(-0.7, -0.65)]);
  };
  arrow(52.6, 23.8, -1, 0, true);
  arrow(-12, 28, 1, 0);
  arrow(30, 11, 0, 1);
}

/** Castle Road has edge lines and crossing diamonds, but no centre line (Street View, 2024). */
function castleRoad(paint: Paint) {
  const castle: Point[] = [];
  for (let z = -154; z < 14; z += 2) castle.push([castleX(z), z]);
  for (const side of [-3.55, 3.55]) solid(paint, castle, side, [[4, 22], [82, 96]]);
  for (const [z, travel] of [[-14, 1], [-19, -1], [-39, -1], [-99, 1], [-95.5, -1], [-115.5, -1], [-119, 1]])
    diamond(paint, [castleX(z) - travel * 1.8, z], [0, travel]);
}

function moatApproach(paint: Paint) {
  // The bridge and north bend have edge lines and green margins, with no centre dashes.
  const bridge: Point[] = [[32, 39.6], [32, 41], [32, 72.6], [32, 74]];
  const northHalf = (_x: number, z: number) => 4 - Math.max(0, Math.min(1, (z - 100) / 15));
  const north = northSample();
  north.pop();     // End before the mapped road's open end.
  const junction = (p: Point) => nearLine(p, SCHOOL_ROAD, 3.05) || nearLine(p, INNER_ROAD, 3.55);
  for (const side of [-1, 1]) {
    band(paint, bridge, side * 3.55, side * 3.7);
    band(paint, bridge, side * 3.74, side * 4, [], GREEN, 'ART_PathGreen');
    band(paint, bridge, side * 4, side * 5.05, [], 0.012, 'ART_PathGreen');
    const edge = (offset: number) => (x: number, z: number) => side * (northHalf(x, z) + offset);
    maskedBand(paint, north, edge(-0.65), edge(-0.5), junction);
    maskedBand(paint, north, edge(-0.46), edge(0), junction, GREEN, 'ART_PathGreen');
  }
}

function parking(paint: Paint) {
  for (const z of [-29, -13, 3]) {
    for (let x = -103; x < -34; x += 3) if (!(z === 3 && x > -71 && x < -58)) segment(paint, [x, z], [x, z + 5], 0.1);
    segment(paint, [-103, z + 5], [-34, z + 5], 0.1);
  }
}

/** Quadratic curve through three points, for the painted returns at the Nishi corner. */
function curve(a: Point, b: Point, c: Point, steps = 10): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps, s = 1 - t;
    return [s * s * a[0] + 2 * s * t * b[0] + t * t * c[0], s * s * a[1] + 2 * s * t * b[1] + t * t * c[1]] as Point;
  });
}

/** The bicycle pictogram of the Nishi crossing, centred on (u, v) of the local frame. */
function bicycle(paint: Paint, local: (u: number, v: number) => Point, u: number, v: number, size: number) {
  const at = (s: number, t: number) => local(u + s * size, v + t * size);
  const trace = (points: Point[]) => points.forEach((p, i) => { if (i) segment(paint, at(...points[i - 1]), at(...p), 0.09 * size); });
  for (const s of [-0.62, 0.62]) trace(Array.from({ length: 21 }, (_, i) => {
    const a = i / 20 * Math.PI * 2;
    return [s + Math.cos(a) * 0.36, Math.sin(a) * 0.36] as Point;
  }));
  trace([[-0.62, 0], [-0.2, 0.42], [0.42, 0.42], [0.62, 0], [0, 0], [-0.2, 0.42]]);
  trace([[0, 0], [0.42, 0.42]]);
  trace([[0.42, 0.42], [0.36, 0.6], [0.16, 0.6]]);
  trace([[-0.32, 0.5], [-0.08, 0.5]]);
}

/**
 * The crossing beside the Nishi gate (0991, 0995 and the November 2022 panorama). Zebra stripes
 * lie along the road; the blue cycle band is on the rampart-stair side of them, and westbound
 * traffic stops at a bar with a green trail short of both. See `crossing` in school-road.json.
 */
function nishiCrossing(paint: Paint) {
  const road = field.schoolRoad.points as unknown as Line, a = road[road.length - 2], c = road[road.length - 3];
  const length = dist(a, c), ux = (c[0] - a[0]) / length, uz = (c[1] - a[1]) / length, nx = -uz, nz = ux;
  const x = NISHI.origin, z = a[1] + (c[1] - a[1]) * (x - a[0]) / (c[0] - a[0]);
  const local = (u: number, v: number): Point => [x + ux * u + nx * v, z + uz * u + nz * v];
  const box = (lo: number, hi: number, near: number, far: number, y = PAINT, material: Material = 'HK_WhitePaint') =>
    paint.ring([local(lo, near), local(hi, near), local(hi, far), local(lo, far)], y, material);
  const { zebra, blue, stopBar } = NISHI, [left, right] = blue.u, [wall, gate] = blue.v, [pictureNear, pictureFar] = blue.picture;
  for (let i = 0; i < zebra.stripes; i++) box(zebra.u[0], zebra.u[1], zebra.v + i * zebra.pitch, zebra.v + i * zebra.pitch + zebra.width);
  box(left, right, wall, pictureNear, PAINT, 'HK_SignBlue');
  for (const [lo, hi] of [[left, left + 0.22], [right - 0.22, right]]) box(lo, hi, pictureNear, pictureFar, PAINT, 'HK_SignBlue');
  box(left, right, pictureFar, pictureFar + 0.2, PAINT, 'HK_SignBlue');
  for (const [lo, hi] of [[left - blue.border, left], [right, right + blue.border]]) box(lo, hi, wall, gate);
  bicycle(paint, local, (left + right) / 2, (pictureNear + pictureFar) / 2 - 0.1, 1.15);
  bicycle(paint, local, (left + right) / 2, wall + 0.55, 0.62);
  box(stopBar.u - STOP_WIDTH / 2, stopBar.u + STOP_WIDTH / 2, stopBar.v[0], stopBar.v[1]);
  box(stopBar.u + STOP_WIDTH / 2, stopBar.u + STOP_WIDTH / 2 + stopBar.green, stopBar.v[0], stopBar.v[1], GREEN, 'ART_PathGreen');
  for (const [start, bend, end] of NISHI.returns as unknown as [Point, Point, Point][]) solid(paint, curve(start, bend, end));
  const [[bx, bz], [cx, cz]] = NISHI.westStop as unknown as Point[];
  segment(paint, [bx, bz], [cx, cz], STOP_WIDTH);
}

function photographedStreets(paint: Paint) {
  // Green shoulders and edge lines run the whole inner-moat corridor, to the corner it turns at
  // (November 2022 panoramas at (30, 345) and (-120, 170)).
  const inner = INNER_ROAD.filter(p => p[1] >= 90 && p[1] <= INNER_ROAD_END);
  const accesses: Line[] = APPROACH_DATA.localStreets;
  const accessMouth = (point: Point) => accesses.some(line => nearLine(point,line,2.2));
  for (const side of [-1, 1]) {
    maskedBand(paint, inner, side * 2.85, side * 3.3, accessMouth, PAINT, 'ART_PathGreen');
    maskedBand(paint, inner, side * 2.7, side * 2.85, accessMouth, GREEN);
  }
  // The school-side road's lines stop at the two junctions it meets.
  const school = higashi.roads.schoolSide as unknown as Line;
  const north = northSample();
  const junction = (p: Point) => nearLine(p, north, 3.05) || nearLine(p, INNER_ROAD, 3.55);
  for (const side of [-1, 1]) {
    maskedBand(paint, school, side * 2.55, side * 3, junction, 0.024, 'ART_PathGreen');
    maskedBand(paint, school, side * 2.35, side * 2.5, junction, 0.024);
  }
  nishiCrossing(paint);
  // Painted diamonds on the rampart road (0980, 1004).
  for (const [dx, dz, turn] of schoolRoad.diamonds.points) {
    const angle = turn * Math.PI / 180, sin = Math.sin(angle), cos = Math.cos(angle);
    const point = (u: number, v: number): Point => [dx + sin * v + cos * u, dz + cos * v - sin * u];
    const rhombus = (w: number, h: number) => [point(0, -h), point(w, 0), point(0, h), point(-w, 0)];
    paint.ring(rhombus(0.75, 1.9), 0.021, 'ART_PathGreen');
    const outer = rhombus(0.62, 1.5), inner = rhombus(0.42, 1);
    outer.forEach((p, i) => { const j = (i + 1) % 4; paint.ring([p, outer[j], inner[j], inner[i]]); });
  }
  // The green cycle band follows the moat-side street's left edge through the bend (0980, 0985, 0990).
  // Its edge lines carry on to the inner-moat road, and stop at Route 25 with a stop bar.
  const link = UNIVERSITY_DATA.link as unknown as Line;
  const west = UNIVERSITY_DATA.road as unknown as Line;
  const linkMouth: Cut = [-1, ROUTE_25_REACH];
  // The wall-side line turns off at the Nishi corner, which paints its own hooks and stop bars.
  const nishiCorner = maskCuts(link, p => p[1] > NISHI.lineEnd && p[0] < NISHI.origin + NISHI.stopBar.u);
  // IMG_1074-1081: the narrow tennis-lot lane has no continuous edge bands.
  const unmarkedLane = maskCuts(link, p => p[0] > -545);
  band(paint, link, 2.25, 2.4, [linkMouth, ...unmarkedLane]);
  band(paint, link, -2.4, -2.25, [linkMouth, ...nishiCorner, ...unmarkedLane]);
  band(paint, link.slice(0, 8), 2.42, 2.92, [linkMouth, ...unmarkedLane], 0.021, 'ART_PathGreen');
  bar(paint, at(link, ROUTE_25_REACH + 0.3), tangent(link, 1).map(n => -n) as unknown as Point, 0.1, 2.25);
  const owned = maskCuts(west, p => covered(p[0], p[1]));
  dashed(paint, west, owned);
  // Route 25 west of the practice area keeps its edge lines, broken only at public roads.
  const { left, right } = sideCuts(west, link);
  solid(paint, west, 3.55, [...owned, ...left]);
  solid(paint, west, -3.55, [...owned, ...right]);
  // The south end of the east street meets Route 25 with a centre line and a stop bar (panorama
  // at (240, 70)). The modelled carriageway is narrower than the real one here.
  const south = eastSouth();
  const mouth = maskCuts(south, p => p[1] < EAST_SOUTH_STOP);
  for (const side of [-1, 1]) solid(paint, south, side * EAST_SOUTH_EDGE, mouth);
  solid(paint, south, 0, [...mouth, ...maskCuts(south, p => p[1] > EAST_SOUTH_STOP + EAST_SOUTH_CENTRE)]);
  const { length: count } = south, tail = south[count - 2], end = south[count - 1], run = dist(tail, end);
  bar(paint, [tail[0] + (end[0] - tail[0]) * (tail[1] - EAST_SOUTH_STOP) / (tail[1] - end[1]), EAST_SOUTH_STOP],
    [(end[0] - tail[0]) / run, (end[1] - tail[1]) / run], 0.1, EAST_SOUTH_EDGE);
  // The east street's edge lines; its section is offset from the mapped centre by the survey.
  const street = eastStreet.street, points = street.points as unknown as Line;
  const centre = (station: number) => {
    for (let i = 1; i < points.length; i++) if (points[i - 1][1] <= station && station <= points[i][1])
      return points[i - 1][0] + (points[i][0] - points[i - 1][0]) * (station - points[i - 1][1]) / (points[i][1] - points[i - 1][1]);
    return station < points[0][1] ? points[0][0] : points[points.length - 1][0];
  };
  const steps = [...new Set([street.from, street.to, ...points.map(p => p[1]).filter(p => p > street.from && p < street.to)])];
  for (let s = street.from; s < street.to; s += 12) if (!steps.includes(s)) steps.push(s);
  steps.sort((p, q) => p - q);
  for (const lo of [street.road[0] + 0.28, street.road[1] - 0.43]) for (let i = 1; i < steps.length; i++) {
    const p = steps[i - 1], q = steps[i];
    paint.ring([[centre(p) + lo, p], [centre(p) + lo + LINE_WIDTH, p], [centre(q) + lo + LINE_WIDTH, q], [centre(q) + lo, q]]);
  }
}

function profile(road: Road): Profile {
  return rules.profiles.find(item => item.name === road.name)
    ?? rules.defaults[road.kind as keyof typeof rules.defaults] ?? rules.defaults.service;
}
const kerbMargin = (road: Road) => rules.kerbMargin[road.kind as 'primary'] ?? rules.kerbMargin.default;
const edgeOffset = (road: Road) => road.width / 2 - kerbMargin(road);
const reversed = (road: Road): Road => ({ ...road, points: [...road.points].reverse(), nodes: [...road.nodes].reverse() });

/** Join ways split only by map tags, so a line and its rhythm run through their ends. */
function chains(roads: Road[]) {
  const marked = roads.filter(r => profile(r).edge && !r.tunnel), ends = new Map<string, Road[]>();
  for (const r of marked) for (const node of [r.nodes[0], r.nodes[r.nodes.length - 1]])
    ends.set(node, [...ends.get(node) ?? [], r]);
  const key = (r: Road) => [r.name, r.kind, r.width, r.oneway === 'yes'].join();
  const used = new Set<string>(), out: Chain[] = [];
  const extend = (chain: Road[], start: string) => {
    let node = start;
    for (;;) {
      const here = ends.get(node) ?? [], next = here.find(r => !used.has(r.id) && key(r) === key(chain[0]));
      if (here.length !== 2 || !next) return;
      used.add(next.id);
      const road = next.nodes[0] === node ? next : reversed(next);
      chain.push(road);
      node = road.nodes[road.nodes.length - 1];
    }
  };
  for (const r of marked) {
    if (used.has(r.id)) continue;
    used.add(r.id);
    const tail = [r], head = [reversed(r)];
    extend(tail, r.nodes[r.nodes.length - 1]);
    extend(head, r.nodes[0]);
    const parts = [...head.slice(1).reverse().map(reversed), ...tail];
    const points = [parts[0].points[0]], nodes = [parts[0].nodes[0]];
    for (const p of parts) { points.push(...p.points.slice(1)); nodes.push(...p.nodes.slice(1)); }
    out.push({ ...parts[0], points, nodes, ids: new Set(parts.map(p => p.id)) });
  }
  return out;
}

function project(points: Line, marks: number[], target: Point) {
  let best = Infinity, station = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], c = points[i], dx = c[0] - a[0], dz = c[1] - a[1], length = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((target[0] - a[0]) * dx + (target[1] - a[1]) * dz) / length));
    const d = Math.hypot(target[0] - a[0] - dx * t, target[1] - a[1] - dz * t);
    if (d < best) { best = d; station = marks[i - 1] + t * Math.sqrt(length); }
  }
  return station;
}

function network(paint: Paint) {
  const roads = (east.roads as unknown as Road[]).filter(r => r.kind !== 'corridor' && r.width >= 3);
  const roadChains = chains(roads);
  // Authored streets own their own section; a mapped centreline may not paint over them.
  const authored: [Line, number][] = [[northSample(), 5], [INNER_ROAD, 5], [SCHOOL_ROAD, 5],
    [eastStreet.street.points as unknown as Line, 5.5], [UNIVERSITY_DATA.road as unknown as Line, 5], [UNIVERSITY_DATA.link as unknown as Line, 5],
    [field.schoolRoad.points as unknown as Line, 5], [higashi.roads.schoolSide as unknown as Line, 5]];
  const keep = (p: Point) => covered(p[0], p[1]) && !authored.some(([line, reach]) => nearLine(p, line, reach));
  const facilities = east.facilities as unknown as Facility[];
  const signals = new Set(facilities.filter(f => f.tags.highway === 'traffic_signals').map(f => f.id.split('/')[1]));
  const crossings = facilities.filter(f => f.direction);
  const onChain = (f: Facility, chain: Chain) => nearLine([f.x, f.z], chain.points, chain.width / 2);
  const byNode = new Map<string, Chain[]>();
  for (const chain of roadChains) for (const node of chain.nodes) byNode.set(node, [...byNode.get(node) ?? [], chain]);

  const sideStop = (road: Road, i: number, j: number, chain: Chain) => {
    const here = road.points[i], there = road.points[j], length = dist(here, there), reach = chain.width / 2 + 1;
    if (length <= reach) return;
    const ux = (there[0] - here[0]) / length, uz = (there[1] - here[1]) / length;
    const point: Point = [here[0] + ux * reach, here[1] + uz * reach];
    if (!keep(point)) return;
    const half = road.width / 2 - 0.3;
    bar(paint, point, [-ux, -uz], road.oneway === 'yes' ? -half : 0.1, half);
  };

  for (const chain of roadChains) {
    const points = chain.points, marks = stations(points), length = marks[marks.length - 1];
    if (length < 8) continue;
    const style = profile(chain), edge = edgeOffset(chain), oneway = chain.oneway === 'yes';
    const blocked = maskCuts(points, p => !keep(p));
    const shared: Cut[] = [], left: Cut[] = [], right: Cut[] = [], runs: Cut[] = [], stops: [number, number][] = [];
    chain.nodes.forEach((node, n) => {
      const s = marks[n];
      for (const other of byNode.get(node) ?? []) {
        if (other === chain) continue;
        const reach = other.width / 2 + JOINT_MARGIN;
        shared.push([s - reach, s + reach]);
        if (s - reach > 0) stops.push([s - reach, 1]);
        if (s + reach < length && !oneway) stops.push([s + reach, -1]);
      }
      if (signals.has(node)) runs.push([s - rules.signalApproach, s + rules.signalApproach]);
      for (const r of roads) {
        const i = r.nodes.indexOf(node);
        if (i < 0 || chain.ids.has(r.id) || profile(r).edge) continue;
        // Edge lines run across driveways and car-park mouths (panoramas at (275, 372), (-265, 206)).
        if (r.kind === 'service') continue;
        const reach = r.width / 2 + JOINT_MARGIN;
        for (const j of [i - 1, i + 1]) {
          if (j < 0 || j >= r.points.length) continue;
          const [ux, uz] = tangent(points, s, marks);
          const side = ux * (r.points[j][1] - r.points[i][1]) - uz * (r.points[j][0] - r.points[i][0]);
          (side > 0 ? left : right).push([s - reach, s + reach]);
          sideStop(r, i, j, chain);
        }
      }
    });
    const zebras = crossings.filter(f => onChain(f, chain)).map(f => ({ f, s: project(points, marks, [f.x, f.z]) }));
    for (const { s } of zebras) shared.push([s - ZEBRA_HALF - ZEBRA_CLEARANCE, s + ZEBRA_HALF + ZEBRA_CLEARANCE]);
    const placeDiamond = (station: number, direction: number) => {
      if (station < 0 || station > length || [...shared, ...blocked].some(([lo, hi]) => lo - 4 <= station && station <= hi + 4)) return;
      const [ux, uz] = tangent(points, station, marks), p = at(points, station, marks), offset = oneway ? 0 : direction * edge / 2;
      diamond(paint, [p[0] - uz * offset, p[1] + ux * offset], [ux, uz]);
    };
    for (const { f, s } of zebras) if (!f.controlled) for (const distance of rules.diamondStations) {
      placeDiamond(s - distance, 1);
      if (!oneway) placeDiamond(s + distance, -1);
    }
    const cuts = [...shared, ...blocked];
    if (style.edge) {
      solid(paint, points, edge, [...cuts, ...left]);
      solid(paint, points, -edge, [...cuts, ...right]);
      // A green margin outside the edge line on the side named by its profile.
      if (style.green) {
        const { xMin, xMax, side: towards } = style.green;
        const sign = (points[length && points.length - 1][0] - points[0][0] > 0 ? 1 : -1) * (towards === 'south' ? -1 : 1);
        const away = maskCuts(points, p => p[0] < xMin || p[0] > xMax);
        const inner = sign * (edge + LINE_WIDTH / 2 + 0.03), outer = sign * (edge + kerbMargin(chain) - 0.03);
        band(paint, points, Math.min(inner, outer), Math.max(inner, outer), [...cuts, ...away, ...(sign > 0 ? left : right)], GREEN, 'ART_PathGreen');
      }
    }
    if (style.centre === 'dashed') {
      for (const [lo, hi] of runs) {
        const a = Math.max(0, lo), c = Math.min(length, hi);
        for (const [p, q] of spans(c - a, cuts.map(([x, y]) => [x - a, y - a]))) solid(paint, sliceLine(points, a + p, a + q, marks));
      }
      dashed(paint, points, [...cuts, ...runs]);
    }
    for (const [s, direction] of stops) {
      if (blocked.some(([lo, hi]) => lo <= s && s <= hi)) continue;
      // `direction` 1: traffic runs along the line, stopping at s, and keeps left of that travel.
      let hold = s;
      for (const zebra of zebras) {
        const gap = (s - zebra.s) * direction;
        if (gap >= 0 && gap < CROSSING_APPROACH) hold = zebra.s - direction * (ZEBRA_HALF + STOP_SETBACK);
      }
      if (hold < 0 || hold > length) continue;
      const [ux, uz] = tangent(points, hold, marks);
      bar(paint, at(points, hold, marks), [ux * direction, uz * direction], oneway ? -edge : 0.1, edge);
    }
  }
}

export function roadMarkingCommands() {
  const paint = new Paint();
  kyobashiCrossings(paint);
  route25(paint);
  castleRoad(paint);
  moatApproach(paint);
  parking(paint);
  photographedStreets(paint);
  for (const triangle of east.paint as unknown as Point[][]) paint.ring(triangle);
  network(paint);
  return paint.faces;
}
