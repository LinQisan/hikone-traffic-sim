// The web port's own choices on top of VRLearn's layout (data/layout.json stays generated): props
// that the real Kyobashi crossing does not have are left out of the browser scene. The Unity app
// keeps these two because they hide one of scenario 05's vehicle appear/despawn points (VRLearn
// occlusion check); the browser is not an experiment. Positions are unchanged. Pure logic
// (renderer, collision builder, event checker and tests share it).

/** Left out, matched by asset and position (Unity x, z, within 0.5 m). */
export const WEB_HIDDEN = [
  // the "横断歩道" sign at the bridge corner: the crossing is signal-controlled (歩車分離式), and
  // the street photographs show no crosswalk signs there (VRLearn already left out the other three)
  { a: 'HK_Sign_Crosswalk', x: 37.3, z: 37.4 },
  // the wooden "彦根城 →" post at the bridge corner: the corner has only the signal post
  { a: 'HK_GuidePost', x: 38.2, z: 37.6 },
];

const near = (item, h) => h.a === item.a && Math.hypot(item.p[0] - h.x, item.p[2] - h.z) < 0.5;
export const isHidden = item => WEB_HIDDEN.some(h => near(item, h));

/** The layout as the browser shows it: VRLearn's layout without the hidden props. */
export const webLayout = layout => ({ ...layout, items: layout.items.filter(item => !isHidden(item)) });
