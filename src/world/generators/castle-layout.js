// Google satellite placement, registered approximately to the browser's rotated Kyobashi plan.
// The hilltop stays beyond the practice map; castle-approach.js registers its surrounding roads.
const anchor = { lat: 35.27246, lon: 136.2526297, x: 32, z: 56.8 };
const bearing = 32 * Math.PI / 180;
export function geographicPoint(lat, lon) {
  const east = (lon - anchor.lon) * 111320 * Math.cos(anchor.lat * Math.PI / 180);
  const north = (lat - anchor.lat) * 111320;
  return [anchor.x + east * Math.cos(bearing) - north * Math.sin(bearing),
    anchor.z + east * Math.sin(bearing) + north * Math.cos(bearing)];
}
const [x, z] = geographicPoint(35.276452, 136.251846);

export const CASTLE_SITE = {
  x, z,
  height: 49.5, // Approximate hilltop rise above the moat road; no change to practice-road heights.
  yaw: 193, // The main roof ridge runs northwest/southeast; the broad courtyard face is southwest.
};

// Surviving buildings, rather than copies of the keep. Google satellite footprints and the
// city's castle map/conservation descriptions guide these approximate visual dimensions.
export const CASTLE_REFERENCE = 'https://www.city.hikone.lg.jp/kakuka/kanko_bunka/8/2_1/3/4581.html';
function site(id, name, lat, lon, floor, yaw, size) {
  const [x, z] = geographicPoint(lat, lon);
  return { id, name, x, z, floor, yaw, size };
}
export const CASTLE_BUILDINGS = [
  site('nishinomaru', 'Nishinomaru three-storey turret and connecting wings', 35.277944, 136.250627, 42, -77, [12, 10]),
  site('taikomon', 'Taikomon gate and connecting turret', 35.276025, 136.252114, 41, 13, [13, 6]),
  site('tenbin', 'Tenbin turret and corridor bridge', 35.275540, 136.252510, 27, -32, [38, 8]),
  site('omotegoten', 'Reconstructed Omote Goten / Hikone Castle Museum', 35.275667, 136.253500, 0.15, -77, [56, 104]),
  site('sawaguchi', 'Sawaguchi Tamon turret / Kaikoku Memorial Hall', 35.275152, 136.255082, 0.15, 13, [48, 8]),
];

export function castleRectangle(x, z, width, depth, yaw) {
  const a = yaw * Math.PI / 180;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) =>
    [x + u * width / 2 * Math.cos(a) + v * depth / 2 * Math.sin(a),
      z - u * width / 2 * Math.sin(a) + v * depth / 2 * Math.cos(a)]);
}
export const CASTLE_TERRACES = [
  { id: 'honmaru', floor: CASTLE_SITE.height, footprint: castleRectangle(x, z + 3, 50, 40, 13) },
  ...CASTLE_BUILDINGS.filter(b => b.floor > 1 || b.id === 'omotegoten').map(b => ({ id: b.id, floor: b.floor,
    footprint: castleRectangle(b.x, b.z, b.id === 'nishinomaru' ? 44 : b.size[0] + 8,
      b.id === 'nishinomaru' ? 32 : b.size[1] + 12, b.yaw) })),
];
// Western Google satellite review, 2026-10-19. The viewport centre was checked
// with Maps' visible coordinate menu; these are outline observations, not a survey.
export function westernOutline(points) {
  const lat = 35.2777, lon = 136.249, m = 156543.03392 * Math.cos(lat * Math.PI / 180) / 2 ** 17;
  return points.map(([px, py]) => geographicPoint(lat + (424 - py) * m / 111320,
    lon + (px - 768) * m / (111320 * Math.cos(lat * Math.PI / 180))));
}
// Shared by the hill foot and the west inner moat: never independently trace these edges.
// South to north, ending at the narrow wooded northern spur beyond Nishinomaru.
export const CASTLE_WEST_BANK = westernOutline([
  [859,594],[842,550],[826,500],[824,458],[831,414],[849,365],
  [866,312],[884,258],[891,213],[900,173],
]);
export const CASTLE_NORTH_BANK = [
  ...[[35.2775,136.2540],[35.2782,136.2531],[35.2785,136.2523],
    [35.27875,136.2511]].map(([lat,lon]) => geographicPoint(lat,lon)),
  ...westernOutline([[945,285],[934,242],[930,207],[920,177]]),
  ...[...CASTLE_WEST_BANK].reverse(),
];

export const CASTLE_ITEMS = [
  { a: 'ART_HikoneKeep', p: [CASTLE_SITE.x, CASTLE_SITE.height, CASTLE_SITE.z], r: CASTLE_SITE.yaw,
    s: [1, 1, 1], g: 'WebLandmark' },
  { a: 'HK_Terrain_Hikone', p: [CASTLE_SITE.x, 0, CASTLE_SITE.z], r: 0,
    s: [1, 1, 1], g: 'WebLandmark' },
  { a: 'ART_HikoneCompound', p: [CASTLE_SITE.x, 0, CASTLE_SITE.z], r: 0,
    s: [1, 1, 1], g: 'WebLandmark' },
];
