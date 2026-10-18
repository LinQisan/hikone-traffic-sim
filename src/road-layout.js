// Local placements accompanying tools/road_network.py's overhead road reconstruction.
// The practice junction remains (32,26); the rest of the imported tile grid is replaced.
import { CASTLE_ITEMS } from './castle-layout.js';
import { NORTH_APPROACH, INNER_MOAT_ROAD, distanceToPath, APPROACH_BUILDINGS, APPROACH_PATCHES } from './castle-approach.js';
export function moatBend(x) {
  const t = Math.max(0, Math.min(1, (x - 110) / 130));
  return 30 * t * t * (3 - 2 * t);
}
// Away from the bridge-foot signal corners the moat side is a ~2.5 m footway and a narrow
// planted strip (Street View, October 2024). Same profile as tools/road_network.py.
export const SHORE_INSET = 5, PATH_INSET = 3.5;
export function shoreTaper(x) {
  const t = Math.max(0, Math.min(1, (Math.abs(x - 32) - 13) / 17));
  return t * t * (3 - 2 * t);
}
const shoreSlope = x => {
  const t = (Math.abs(x - 32) - 13) / 17;
  return t <= 0 || t >= 1 ? 0 : Math.sign(x - 32) * SHORE_INSET * 6 * t * (1 - t) / 17;
};
/** Town-side water edge and the back of the moat footway, before the eastern bend. */
export const moatEdge = x => 39.6 - SHORE_INSET * shoreTaper(x);
export const moatPathEdge = x => 36 - PATH_INSET * shoreTaper(x);
// The town side is a ~2.5 m footway with buildings at its back (same profile in Python).
export const TOWN_INSET = 3.5;
export function townTaper(x) {
  const t = Math.max(0, Math.min(1, (Math.abs(x - 32) - 10) / 8));
  return t * t * (3 - 2 * t);
}
export const townPathEdge = x => 16 + TOWN_INSET * townTaper(x);
// Half widths (with eaves) of the Route 25 frontage. A building moves only as far as its
// least-tapered end allows, so no wall or eave stands on the raised footway.
const FRONT_HALF = { HK_Machiya_A: 4.1, HK_Machiya_A_Narrow: 3.2, HK_Machiya_B: 3.5, HK_Machiya_C: 4.7,
  HK_Kura: 3.5, ART_CornerShop: 3.4, ART_WhiteStorehouse: 4, ART_EavesStorehouse: 4,
  ART_ThreeStorey: 3.5, ART_WestCorner: 8.1, ART_NorthLonghouse: 18.6 };
export function frontageShift(a, x, scale = 1) {
  const half = (FRONT_HALF[a] ?? 4.2) * scale;
  let s = 1;
  for (let u = -half; u <= half + 1e-9; u += half / 8) s = Math.min(s, townTaper(x + u));
  return TOWN_INSET * s;
}
export const castleX = z => 32 + Math.max(0, -z) * 0.065;
export const northShore = x => 74 + 0.7 * moatBend(x) + Math.max(0, Math.min(1, (-x - 15) / 60)) * 10;
// A simplified raised bank behind the visible stonework. Ground triangles use the same profile
// in tools/road_network.py; planting/ground agreement is checked on the exported geometry.
export function northBankHeight(x, z) {
  const d = z - northShore(x);
  return 0.15 + 3 * Math.max(0, Math.min(1, (32 - d) / 12));
}

function inside(x, z, polygon) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, az] = polygon[i], [bx, bz] = polygon[j];
    if ((az > z) !== (bz > z) && x < ax + (bx - ax) * (z - az) / (bz - az)) hit = !hit;
  }
  return hit;
}

// Building footprints, rather than their origins, must stay clear of the new through streets.
function coversStreet(item) {
  const [x, , z] = item.p, a = item.r * Math.PI / 180;
  const w = item.a.includes('Narrow') ? 2.7 : item.a.includes('Kura') ? 3 : 4.2;
  for (const u of [-w, 0, w]) for (const v of [-9, -4.5, 0]) {
    const px = x + u * Math.cos(a) + v * Math.sin(a);
    const pz = z - u * Math.sin(a) + v * Math.cos(a);
    if (Math.abs(pz + 64) < 5 || (pz < 16 && Math.abs(px - castleX(pz)) < 5.2)
      || (pz > -65 && pz < 22 && Math.abs(px + 28) < 4.2)
      || (pz > -65 && pz < 30 && Math.abs(px - 134) < 4.2)) return true;
  }
  return false;
}

const worldAsset = a => ({ a, p: [0, 0, 0], r: 0, s: [1, 1, 1], g: 'WebRoad' });

export function roadLayout(layout) {
  const items = [];
  for (const original of layout.items) {
    let item = { ...original, p: [...original.p], s: [...original.s] };
    let [x, y, z] = item.p;
    if (['Roads', 'Ground', 'Landscape', 'Lamps', 'StreetTrees'].includes(item.g)
      || item.g === 'WebRoad' || /GateHouse/.test(item.a)
      || item.a === 'ART_MoatRoadPaint' || item.a === 'ART_MoatRoadSurface') continue;
    if (item.g === 'Moat' && item.a !== 'HK_ChainFence') continue;
    // The rectangular gate court and its surrounding wall are an imported invention.
    // The imported miniature castle compound and dense conifer grid do not follow the reference.
    // Only the reviewed canopy masses below are used in the immediate northern background.
    if (item.g === 'Castle' || item.g === 'Forest') continue;
    if (item.g === 'Buildings') {
      if (x > -27 && x < 9.5 && z > 6 && z < 17) continue; // reviewed single-storey long frontage
      if (item.a === 'HK_Kura' && Math.abs(x - 21.6) < 0.01 && Math.abs(z - 1.4) < 0.01) continue;
      if (x > 90 && z > -5 && z < 40) continue; // old right-angle return frontage
      if (x > -107 && x < -32 && z > -43 && z < 16) continue; // open parking forecourt
      if (z < 4 && Math.abs(x - 32) < 25) item.p[0] += castleX(z) - 32;
      if (coversStreet(item)) continue;
      // The Route 25 row stands at the back of the narrowed footway.
      if (item.r === 0 && z > 14.5 && z < 16.5) item.p[2] += frontageShift(item.a, x, item.s[0]);
    }
    // Imported cedars and pines scattered through the town blocks are absent from the overhead
    // image, where the blocks are roofs with occasional broad garden trees.
    if (item.a === 'HK_Tree_Cedar' || item.a === 'HK_Tree_Pine') continue;
    if (item.g === 'Trees' && (Math.abs(z + 64) < 7 || Math.abs(x - castleX(z)) < 11
      || (x > -107 && x < -32 && z > -43 && z < 16))) continue;
    if (item.g === 'Signs') {
      // The imported school-warning diamonds and isolated speed discs are absent here.
      // Reviewed poles below combine the speed limit and no-parking discs seen in Street View.
      if (/^HK_Sign_(School|Speed)/.test(item.a)) continue;
      if (item.a === 'HK_Sign_Stop' || item.a === 'HK_Sign_Guide') continue;
      if (z < 0) item.p[0] += castleX(z) - 32;
      if (x > 82) item.p[2] += moatBend(x);
    }
    if (item.g === 'Walls') {
      continue; // reviewed parking frontage uses low hedge beds with open driveways
    }
    if (item.a === 'HK_Guardrail' || item.a === 'HK_GuidePost') continue;
    if (item.a === 'HK_ChainFence') {
      // The fence keeps its 0.45 m setback from the narrowed shore and turns with the taper.
      const slope = shoreSlope(x);
      item.p[2] -= SHORE_INSET * shoreTaper(x);
      item.r += Math.atan(slope) * 180 / Math.PI;
      item.s[0] *= Math.hypot(1, slope);
    }
    if ((item.g === 'Moat' || item.g === 'WebBank' || item.g === 'WebStreet') && x > 82) {
      item.p[2] += moatBend(x);
      const t = Math.max(0, Math.min(1, (x - 110) / 130));
      item.r -= Math.atan(30 * 6 * t * (1 - t) / 130) * 180 / Math.PI;
    }
    items.push(item);
  }
  for (const [a, x, z, r] of [
    ['HK_Sign_Paired40', 76, 32.0, 270],
    ['HK_Sign_NoParking', -20, 21.5, 90],
    ['HK_Sign_Paired30', 39.35, -30, 0],
    ['HK_Sign_NoParking', 25.6, 38.9, 150],
    ['HK_Sign_ParkingDirection', -79, 32.3, 90],
    // 30 km/h for northbound Castle Road traffic, beside the corner house (18 October 2026 photograph)
    ['HK_Sign_Speed30', 27.5, 1.5, 180],
  ]) items.push({ a, p: [x, 0.16, z], r, s: [1, 1, 1], g: 'Signs' });
  // A broad-leaf belt, interrupted by the north approach and the visible long-house frontage.
  // These represent canopy masses, not an invented inventory of individual surveyed trees.
  for (let row = 0; row < 3; row++) for (let i = 0; i < 27; i++) {
    const x = -170 + i * 13 + Math.sin(i * 2.7 + row) * 2.5;
    const z = northShore(x) + 10 + row * 17 + Math.cos(i * 1.7 + row) * 2;
    if (distanceToPath(x, z, NORTH_APPROACH) < 14 || distanceToPath(x, z, INNER_MOAT_ROAD) < 14
      || [...APPROACH_BUILDINGS, ...APPROACH_PATCHES].some(f => inside(x, z, f.footprint))
      || (x > 45 && z > northShore(x) + 30)) continue;
    items.push({ a: 'ART_CastleGrove', p: [x, northBankHeight(x, z), z],
      r: (i * 47 + row * 29) % 360, s: [0.9 + i % 3 * 0.10, 0.88 + i % 4 * 0.07, 1], g: 'WebGrove' });
  }
  // The northern longhouse is now part of the reviewed approach, at its actual footprint.
  items.push({ a: 'ART_CastleApproach', p: [0, 0, 0], r: 0, s: [1, 1, 1], g: 'WebApproach' });
  items.push({ a: 'ART_NorthLonghouse', p: [-7.2, 0.15, 15.6 + frontageShift('ART_NorthLonghouse', -7.2, 0.9)],
    r: 0, s: [0.9, 1, 1], g: 'WebFrontage' });
  items.push({ a: 'ART_ParkingPavilion', p: [-65, 0.01, 14.6], r: 0, s: [1, 1, 1], g: 'WebFrontage' });
  for (const x of [-87, -79, -71, -55, -47, -39])
    items.push({ a: 'ART_ClippedHedge', p: [x, 0.15, 18.85], r: 0, s: [1, 1, 1], g: 'WebParking' });
  // Castle Road's formal street-tree rows: near-continuous canopies at ~9.5 m on both kerbs,
  // from just south of the junction crossing, broken only by the Honmachi cross street.
  for (const [side, start] of [[-1, -1], [1, 0]]) {
    const zs = [];
    for (let z = start; z > -114; z -= 9.5) if (Math.abs(z + 64) > 8.5) zs.push(z);
    for (const [i, z] of zs.entries()) items.push({ a: 'ART_TownTree', p: [castleX(z) + side * 5.6, 0.16, z],
      r: side < 0 ? 180 : 0, s: [0.9 + i % 2 * 0.12, 0.94 + i % 3 * 0.05, 1], g: 'WebTownTrees' });
  }
  // Close the frontage gaps beside the junction: both sides are continuous eaves-on houses.
  for (const [a, side, z] of [['HK_Machiya_B', -1, -2.8], ['HK_Machiya_A', -1, -10.4],
    ['HK_Machiya_A_Narrow', 1, -16.3]])
    items.push({ a, p: [castleX(z) + side * 10.4, 0.15, z], r: side < 0 ? 90 : 270, s: [1, 1, 1], g: 'WebFrontage' });
  items.push(...CASTLE_ITEMS);
  // Continue the town frontage along the gently bending bank, instead of across the road.
  const facades = ['HK_Machiya_A', 'HK_Kura', 'HK_Machiya_A_Narrow', 'HK_Machiya_B'];
  for (let i = 0; i < 13; i++) {
    const x = 88 + i * 7.2;
    if (x > 126 && x < 141) continue; // actual narrow street east of the hotel
    const t = Math.max(0, Math.min(1, (x - 110) / 130));
    items.push({ a: facades[i % facades.length], p: [x, 0.15, 15.4 + TOWN_INSET + moatBend(x)],
      r: -Math.atan(30 * 6 * t * (1 - t) / 130) * 180 / Math.PI,
      s: [1, 1, 1], g: 'WebFrontage' });
  }
  for (const a of ['ART_KyobashiRoads', 'ART_KyobashiLand', 'ART_KyobashiBanks', 'ART_KyobashiWater', 'ART_KyobashiBridge'])
    items.push(worldAsset(a));
  const overheadWires = (layout.overheadWires ?? []).map(w => ({ ...w,
    a: [w.a[0], w.a[1], w.a[2] + moatBend(w.a[0])],
    b: [w.b[0], w.b[1], w.b[2] + moatBend(w.b[0])],
  }));
  return { ...layout, items, overheadWires, roadPlan: 'google-overhead-v1' };
}
