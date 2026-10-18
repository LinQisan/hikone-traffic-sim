// Browser-owned street furniture on top of the generated layout. Rendering, collision and sight
// lines use this same pure transformation; no upstream Unity placement is edited.
import { MOAT_BANK_ITEMS, isMoatStraight } from './moat-layout.js';
import { roadLayout, moatPathEdge, townTaper } from './road-layout.js';

/** Left out, matched by asset and position (Unity x, z, within 0.5 m). */
export const WEB_HIDDEN = [
  // the "横断歩道" sign at the bridge corner: the crossing is signal-controlled (歩車分離式), and
  // the street photographs show no crosswalk signs there (VRLearn already left out the other three)
  { a: 'HK_Sign_Crosswalk', x: 37.3, z: 37.4 },
  // the wooden "彦根城 →" post at the bridge corner: the corner has only the signal post
  { a: 'HK_GuidePost', x: 38.2, z: 37.6 },
];

const near = (item, h) => h.a === item.a && Math.hypot(item.p[0] - h.x, item.p[2] - h.z) < 0.5;
// The imported ten-metre lamp grid is absent along the moat and on the bridge. The extra pair
// immediately south of the junction also duplicates the lamps on the two signal installations.
const automaticLamp = item => item.a === 'HK_StreetLamp' && (
  item.p[2] === 21 || item.p[2] === 31 || item.p[2] >= 39 ||
  ((item.p[0] === 27 || item.p[0] === 37) && item.p[2] > 0));
export const isHidden = item => WEB_HIDDEN.some(h => near(item, h)) || automaticLamp(item);

const streetItem = (a, x, z) => ({ a, p: [x, 0.16, z], r: 0, s: [1, 1, 1], g: 'WebStreet' });
// October 2024 Street View: low square lamps on the moat bank, distribution poles on the
// town footway east of the crossing. Positions fit the existing map, not survey coordinates.
export const WEB_STREET_ITEMS = [
  ...[-90, -58, -26, 6, 55, 87].map(x => streetItem('ART_PathLamp', x, moatPathEdge(x) + 0.3)),
  // On the narrowed footway the poles stand at its kerb side, clear of the frontage eaves.
  ...[49.5, 74, 101].map(x => streetItem('ART_UtilityPole', x, 19 + 2.55 * townTaper(x))),
];

// Differentiate the junction frontages. The western compound replaces two isolated sheds;
// its origin moves slightly west so its eaves leave the curved pavement clear.
export const WEB_FRONTAGES = [
  { x: 45.3, z: 15.6, from: 'HK_Machiya_A_Narrow', to: 'ART_CornerShop', scale: [1, 1, 1] },
  { x: 51.72, z: 15.45, from: 'HK_Machiya_A', to: 'ART_WhiteStorehouse', scale: [1, 1, 1] },
  { x: 58.14, z: 15.45, from: 'HK_Machiya_A_Narrow', to: 'ART_EavesStorehouse', scale: [0.75, 1, 1] },
  { x: 63.96, z: 15.6, from: 'HK_Kura', to: 'ART_ThreeStorey', scale: [1, 1, 1] },
  { x: 18.6, z: 15.6, from: 'HK_Kura', to: 'ART_WestCorner', position: [16.6, 0.15, 15.6], absoluteScale: [1, 1, 1] },
];
export const frontageAt = item => WEB_FRONTAGES.find(f => item.a === f.from
  && Math.hypot(item.p[0] - f.x, item.p[2] - f.z) < 0.01);
const reviewedItem = item => {
  const front = frontageAt(item);
  if (front) return { ...item, a: front.to, p: front.position ?? item.p,
    s: front.absoluteScale ?? item.s.map((v, i) => v * front.scale[i]) };
  if (isMoatStraight(item)) return { ...item, a: 'ART_MoatRoadSurface' };
  return item;
};
const surfaces = ['ART_PavingDetails', 'ART_MoatRoadPaint'].map(a =>
  ({ a, p: [0, 0, 0], r: 0, s: [1, 1, 1], g: 'WebSurface' }));

const powerPoles = WEB_STREET_ITEMS.filter(i => i.a === 'ART_UtilityPole');
const overheadWires = powerPoles.slice(1).flatMap((pole, i) => [8.25, 10.05].flatMap(y =>
  [-0.85, 0, 0.85].map(z => ({
    a: [powerPoles[i].p[0], y + 0.16, powerPoles[i].p[2] + z],
    b: [pole.p[0], y + 0.16, pole.p[2] + z], sag: 0.45,
  }))));

/** Idempotent, with the same physical props for the renderer and collision builder. */
export const webLayout = layout => layout.roadPlan ? layout : roadLayout({ ...layout,
  items: [...layout.items.filter(item => item.g !== 'WebStreet' && item.g !== 'WebSurface'
    && item.g !== 'WebBank' && !isHidden(item))
    .map(reviewedItem), ...WEB_STREET_ITEMS, ...MOAT_BANK_ITEMS, ...surfaces],
  overheadWires,
});
