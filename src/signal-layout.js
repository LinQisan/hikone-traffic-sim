// Pure placement conversion for the newly authored signal models. Preserve the
// source head/pole anchors and orientations, while removing the old cube scale.
export const SIGNAL_SIZE = {
  ART_Signal_Car: [1.78, 0.62, 0.19],
  ART_Signal_Pedestrian: [0.4269878566265106, 0.6871233582496643, 0.2046535462141037],
  ART_Signal_Support: [1, 1, 1],
};

export function signalPlacements(data) {
  return data.parts.flatMap(part => {
    const asset = part.name.startsWith('TrafficLight_Car') ? 'ART_Signal_Car' :
      part.name === 'TrafficLight_Walk' ? 'ART_Signal_Pedestrian' :
      /^Pole[12]$/.test(part.name) ? 'ART_Signal_Support' : null;
    if (!asset) return []; // Old light meshes are replaced by the head's new discs.
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
