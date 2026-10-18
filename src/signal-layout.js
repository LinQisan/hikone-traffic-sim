// Browser-owned layout, checked from both the junction and Castle Road in October 2024
// Street View. Positions fit the imported map's pavement; the old cube anchors do not.
const INSTALLATIONS = [
  { id: 'bridge-west', corner: 'northwest', style: 'truss', pole: [26.6, 36.6], height: 5.6,
    vehicle: [29.1, 4.7, 36.6], facing: [0, -1], phase: 'below',
    nameHeight: 4.15, nameFacing: [1, 0],
    walks: [{ crossing: 'west', facing: [0, -1], side: [-1, 0] }] },
  { id: 'bridge-east', corner: 'northeast', style: 'truss', pole: [37.4, 36.6], height: 5.6,
    vehicle: [37.4, 4.7, 33], facing: [-1, 0], phase: 'below',
    nameHeight: 5.45, nameFacing: [-1, 0],
    walks: [{ crossing: 'east', facing: [0, -1], side: [1, 0] }] },
  { id: 'town-west', corner: 'southwest', style: 'mast', pole: [26.6, 15.4], height: 6.4,
    vehicle: [26.6, 4.7, 19], facing: [1, 0], phase: 'above', lampFacing: [0, 1],
    walks: [{ crossing: 'west', facing: [0, 1], side: [-1, 0] },
      { crossing: 'south', facing: [1, 0], side: [0, 1] }] },
  { id: 'town-east', corner: 'southeast', style: 'mast', pole: [37.4, 15.4], height: 5.6,
    vehicle: [34.7, 4.7, 15.4], facing: [0, 1], phase: 'above',
    walks: [{ crossing: 'south', facing: [-1, 0], side: [0, 1] }] },
  // The east crossing ends at a separate lamp/name-board pole in front of the machiya.
  { id: 'town-east-walk', corner: 'southeast-walk', style: 'lamp', pole: [42.6, 20.6], height: 6.4,
    facing: [0, 1], lampFacing: [1, 0], nameHeight: 5.5, nameFacing: [0, -1], nameSize: [1.1, 0.48],
    walks: [{ crossing: 'east', facing: [0, 1], side: [-1, 0] }] },
];

// The blue direction sign cantilevered from Castle Road's west pavement just south of the
// junction: double-sided on a brown post (October 2024 panorama facing south; 18 October 2026
// photograph facing north).
export const GUIDE_SIGNS = [
  { id: 'castle-road-guide', pole: [25.6, 6], height: 6.5, board: [27.7, 5.55, 6], size: [2.6, 1.7],
    facing: [0, 1] },
];
// The square lantern lamp at Castle Road's east kerb carries the blue pedestrian-and-bicycle disc
// facing northbound walkers (18 October 2026 photograph).
export const LANTERNS = [
  { id: 'castle-road-lantern', pole: [36.9, 3.0], height: 3.9, disc: { height: 2.55, facing: [0, -1] } },
];

export const POLE = {
  car: { base: 0.15, top: 0.1 },
  pedestrian: { base: 0.12, top: 0.08 },
  guide: { base: 0.16, top: 0.12 },
  lantern: { base: 0.08, top: 0.065 },
};
export const ARM_ABOVE_HEAD = 0.47;
export const ARM_BEYOND_HEAD = 0.85;

/** Five physical installations in Unity metres: four vehicle poles and one walk-only lamp. */
export function signalRigs() {
  return INSTALLATIONS.map(({ pole, vehicle, walks, ...config }) => ({
    ...config, group: config.id, kind: vehicle ? 'car' : 'pedestrian',
    pole: { x: pole[0], z: pole[1] },
    head: vehicle ? { x: vehicle[0], y: vehicle[1], z: vehicle[2] } : null,
    pedestrians: walks.map(({ facing, side, crossing }) => ({ facing, side, crossing,
      head: { x: pole[0] + side[0] * 0.56 + facing[0] * 0.14,
        y: 2.85, z: pole[1] + side[1] * 0.56 + facing[1] * 0.14 } })),
  }));
}

/** Real-size heads. GLB lenses face local -Z; mirror the Unity placement into three.js. */
export function signalPlacements(rigs = signalRigs()) {
  const place = (asset, head, [fx, fz], group, name) => ({ asset, group, name,
    matrix: [-fz, 0, -fx, 0, 0, 1, 0, 0, fx, 0, -fz, 0, -head.x, head.y, head.z, 1] });
  return rigs.flatMap(r => [
    ...(r.head ? [place('ART_Signal_Car', r.head, r.facing, r.group, 'TrafficLight_Car')] : []),
    ...r.pedestrians.map((walk, i) => place('ART_Signal_Pedestrian', walk.head, walk.facing,
      r.group, `TrafficLight_Walk_${i}`)),
  ]);
}
