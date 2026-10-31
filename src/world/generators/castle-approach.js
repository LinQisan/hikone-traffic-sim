// Visual reconstruction from Google Maps satellite, reviewed 2026-10-18. Metres, not a survey.
// Pixel observations describe outlines only; no map imagery is shipped with the scene.
// The shared registration preserves the existing bridge and hilltop coordinates.
import { geographicPoint, CASTLE_SITE, CASTLE_BUILDINGS, CASTLE_TERRACES, CASTLE_NORTH_BANK } from './castle-layout.js';
import { castlePaths } from './castle-paths.js';
import { EAST_GEOGRAPHY } from './east-layout.ts';
import higashi from '../../../world/higashi-frontage.json' with { type: 'json' };
import island from '../../../world/higashi-island.json' with { type: 'json' };
import street from '../../../world/east-street.json' with { type: 'json' };
import south from '../../../world/south-promenade.json' with { type: 'json' };
import moat from '../../../world/castle-moat.json' with { type: 'json' };
export const HIGASHI_FRONTAGE = higashi;
export const HIGASHI_ISLAND = island;
export const HIGASHI_STREET = street;
export const CASTLE_MOAT = moat;

export const APPROACH_REFERENCE = 'https://www.google.com/maps/@?api=1&map_action=map&center=35.2744,136.252&zoom=18&basemap=satellite';
const latitude = 35.2744, longitude = 136.252;
const metresPerPixel = 156543.03392 * Math.cos(latitude * Math.PI / 180) / 2 ** 18;
function outline(points) {
  return points.map(([px, py]) => geographicPoint(latitude + (550 - py) * metresPerPixel / 111320,
    longitude + (px - 700) * metresPerPixel / (111320 * Math.cos(latitude * Math.PI / 180)))
    .map(v => +v.toFixed(5)));
}

// OSM way 1499485466 (registered with the shared frame), checked against the owner's
// 29 October 2026 photographs 0869–0872: the road runs straight north from the bridge
// between the masugata walls, turns west inside the enclosure and passes Saigo's longhouse
// with a grass verge. The road-cut shoulders then fall on the mapped retaining walls.
// The mapped first corner (radius ≈6.5 m) is drawn as a 7.5 m arc: its inner shoulder then
// closes to the wall corner instead of folding. The satellite-traced tail is retained.
const corner = [0, 1, 2, 3, 4, 5, 6].map(i => [24.5 + 7.5 * Math.cos(i * Math.PI / 12), 88 + 7.5 * Math.sin(i * Math.PI / 12)]);
export const NORTH_APPROACH = [[32, 74], [32, 81], ...corner, [17.5, 95.8], [12.7, 97.4],
  [9, 100.2], [6.1, 103.8], [4, 107.8], [2.8, 112.9], [3.1, 119.2], [8.3, 152],
  ...outline([[867, 760], [843, 736], [814, 707]])];
// The public fork has three sides, not a road ending on the parking boundary.
// Both branches share the real school-front junction (OSM 59265942/1499485467).
const schoolBranch = higashi.roads.branch.flatMap((c, i, points) => {
  if (!i) return [c];
  const a = points[i - 1], steps = Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1]) / 5);
  return Array.from({length: steps}, (_, k) => [a[0]+(c[0]-a[0])*(k+1)/steps, a[1]+(c[1]-a[1])*(k+1)/steps]);
});
// Keep the existing straight approach through z=152. Short collinear samples stop
// the cubic road author anticipating the long west branch and bowing off the street.
NORTH_APPROACH.splice(17, NORTH_APPROACH.length - 17, ...schoolBranch);
// A pedestrian bridge and the visible access to the Otemon ticket office, not a vehicle lane.
export const OTEMON_PATH = outline([
  [608, 512], [650, 496], [693, 477],
]);
const outerPixels = [
  [316, 207], [405, 286], [489, 358], [570, 428], [631, 491], [702, 551],
  [724, 652], [774, 681], [818, 693], [875, 696], [938, 690],
  [1002, 673], [1065, 646], [1119, 608], [1147, 557], [1161, 513],
  [1147, 464], [1150, 433], [1139, 396], [1149, 343], [1177, 292],
];
export const INNER_MOAT_OUTER = outline(outerPixels);
// Follow the reviewed bank at a consistent road/shoulder setback. Independent tracing of
// both lines would let the road cut through the water at the south bend.
/** Replaces the stretch of a line lying between two mapped ends with the reviewed points. */
function reviewed(line, points) {
  const nearest = ([x, z]) => line.reduce((best, p, i) => Math.hypot(p[0] - x, p[1] - z) < Math.hypot(line[best][0] - x, line[best][1] - z) ? i : best, 0);
  const first = nearest(points[0]), last = nearest(points.at(-1));
  line.splice(first, last - first + 1, ...points);
}
reviewed(INNER_MOAT_OUTER, moat.outerBank);
export const INNER_MOAT_ROAD = outline(outerPixels.map(([x, y], i, ps) => {
  const a = ps[Math.max(0, i - 1)], b = ps[Math.min(ps.length - 1, i + 1)];
  const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
  return [x - dy / length * 15, y + dx / length * 15];
}));
// At the school/tennis peninsula the street stands well back from the inner moat.
// A fixed bank offset put the old western end through the timber-house plots.
const westernStreet = [[35.2772,136.2487,944,752],[35.2772,136.2487,1035,830],
  [35.2772,136.2487,1140,891]].map(([lat,lon,x,y])=>{
  const m=156543.03392*Math.cos(lat*Math.PI/180)/2**18;
  return geographicPoint(lat+(424-y)*m/111320,lon+(x-768)*m/(111320*Math.cos(lat*Math.PI/180)));
});
INNER_MOAT_ROAD.splice(0,westernStreet.length,...westernStreet);
const frontageStart = INNER_MOAT_ROAD.findIndex(([x]) => x > -90);
const frontageEnd = INNER_MOAT_ROAD.findIndex(([x, z]) => x > 20 && z > 220);
INNER_MOAT_ROAD.splice(frontageStart, frontageEnd - frontageStart, ...higashi.roads.inner);
// Replace only the reviewed northern tail, retaining its OSM node geometry at the join.
if (EAST_GEOGRAPHY.reviewedRoutes) {
  const first = INNER_MOAT_ROAD.findIndex(([,z])=>z>=348);
  INNER_MOAT_ROAD.splice(first,INNER_MOAT_ROAD.length-first,...EAST_GEOGRAPHY.reviewedRoutes.innerRoad);
}
reviewed(INNER_MOAT_ROAD, moat.road);
export const INNER_MOAT_INNER = outline([
  [354, 182], [438, 260], [520, 330], [596, 391], [649, 428], [663, 450],
  [686, 457], [697, 479], [715, 531], [743, 569], [756, 613], [807, 647],
  [853, 667], [900, 675], [961, 672], [1025, 653], [1090, 618],
  [1119, 588], [1136, 541], [1140, 489], [1123, 444], [1118, 403],
  [1101, 371], [1099, 328], [1126, 278],
]);
reviewed(INNER_MOAT_INNER, moat.innerBank);

function building(name, pixels, height, roof = 'flat', rise = 0) {
  return { name, footprint: outline(pixels), height, roof, rise };
}
// Heights/facades are deliberately approximate. Satellite-visible footprints and roof forms
// carry identity; hidden rooms, signs and extra historical gates are not invented.
export const APPROACH_BUILDINGS = [
  building('Saigo longhouse gate', [[788, 855], [848, 787], [861, 798], [801, 868]], 3.6, 'tile', 1.5),
  // OSM outlines replace the older pixel estimates only in this reviewed school group.
  ...higashi.buildings,
  ...island.buildings,
  building('Hikone prosecutors office', [[609, 720], [669, 646], [709, 677], [649, 754]], 6.8),
  building('Building behind Saigo gate', [[695, 765], [740, 714], [793, 754], [749, 811]], 6.8),
  building('Otemon parking annex', [[536, 640], [568, 607], [599, 636], [571, 672]], 3.6, 'red', 1.6),
];
// Camera envelopes include the new courtyard structures, without treating the whole
// composite or the open gate as one solid rectangle. Geometry uses the same dimensions.
const gateWalls = higashi.gate.walls.flatMap(path => path.slice(1).map((c, i) => {
  const a = path[i], length = Math.hypot(c[0] - a[0], c[1] - a[1]);
  const nx = -(c[1] - a[1]) / length * .26, nz = (c[0] - a[0]) / length * .26;
  return {footprint: [[a[0]+nx,a[1]+nz],[c[0]+nx,c[1]+nz],[c[0]-nx,c[1]-nz],[a[0]-nx,a[1]-nz]], height: 2.2, rise: 0};
}));
const [kx, kz] = higashi.kiosk.center;
export const APPROACH_CAMERA_SOLIDS = [...APPROACH_BUILDINGS.map(b => {
  if (b.name !== south.gate.name) return b;
  // The new roof projects beyond the registered wall, including its end soffits.
  const cx=b.footprint.reduce((s,p)=>s+p[0],0)/4,cz=b.footprint.reduce((s,p)=>s+p[1],0)/4;
  return {...b,footprint:b.footprint.map(([x,z])=>[cx+(x-cx)*1.17,cz+(z-cz)*1.032]),
    height:south.gate.eave,rise:south.gate.roofRise+.35};
}), ...gateWalls,
  {footprint: [[kx-1.96,kz-1.61],[kx+1.96,kz-1.61],[kx+1.96,kz+1.61],[kx-1.96,kz+1.61]], height: 3.65, rise: 0}];
export const APPROACH_PATCHES = [
  { material: 'ART_Sand', footprint: outline([[299, 368], [365, 303], [562, 480], [578, 520], [484, 627]]) },
];

export const APPROACH_DATA = { north: NORTH_APPROACH, retainedNorth: higashi.roads.retainedSouth, schoolRoad: higashi.roads.schoolSide, innerRoad: INNER_MOAT_ROAD, path: OTEMON_PATH,
  outerBank: INNER_MOAT_OUTER, innerBank: INNER_MOAT_INNER, buildings: APPROACH_BUILDINGS,
  patches: APPROACH_PATCHES, castle: CASTLE_SITE, compound: CASTLE_BUILDINGS,
  terraces: CASTLE_TERRACES, northBank: CASTLE_NORTH_BANK,
  paths: castlePaths(OTEMON_PATH.at(-1), INNER_MOAT_ROAD, INNER_MOAT_INNER, INNER_MOAT_OUTER) };

export function distanceToPath(x, z, points) {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return best;
}
