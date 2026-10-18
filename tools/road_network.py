"""Browser-owned Kyobashi road plan, read from Google Maps' overhead imagery.

The junction remains (32,26), with metres along Route 25 and towards the bridge.
This is an approximate visual reconstruction, not a georeferenced survey. Meshes,
ground triangles and the editor plan are generated from these same polygons.
"""
import json
import math
import os
import struct
import subprocess
import zlib
import random
from collections import defaultdict
from castle_approach import data as approach_data, hill_height, hill_surface

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS = ('ART_KyobashiRoads', 'ART_KyobashiLand', 'ART_KyobashiBanks',
          'ART_KyobashiWater', 'ART_KyobashiBridge')
WORLD = dict(xMin=-220, xMax=200, zMin=-155, zMax=165)
AREA_EPS = 1e-10  # Keep small corner fragments; dropping them leaves real pinholes.


def moat_bend(x):
    t = max(0, min(1, (x - 110) / 130))
    return 30 * t * t * (3 - 2 * t)


# Street View (中壕東西通り, October 2024) and the overhead image: away from the bridge-foot
# corners, the moat side has a ~2.5 m footway, then a narrow planted strip and the stone edge.
SHORE_INSET, PATH_INSET = 5.0, 3.5


def shore_taper(x):
    t = max(0, min(1, (abs(x - 32) - 13) / 17))
    return t * t * (3 - 2 * t)


# The town side is a ~2.5 m footway with buildings at its back; only the corner fillets keep
# the wider paving. A shorter taper starts just outside Castle Road's own pavements.
TOWN_INSET = 3.5


def town_taper(x):
    t = max(0, min(1, (abs(x - 32) - 10) / 8))
    return t * t * (3 - 2 * t)


def moat_edge(x):
    """Town-side water edge; the signal corners at the bridge keep their original depth."""
    return 39.6 + moat_bend(x) - SHORE_INSET * shore_taper(x)


def castle_x(z):
    return 32 + max(0, -z) * 0.065


def north_shore(x):
    return 74 + 0.7 * moat_bend(x) + max(0, min(1, (-x - 15) / 60)) * 10


# The castle-side bank and the masugata walls at the bridge's north end stand ~4.5 m above the
# road (18 October 2026 photographs; formerly 3 m). Same profile in src/road-layout.js.
BANK_RISE = 4.2


def north_bank_height(x, z):
    return 0.15 + BANK_RISE * max(0, min(1, (32 - (z - north_shore(x))) / 12))


def masonry(b, a, c, low, high, seed, inset=(0.0, 0.0)):
    """Irregular coursed stones (nozura-zumi) on a wall from a to c, as coplanar painted cells.
    `low`/`high` give the bottom/top height at a parameter t along the wall; `inset` offsets the
    face along its normal (x, z) so cells sit just proud of a base face."""
    rng = random.Random(seed)
    length = math.dist(a, c)
    if length < 0.3:
        return
    lo, hi = min(low(0), low(1)), max(high(0), high(1))
    y = lo
    while y < hi - 0.05:
        row = min(hi - y, rng.uniform(0.65, 1.05))
        t = rng.uniform(-0.6, 0) / length
        while t < 1:
            t2 = min(1, t + rng.uniform(0.7, 1.9) / length)
            t0 = max(0, t)
            if t2 - t0 > 0.05 / length:
                pts = []
                for tt in (t0, t2):
                    px, pz = a[0] + (c[0] - a[0]) * tt + inset[0], a[1] + (c[1] - a[1]) * tt + inset[1]
                    pts.append((px, pz, max(low(tt), y + 0.03), min(high(tt), y + row - 0.03)))
                if all(top - bottom > 0.08 for _, _, bottom, top in pts):
                    (x0, z0, b0, t0y), (x1, z1, b1, t1y) = pts
                    tone = rng.random()
                    material = 'ART_StoneLight' if tone < 0.4 else 'HK_Stone' if tone < 0.85 else 'HK_StoneDark'
                    b.face([(x0, b0, z0), (x0, t0y, z0), (x1, t1y, z1), (x1, b1, z1)], material, False)
            t = t2
        y += row


def walk_height(x, z):
    # Flush coloured shoulders on the bridge; short end transitions meet town pavements.
    if 25 <= x <= 39 and 39.6 <= z <= 74:
        return 0.01 + 0.15 * max(0, 1 - (z - 39.6) / 1.4, 1 - (74 - z) / 1.4)
    return hill_height(x, z) + 0.01


def sample(points, step=2):
    """Centripetal-looking cubic centreline, with explicit straight bridge approaches."""
    out = []
    for i in range(len(points) - 1):
        p0, p1 = points[max(0, i - 1)], points[i]
        p2, p3 = points[i + 1], points[min(len(points) - 1, i + 2)]
        n = max(1, math.ceil(math.dist(p1, p2) / step))
        for j in range(n):
            t = j / n
            out.append(tuple(0.5 * ((2 * b) + (-a + c) * t +
                (2 * a - 5 * b + 4 * c - d) * t * t +
                (-a + 3 * b - 3 * c + d) * t ** 3)
                for a, b, c, d in zip(p0, p1, p2, p3)))
    return out + [points[-1]]


# Route 25 crossing centres and the stop bars 2 m before them (shared with tools/moat_art.py).
WALK_CROSSINGS = (19.7, 44.3)
STOP_BARS = (16.4, 47.6)
NORTH = [tuple(p) for p in approach_data()['north']]
MAIN = [(x, 26 + moat_bend(x)) for x in range(-220, 201, 2)]
SOUTH = [(castle_x(z), z) for z in range(-155, 17, 2)] + [(32, 26), (32, 39.6)]
BRIDGE = [(32, z) for z in (39.6, 41, 72.6, 74)]
HONMACHI = [(x, -64) for x in range(-160, 161, 4)]
PARKING = [(-28, 26), (-28, 12), (-28, -18), (-27, -42), (-26, -64)]
EAST_LANE = [(132, 26 + moat_bend(132)), (134, 4), (135, -28), (135, -64)]


def north_half(x, z):
    return 4 - max(0, min(1, (z - 100) / 15))


def north_outer(x, z):
    return 6.5 - 2.5 * max(0, min(1, (z - 100) / 15))


def area(poly):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(poly, poly[1:] + poly[:1])) / 2


def ccw(poly):
    return poly if area(poly) > 0 else list(reversed(poly))


def bounds(poly):
    return min(p[0] for p in poly), min(p[1] for p in poly), max(p[0] for p in poly), max(p[1] for p in poly)


def overlap(a, b):
    return a[0] < b[2] - 1e-7 and b[0] < a[2] - 1e-7 and a[1] < b[3] - 1e-7 and b[1] < a[3] - 1e-7


def clip(poly, a, b, inside):
    out = []
    cross = lambda p: (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
    for p, q in zip(poly, poly[1:] + poly[:1]):
        dp, dq = cross(p), cross(q)
        ip, iq = (dp >= -1e-9, dq >= -1e-9) if inside else (dp <= 1e-9, dq <= 1e-9)
        if ip:
            out.append(p)
        if ip != iq:
            t = dp / (dp - dq)
            out.append((p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t))
    return out if len(out) >= 3 and abs(area(out)) > AREA_EPS else []


def subtract(poly, cutter):
    if not overlap(bounds(poly), bounds(cutter)):
        return [poly]
    remaining, out = poly, []
    for a, b in zip(cutter, cutter[1:] + cutter[:1]):
        outside = clip(remaining, a, b, False)
        if outside:
            out.append(outside)
        remaining = clip(remaining, a, b, True)
        if not remaining:
            break
    return out


def difference(polys, cutters):
    if not polys:
        return []
    envelope = bounds([p for poly in polys for p in poly])
    # A subtraction cannot grow the input envelope. Most town cells touch no road.
    for c in (c for c in cutters if overlap(envelope, bounds(c))):
        polys = [p for poly in polys for p in subtract(poly, c)]
    return polys


def strip(points, left, right):
    edges = []
    for i, p in enumerate(points):
        a, b = points[max(0, i - 1)], points[min(len(points) - 1, i + 1)]
        dx, dz = b[0] - a[0], b[1] - a[1]
        n = math.hypot(dx, dz)
        nx, nz = -dz / n, dx / n
        lo = left(*p) if callable(left) else left
        hi = right(*p) if callable(right) else right
        edges.append(((p[0] + nx * lo, p[1] + nz * lo),
                      (p[0] + nx * hi, p[1] + nz * hi)))
    result = []
    for a, b in zip(edges, edges[1:]):
        p = ccw([a[0], a[1], b[1], b[0]])
        turns = [(c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])
                 for a, c, d in zip(p, p[1:] + p[:1], p[2:] + p[:2])]
        # Offset curves can turn inside their own radius at the tight bank bend. A folded
        # quad is not a convex Boolean cutter; union its two swept triangles instead.
        if min(turns) < -1e-8:
            result.extend(ccw(t) for t in ([p[0], p[1], p[2]], [p[0], p[2], p[3]])
                          if abs(area(t)) > AREA_EPS)
        else:
            result.append(p)
    return result


def node_polygons(polys):
    """Share rounded vertices and split T junctions before exporting Float32 meshes."""
    rounded = [[(round(x, 5), round(z, 5)) for x, z in p] for p in polys]
    # Coincident Boolean intersections can straddle a rounding boundary. Weld within
    # 40 micrometres before noding, safely above an exported Float32 ULP at this map's edge.
    weld, nearby = {}, defaultdict(list)
    tolerance = 0.00004
    for v in sorted({v for p in rounded for v in p}):
        gx, gz = math.floor(v[0] / tolerance), math.floor(v[1] / tolerance)
        candidates = [p for x in range(gx - 1, gx + 2) for z in range(gz - 1, gz + 2)
                      for p in nearby[x, z] if math.dist(p, v) < tolerance]
        weld[v] = min(candidates, key=lambda p: math.dist(p, v)) if candidates else v
        if not candidates:
            nearby[gx, gz].append(v)
    snapped = [[weld[v] for v in p] for p in rounded]
    cells = defaultdict(set)
    for p in snapped:
        for v in p:
            cells[math.floor(v[0] / 8), math.floor(v[1] / 8)].add(v)
    out = []
    for p in snapped:
        vertices = []
        for a, b in zip(p, p[1:] + p[:1]):
            dx, dz = b[0] - a[0], b[1] - a[1]
            length2 = dx * dx + dz * dz
            if length2 < 1e-12:
                continue
            cuts = {a: 0, b: 1}
            cross_tolerance = tolerance * math.sqrt(length2)
            for gx in range(math.floor((min(a[0], b[0]) - tolerance) / 8), math.floor((max(a[0], b[0]) + tolerance) / 8) + 1):
                for gz in range(math.floor((min(a[1], b[1]) - tolerance) / 8), math.floor((max(a[1], b[1]) + tolerance) / 8) + 1):
                    for v in cells[gx, gz]:
                        t = ((v[0] - a[0]) * dx + (v[1] - a[1]) * dz) / length2
                        if 1e-8 < t < 1 - 1e-8 and abs(dx * (v[1] - a[1]) - dz * (v[0] - a[0])) < cross_tolerance:
                            cuts[v] = t
            vertices.extend(v for v, t in sorted(cuts.items(), key=lambda pair: pair[1])[:-1])
        clean = []
        for v in vertices:
            if clean and v == clean[-1]:
                continue
            if len(clean) > 1 and v == clean[-2]:
                clean.pop()
            else:
                clean.append(v)
        while len(clean) > 1 and clean[0] == clean[-1]:
            clean.pop()
        # A welded ear can straddle the polygon's closing edge as well as its interior.
        # Remove cyclic A–B–A spikes before edge ownership and Float32 triangulation.
        while len(clean) >= 3:
            spike = next((i for i in range(len(clean)) if clean[i - 1] == clean[(i + 1) % len(clean)]), None)
            if spike is None:
                break
            clean.pop(spike)
            clean.pop(spike % len(clean))
        out.append(clean if len(clean) >= 3 and abs(area(clean)) > AREA_EPS else [])
    return out


def edge_uses(polys):
    edges = defaultdict(list)
    for i, p in enumerate(polys):
        for a, b in zip(p, p[1:] + p[:1]):
            edges[tuple(sorted((a, b)))].append((i, a, b))
    return edges


def curb_bands(roads, width=0.12):
    """Mitered bands outside the actual union contour, including intersection fillets."""
    remaining = {uses[0][1]: uses[0][2] for uses in edge_uses(roads).values() if len(uses) == 1}
    bands = []
    while remaining:
        start = next(iter(remaining))
        loop, point = [], start
        while True:
            loop.append(point)
            point = remaining.pop(point)
            if point == start:
                break
        # Keep the sampled curves but coalesce straight runs before offsetting.
        simple = []
        for i, p in enumerate(loop):
            a, c = loop[i - 1], loop[(i + 1) % len(loop)]
            if abs((p[0] - a[0]) * (c[1] - p[1]) - (p[1] - a[1]) * (c[0] - p[0])) > 1e-5:
                simple.append(p)
        outer = []
        for i, p in enumerate(simple):
            a, c = simple[i - 1], simple[(i + 1) % len(simple)]
            before, after = math.dist(a, p), math.dist(p, c)
            n1 = ((p[1] - a[1]) / before, -(p[0] - a[0]) / before)
            n2 = ((c[1] - p[1]) / after, -(c[0] - p[0]) / after)
            k = width / (1 + n1[0] * n2[0] + n1[1] * n2[1])
            outer.append((p[0] + (n1[0] + n2[0]) * k, p[1] + (n1[1] + n2[1]) * k))
        for i, a in enumerate(simple):
            j = (i + 1) % len(simple)
            bands.append(ccw([a, simple[j], outer[j], outer[i]]))
    return bands


def intersection(poly, cutter):
    for a, b in zip(cutter, cutter[1:] + cutter[:1]):
        poly = clip(poly, a, b, True)
        if not poly:
            break
    return poly


def height_pieces(poly):
    """A pavement face must not interpolate across a bridge ramp's height break."""
    if max(hill_height(*p) for p in poly) > 0.150001:
        # Split against the authoritative hill triangles so a rising path never cuts into
        # the slope or floats above a different triangulation of its terrain.
        triangles = [ccw([(x, z) for x, y, z in t]) for t, cap in hill_surface()[1]]
        nearby = [t for t in triangles if overlap(bounds(poly), bounds(t))]
        return [cut for t in nearby if (cut := intersection(poly, t))] + difference([poly], nearby)
    if not overlap(bounds(poly), (25, 39.6, 39, 74)):
        return [poly]
    pieces = [poly]
    for a, b in [((25, 0), (25, 1)), ((39, 0), (39, 1)),
                 *[((0, z), (1, z)) for z in (39.6, 41, 72.6, 74)]]:
        pieces = [p for q in pieces for p in (clip(q, a, b, True), clip(q, a, b, False)) if p]
    return pieces


def triangulate(poly):
    """Keep noded boundary vertices without exporting collinear zero-area triangles."""
    points = [tuple(struct.unpack('f', struct.pack('f', v))[0] for v in p) for p in poly]
    remaining = list(range(len(poly)))
    result = []
    cross = lambda a, b, c: (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    while len(remaining) > 3:
        total = area([points[i] for i in remaining]) * 2
        ears = []
        for j, i in enumerate(remaining):
            ids = (remaining[j - 1], i, remaining[(j + 1) % len(remaining)])
            a, b, c = [points[k] for k in ids]
            size = cross(a, b, c)
            if size <= 1e-12 or total - size <= 1e-12:
                continue
            if any(cross(a, b, points[k]) >= -1e-12 and cross(b, c, points[k]) >= -1e-12
                   and cross(c, a, points[k]) >= -1e-12 for k in remaining if k not in ids):
                continue
            ears.append((size, j, ids))
        if not ears:
            raise ValueError('Cannot triangulate road surface: ' + str(poly))
        _, j, ids = max(ears)
        result.append([poly[i] for i in ids])
        remaining.pop(j)
    if len(remaining) == 3 and cross(*[points[i] for i in remaining]) > 1e-12:
        result.append([poly[i] for i in remaining])
    return result


def plan():
    global _land_cuts
    roads, walks = [], []
    moat_path = lambda x, z: 10 - PATH_INSET * shore_taper(x)
    town_path = lambda x, z: 10 - TOWN_INSET * town_taper(x)
    paths = [(MAIN, 4, (town_path, moat_path)), (SOUTH, 4, 10), (BRIDGE, 4, 7), (sample(NORTH), north_half, north_outer),
             (HONMACHI, 3, 4.5), (PARKING, 3, 4.0), (EAST_LANE, 2.8, 3.8),
             (sample(approach_data()['innerRoad']), 3.5, 5.5)]
    negative = lambda width: (lambda x, z: -width(x, z)) if callable(width) else -width
    for pts, half, outer in paths:
        town, moat = outer if isinstance(outer, tuple) else (outer, outer)
        roads += strip(pts, negative(half), half)
        walks += strip(pts, negative(town), negative(half)) + strip(pts, half, moat)
    pedestrian = strip(approach_data()['path'], -2.4, 2.4)
    walks += pedestrian
    # Overlapping end caps close the join between the straight bridge and curved road.
    for radius, target in ((4, roads), (6.5, walks)):
        target.append(ccw([(32 + radius * math.cos(i * math.tau / 32),
                            74 + radius * math.sin(i * math.tau / 32)) for i in range(32)]))
    # Smooth the four corners of the signal junction; preserve its practice crossings.
    for sx in (-1, 1):
        for sz in (-1, 1):
            cx, cz = 32 + sx * 12, 26 + sz * 12
            arc = [(cx - sx * 8 * math.cos(t * math.pi / 2),
                    cz - sz * 8 * math.sin(t * math.pi / 2)) for t in [i / 16 for i in range(17)]]
            inner = (32 + sx * 4, 26 + sz * 4)
            # The fillet is concave. Its fan triangles must be separate convex cutters.
            roads.extend(ccw([inner, a, c]) for a, c in zip(arc, arc[1:]))
    # The real parking forecourt is an open asphalt lot, with two narrow access lanes.
    # Its asphalt reaches the hedge beds behind the narrowed footway.
    roads += [ccw([(-106, -36), (-32, -36), (-32, 18.2), (-106, 18.2)])]
    roads += strip([(-97, 10), (-97, 26)], -3, 3)
    # Cut with the actual road and shoulder pieces. A wide enclosing strip can fold at
    # the tight northern bend and leave terrain protruding through the carriageway.
    _land_cuts = roads + walks + triangulate(inner_moat())
    # Avoid coplanar overlap and pavement lips across an intersecting road.
    united = []
    for i, p in enumerate(roads):
        united += difference([p], roads[:i])
    pavements = []
    for i, p in enumerate(walks):
        # Clip against original convex strips. Reusing already fragmented outputs
        # amplifies tiny coincident-edge fragments at the rounded junction.
        pavements += difference([p], roads + walks[:i])
    return united, pavements


_plan = None
_land_cuts = []
_surfaces = None
_steps = None


def polygons():
    global _plan
    if _plan is None:
        _plan = plan()
    return _plan


def surfaces():
    """One conforming top-surface partition, shared by the GLBs and ground export."""
    global _surfaces
    if _surfaces is not None:
        return _surfaces
    roads, walks = polygons()
    noded = node_polygons(roads + walks)
    roads, walks = [p for p in noded[:len(roads)] if p], [p for p in noded[len(roads):] if p]
    bands = [(p, bounds(p)) for p in curb_bands(roads)]
    pavement, curbs = [], []
    for p in walks:
        if max(walk_height(*v) for v in p) <= 0.01 + 1e-7:
            pavement.append(p)  # Flush bridge margins have no raised curb to model.
            continue
        nearby = [q for q, box in bands if overlap(bounds(p), box)]
        pavement.extend(q for piece in difference([p], nearby) for q in height_pieces(piece))
        for band in nearby:
            cut = intersection(p, band)
            if cut:
                curbs.extend(height_pieces(cut))
    entries = [('road', p, 0.01, 'HK_Asphalt') for p in roads]
    entries += [('walk', p, walk_height, 'HK_Sidewalk') for p in pavement]
    entries += [('curb', p, walk_height, 'HK_Curb') for p in curbs]
    entries += [('town', p, 0.15, 'HK_Sidewalk') for p in town_land()]
    entries += [('bank', p, north_bank_height, 'HK_Grass') for p in north_land()]
    for patch in approach_data()['patches']:
        pieces = triangulate(ccw([tuple(p) for p in patch['footprint']]))
        entries += [('bank', p, north_bank_height, patch['material'])
                    for p in difference(pieces, _land_cuts)]
    noded = node_polygons([p for kind, p, height, material in entries])
    _surfaces = [(kind, p, height, material) for (kind, _, height, material), p in zip(entries, noded) if p]
    return _surfaces


def surface_steps():
    """Only exposed height differences need a side face; never overlap a top surface."""
    global _steps
    if _steps is not None:
        return _steps
    entries = surfaces()
    _steps = []

    def wall(a, b, first, second, ha, hb, la, lb):
        da, db = ha - la, hb - lb
        if max(abs(da), abs(db)) < 1e-7:
            return
        if da * db < -1e-12:
            t = da / (da - db)
            p = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
            h, low = ha + (hb - ha) * t, la + (lb - la) * t
            wall(a, p, first, second, ha, h, la, low)
            wall(p, b, first, second, h, hb, low, lb)
            return
        if da + db < 0:
            a, b, ha, hb, la, lb, first, second = b, a, lb, la, hb, ha, second, first
        material = 'HK_Curb' if second == 'road' and first in ('walk', 'curb') else 'HK_Sidewalk'
        destination = 'roads'
        if first == 'bank':
            destination, material = 'banks', 'HK_Stone'
        points = [(a[0], la, a[1]), (a[0], ha, a[1]), (b[0], hb, b[1]), (b[0], lb, b[1])]
        # A ramp meeting a level surface ends in a triangle rather than a zero-area quad.
        points = [p for i, p in enumerate(points) if math.dist(p, points[i - 1]) > 1e-8]
        if len(points) >= 3:
            _steps.append((destination, points, material))

    for uses in edge_uses([p for kind, p, height, material in entries]).values():
        i, a, b = uses[0]
        kind, _, height, _ = entries[i]
        at = lambda h, p: h(*p) if callable(h) else h
        if len(uses) == 2:
            other, _, _ = uses[1]
            kind2, _, height2, _ = entries[other]
            wall(a, b, kind, kind2, at(height, a), at(height, b), at(height2, a), at(height2, b))
        elif len(uses) == 1 and kind in ('road', 'walk', 'curb'):
            # At the water, bridge shoulders meet the existing stone deck (top = -0.03 m).
            bridge = all(25 - 1e-5 <= x <= 39 + 1e-5 and 39.6 - 1e-5 <= z <= 74 + 1e-5 for x, z in (a, b))
            base = -0.03 if bridge else 0.15
            wall(a, b, kind, 'town', at(height, a), at(height, b), base, base)
        elif len(uses) == 1 and kind == 'bank' and min(a[0], b[0]) < 40 and max(a[0], b[0]) > 24:
            # The sloped moat wall leaves the old 24..40 m bridge opening free. Its top
            # still has exposed bank edges beside the narrower curved approach. Close
            # those actual edges to the water bed; otherwise the hollow bank shows sky
            # from the bridge. Road/pavement subtraction already provides the clearance.
            if all(abs(z - north_shore(x) - 4) < 0.0001 for x, z in (a, b)) and abs(b[0] - a[0]) > 1e-8:
                lo, hi = sorted(((24 - a[0]) / (b[0] - a[0]), (40 - a[0]) / (b[0] - a[0])))
                lo, hi = max(0, lo), min(1, hi)
                c, d = [tuple(a[i] + (b[i] - a[i]) * t for i in range(2)) for t in (lo, hi)]
                wall(c, d, 'bank', 'water', at(height, c), at(height, d), -1.35, -1.35)
        elif len(uses) > 2:
            raise ValueError('Overlapping surface edge: ' + str(uses))
    return _steps


def face(b, poly, y, material, strokes=True):
    # Triangulation must not introduce a different pigment at every diagonal: a flat
    # polygon can still share its vertices, normals and colour in both detail levels.
    pigment = b.pigment(material)
    for triangle in triangulate(ccw(poly)):
        b.face([(x, y(x, z) if callable(y) else y, z) for x, z in reversed(triangle)], material,
               strokes=strokes, pigment=pigment)


def paint(b, a, c, width=0.15):
    face(b, strip([a, c], -width / 2, width / 2)[0], 0.022, 'HK_WhitePaint')


def roads_mesh(b):
    for kind, p, height, material in surfaces():
        if kind in ('road', 'walk', 'curb'):
            p = approach_part(p, False)
            if p:
                face(b, p, height, material, kind != 'curb')
    for destination, points, material in surface_steps():
        if destination == 'roads':
            points = approach_side(points, False)
            if points:
                b.face(points, material, strokes=False)
    # Four crossings are visible in the close overhead image, including the bridge entrance.
    # The Route 25 crossings lie just beyond the kerb returns, 24.6 m apart (overhead: ~24.3 m).
    for z in [22.5 + i * 0.85 for i in range(9)]:
        for x in WALK_CROSSINGS:
            face(b, [(x - 1.3, z), (x + 1.3, z), (x + 1.3, z + 0.43), (x - 1.3, z + 0.43)], 0.022, 'HK_WhitePaint')
    for x in [28.4 + i * 0.85 for i in range(9)]:
        face(b, [(x, 16.4), (x + 0.43, 16.4), (x + 0.43, 19.0), (x, 19.0)], 0.022, 'HK_WhitePaint')
        face(b, [(x, 33.1), (x + 0.43, 33.1), (x + 0.43, 35.7), (x, 35.7)], 0.022, 'HK_WhitePaint')
    # Approach centre and edge lines follow the bend instead of tile repeats.
    for a, c in zip(MAIN, MAIN[1:]):
        x = (a[0] + c[0]) / 2
        if WALK_CROSSINGS[0] - 1.3 < x < WALK_CROSSINGS[1] + 1.3 or x >= 199:
            continue
        for offset in (-3.55, 3.55):
            if offset < 0 and (-101 < x < -93 or -32 < x < -24 or 128 < x < 136):
                continue
            paint(b, (a[0], a[1] + offset), (c[0], c[1] + offset))
        if (x < -130 and int((x + 160) / 5) % 2 == 0 or -20 <= x <= STOP_BARS[0]
                or STOP_BARS[1] <= x < 54
                or x > 84 and int((x - 84) / 6) % 2 == 0):
            paint(b, a, c)
    # The western parking frontage also has a tapered central hatch, visible in Street View.
    west_hatch = [(-130, 26), (-116, 25.4), (-48, 25.4), (-20, 26.15), (-48, 26.6), (-116, 26.6)]
    for a, c in zip(west_hatch, west_hatch[1:] + west_hatch[:1]):
        paint(b, a, c)
    for x in range(-126, -23, 3):
        # Clip each diagonal against the convex median; no paint enters either traffic lane.
        q = strip([(x - 1, 25), (x + 1, 27)], -0.10, 0.10)[0]
        for a, c in zip(ccw(west_hatch), ccw(west_hatch)[1:] + ccw(west_hatch)[:1]):
            q = clip(q, a, c, True) if q else []
        if q:
            face(b, q, 0.022, 'HK_WhitePaint')
    # Reuse the hand-authored tapered hatch and arrows, without obsolete edge lines.
    from moat_art import road_paint
    road_paint(b, details_only=True)
    # Castle Road has continuous centre/edge lines, not a repeating tile's dashed centre.
    # Leave the Honmachi cross street open; traffic routes use the same carriageway as before.
    for z in range(-154, 12, 2):
        if -70 <= z < -58:
            continue
        for dx in (-3.55, 0, 3.55):
            paint(b, (castle_x(z) + dx, z), (castle_x(z + 2) + dx, z + 2))
    # The bridge/north bend have edge lines and green margins, with no centre dashes.
    # End paint before the mapped road's open end: Float32 export must not put its last
    # vertex over the adjacent terrain when the two use different coordinate rounding.
    for pts in (BRIDGE, sample(NORTH)[:-1]):
        for side in (-1, 1):
            at = lambda offset: (lambda x, z: side * (north_half(x, z) + offset)) if pts is not BRIDGE else side * (4 + offset)
            for q in strip(pts, at(-0.45), at(-0.30)):
                q = approach_part(q, False)
                if q:
                    face(b, q, 0.022, 'HK_WhitePaint')
            for q in strip(pts, at(-0.26), at(0)):
                q = approach_part(q, False)
                if q:
                    face(b, q, 0.023, 'ART_PathGreen')
    for side in (-1, 1):
        for q in strip(BRIDGE, side * 4.0, side * 5.05):
            face(b, q, lambda x, z: walk_height(x, z) + 0.002, 'ART_PathGreen')
    # Parking bays are visibly parking, rather than a disconnected two-lane road.
    for z in (-29, -13, 3):
        for x in range(-103, -34, 3):
            if z == 3 and -71 < x < -58:
                continue  # service pavilion apron, not a parking space
            paint(b, (x, z), (x, z + 5), 0.10)
        paint(b, (-103, z + 5), (-34, z + 5), 0.10)


def town_land():
    polygons()
    cuts = _land_cuts
    cells = []
    for x in range(-240, 220, 10):
        for lo, hi, material in ((-180, 30, 'HK_Sidewalk'),):
            for z in range(lo, hi, 10):
                cells.append(([(x, z), (x + 10, z), (x + 10, z + 10), (x, z + 10)], material))
    # Continuous two-metre shore strips avoid stairsteps and gaps at a curving bank.
    for x in range(-240, 220, 2):
        cells.append(([(x, 30), (x + 2, 30), (x + 2, moat_edge(x + 2)),
                       (x, moat_edge(x))], 'HK_Sidewalk'))
    return [p for poly, material in cells for p in difference([ccw(poly)], cuts)]


def land_mesh(b):
    for kind, p, height, material in surfaces():
        if kind in ('town', 'bank'):
            p = approach_part(p, False)
            if p:
                face(b, p, height, material)


def north_land():
    polygons()
    out = []
    patches = [t for patch in approach_data()['patches']
               for t in triangulate(ccw([tuple(p) for p in patch['footprint']]))]
    # The hill supplies its own surface: do not retain a second unseen ground sheet below it.
    hill = triangulate(ccw([(x, z) for x, y, z in hill_surface()[0][-1]]))
    for x in range(-380, 220, 8):
        for lo, hi in zip((4, 12, 20, 32, 50, 75, 110, 130, 180, 240, 300),
                          (12, 20, 32, 50, 75, 110, 130, 180, 240, 300, 370)):
            p = ccw([(x, north_shore(x) + lo), (x + 8, north_shore(x + 8) + lo),
                     (x + 8, north_shore(x + 8) + hi), (x, north_shore(x) + hi)])
            out += difference([p], _land_cuts + patches + hill)
    return out


def inner_moat():
    d = approach_data()
    return ccw([tuple(p) for p in d['outerBank'] + list(reversed(d['innerBank']))])


def banks_mesh(b):
    # Coarse stone faces give the sloped wall its scale without thousands of separate rocks.
    # Courses and stone widths vary, as in the castle's nozura-zumi walls (18 October 2026 photos).
    top = 0.15 + BANK_RISE
    shore = lambda u: north_shore(u)
    for x in range(-220, 200, 2):
        if 24 <= x < 40:
            continue
        a, c = (x, moat_edge(x)), (x + 2, moat_edge(x + 2))
        b.face([(a[0], -1.35, a[1]), (c[0], -1.35, c[1]),
                (c[0], 0.15, c[1]), (a[0], 0.15, a[1])], 'HK_StoneDark', False)
        b.face([(x, -1.35, shore(x)), (x, top, shore(x) + 4),
                (x + 2, top, shore(x + 2) + 4), (x + 2, -1.35, shore(x + 2))], 'HK_StoneDark', False)
    rng = random.Random(712)
    stone_point = lambda u, y: (u, y, shore(u) + 4 * (y + 1.35) / (top + 1.35) - 0.018)
    y = -1.35
    while y < top - 0.1:
        row = min(top - y, rng.uniform(0.7, 1.1))
        for lo, hi in ((-220, 24), (40, 200)):
            u = lo - rng.uniform(0, 1.2)
            while u < hi:
                u2 = min(hi, u + rng.uniform(1.0, 2.4))
                l, r = max(lo, u) + 0.04, u2 - 0.04
                if r - l > 0.3:
                    lean = rng.uniform(-0.12, 0.12)
                    tone = rng.random()
                    material = 'ART_StoneLight' if tone < 0.35 else 'HK_Stone' if tone < 0.88 else 'HK_StoneDark'
                    b.face([stone_point(l, y + 0.04), stone_point(l + lean, y + row - 0.035),
                            stone_point(r + lean, y + row - 0.035), stone_point(r, y + 0.04)], material, False)
                u = u2
        y += row
    # Retaining faces use the same pavement/terrain boundary as their adjoining tops; the tall
    # masugata walls beside the north approach carry the same irregular courses.
    for i, (destination, points, material) in enumerate(surface_steps()):
        if destination == 'banks':
            points = approach_side(points, False)
            if points:
                b.face(points, material, strokes=False)
            if len(points) == 4 and max(p[1] for p in points) - min(p[1] for p in points) > 1.2:
                (ax, la, az), (_, ha, _), (bx, hb, bz), (_, lb, _) = points
                length = math.hypot(bx - ax, bz - az)
                if length > 0.3:
                    n = ((bz - az) / length * 0.015, -(bx - ax) / length * 0.015)
                    masonry(b, (ax, az), (bx, bz), lambda t: la + (lb - la) * t,
                            lambda t: ha + (hb - ha) * t, 9000 + i, n)


def inner_banks_mesh(b):
    # Inner moat banks follow the same outlines used to cut land and editor water walls.
    # Large stone planes carry the silhouette; no separate rock objects or hidden cap strips.
    from streetscape import outward_face
    for bank in ('outerBank', 'innerBank'):
        points = approach_data()[bank]
        for a, c in zip(points, points[1:]):
            dx, dz = c[0] - a[0], c[1] - a[1]
            length = math.hypot(dx, dz)
            middle = ((a[0] + c[0]) / 2, (a[1] + c[1]) / 2)
            # The moat is on the left of the outer chain and right of the inner chain.
            side = 1 if bank == 'outerBank' else -1
            solid = (middle[0] + side * dz / length, -0.6, middle[1] - side * dx / length)
            outward_face(b, [(a[0], -1.35, a[1]), (c[0], -1.35, c[1]),
                             (c[0], 0.15, c[1]), (a[0], 0.15, a[1])], 'HK_StoneDark', solid)


def bridge_mesh(b):
    # 18 October 2026 photographs: a weathered timber-style balustrade (top and bottom rails with
    # close balusters) between round grey posts with onion-shaped giboshi caps, every ~4.3 m.
    # Keep the 34.4 m authored deck; the four shaped newels stand at its ends.
    from streetscape import bridge_posts, lathe
    from abstract_props import cylinder
    giboshi = [(1.02, 0.16), (1.07, 0.17), (1.11, 0.11), (1.19, 0.15), (1.29, 0.17),
               (1.39, 0.12), (1.47, 0.05), (1.52, 0.01)]
    for x in (25.25, 38.75):
        for z in [39.6 + i * 4.3 for i in range(1, 8)]:
            base = walk_height(x, z)
            cylinder(b, (x, base, z), (x, base + 1.02, z), 0.15, 'HK_Stone', segments=12)
            lathe(b, x, z, [(base + y, r) for y, r in giboshi], 'ART_StoneLight')
        b.box((x, 0.95, 56.8), (0.13, 0.13, 34.4), 'HK_WoodDark')
        b.box((x, 0.30, 56.8), (0.12, 0.10, 34.4), 'HK_WoodDark')
        for i in range(77):
            z = 39.8 + i * 0.45
            if any(abs(z - (39.6 + k * 4.3)) < 0.25 for k in range(9)):
                continue
            base = walk_height(x, z)
            b.box((x, max(base, 0.35) + 0.27, z), (0.07, 0.54, 0.07), 'HK_WoodDark')
    b.box((32, -0.28, 56.8), (14, 0.50, 34.4), 'HK_StoneDark')
    # Keep the separately modelled stone newels at both banks.
    before = len(b.vertices)
    bridge_posts(b)
    for i in range(before, len(b.vertices)):
        x, z, y = b.vertices[i]
        # Existing newels are local to a bridge whose origin is (32,39.6).
        unity_x, unity_z = -x + 32, -z
        if unity_z > 6:
            unity_z += 22
        b.vertices[i] = (-unity_x, -(unity_z + 39.6), y + 0.01)


def otemon_bridge_mesh(b):
    # Otemon bridge is pedestrian width. Its existing walk surface is part of the shared plan.
    from streetscape import outward_face
    for p in strip(approach_data()['path'][:3], -2.4, 2.4):
        for a, c in zip(p, p[1:] + p[:1]):
            outward_face(b, [(a[0], -0.12, a[1]), (c[0], -0.12, c[1]),
                             (c[0], 0.15, c[1]), (a[0], 0.15, a[1])], 'HK_Stone',
                         (sum(v[0] for v in p) / 4, 0, sum(v[1] for v in p) / 4))
    for side in (-1, 1):
        for p in strip(approach_data()['path'][:3], side * 2.4, side * 2.62):
            face(b, p, 0.81, 'HK_Stone', False)
            centre = (sum(v[0] for v in p) / 4, 0.45, sum(v[1] for v in p) / 4)
            for a, c in zip(p, p[1:] + p[:1]):
                outward_face(b, [(a[0], 0.15, a[1]), (c[0], 0.15, c[1]),
                                 (c[0], 0.81, c[1]), (a[0], 0.81, a[1])], 'HK_Stone', centre)


def approach_part(poly, far):
    """The practice boundary partitions existing detail from one economical distant batch."""
    return clip(poly, (0, WORLD['zMax']), (1, WORLD['zMax']), far)


def approach_side(points, far):
    result = []
    limit = WORLD['zMax']
    for a, c in zip(points, points[1:] + points[:1]):
        ia, ic = (a[2] >= limit, c[2] >= limit) if far else (a[2] <= limit, c[2] <= limit)
        if ia:
            result.append(a)
        if ia != ic:
            t = (limit - a[2]) / (c[2] - a[2])
            result.append(tuple(a[i] + (c[i] - a[i]) * t for i in range(3)))
    return result if len(result) >= 3 else []


def distant_approach_mesh(b):
    # No raised brush geometry outside the practice rectangle. The small composite retains
    # vertex pigments and the same exact surface silhouettes, with one draw per selected LOD.
    for kind, p, height, material in surfaces():
        p = approach_part(p, True)
        if p:
            face(b, p, height, material, False)
    for destination, points, material in surface_steps():
        points = approach_side(points, True)
        if points:
            b.face(points, material, strokes=False)
    face(b, inner_moat(), -1.35, 'HK_Water', False)
    inner_banks_mesh(b)
    otemon_bridge_mesh(b)
    for side in (-1, 1):
        pts = sample(NORTH)[:-1]
        for lo, hi, height, material in ((-0.45, -0.30, 0.022, 'HK_WhitePaint'),
                                         (-0.26, 0, 0.023, 'ART_PathGreen')):
            at = lambda offset: lambda x, z: side * (north_half(x, z) + offset)
            for q in strip(pts, at(lo), at(hi)):
                q = approach_part(q, True)
                if q:
                    face(b, q, height, material, False)


def triangles(poly, y):
    # Ground queries must use the exported Float32 boundary too. At distant T junctions,
    # a tiny valid curb triangle can otherwise move across a double-precision road edge.
    packed = lambda v: round(struct.unpack('f', struct.pack('f', v))[0], 8)
    return [[v for x, z in triangle for v in (packed(x), packed(y(x, z) if callable(y) else y), packed(z))]
            for triangle in triangulate(poly)]


_pending_image = None


def export_plan(markings=()):
    global _pending_image
    roads = [p for kind, p, height, material in surfaces() if kind == 'road']
    walks = [p for kind, p, height, material in surfaces() if kind in ('walk', 'curb')]
    groups = {'Kyobashi carriageway': [t for p in roads for t in triangles(p, 0.01)],
              'Kyobashi pavement': [t for p in walks for t in triangles(p, walk_height)],
              # Flat distant bank is the ordinary 0.15 m fallback, outside the editor/play
              # rectangle. Keep its render mesh but do not index thousands of unused ground
              # triangles at startup. The rising path keeps its own exact walk triangles.
              'Kyobashi raised bank': [t for kind, p, height, material in surfaces() if kind == 'bank'
                                      if (q := approach_part(p, False)) for t in triangles(q, height)]}
    with open(os.path.join(ROOT, 'data', 'road_tiles.json'), 'w') as f:
        json.dump(groups, f, separators=(',', ':'))
    path = os.path.join(ROOT, 'data', 'map.json')
    with open(path) as f:
        meta = json.load(f)
    ppm = 6
    signal_script = "import {signalRigs} from './src/signal-layout.js';console.log(JSON.stringify(signalRigs().map((r,i)=>({name:'信号柱 '+(i+1),x:r.pole.x,z:r.pole.z,yaw:0}))));"
    signals = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', signal_script], cwd=ROOT))
    water_walls = []
    for label, xs in [('west', list(range(-220, 25, 2)) + [25]), ('east', [39] + list(range(40, 201, 2)))]:
        polygon = [(x, moat_edge(x)) for x in xs] + [(x, north_shore(x)) for x in reversed(xs)]
        water_walls.append(dict(name='Moat water ' + label, polygon=[round(v, 5) for p in polygon for v in p]))
    # The bridge deck is free ground; its pedestrian corridor is removed from the water walls.
    for i, p in enumerate(difference(triangulate(inner_moat()), strip(approach_data()['path'], -2.4, 2.4))):
        water_walls.append(dict(name='Inner moat ' + str(i), polygon=[round(v, 5) for point in p for v in point]))
    meta.update(world=WORLD, imageWidth=(WORLD['xMax'] - WORLD['xMin']) * ppm,
                imageHeight=(WORLD['zMax'] - WORLD['zMin']) * ppm, pixelsPerMeter=ppm,
                exportedFrom='tools/road_network.py; Google Maps overhead visual reconstruction',
                surfaces=[dict(kind=k, triangles=[v for t in ts for i, v in enumerate(t) if i % 3 != 1])
                          for k, ts in zip(('carriageway', 'sidewalk', 'ground'), groups.values())],
                walls=water_walls, lanes=[], signals=signals)
    with open(path, 'w') as f:
        json.dump(meta, f, separators=(',', ':'))
    # The simulator needs only the water walls; map.json's ~1 MB of surfaces serve the editor.
    with open(os.path.join(ROOT, 'data', 'walls.json'), 'w') as f:
        json.dump(dict(world=WORLD, walls=water_walls), f, separators=(',', ':'))
    # Road heights are needed immediately by paving generators. The plan image waits until
    # every requested model is exported, so new frontages have their final GLB bounds.
    _pending_image = (meta, roads, walks, markings)


def finish_exports():
    if _pending_image is not None:
        export_image(*_pending_image)


def export_image(meta, roads, walks, markings):
    """A dependency-free plan image; editor overlays supply editable route lines."""
    w, h, ppm = meta['imageWidth'], meta['imageHeight'], meta['pixelsPerMeter']
    rows = [bytearray(bytes((168, 177, 127)) * w) for _ in range(h)]
    def raster(poly, color):
        p = [((x - WORLD['xMin']) * ppm, (WORLD['zMax'] - z) * ppm) for x, z in poly]
        for j in range(max(0, math.ceil(min(v[1] for v in p))), min(h, math.ceil(max(v[1] for v in p)))):
            cuts = []
            y = j + 0.5
            for a, c in zip(p, p[1:] + p[:1]):
                if min(a[1], c[1]) <= y < max(a[1], c[1]):
                    cuts.append(a[0] + (c[0] - a[0]) * (y - a[1]) / (c[1] - a[1]))
            cuts.sort()
            for lo, hi in zip(cuts[::2], cuts[1::2]):
                lo, hi = max(0, math.ceil(lo - 0.5)), min(w, math.ceil(hi - 0.5))
                rows[j][lo * 3:hi * 3] = bytes(color) * max(0, hi - lo)
    raster([(-220, -155), (200, -155), (200, moat_edge(200)),
            *[(x, moat_edge(x)) for x in range(200, -221, -2)]], (222, 204, 164))
    raster([*[(x, moat_edge(x)) for x in range(-220, 201, 2)],
            *[(x, north_shore(x)) for x in range(200, -221, -2)]], (108, 153, 164))
    raster(inner_moat(), (108, 153, 164))
    for patch in approach_data()['patches']:
        raster(patch['footprint'], (194, 174, 133))
    for x in range(-220, 200, 4):
        if 24 <= x < 40:
            continue
        raster([(x, north_shore(x)), (x + 4, north_shore(x + 4)),
                (x + 4, north_shore(x + 4) + 4), (x, north_shore(x) + 4)], (158, 160, 142))
    for p in walks:
        raster(p, (237, 219, 179))
    for p in roads:
        raster(p, (132, 142, 156))
    for p, material in markings:
        raster(p, (250, 242, 209) if material == 'HK_WhitePaint' else (133, 171, 143))
    # Use the browser's actual placement transformation for the plan's roof footprints.
    script = "import fs from 'node:fs';import {webLayout} from './src/web-layout.js';console.log(JSON.stringify(webLayout(JSON.parse(fs.readFileSync('data/layout.json'))).items));"
    items = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', script], cwd=ROOT))
    roof_bounds = {}
    for item in items:
        name = item['a']
        x, y, z = item['p']
        angle = math.radians(item['r'])
        if item['g'] in ('Buildings', 'WebFrontage'):
            if name not in roof_bounds:
                # GLB stores mirrored X and ordinary Z. Read the exported silhouette, including
                # eaves, rather than guessing every new building is a 7.2 by 9 metre house.
                with open(os.path.join(ROOT, 'data', 'models', 'impressionist', name + '.glb'), 'rb') as f:
                    header = f.read(20)
                    model = json.loads(f.read(struct.unpack_from('<I', header, 12)[0]))
                positions = [model['accessors'][p['attributes']['POSITION']]
                             for mesh in model['meshes'] for p in mesh['primitives']]
                roof_bounds[name] = (-max(p['max'][0] for p in positions),
                                     -min(p['min'][0] for p in positions),
                                     min(p['min'][2] for p in positions), max(p['max'][2] for p in positions))
            left, right, back, front = roof_bounds[name]
            pts = [(x + u * math.cos(angle) + v * math.sin(angle),
                    z - u * math.sin(angle) + v * math.cos(angle))
                   for u, v in [(u * item['s'][0], v * item['s'][2])
                                for u, v in [(left, front), (right, front), (right, back), (left, back)]]]
            raster(pts, (100, 111, 139))
        elif item['g'] in ('Forest', 'WebBank', 'WebGrove', 'WebTownTrees') and ('Tree' in name or 'Grove' in name):
            r = (6.3 if item['g'] == 'WebGrove' else 3) * item['s'][0]
            raster([(x + r * math.cos(i * math.tau / 9), z + r * math.sin(i * math.tau / 9)) for i in range(9)], (117, 145, 103))
        elif item['g'] == 'WebParking':
            raster([(x - 4, z - 0.6), (x + 4, z - 0.6), (x + 4, z + 0.6), (x - 4, z + 0.6)], (117, 145, 103))
    for building in approach_data()['buildings']:
        raster(building['footprint'], (100, 111, 139))
    def chunk(kind, data):
        return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data))
    raw = b''.join(b'\0' + row for row in rows)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', w, h, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')
    with open(os.path.join(ROOT, 'data', 'map.png'), 'wb') as f:
        f.write(png)


def build(name, mesh_class):
    b = mesh_class(name)
    if name == 'ART_KyobashiRoads':
        markings = []
        class PaintedPlan:
            pigment = b.pigment

            def face(self, points, material, **kwargs):
                if material in ('HK_WhitePaint', 'ART_PathGreen'):
                    markings.append(([(x, z) for x, y, z in points], material))
                b.face(points, material, **kwargs)
        roads_mesh(PaintedPlan())
        export_plan(markings)
    elif name == 'ART_KyobashiLand':
        land_mesh(b)
    elif name == 'ART_KyobashiBanks':
        banks_mesh(b)
    elif name == 'ART_KyobashiBridge':
        bridge_mesh(b)
    else:
        # Two-metre water cells where the shore tapers at the bridge-foot corners.
        xs = sorted({*range(-240, 221, 10), *range(-20, 86, 2)})
        for x, x2 in zip(xs, xs[1:]):
            face(b, [(x, moat_edge(x)), (x2, moat_edge(x2)),
                     (x2, north_shore(x2)), (x, north_shore(x))], -1.35, 'HK_Water')
    return b
