// Reviewed road topology and photo-relative dimensions. Raw WGS84 sources stay separate.
import survey from '../../../world/walked-streets.json' with {type:'json'};
import field from '../../../world/field-observations.json' with {type:'json'};
import frontage from '../../../world/inner-moat-street.json' with {type:'json'};
import {geographicPoint} from '../geography/coordinates.ts';

type Point = readonly [number,number];

export const WALKED_STREET_PROFILE = survey.estimates;
const source = (key: keyof typeof survey.roads): Point[] => survey.roads[key].coordinatesWgs84.map(([lon,lat]) => {
  const [x,z]=geographicPoint(lat,lon);return [+x.toFixed(5),+z.toFixed(5)];
});
export const CAMPUS_STREET = source('campusStreet');
export const CAMPUS_LOOP_ENTRY = source('campusLoop').slice(-3).toReversed();
export const SCHOOL_LOOP = source('schoolLoop');
export const OTEMON_WALK = [source('otemonApproach')[0], ...source('otemonBridge')];

/** Rounded corners remain inside the adjacent source segments; the radius is estimated. */
export function roundedRoute(points: readonly Point[], radius: number): Point[] {
  if(points.length<3)return [...points];
  const result = [points[0]];
  for (let i=1;i<points.length-1;i++) {
    const a=points[i-1],p=points[i],c=points[i+1];
    const before=Math.hypot(p[0]-a[0],p[1]-a[1]),after=Math.hypot(c[0]-p[0],c[1]-p[1]);
    const reach=Math.min(radius,before*.35,after*.35);
    const lo: Point=[p[0]+(a[0]-p[0])*reach/before,p[1]+(a[1]-p[1])*reach/before];
    const hi: Point=[p[0]+(c[0]-p[0])*reach/after,p[1]+(c[1]-p[1])*reach/after];
    for (let j=0;j<=6;j++) {const t=j/6;result.push([(1-t)**2*lo[0]+2*t*(1-t)*p[0]+t*t*hi[0],(1-t)**2*lo[1]+2*t*(1-t)*p[1]+t*t*hi[1]]);}
  }
  result.push(points[points.length-1]);
  return result;
}

// Local streets have a single asphalt/Ground owner, rather than raised decorative ribbons.
export const INNER_RESIDENTIAL_LANES: Point[][] = [frontage.lanes.south,frontage.lanes.back].map(line=>line.map(([x,z])=>[x,z]));
INNER_RESIDENTIAL_LANES[0][0] = SCHOOL_LOOP[0];

/** Moat lies north of this stretch. Tennis fencing stays south of the full carriageway. */
export function streetEdgeAtX(points: readonly (readonly number[])[], x: number, setback: number): Point {
  for(let i=1;i<points.length;i++) {
    const a=points[i-1],c=points[i];
    if(x<Math.min(a[0],c[0])||x>Math.max(a[0],c[0])||Math.abs(c[0]-a[0])<1e-6)continue;
    const z=a[1]+(c[1]-a[1])*(x-a[0])/(c[0]-a[0]);
    const length=Math.hypot(c[0]-a[0],c[1]-a[1]);
    const sign=c[0]>a[0]?1:-1;
    return [x+sign*(c[1]-a[1])/length*setback,z-sign*(c[0]-a[0])/length*setback];
  }
  throw Error(`Street boundary X ${x} lies outside the reviewed road`);
}
const tennisRoadside = (x: number) => streetEdgeAtX(field.schoolRoad.points,x,survey.estimates.tennisRoadSetback);
const [west,east]=survey.estimates.tennisFenceEnds,[gateWest,gateEast]=survey.estimates.tennisGateX;
export const TENNIS_FRONTAGE = {
  fenceRuns:[[west,-478,gateWest],[gateEast,-436,east]].map(xs=>xs.map(tennisRoadside)),
  gatePillars:[gateWest,gateEast].map(tennisRoadside),
};
