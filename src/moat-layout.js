// Bank silhouettes and clearings from the supplied aerial view, fitted to the imported plan.
// Roots remain on the landward side of the chain fence; crowns can overhang the water.
import { SHORE_INSET, shoreTaper, moatEdge } from './road-layout.js';

// Authored against the original 39.6 m shore; the narrowed strip moves each root with the shore.
const plant = (a, x, z, yaw, s) =>
  ({ a, p: [x, 0.15, z - SHORE_INSET * shoreTaper(x)], r: yaw, s, g: 'WebBank' });
const broad = (x, z, yaw, w = 1, h = 1) => plant('ART_MoatTree_Broad', x, z, yaw, [w, h, w]);
const airy = (x, z, yaw, w = 1, h = 1) => plant('ART_MoatTree_Airy', x, z, yaw, [w, h, w]);

export const MOAT_BANK_ITEMS = [
  // West of the bridge: scattered mature trees with long openings toward the moat.
  broad(-80, 38.2, -8, 0.9, 0.93), airy(-67, 38.1, 11, 0.8, 0.90),
  broad(-45, 38.0, 7, 1.05, 0.94), airy(-24, 38.2, -12, 0.85, 0.95),
  airy(0, 38.3, 9, 0.90, 0.90), broad(17, 38.0, -8, 0.92, 0.93),
  // East approach: a near pair, an opening, then an overlapping riverside canopy.
  broad(47.0, 38.1, -10, 0.95, 0.95), broad(53.3, 38.4, 8, 1.06, 1.02),
  airy(62.5, 38.2, -12, 0.77, 0.86),
  broad(72.0, 38.3, 11, 1.02, 0.94), broad(78.0, 38.5, -7, 1.04, 1.00),
  broad(87.0, 38.4, 8, 1.12, 0.96), airy(94.0, 38.2, -9, 0.90, 1.02),
  broad(108.0, 38.4, 7, 1.05, 0.98), airy(116.0, 38.1, -11, 0.87, 0.95),
  broad(124.0, 38.4, 9, 1.08, 1.03), airy(137.0, 38.2, -10, 0.92, 0.97),
  // Low, irregular patches leave the bridge approaches and the main path open.
  // Shallow enough to stay between the footway and the fence on the narrow strip.
  ...[-109, -99, -87, -76, -63, -53, -42, -31, -18, -5, 8, 19,
    47, 54, 63, 72, 80, 88, 96, 106, 114, 123, 132, 140].map((x, i) => ({
    ...plant('ART_MoatBankPatch', x, 0, (i % 3 - 1) * 3,
      [0.72 + (i % 4) * 0.12, 0.70 + (i % 3) * 0.14, 0.7]),
    p: [x, 0.15, moatEdge(x) - 1.45 + (i % 3) * 0.1] })),
];

export const isMoatStraight = item => item.a === 'HK_RoadSurf_Straight'
  && item.r === 0 && item.p[2] === 26;
