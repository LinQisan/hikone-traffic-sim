"""Local Higashi/Otemae reconstruction from owner photos 0864–0866 and mapped outlines.

All parts use the retained metre frame. Heights and unphotographed elevations are explicit
estimates in world/higashi-frontage.json. No image textures or hidden interiors are made.
"""
import json
import math
import os
from functools import lru_cache

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BROWN = (.51, .44, .37)
STONE = (.64, .65, .61)
CREAM = (.83, .82, .74)
DARK = (.23, .28, .28)


@lru_cache(maxsize=1)
def data():
    with open(os.path.join(ROOT, 'world', 'higashi-frontage.json')) as f:
        return json.load(f)


@lru_cache(maxsize=1)
def island():
    with open(os.path.join(ROOT, 'world', 'higashi-island.json')) as f:
        return json.load(f)


def east_owned(item):
    """Island buildings reaching the East Hikone ownership area are authored there, whole."""
    from east_extension import ownership
    return (item.get('name') in {q['name'] for q in island()['buildings']}
            and any(ownership().contains(*p) for p in item['footprint']))


def east_replaced():
    return {q['osm'] for q in island()['buildings'] if east_owned(q)}


def circle(x, z, radius, n=16):
    return [(x + radius * math.cos(i * math.tau / n), z + radius * math.sin(i * math.tau / n)) for i in range(n)]


@lru_cache(maxsize=1)
def ground_surfaces():
    """Disjoint parking/court/planting pieces; the road author owns both mesh and Ground."""
    from road_network import ccw, triangulate, difference
    import road_network
    d = data()
    islands = [ccw(circle(*q['point'], q['radius'])) for q in d['planting']]
    # Existing roads and flush footways take precedence at the source boundary.
    road_network.polygons()
    # Subtract original convex strips, not their fragmented union. At the T,
    # repeatedly clipping tiny coincident fragments creates overlapping edges.
    public = road_network._land_cuts
    out = []
    previous = []
    for q in d['parking'] + [dict(d['forecourt'], name='Higashi entrance court')] + d['aprons'] + island()['grounds']:
        footprint = triangulate(ccw(q['footprint']))
        pieces = difference(footprint, public + previous)
        previous += footprint
        if q['name'] == 'Higashi entrance court':
            pieces = difference(pieces, islands)
        out.extend((q['name'], p, q['height'], q['material']) for p in pieces)
    for p in islands:
        out.extend(('Higashi planting', t, .15, 'HK_Grass') for t in difference(triangulate(p), public))
    return out


def island_cut(land, grass):
    """East-owned ground: mapped courts replace the green; the island has no paved land."""
    from road_network import area, ccw, triangulate, difference, bounds, overlap
    grounds, cutters = {}, []
    for q in island()['grounds']:
        pieces = triangulate(ccw(q['footprint']))
        cutters += pieces
        grounds.setdefault(q['material'], []).extend(pieces)
    box = (100, 90, 216, 400)
    hit = lambda t: box[0] < sum(p[0] for p in t) / 3 < box[2] and box[1] < sum(p[1] for p in t) / 3 < box[3]
    boxes = [(c, bounds(c)) for c in cutters]
    def cut(ts):
        out = []
        for t in ts:
            t = ccw([tuple(p) for p in t])
            near = [c for c, bb in boxes if overlap(bounds(t), bb)]
            pieces = difference([t], near) if near else [t]
            # Difference pieces are convex; a fan drops the slivers left by shared edges.
            out.extend(t for piece in pieces for t in ([piece[0], c, d] for c, d in zip(piece[1:], piece[2:]))
                       if abs(area(t)) > 1e-6)
        return out
    moved = [t for t in land if hit(t)]
    kept = [t for t in land if not hit(t)]
    # The road author keeps the courts west of the ownership seam; never overlap it.
    retained = [ccw([(-999, -999), (120, -999), (120, 999), (-999, 999)]), ccw([(100, -999), (184, -999), (184, 100), (100, 100)])]
    pieces = {material: [t for piece in difference(polys, retained) for t in ([piece[0], c, d] for c, d in zip(piece[1:], piece[2:]))
                         if abs(area(t)) > 1e-6]
              for material, polys in grounds.items()}
    return kept, cut(grass) + cut(moved), pieces


def ground_cutters():
    from road_network import ccw, triangulate
    d = data()
    rings = [q['footprint'] for q in d['parking'] + d['aprons'] + island()['grounds']] + [d['forecourt']['footprint']]
    rings += [circle(*q['point'], q['radius']) for q in d['planting']]
    return [p for ring in rings for p in triangulate(ccw(ring))]


def kerb_openings():
    from road_network import ccw, strip
    d = data()
    return ([ccw(q['footprint']) for q in d['aprons']]
            + strip(d['gate']['approach'][:2], -d['gate']['opening'] / 2, d['gate']['opening'] / 2))


def face(b, points, material, inside, pigment):
    from east_extension import outward
    outward(b, points, material, inside, pigment)


def solid(b, p, bottom, top, material='ART_Concrete', pigment=STONE):
    from road_network import ccw, triangulate
    inside = (sum(x for x, z in p) / len(p), (bottom + top) / 2, sum(z for x, z in p) / len(p))
    for a, c in zip(p, p[1:] + p[:1]):
        face(b, [(a[0], bottom, a[1]), (c[0], bottom, c[1]), (c[0], top, c[1]), (a[0], top, a[1])], material, inside, pigment)
    for t in triangulate(ccw(p)):
        for y in (bottom, top):
            face(b, [(x, y, z) for x, z in t], material, inside, pigment)


def box(b, at, u, v, width, depth, lo, hi, material, pigment):
    p = [at(u + du * width / 2, 0, v + dv * depth / 2) for du, dv in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    solid(b, [(q[0], q[2]) for q in p], lo, hi, material, pigment)


def frame(a, c, center):
    length = math.dist(a, c)
    ux, uz = (c[0] - a[0]) / length, (c[1] - a[1]) / length
    nx, nz = -uz, ux
    if nx * ((a[0] + c[0]) / 2 - center[0]) + nz * ((a[1] + c[1]) / 2 - center[1]) < 0:
        nx, nz = -nx, -nz
    return length, lambda u, y, o: (a[0] + ux * u + nx * o, y, a[1] + uz * u + nz * o)


def building(b, item):
    """All elevations and closed roofs share the mapped footprint, including rear sides."""
    from university_photos import framed_window
    from abstract_props import cylinder
    from university_frontage import rect
    kind, p, top = item['profile'], item['footprint'], .15 + item['height']
    center = (sum(x for x, z in p) / len(p), sum(z for x, z in p) / len(p))
    wall = BROWN if kind in ('main', 'classroom') else (.86, .86, .81) if kind in ('barrel', 'arena', 'block') else (.78, .78, .71)
    if kind == 'shed':
        # Open-sided cycle and playground sheds on regular posts.
        solid(b, p, top - .16, top, 'ART_Concrete', tuple(item['roofColor']) if 'roofColor' in item else CREAM)
        for a, c in zip(p, p[1:] + p[:1]):
            n = max(1, round(math.dist(a, c) / 6))
            for i in range(n):
                t = i / n
                cylinder(b, (a[0] + (c[0] - a[0]) * t, .15, a[1] + (c[1] - a[1]) * t),
                         (a[0] + (c[0] - a[0]) * t, top - .16, a[1] + (c[1] - a[1]) * t), .05, 'HK_MetalLight', segments=5)
        return
    if kind in ('covered-walk', 'porch'):
        # Open covered links have columns and a closed roof, rather than a solid box
        # that would block the courtyard. The recorded roof polygon stays unchanged.
        solid(b, p, top - .22, top, 'ART_Concrete', CREAM)
        for x, z in p:
            cylinder(b, (x, .01, z), (x, top - .22, z), .11, 'ART_StoneLight', segments=6)
        return
    solid(b, p, .15, top, 'ART_Concrete', wall)
    for a, c in zip(p, p[1:] + p[:1]):
        length, at = frame(a, c, center)
        if length < 4:
            continue
        floors = 4 if kind == 'main' else 3 if kind == 'classroom' else 2 if kind in ('timber', 'hall') else 1
        if kind == 'block':
            # Long ribbon windows keep the third block light; its elevations are not close views.
            for floor in range(3):
                framed_window(b, at, .4, length - .4, 1.15 + 3 * floor, 2.15 + 3 * floor, width=.04,
                              columns=max(1, round(length / 5)), rows=1)
            floors = 0
        if kind in ('barrel', 'arena'):
            # Street View: high windows only. Arenas carry a continuous clerestory on their
            # long sides; the gym has spaced small square lights.
            if kind == 'arena' and length > 25:
                framed_window(b, at, 2, length - 2, top - 3, top - 1.3, width=.04,
                              columns=max(2, round(length / 7)), rows=1)
            elif kind == 'barrel':
                count = max(1, round(length / 5.5))
                for i in range(count):
                    u = length * (i + .5) / count
                    framed_window(b, at, u - .6, u + .6, top - 3.4, top - 2.2, width=.04, columns=1, rows=1)
            floors = 0
        for floor in range(floors):
            y = 1.15 + 3.0 * floor
            if y + 1 > top - .35:
                continue
            # Photographed corridor strips replace the old separate square windows.
            if kind in ('main', 'classroom') and length > 7:
                framed_window(b, at, .35, length - .35, y, y + .88, width=.034,
                              columns=max(2, round((length - .7) / 1.15)), rows=1)
                if b.distant:
                    for i in range(1, max(2, round(length / 4.6))):
                        u = length * i / max(2, round(length / 4.6))
                        cylinder(b, at(u, y, .045), at(u, y + .88, .045), .024, 'ART_StoneLight', segments=4)
            else:
                count = max(1, round(length / 3.3))
                for i in range(count):
                    u = length * (i + .5) / count
                    framed_window(b, at, u - .75, u + .75, y, y + 1.2, width=.04, columns=2, rows=1)
        # Parapet/coping, recessed roof bedding and downpipes terminate on the walls.
        rect(b, at, 0, top - .18, length, .18, CREAM, .023)
        if length > 18:
            for u in (.25, length - .25):
                cylinder(b, at(u, .2, .07), at(u, top - .2, .07), .045, 'HK_MetalLight', segments=5)
        if kind == 'main' and length > 10:
            for y in (3.15, 6.15, 9.15):
                rect(b, at, .1, y, length - .2, .035, (.58, .51, .44), .018)
        if kind == 'timber':
            for i in range(1, max(2, int(length / 1.5))):
                u = length * i / max(2, int(length / 1.5))
                rect(b, at, u, .2, .08, top - .4, (.53, .43, .31), .05)
    if item['roof'] == 'flat':
        # A separate weathered roof plane is enclosed by the coping.
        from road_network import ccw, triangulate
        for t in triangulate(ccw(p)):
            face(b, [(x, top + .008, z) for x, z in t], 'HK_MetalLight', (center[0], top - 1, center[1]), (.58, .60, .59))
    else:
        # Roof rise follows the footprint's short axis, closing every gable, even
        # on the concave wooden entrance wing. No guessed rectangular roof filler.
        longest = max(zip(p, p[1:] + p[:1]), key=lambda q: math.dist(*q))
        a, c = longest
        length = math.dist(a, c)
        nx, nz = -(c[1] - a[1]) / length, (c[0] - a[0]) / length
        values = [x * nx + z * nz for x, z in p]
        lo, hi = min(values), max(values)
        mid = (lo + hi) / 2
        from field_photos import clipped
        from road_network import ccw, triangulate
        curved = kind == 'barrel'
        def roof_y(x, z):
            u = abs((x * nx + z * nz - mid) / ((hi - lo) / 2))
            return top + item['rise'] * max(0, 1 - u * u if curved else 1 - u)
        # A gable breaks at the ridge; the gym's barrel roof breaks into curved bands.
        bands = (4 if b.distant else 10) if curved else 2
        cuts = [lo + (hi - lo) * i / bands for i in range(1, bands)]
        roof_material = (.74, .76, .76) if curved else (.56, .59, .60) if kind == 'arena' else (.40, .43, .43)
        for triangle in triangulate(ccw(p)):
            pieces = [list(triangle)]
            for cut in cuts:
                value = lambda v: v[0] * nx + v[1] * nz - cut
                pieces = [q for piece in pieces for q in (clipped(piece, value, False), clipped(piece, value, True)) if len(q) >= 3]
            for q in pieces:
                face(b, [(x, roof_y(x, z), z) for x, z in q], 'HK_RoofTile', (center[0], top - 1, center[1]), roof_material)
        for a, c in zip(p, p[1:] + p[:1]):
            # Split at each break to retain a closed gable or arched end.
            va, vc = a[0] * nx + a[1] * nz, c[0] * nx + c[1] * nz
            ts = sorted((cut - va) / (vc - va) for cut in cuts if (va - cut) * (vc - cut) < -1e-8)
            q = [a] + [[a[j] + (c[j] - a[j]) * t for j in (0, 1)] for t in ts] + [c]
            for u, v in zip(q, q[1:]):
                if max(roof_y(*u), roof_y(*v)) > top + .001:
                    face(b, [(u[0], top - .01, u[1]), (v[0], top - .01, v[1]),
                             (v[0], roof_y(*v), v[1]), (u[0], roof_y(*u), u[1])], 'ART_Concrete',
                         (center[0], top - 1, center[1]), wall)
    if kind == 'main':
        roof_details(b, item)


def roof_details(b, item):
    from abstract_props import cylinder
    from university_frontage import rect, line
    # Two photographed lift/stair headhouses, including the north-end clock.
    tx, tz = .362, .93218
    nx, nz = -.93218, .362
    at = lambda u, y, o: (81 + tx * u + nx * o, y, 193 + tz * u + nz * o)
    box(b, at, 0, -2, 4.6, 4.3, 13.15, 15.35, 'ART_Concrete', CREAM)
    box(b, at, -70, -2, 5.4, 4.8, 13.15, 15.1, 'ART_Concrete', CREAM)
    rect(b, at, -.52, 13.72, 1.04, 1.04, DARK, .17)
    rect(b, at, -.47, 13.77, .94, .94, CREAM, .18)
    for i in range(12):
        angle = i * math.tau / 12
        line(b, at, [(.36 * math.sin(angle), 14.24 + .36 * math.cos(angle)),
                     (.41 * math.sin(angle), 14.24 + .41 * math.cos(angle))], .028, DARK, .19)
    line(b, at, [(0, 14.24), (.04, 14.53)], .035, DARK, .195)
    line(b, at, [(0, 14.24), (.22, 14.15)], .045, DARK, .195)
    # Coping rail is supported at regular structural intervals on each long facade.
    for a, c in [(item['footprint'][0], item['footprint'][8]), (item['footprint'][9], item['footprint'][-1])]:
        length = math.dist(a, c)
        count = max(1, round(length / 3))
        cylinder(b, (a[0], 13.62, a[1]), (c[0], 13.62, c[1]), .035, 'HK_MetalLight', segments=4)
        for i in range(count + 1):
            x, z = a[0] + (c[0] - a[0]) * i / count, a[1] + (c[1] - a[1]) * i / count
            cylinder(b, (x, 13.15, z), (x, 13.62, z), .03, 'HK_MetalLight', segments=4)


def school_gate(b):
    from university import prism
    from abstract_props import cylinder
    from university_frontage import rect, label
    d = data()['gate']
    for path in d['walls']:
        for a, c in zip(path, path[1:]):
            prism(b, a, c, .15, d['height'], .42, 'ART_Concrete')
            prism(b, a, c, d['height'], d['height'] + .14, .49, 'ART_StoneLight')
    x, z = d['center']
    tx, tz = d['tangent']
    nx, nz = -tz, tx
    # Reader-right reverses the tangent because the renderer mirrors map X.
    at = lambda u, y, o: (x - tx * u + nx * o, y, z - tz * u + nz * o)
    for side in (-1, 1):
        u = side * d['opening'] / 2
        box(b, at, u, 0, .55, .65, .15, 2.2, 'ART_Concrete', STONE)
        # Retracted steel leaves sit beside the piers; the photographed opening
        # stays physically traversable in both high and low representations.
        for i in range(7):
            v = u + side * (.45 + i * .11)
            cylinder(b, at(v, .18, .22), at(v, 1.65, .22), .025, 'HK_MetalLight', segments=4)
        for y in (.35, 1.5):
            cylinder(b, at(u + side * .4, y, .22), at(u + side * 1.25, y, .22), .03, 'HK_MetalLight', segments=4)
    rect(b, at, -9.5, 1.27, 3.8, .37, (.43, .45, .41), .226)
    label(b, at, '滋賀県立彦根東高等学校', -9.25, 1.36, 3.28, .18, (.16, .22, .22), .235)
    # Frontage bulletin case: own simple school information, no invented event/date.
    board = lambda u, y, o: at(u + 7.25, y, o)
    box(b, board, 0, .30, 2.05, .18, .85, 1.95, 'ART_Timber', (.24, .28, .23))
    rect(b, board, -.93, .94, 1.86, .93, (.21, .41, .34), .40)
    rect(b, board, -.78, 1.08, .7, .51, CREAM, .41)
    rect(b, board, .08, 1.08, .7, .51, CREAM, .41)
    label(b, board, '彦根東高校', -.75, 1.66, 1.5, .13, CREAM, .42)
    label(b, board, '学校案内', -.71, 1.38, .56, .10, DARK, .42)
    label(b, board, '交通安全', .15, 1.38, .56, .10, DARK, .42)
    for u in (-.65, .21):
        for i in range(3):rect(b, board, u, 1.19 - i * .038, .43 - i * .055, .012, (.37, .44, .41), .42)


def parking(b):
    from abstract_props import cylinder
    from university_frontage import label, rect
    lot = data()['parking'][0]
    p = lot['footprint']
    # The long road-facing edge has an open entrance beside the kiosk. The
    # photographed gravel remains unmarked instead of an invented stall grid.
    entrance = lot['fenceEntrance']
    paths = [[p[0], entrance[0]], [entrance[1], *p[1:], p[0]]]
    for path in paths:
        for a, c in zip(path, path[1:]):
            length = math.dist(a, c)
            if length < .1:continue
            n = max(1, math.ceil(length / 1.6))
            for i in range(n + 1):
                x, z = a[0] + (c[0] - a[0]) * i / n, a[1] + (c[1] - a[1]) * i / n
                cylinder(b, (x, .01, z), (x, 1.04, z), .046, 'ART_StoneLight', segments=5)
            for y in (.43, .83):
                cylinder(b, (a[0], y, a[1]), (c[0], y, c[1]), .04, 'ART_StoneLight', segments=5)
    q = data()['kiosk']
    x, z = q['center']
    at = lambda u, y, o: (x + u, y, z + o)
    box(b, at, 0, 0, q['width'], q['depth'], .15, q['eave'], 'ART_Timber', (.48, .34, .25))
    # The timber window wraps around the building; no transparent backless cards.
    for a, c in zip([[-1.65, -1.35], [1.65, -1.35], [1.65, 1.35], [-1.65, 1.35]],
                    [[1.65, -1.35], [1.65, 1.35], [-1.65, 1.35], [-1.65, -1.35]]):
        a, c = [x + a[0], z + a[1]], [x + c[0], z + c[1]]
        length, f = frame(a, c, (x, z))
        from university_photos import framed_window
        if a[1] > z + 1 and c[1] > z + 1:
            # An inferred rear service door gives the closed kiosk plausible access.
            # Its exact position is unverified; do not imply a photographed back wall.
            framed_window(b, f, .18, length * .48, .95, 2.05, columns=2, rows=1)
            rect(b, f, length * .59, .16, .95, 1.98, (.28, .28, .23), .024)
            rect(b, f, length * .62, 1.12, .75, .78, (.31, .43, .45), .032)
            cylinder(b, f(length * .60, 1.02, .065), f(length * .65, 1.02, .065), .025, 'HK_MetalLight', segments=5)
        else:
            framed_window(b, f, .2, length - .2, .95, 2.05, columns=3, rows=1)
    roof = [[x - 1.95, 2.5, z - 1.6], [x + 1.95, 2.5, z - 1.6],
            [x + 1.95, 2.5, z + 1.6], [x - 1.95, 2.5, z + 1.6]]
    ridge = [(x - .65, 3.65, z), (x + .65, 3.65, z)]
    for f in ([roof[0], roof[1], ridge[1], ridge[0]], [roof[2], roof[3], ridge[0], ridge[1]],
              [roof[3], roof[0], ridge[0]], [roof[1], roof[2], ridge[1]]):
        face(b, f, 'HK_RoofTile', (x, 1, z), (.43, .43, .38))
    face(b, list(reversed(roof)), 'ART_Timber', (x, 3, z), (.42, .34, .28))
    front = lambda u, y, o: (x - u, y, z - 1.35 - o)
    rect(b, front, -.9, .42, 1.8, .3, CREAM, .02)
    label(b, front, '大手前駐車場', -.8, .48, 1.6, .15, DARK, .03)


def planting(b):
    from vegetation import tree, spray
    from abstract_props import cylinder
    for i, q in enumerate(data()['trees']):
        x, z = q['point']
        if q['species'] != 'palm':
            tree(b, q['species'], (x, .15, z), q['height'], q['spread'], seed=8640 + i, fine=False)
        else:
            h = q['height']
            cylinder(b, (x, .15, z), (x, h, z), .14, 'HK_Bark', segments=6, end_radius=.09)
            for j in range(9):
                a = j * math.tau / 9
                tip = (x + math.cos(a) * 1.85, h - .5, z + math.sin(a) * 1.85)
                mid = (x + math.cos(a) * .9, h + .3, z + math.sin(a) * .9)
                cylinder(b, (x, h, z), mid, .028, 'HK_LeafDark', segments=3, end_radius=.012)
                cylinder(b, mid, tip, .025, 'HK_LeafDark', segments=3, end_radius=.005)
                spray(b, mid, (.7, .15, .8), a, 'HK_LeafDark', 8650 + j, fine=False)
    # Photographed round shrubs in the gate-side verge; the courtyard's larger
    # islands stay low, leaving the entrance path and building identification open.
    for i, q in enumerate(data()['planting']):
        x, z = q['point']
        if q['radius'] < 2:
            spray(b, (x, .72, z), (q['radius'] * 1.5, .75, q['radius'] * 1.3), i, 'HK_LeafDark', 8660 + i, fine=False)


def boundary(b):
    """Clipped hedge on a dark stone base along the school's road boundary (Street View 2022)."""
    from university import prism
    d = island()['hedge']
    gap_a, gap_c = d['gap']
    runs, run = [], [d['line'][0]]
    for a, c in zip(d['line'], d['line'][1:]):
        if a[1] < gap_a[1] < c[1]:
            t = (gap_a[1] - a[1]) / (c[1] - a[1])
            run.append([a[0] + (c[0] - a[0]) * t, gap_a[1]])
            runs.append(run)
            t = (gap_c[1] - a[1]) / (c[1] - a[1])
            run = [[a[0] + (c[0] - a[0]) * t, gap_c[1]]]
        run.append(c)
    runs.append(run)
    for run in runs:
        for a, c in zip(run, run[1:]):
            prism(b, a, c, .15, .15 + d['base'], .7, 'HK_StoneDark')
            prism(b, a, c, .15 + d['base'], .15 + d['height'], .9, 'HK_LeafDark')


def frontage(b):
    school_gate(b)
    parking(b)
    planting(b)
    markings(b)
    boundary(b)
    from vegetation import tree
    # The planted court between the two classroom slabs (GSI, owner oblique view).
    for i, (x, z) in enumerate(island()['garden'][:2]):
        tree(b, 'cherry', (x, .15, z), 6.0 + i % 3 * .6, 3.4, seed=8700 + i, fine=False)
    # Paired pale memorial blocks visible in 0865, with an uninscribed dark panel.
    # The source text cannot be read reliably, so no inscription is fabricated.
    from university_frontage import rect
    for x, z in ((48.2, 166.5), (50.4, 165.7)):
        at = lambda u, y, o: (x + .36 * u - .933 * o, y, z + .933 * u + .36 * o)
        box(b, at, 0, 0, 1.65, .52, .15, 1.15, 'ART_StoneLight', CREAM)
        rect(b, at, -.5, .45, 1, .43, (.38, .42, .39), .27)


def markings(b):
    from road_network import strip, difference, sample, north_sample, approach_data, face as ground_face
    from university_frontage import label
    road = data()['roads']['schoolSide']
    crossings = strip(north_sample(), -3.05, 3.05) + strip(sample(approach_data()['innerRoad']), -3.55, 3.55)
    for side in (-1, 1):
        for lo, hi, material in ((2.68, 3, 'ART_PathGreen'), (2.5, 2.63, 'HK_WhitePaint')):
            for p in strip(road, side * lo, side * hi):
                for q in difference([p], crossings):
                    ground_face(b, q, .024, material, False)
    # The west-to-east branch has the photographed stop marking before the T.
    # It is static road paint; this edit does not alter authored event driver rules.
    forward = (.98835, -.1522)
    right = (-.1522, -.98835)
    at = lambda u, v, o: (3.8 + right[0] * u + forward[0] * v, .026 + o,
                          160.84 + right[1] * u + forward[1] * v)
    from university_frontage import rect
    rect(b, at, -2.8, -.15, 5.6, .3, (.92, .91, .83), 0)
    for i, char in enumerate('止まれ'):
        label(b, at, char, -.55, -3.3 - i * 1.5, 1.1, 1.35, (.92, .91, .83), 0)
