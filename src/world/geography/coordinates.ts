import frame from '../../../world/geographic-frame.json' with {type: 'json'};
export {frame};
const bearing = frame.bearingDegrees * Math.PI / 180;
/** Existing metre-scale local frame. Keep the X mirror exclusively in three/scene/coords.ts. */
export function geographicPoint(lat: number, lon: number): [number, number] {
  const {anchor, metresPerLatitudeDegree: metres} = frame;
  const east = (lon - anchor.lon) * metres * Math.cos(anchor.lat * Math.PI / 180);
  const north = (lat - anchor.lat) * metres;
  return [anchor.x + east * Math.cos(bearing) - north * Math.sin(bearing),
    anchor.z + east * Math.sin(bearing) + north * Math.cos(bearing)];
}
export function geographicLocation(x: number, z: number): {lat: number; lon: number} {
  const {anchor, metresPerLatitudeDegree: metres} = frame;
  const east = (x - anchor.x) * Math.cos(bearing) + (z - anchor.z) * Math.sin(bearing);
  const north = -(x - anchor.x) * Math.sin(bearing) + (z - anchor.z) * Math.cos(bearing);
  return {lat: anchor.lat + north / metres, lon: anchor.lon + east / (metres * Math.cos(anchor.lat * Math.PI / 180))};
}
