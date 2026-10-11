// Lower kerbs in the browser. The Unity scene's pavements stand 40 cm above the carriageway
// (carriageway y 0.01, pavement 0.41: the experiment's collision geometry). Japanese kerbs are about
// 15 cm, and from a 40 cm pavement the eyes are ~2 m above the road and cars look low. The browser
// therefore maps heights: up to the carriageway nothing changes (cars, road markings, the moat),
// everything at pavement level and above moves down 0.25 m (pavement 0.16), and the kerb faces and
// corner ramps in between are compressed. Horizontal positions are untouched. Pure logic.
export const CARRIAGEWAY = 0.01;
export const UNITY_PAVEMENT = 0.41;
export const PAVEMENT = 0.16;
export const DROP = UNITY_PAVEMENT - PAVEMENT;

/** A Unity height → the browser's height. */
export function kerbY(y) {
  if (y <= CARRIAGEWAY) return y;
  if (y >= UNITY_PAVEMENT) return y - DROP;
  return CARRIAGEWAY + (y - CARRIAGEWAY) * (PAVEMENT - CARRIAGEWAY) / (UNITY_PAVEMENT - CARRIAGEWAY);
}

/**
 * Layout objects standing at pavement or town level (base y ≥ 0.2: houses, trees, lamps, walls,
 * the castle hill's objects) move down as a whole; those based at road level (road tiles with
 * their kerbs, the raised roads, the bridge, the castle-hill terrain) have every vertex mapped.
 */
export const movesWhole = baseY => baseY >= 0.2;
