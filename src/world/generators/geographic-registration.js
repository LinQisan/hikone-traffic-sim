// Independent OSM/GSI geometry, reviewed against the city guide on 2026-10-31.
// Source WGS84 outlines and estimated model placements are recorded separately.
import registration from '../../../world/geographic-registration.json' with {type:'json'};

export const GEOGRAPHIC_REGISTRATION = registration;
export const registeredFootprint = id => registration.features[id].placement.footprint;
export const registeredPose = id => {
  const {x,z,yaw} = registration.features[id].placement;
  return {x,z,yaw};
};
export const SCHOOL_ACCESS = registration.features['school-access'].placement.line;
