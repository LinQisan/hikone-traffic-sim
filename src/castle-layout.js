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

export const CASTLE_ITEMS = [
  { a: 'ART_HikoneKeep', p: [CASTLE_SITE.x, CASTLE_SITE.height, CASTLE_SITE.z], r: CASTLE_SITE.yaw,
    s: [1, 1, 1], g: 'WebLandmark' },
  { a: 'HK_Terrain_Hikone', p: [CASTLE_SITE.x, 0, CASTLE_SITE.z], r: 0,
    s: [1, 1, 1], g: 'WebLandmark' },
];
