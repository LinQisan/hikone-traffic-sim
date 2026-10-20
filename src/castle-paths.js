// Castle circulation traced from Google satellite imagery and the official castle plan.
// Widths and elevations are approximate. The graph records junctions and grade-separated
// crossings explicitly: the two entrance slopes meet BELOW the Roka bridge.
import { geographicPoint, CASTLE_BUILDINGS, CASTLE_SITE } from './castle-layout.js';

export const CASTLE_PATH_REFERENCE = 'https://hikonecastle.com/img/about/castle-map.jpg';
const bearing = 32 * Math.PI / 180, pixelScale = 0.3505;
const anchor = geographicPoint(35.275540, 136.252510);
// The 18.5z south view, centred near 35.2756, 136.2524. Register to Tenbin's gate.
function south(px, py, y) {
  const east = (px - 798) * pixelScale, north = (499 - py) * pixelScale;
  return [anchor[0] + east * Math.cos(bearing) - north * Math.sin(bearing), y,
    anchor[1] + east * Math.sin(bearing) + north * Math.cos(bearing)];
}
const site = id => CASTLE_BUILDINGS.find(b => b.id === id);
function local(id, x, y, z) {
  const b = site(id), a = b.yaw * Math.PI / 180;
  return [b.x + x * Math.cos(a) + z * Math.sin(a), y,
    b.z - x * Math.sin(a) + z * Math.cos(a)];
}
function north(px, py, y) {
  const b = site('nishinomaru'), east = (px - 638) * pixelScale, n = (279 - py) * pixelScale;
  return [b.x + east * Math.cos(bearing) - n * Math.sin(bearing), y,
    b.z + east * Math.sin(bearing) + n * Math.cos(bearing)];
}
function nearest(points, [x, z]) {
  let best = null;
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const p = [ax + t * dx, az + t * dz], distance = Math.hypot(p[0] - x, p[1] - z);
    if (!best || distance < best.distance) best = { p, distance, index: i };
  }
  return best;
}

export function castlePaths(otemonLanding, innerRoad, innerBank, outerBank) {
  const museumHalfWidth = site('omotegoten').size[0] / 2, museumHalfDepth = site('omotegoten').size[1] / 2;
  const nodes = {
    otemon: [otemonLanding[0], 0.16, otemonLanding[1]],
    cut: south(799, 548, 18.5),
    kanenomaru: local('tenbin', 0, 27, -31),
    tenbin: local('tenbin', 0, 27, 13),
    taikoSouth: local('taikomon', 0, 41, -8),
    taikoNorth: local('taikomon', 0, 41, 8),
    honmaru: south(654, 268, CASTLE_SITE.height),
    westJunction: north(946, 575, 47),
    nishinomaru: local('nishinomaru', 13, 42, -6),
    kuromon: north(929, 201, 0.16),
    omote: local('omotegoten', -museumHalfWidth - 4, 0.16, -museumHalfDepth - 4),
    museum: local('omotegoten', 0, 0.16, -museumHalfDepth - 3),
    forecourt: local('omotegoten', 0, 0.16, -museumHalfDepth - 6),
    sawaguchi: local('sawaguchi', 8, 0.16, -8),
  };
  const target = geographicPoint(35.27499, 136.25406);
  const inside = nearest(innerBank, target).p, outside = nearest(outerBank, target).p;
  const bankDx = inside[0] - outside[0], bankDz = inside[1] - outside[1], bankLength = Math.hypot(bankDx, bankDz);
  nodes.omoteBank = [inside[0] + bankDx / bankLength * 2, 0.16, inside[1] + bankDz / bankLength * 2];
  const road = nearest(innerRoad, outside), previous = innerRoad[road.index - 1], next = innerRoad[road.index];
  const dx = next[0] - previous[0], dz = next[1] - previous[1], length = Math.hypot(dx, dz);
  const sign = (-dz * (outside[0] - road.p[0]) + dx * (outside[1] - road.p[1])) > 0 ? 1 : -1;
  nodes.omoteRoad = [road.p[0] - dz / length * sign * 4.6, 0.16, road.p[1] + dx / length * sign * 4.6];
  const routes = [];
  function route(id, from, to, kind, width, points = []) {
    const path = [nodes[from], ...points, nodes[to]].filter((p, i, ps) => !i || Math.hypot(p[0] - ps[i - 1][0], p[2] - ps[i - 1][2]) > 0.00001);
    routes.push({ id, from, to, kind, width, points: path });
  }
  route('otemon-ascent', 'otemon', 'cut', 'stairs', 3.2, [
    south(665, 723, 1.5), south(662, 684, 3), south(681, 652, 5),
    south(716, 619, 9), south(724, 586, 12), south(720, 554, 15),
    south(735, 535, 17), south(769, 524, 18),
  ]);
  route('omote-ascent', 'omote', 'cut', 'stairs', 3.2, [
    south(1002, 630, 0.16), south(969, 610, 3), south(931, 591, 6),
    south(907, 567, 10), south(870, 550, 15), south(835, 547, 17),
  ]);
  route('kanenomaru-stairs', 'cut', 'kanenomaru', 'stairs', 3.2, [
    south(786, 547, 18.5), south(774, 546, 19), south(760, 558, 21), south(759, 576, 24), south(774, 589, 27),
  ]);
  route('roka-bridge', 'kanenomaru', 'tenbin', 'bridge', 3.2);
  route('taikomaru-ascent', 'tenbin', 'taikoSouth', 'stairs', 3.2, [
    south(781, 441, 31), south(763, 413, 34), south(745, 393, 36),
    south(712, 393, 37), south(690, 383, 38), south(674, 376, 39),
  ]);
  route('taikomon-passage', 'taikoSouth', 'taikoNorth', 'walk', 3.2);
  route('honmaru-stairs', 'taikoNorth', 'honmaru', 'stairs', 3.2, [
    south(710, 309, 43), south(710, 290, 46), south(689, 277, 49.5),
  ]);
  route('honmaru-west', 'honmaru', 'westJunction', 'walk', 4, [
    south(610, 273, 49.5), south(575, 251, 49.5), south(557, 222, 49.5),
    south(548, 190, 49.5), south(548, 164, 49.5), south(575, 132, 49.5),
    south(583, 109, 49), north(936, 627, 48), north(936, 601, 47),
  ]);
  route('nishinomaru-ridge', 'westJunction', 'nishinomaru', 'walk', 4.2, [
    north(925, 545, 46.5), north(913, 507, 46), north(876, 459, 45.5),
    north(842, 423, 45), north(806, 383, 44.5), north(775, 341, 44),
    north(745, 301, 43.5), north(716, 265, 43), north(696, 282, 42),
  ]);
  route('kuromon-descent', 'westJunction', 'kuromon', 'stairs', 2.6, [
    north(982, 566, 45), north(992, 542, 43), north(981, 516, 41),
    north(971, 487, 38), north(987, 452, 34), north(1007, 402, 29),
    north(1006, 371, 25), north(981, 350, 22), north(956, 328, 19),
    north(935, 306, 16), north(916, 281, 12), north(895, 252, 8),
    north(886, 219, 4), north(895, 202, 1.5),
  ]);
  route('omote-bridge', 'omoteRoad', 'omoteBank', 'bridge', 3.8,
    [[outside[0], 0.16, outside[1]], [inside[0], 0.16, inside[1]]]);
  const frontCorner = nodes.forecourt;
  const firstBank = nearest(innerBank, target).index, lastBank = nearest(innerBank, [frontCorner[0], frontCorner[2]]).index;
  const bankWalk = innerBank.slice(firstBank, lastBank).map(([x, z]) => {
    const dx = CASTLE_SITE.x - x, dz = CASTLE_SITE.z - z, length = Math.hypot(dx, dz);
    return [x + dx / length * 4, 0.16, z + dz / length * 4];
  });
  route('omote-frontcourt', 'omoteBank', 'forecourt', 'walk', 3.2, bankWalk);
  route('museum-frontage', 'forecourt', 'museum', 'walk', 3.2);
  route('museum-omote', 'forecourt', 'omote', 'walk', 3.2,
    [local('omotegoten', -museumHalfWidth - 4, 0.16, -museumHalfDepth - 6)]);
  const access = nearest(innerRoad, [nodes.sawaguchi[0], nodes.sawaguchi[2]]);
  const roadPoints = [access.p, ...innerRoad.slice(road.index, access.index).reverse(), road.p]
    .map(([x, z]) => [x - dz / length * sign * 4.6, 0.16, z + dx / length * sign * 4.6]);
  route('ninomaru-access', 'sawaguchi', 'omoteRoad', 'street', 3.2, roadPoints);
  return { nodes, routes };
}
