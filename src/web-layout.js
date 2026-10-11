// The web port's own choices on top of VRLearn's layout (data/layout.json stays generated): props
// that the real Kyobashi crossing does not have are left out of the browser scene, and a few are
// shown as the real ones. Positions of
// everything else are unchanged. Pure logic (renderer, collision builder and tests share it).

/** Left out, matched by asset and position (Unity x, z, within 0.5 m). */
export const WEB_HIDDEN = [
  // "横断歩道" signs at the four corners: the crossing is signal-controlled (歩車分離式), and
  // the street photographs show no crosswalk signs there
  { a: 'HK_Sign_Crosswalk', x: 44.8, z: 31.3 },
  { a: 'HK_Sign_Crosswalk', x: 21.0, z: 20.9 },
  { a: 'HK_Sign_Crosswalk', x: 37.3, z: 37.4 },
  { a: 'HK_Sign_Crosswalk', x: 26.7, z: 13.4 },
  // the wooden "彦根城 →" post at the bridge corner: the corner has only the signal post
  { a: 'HK_GuidePost', x: 38.2, z: 37.6 },
];

/** Shown as another asset: Route 25 along the moat is a 40 km/h road (the street photographs). */
export const WEB_REPLACED = [
  { a: 'HK_Sign_Speed30', x: 88.0, z: 31.2, as: 'HK_Sign_Speed40' },
  { a: 'HK_Sign_Speed30', x: -20.0, z: 20.8, as: 'HK_Sign_Speed40' },
];

const near = (item, h) => h.a === item.a && Math.hypot(item.p[0] - h.x, item.p[2] - h.z) < 0.5;
export const isHidden = item => WEB_HIDDEN.some(h => near(item, h));

/** The layout as the browser shows it. */
export const webLayout = layout => ({ ...layout, items: layout.items.filter(item => !isHidden(item)).map(item => {
  const swap = WEB_REPLACED.find(h => near(item, h));
  return swap ? { ...item, a: swap.as } : item;
}) });
