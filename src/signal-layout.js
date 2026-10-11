// Pure placement conversion for the newly authored signal models. Preserve the
// source head/pole anchors and orientations, while removing the old cube scale.
export const SIGNAL_SIZE = {
  ART_Signal_Car: [1.78, 0.62, 0.19],
  ART_Signal_Pedestrian: [0.4269878566265106, 0.6871233582496643, 0.2046535462141037],
};

export function signalPlacements(data) {
  return data.parts.flatMap(part => {
    const asset = part.name.startsWith('TrafficLight_Car') ? 'ART_Signal_Car' :
      part.name === 'TrafficLight_Walk' ? 'ART_Signal_Pedestrian' : null;
    if (!asset) return []; // Old light meshes are replaced by the head's new discs; poles by signalRigs.
    const size = SIGNAL_SIZE[asset];
    // M_three = mirrorX * M_Unity * inverseSourceScale * mirrorX.
    // The GLBs are already authored with their local X mirrored.
    const matrix = part.matrix.map((value, i) => {
      const row = i % 4, column = Math.floor(i / 4);
      return value * (row === 0 ? -1 : 1) * (column === 0 ? -1 : 1) / (column < 3 ? size[column] : 1);
    });
    return [{ asset, matrix, group: part.group, name: part.name }];
  });
}

// Kyobashi's signal posts as photographed (Unity coordinates, metres): a tall brown pole on the
// source pole's spot and a long two-pipe mast arm out to the source head, which keeps its exact
// position; pedestrian heads sit on short brackets from a lower pole.
export const POLE = {
  car: { height: 7.4, base: 0.15, top: 0.11 },
  pedestrian: { height: 3.75, base: 0.1, top: 0.085 },
};
export const ARM_ABOVE_HEAD = 0.47;      // the head hangs from brackets this far below the arm's axis
export const ARM_BEYOND_HEAD = 0.85;     // the arm reaches past the head's centre to its far end

/**
 * One rig per signal group: { kind, head: {x, y, z}, facing: [x, z] (where the lenses look,
 * towards the people they are for), pole: {x, z} }. The lenses sit on the source cube's local -Z
 * side (see signalPlacements), so they look along the head's -Z axis.
 */
export function signalRigs(data) {
  const groups = new Map();
  for (const part of data.parts) {
    if (!groups.has(part.group)) groups.set(part.group, []);
    groups.get(part.group).push(part);
  }
  const at = part => ({ x: part.matrix[12], y: part.matrix[13], z: part.matrix[14] });
  return [...groups].flatMap(([group, parts]) => {
    const head = parts.find(p => p.name.startsWith('TrafficLight_'));
    const pole = parts.find(p => p.name === 'Pole2');
    if (!head || !pole) return [];
    const fx = -head.matrix[8], fz = -head.matrix[10], l = Math.hypot(fx, fz) || 1;
    const p = at(pole);
    return [{ kind: head.name === 'TrafficLight_Walk' ? 'pedestrian' : 'car', group,
      head: at(head), facing: [fx / l, fz / l], pole: { x: p.x, z: p.z } }];
  });
}
