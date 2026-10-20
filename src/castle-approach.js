// Visual reconstruction from Google Maps satellite, reviewed 2026-10-18. Metres, not a survey.
// Pixel observations describe outlines only; no map imagery is shipped with the scene.
// The shared registration preserves the existing bridge and hilltop coordinates.
import { geographicPoint, CASTLE_SITE, CASTLE_BUILDINGS, CASTLE_TERRACES, CASTLE_NORTH_BANK } from './castle-layout.js';
import { castlePaths } from './castle-paths.js';

export const APPROACH_REFERENCE = 'https://www.google.com/maps/@?api=1&map_action=map&center=35.2744,136.252&zoom=18&basemap=satellite';
const latitude = 35.2744, longitude = 136.252;
const metresPerPixel = 156543.03392 * Math.cos(latitude * Math.PI / 180) / 2 ** 18;
function outline(points) {
  return points.map(([px, py]) => geographicPoint(latitude + (550 - py) * metresPerPixel / 111320,
    longitude + (px - 700) * metresPerPixel / (111320 * Math.cos(latitude * Math.PI / 180)))
    .map(v => +v.toFixed(5)));
}

// Kyobashi's existing near-bank tie points are retained; the former road ending at (25,160)
// is replaced by the real bend past Saigo's longhouse and the inner-moat T junction.
export const NORTH_APPROACH = [[32, 74], [30, 81], [22, 88], ...outline([
  [822, 890], [816, 876], [821, 860], [836, 839], [855, 818], [875, 797], [887, 782],
  [867, 760], [843, 736], [814, 707],
])];
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
export const INNER_MOAT_INNER = outline([
  [354, 182], [438, 260], [520, 330], [596, 391], [649, 428], [663, 450],
  [686, 457], [697, 479], [715, 531], [743, 569], [756, 613], [807, 647],
  [853, 667], [900, 675], [961, 672], [1025, 653], [1090, 618],
  [1119, 588], [1136, 541], [1140, 489], [1123, 444], [1118, 403],
  [1101, 371], [1099, 328], [1126, 278],
]);

function building(name, pixels, height, roof = 'flat', rise = 0) {
  return { name, footprint: outline(pixels), height, roof, rise };
}
// Heights/facades are deliberately approximate. Satellite-visible footprints and roof forms
// carry identity; hidden rooms, signs and extra historical gates are not invented.
export const APPROACH_BUILDINGS = [
  building('Saigo longhouse gate', [[788, 855], [848, 787], [861, 798], [801, 868]], 3.6, 'tile', 1.5),
  building('Hikone Higashi north classroom', [[916, 872], [1028, 791], [1048, 817], [938, 899]], 10.2),
  building('Hikone Higashi west wing', [[891, 853], [916, 835], [944, 873], [922, 891]], 10.2),
  building('Hikone Higashi south classroom', [[952, 934], [1068, 850], [1090, 878], [972, 962]], 10.2),
  building('Hikone Higashi connector', [[1003, 903], [1022, 890], [1051, 930], [1030, 947]], 6.8),
  building('Hikone Higashi south hall', [[1079, 926], [1134, 853], [1234, 927], [1178, 999]], 9.5, 'metal', 3.0),
  building('Hikone Higashi north gymnasium', [[970, 724], [1056, 663], [1101, 723], [1013, 787]], 8.0, 'metal', 3.5),
  building('Hikone prosecutors office', [[609, 720], [669, 646], [709, 677], [649, 754]], 6.8),
  building('Building behind Saigo gate', [[695, 765], [740, 714], [793, 754], [749, 811]], 6.8),
  building('Otemon parking annex', [[536, 640], [568, 607], [599, 636], [571, 672]], 3.6, 'red', 1.6),
];
export const APPROACH_PATCHES = [
  { material: 'ART_Sand', footprint: outline([[299, 368], [365, 303], [562, 480], [578, 520], [484, 627]]) },
  { material: 'ART_Sand', footprint: outline([[1117, 659], [1191, 689], [1184, 715], [1334, 806], [1241, 910], [1135, 835], [1093, 766]]) },
];

export const APPROACH_DATA = { north: NORTH_APPROACH, innerRoad: INNER_MOAT_ROAD, path: OTEMON_PATH,
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
