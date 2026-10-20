// Browser-owned layout, checked from both the junction and Castle Road in October 2024
// Street View. Positions fit the imported map's pavement; the old cube anchors do not.
// Reviewed against the owner's October 2026 photographs, including the view west from the shop.
// Far-side heads hang over their lanes; the shop-side Kyobashi lamp carries a name and walk head. Poles
// stand about 3 m behind the kerb: the local bridge begins ~4 m further from Route 25 than the
// real one, so a pole beside the bridge newel would need an 8 m arm. Town poles stand at the
// kerb-return apexes.
const INSTALLATIONS = [
  // Over the bridge's northbound lane for traffic arriving from Castle Road; name board faces west.
  { id: 'bridge-west', corner: 'northwest', style: 'truss', pole: [24.2, 33.0], height: 6.8,
    vehicle: [29.6, 5.35, 33.0], facing: [0, -1], phase: 'below',
    nameHeight: 4.15, nameFacing: [-1, 0],
    walks: [{ crossing: 'west', facing: [0, -1], side: [-1, 0] },
      { crossing: 'north', facing: [1, 0], side: [0, -1] }] },
  // A long truss over the eastbound lane; name board faces Castle Road (south).
  { id: 'bridge-east', corner: 'northeast', style: 'truss', pole: [41.2, 32.8], height: 8.9,
    vehicle: [41.2, 5.35, 28.6], facing: [-1, 0], phase: 'below',
    // The owner confirms an opposing vehicle head on this same arm-end frame.
    extraHeads: [{ head: [41.6, 5.35, 28.6], facing: [1, 0] }],
    // The owner clarified that the name belongs above the truss on a taller shaft.
    // Keep the tension attachment below the name instead of lifting it with the pole cap.
    nameHeight: 8.45, nameFacing: [0, -1], nameSize: [1.35, 0.8], trussTieHeight: 7.0,
    walks: [{ crossing: 'east', facing: [0, -1], side: [1, 0] },
      { crossing: 'north', facing: [-1, 0], side: [0, -1] }] },
  // The owner's (25.34, 19.31) front/rear pair shows two opposing heads on one arm-end frame.
  // The phase plate faces westbound traffic; its rear is visible above the reverse-facing head.
  { id: 'town-west', corner: 'southwest', style: 'mast', pole: [25.3, 19.3], height: 7.1,
    vehicle: [25.3, 5.35, 23.8], facing: [1, 0], phase: 'above', lampFacing: [0, 1], lampReach: 2.75,
    armBack: 0.4, lampBack: 0.35, lampDark: true,
    extraHeads: [{ head: [24.9, 5.35, 23.8], facing: [-1, 0] }],
    walks: [{ crossing: 'west', facing: [0, 1], side: [-1, 0] },
      { crossing: 'south', facing: [1, 0], side: [0, -1] }] },
  // The owner's (38.70, 19.29) photograph identifies a tall square mast, not a walk-only post.
  // Its arm reaches west over Castle Road's southbound lane; the name-board lamp is farther east.
  { id: 'town-east', corner: 'southeast', style: 'mast', pole: [38.7, 19.3], height: 6.2,
    vehicle: [34.2, 5.35, 19.3], facing: [0, 1], phase: 'above',
    walks: [{ crossing: 'south', facing: [-1, 0], side: [0, -1] }] },
  // Coordinate-specific close-up: the Kyobashi plate sits beside the shaft below its lamp.
  // This installation carries the east-crossing pedestrian head, without a vehicle head or arm.
  { id: 'town-east-walk', corner: 'southeast-walk', style: 'lamp', pole: [44.9, 20.6], height: 6.4,
    facing: [0, 1], lampFacing: [0, 1], lampReach: 1.6, lampBack: 0.3, lampDark: true,
    nameHeight: 5.75, nameFacing: [1, 0], nameSize: [1.15, 0.58], nameOffset: [0, 0.82],
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
// The 京橋口 bus stop at the town-side kerb, east of the parking office (18 October 2026 photograph).
export const BUS_STOPS = [
  { id: 'kyobashiguchi-bus', pole: [6.4, 21.25], facing: [1, 0] },
];
export const LANTERNS = [
  { id: 'castle-road-lantern', pole: [36.9, 3.0], height: 3.9, disc: { height: 2.55, facing: [0, -1] } },
];

export const POLE = {
  car: { base: 0.15, top: 0.1 },
  pedestrian: { base: 0.12, top: 0.08 },
  guide: { base: 0.16, top: 0.12 },
  lantern: { base: 0.08, top: 0.065 },
  bus: { base: 0.05, top: 0.05 },
};
export const ARM_ABOVE_HEAD = 0.47;
export const ARM_BEYOND_HEAD = 0.4;

/** Five installations: four vehicle poles (six heads) and an independent name-board lamp. */
export function signalRigs() {
  return INSTALLATIONS.map(({ pole, vehicle, walks, extraHeads = [], ...config }) => ({
    ...config, group: config.id, kind: vehicle ? 'car' : 'pedestrian',
    pole: { x: pole[0], z: pole[1] },
    head: vehicle ? { x: vehicle[0], y: vehicle[1], z: vehicle[2] } : null,
    extraHeads: extraHeads.map(({ head, facing }) => ({ facing, head: { x: head[0], y: head[1], z: head[2] } })),
    pedestrians: walks.map(({ facing, side, crossing }) => ({ facing, side, crossing,
      head: { x: pole[0] + side[0] * 0.56 + facing[0] * 0.14,
        y: 2.75, z: pole[1] + side[1] * 0.56 + facing[1] * 0.14 } })),
  }));
}

/** Name face in map coordinates, shared by the assembly and geometric clearance checks. */
export function signalNamePlate(rig) {
  if (rig.nameHeight == null) return null;
  const facing = rig.nameFacing, offset = rig.nameOffset ?? [0, 0];
  return { facing, size: rig.nameSize ?? [0.96, 0.72],
    center: { x: rig.pole.x + facing[0] * 0.17 + offset[0], y: rig.nameHeight,
      z: rig.pole.z + facing[1] * 0.17 + offset[1] } };
}

/** Walk notices sit ahead of the hoods, with room between each housing and its shaft. */
export function signalWalkPlate(rig, walk) {
  const { facing, side, head } = walk;
  return { facing, size: [0.18, 0.72],
    center: { x: rig.pole.x + facing[0] * 0.5 + side[0] * 0.24, y: head.y,
      z: rig.pole.z + facing[1] * 0.5 + side[1] * 0.24 } };
}

/** Real-size heads. GLB lenses face local -Z; mirror the Unity placement into three.js. */
export function signalPlacements(rigs = signalRigs()) {
  const place = (asset, head, [fx, fz], group, name) => ({ asset, group, name,
    matrix: [-fz, 0, -fx, 0, 0, 1, 0, 0, fx, 0, -fz, 0, -head.x, head.y, head.z, 1] });
  return rigs.flatMap(r => [
    ...(r.head ? [place('ART_Signal_Car', r.head, r.facing, r.group, 'TrafficLight_Car')] : []),
    ...r.extraHeads.map((e, i) => place('ART_Signal_Car', e.head, e.facing, r.group, `TrafficLight_Car_${i + 2}`)),
    ...r.pedestrians.map((walk, i) => place('ART_Signal_Pedestrian', walk.head, walk.facing,
      r.group, `TrafficLight_Walk_${i}`)),
  ]);
}
