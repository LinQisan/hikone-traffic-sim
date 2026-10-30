"""The east street seen on foot, from the owner's photographs 0895-0910.

world/east-street.json owns the street section, lots, planting and house styles; every size is
a visual estimate. Pigments stay warm and broken, with violet-brown darks rather than black, so
the painted shaders keep the Renoir palette on realistic forms. Shop names and posters are
reduced to colour shapes; no photograph is used as a texture.
"""
import json
import math
import os
from functools import lru_cache

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DARK = (.27, .22, .25)
TIMBER = (.36, .27, .25)
PLASTER = (.90, .86, .75)
STUCCO = (.84, .79, .67)
TILE = (.42, .44, .50)
BRICK = (.60, .34, .27)
WARM_BRICK = (.68, .42, .31)
CONCRETE = (.72, .69, .63)
GLASS = (.27, .33, .40)
SHOP_SOUTH = ((278.95, 300.77), (280.33, 323.89))
SHOP_NORTH = ((280.36, 324.52), (281.35, 346.99))


@lru_cache(maxsize=1)
def data():
    with open(os.path.join(ROOT, 'world', 'east-street.json')) as f:
        return json.load(f)


def centre(z):
    points = data()['street']['points']
    for a, c in zip(points, points[1:]):
        if a[1] <= z <= c[1]:
            return a[0] + (c[0] - a[0]) * (z - a[1]) / (c[1] - a[1])
    return points[0][0] if z < points[0][1] else points[-1][0]


def band(lo, hi):
    """Quads between two offsets from the centreline, tapered into the mapped road at each end."""
    from road_network import ccw
    s = data()['street']
    stations = sorted({s['from'], s['to'], *(p[1] for p in s['points'] if s['from'] < p[1] < s['to']),
                       *range(s['from'], s['to'], 12)})
    return [ccw([(centre(a) + lo, a), (centre(a) + hi, a), (centre(c) + hi, c), (centre(c) + lo, c)])
            for a, c in zip(stations, stations[1:])]


def overlay(surfaces):
    """Replace road, footway and yards inside the street corridor with the walked section."""
    from road_network import area, bounds, ccw, difference, overlap, triangulate
    from east_extension import data as source
    s = data()['street']
    fan = lambda polys: [t for p in polys for t in ([p[0], c, d] for c, d in zip(p[1:], p[2:])) if abs(area(t)) > 1e-6]
    near = lambda t: 232 < sum(p[0] for p in t) / len(t) < 300 and 90 < sum(p[1] for p in t) / len(t) < 425
    solids = [ccw([tuple(p) for p in t]) for q in source()['buildings']
              if near(q['outlines'][0]) for t in q['triangles']]
    water = [ccw([tuple(p) for p in t]) for t in surfaces['water'] if near(t)]
    solid_boxes = [(t, bounds(t)) for t in solids + water]
    def clear(polys):
        out = []
        for p in polys:
            box = bounds(p)
            out += difference([p], [t for t, bb in solid_boxes if overlap(box, bb)])
        return out
    road, walk = clear(band(*s['road'])), clear(band(*s['footway']))
    lots = {}
    for q in data()['lots']:
        pieces = clear(triangulate(ccw([tuple(p) for p in q['ring']])))
        lots.setdefault(q['material'], []).extend(pieces)
    cutters = road + walk + [p for pieces in lots.values() for p in pieces]
    boxes = [(c, bounds(c)) for c in cutters]
    def cut(ts):
        out = []
        for t in ts:
            t = ccw([tuple(p) for p in t])
            hits = [c for c, bb in boxes if overlap(bounds(t), bb)] if near(t) else []
            out += fan(difference([t], hits)) if hits else [t]
        return out
    land = cut(surfaces['land'])
    return dict(surfaces, road=cut(surfaces['road']) + fan(road), walk=cut(surfaces['walk']) + fan(walk),
                lot=cut(surfaces['lot']) + fan(lots.get('HK_Asphalt', [])),
                land=[t for t in land if not near(t)], grass=cut(surfaces['grass']) + [t for t in land if near(t)],
                extra={m: fan(p) for m, p in lots.items() if m != 'HK_Asphalt'})


def sign_at(x, z, normal):
    """Reader-right coordinates on a sign: the renderer mirrors map X, so the tangent reverses."""
    nx, nz = normal
    tx, tz = nz, -nx
    return lambda u, y, o: (x - tx * u + nx * o, y, z - tz * u + nz * o)


def board(b, at, x0, y0, x1, y1, colour, depth=.03, material='ART_Concrete'):
    plank(b, at, x0, y0, x1, y1, colour, depth, material)


def stack(b, at, text, x, top, size, colour, depth=.05):
    """Vertical Japanese lettering, one character at a time."""
    from university_frontage import label
    for i, char in enumerate(text):
        label(b, at, char, x, top - (i + 1) * size * 1.08, size, size, colour, depth)


def face(b, points, material, inside, pigment):
    from higashi_school import face as oriented
    oriented(b, points, material, inside, pigment)


def plank(b, at, u0, y0, u1, y1, pigment, o=.03, material='ART_Timber'):
    """A panel proud of a wall in facade coordinates (along, height, outward)."""
    face(b, [at(u0, y0, o), at(u1, y0, o), at(u1, y1, o), at(u0, y1, o)], material, at((u0 + u1) / 2, (y0 + y1) / 2, o - 1), pigment)


def post(b, x, z, top, radius, pigment, bottom=.01, material='HK_MetalLight', segments=6):
    from abstract_props import cylinder
    first = len(b.faces)
    cylinder(b, (x, bottom, z), (x, top, z), radius, material, segments=segments)
    paint(b, first, pigment)


def bar(b, a, c, radius, pigment, material='HK_MetalLight', segments=5):
    from abstract_props import cylinder
    first = len(b.faces)
    cylinder(b, a, c, radius, material, segments=segments)
    paint(b, first, pigment)


def paint(b, first, pigment):
    for i in range(first, len(b.faces)):
        b.pigments[i] = pigment


def ribs(b, at, u0, u1, y0, y1, step, pigment, width=.05, o=.05):
    """Battens or lattice bars, skipped on the distant mesh where they would only shimmer."""
    if b.distant:
        return
    n = max(1, round((u1 - u0) / step))
    for i in range(n + 1):
        u = u0 + (u1 - u0) * i / n
        plank(b, at, u - width / 2, y0, u + width / 2, y1, pigment, o)


def eaves(b, ring, top, depth=.7, drop=.28, pigment=TILE):
    """A tiled overhang with a shaded soffit: the shadow line that makes a wall read as built."""
    center = (sum(p[0] for p in ring) / len(ring), top, sum(p[1] for p in ring) / len(ring))
    turn = 1 if sum(a[0] * c[1] - c[0] * a[1] for a, c in zip(ring, ring[1:] + ring[:1])) > 0 else -1
    for a, c in zip(ring, ring[1:] + ring[:1]):
        length = math.dist(a, c)
        if length < .2:
            continue
        nx, nz = (c[1] - a[1]) / length * turn, -(c[0] - a[0]) / length * turn
        lo = [(p[0] + nx * depth, top - drop, p[1] + nz * depth) for p in (a, c)]
        face(b, [(a[0], top + .02, a[1]), (c[0], top + .02, c[1]), lo[1], lo[0]], 'HK_RoofTile', center, pigment)
        face(b, [(a[0], top - .3, a[1]), (c[0], top - .3, c[1]), lo[1], lo[0]], 'ART_Timber', (center[0], top + 2, center[2]), DARK)


def hip(b, item, top, rise, pigment):
    from field_photos import distance, split_triangles
    edges = [(a, c) for p in item['outlines'] for a, c in zip(p, p[1:] + p[:1])]
    span = max(1.8, max(min(distance(v, a, c) for a, c in edges) for t in item['triangles'] for v in
                        [[sum(q[0] for q in t) / 3, sum(q[1] for q in t) / 3]]))
    height = lambda x, z: top + rise * min(1, min(distance((x, z), a, c) for a, c in edges) / span)
    for t in split_triangles(item['triangles'], 3.2):
        face(b, [(x, height(x, z), z) for x, z in t], 'HK_RoofTile', (sum(v[0] for v in t) / 3, 0, sum(v[1] for v in t) / 3), pigment)


def house(b, building):
    """Style a mapped footprint from the walked photographs; False leaves the generic author."""
    style = data()['houses'].get(building['id'])
    if not style:
        return False
    from higashi_school import frame
    from university_photos import framed_window
    top, kind = style['eave'] + .15, style['style']
    for ring in building.get('wallOutlines', building['outlines']):
        center = (sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring))
        for a, c in zip(ring, ring[1:] + ring[:1]):
            length, at = frame(a, c, center)
            if length < .2:
                continue
            if kind == 'board':
                plank(b, at, 0, .15, length, top, TIMBER, 0)
                plank(b, at, 0, .15, length, .55, CONCRETE, .02, 'ART_Concrete')
                ribs(b, at, .1, length - .1, .55, top - .3, .9, DARK, .07)
            elif kind == 'machiya':
                split = min(3.0, top - .4)
                plank(b, at, 0, .15, length, split, DARK, 0)
                plank(b, at, 0, split, length, top, PLASTER, 0, 'ART_Plaster')
                if length > 3:
                    ribs(b, at, .5, length - .5, .5, split - .4, .22, TIMBER, .05)
            else:
                plank(b, at, 0, .15, length, top, STUCCO, 0, 'ART_Plaster')
                plank(b, at, 0, .15, length, .5, CONCRETE, .02, 'ART_Concrete')
            if kind != 'board' and length > 3.5:
                rows = (1.1, 3.9) if top > 5 else (1.1,)
                for y in rows[1:] if kind == 'machiya' else rows:
                    for i in range(max(1, int(length / 3.4))):
                        u = length * (i + .5) / max(1, int(length / 3.4))
                        framed_window(b, at, u - .75, u + .75, y, y + 1.15, columns=2, rows=1)
        eaves(b, ring, top)
        if kind == 'machiya' and top > 4:
            pent(b, ring, 3.1)
    hip(b, building, top, style['rise'], TILE)
    return True


def pent(b, ring, y):
    """A skirt roof around the street faces of a two-level frontage."""
    center = (sum(p[0] for p in ring) / len(ring), y, sum(p[1] for p in ring) / len(ring))
    for a, c in zip(ring, ring[1:] + ring[:1]):
        if math.dist(a, c) < 1.5:
            continue
        ux, uz = (c[0] - a[0]) / math.dist(a, c), (c[1] - a[1]) / math.dist(a, c)
        nx, nz = uz, -ux
        if nx * ((a[0] + c[0]) / 2 - center[0]) + nz * ((a[1] + c[1]) / 2 - center[2]) < 0:
            nx, nz = -nx, -nz
        low = [(p[0] + nx * .95, y - .32, p[1] + nz * .95) for p in (a, c)]
        face(b, [(a[0], y + .32, a[1]), (c[0], y + .32, c[1]), low[1], low[0]], 'HK_RoofTile', center, TILE)
        face(b, [(a[0], y - .12, a[1]), (c[0], y - .12, c[1]), low[1], low[0]], 'ART_Timber', (center[0], y + 2, center[2]), DARK)


def tint_building(b, first, kind):
    """Warm the photographed buildings after the shared field-photo pigment pass."""
    roofs = {'cafe': (.48, .25, .21), 'church': (.47, .50, .56), 'crest-shops': TILE, 'hotel': TILE}
    walls = {'cafe': (.92, .89, .80), 'church': (.86, .83, .75), 'hotel': (.84, .80, .68)}
    for i in range(first, len(b.faces)):
        name = b.materials[b.slots[i]]
        if name == 'HK_RoofTile' and kind in roofs:
            b.pigments[i] = roofs[kind]
        elif name == 'ART_Plaster' and kind in walls:
            b.pigments[i] = walls[kind]
        elif name == 'ART_Concrete' and kind == 'hotel':
            b.pigments[i] = WARM_BRICK
        elif name == 'HK_MetalLight' and kind == 'hotel':
            b.pigments[i] = TILE
        elif name == 'ART_Timber' and kind == 'crest-shops':
            b.pigments[i] = DARK


def cafe(b):
    from higashi_school import box, frame, solid
    # The white gable faces the parking; brick plinth, skirt roof and half-round canopy (0896-0897).
    length, at = frame((259.2, 170.9), (273, 170.9), (266, 174))
    plank(b, at, 0, .15, length, 1.25, BRICK, .04, 'ART_Concrete')
    if not b.distant:
        for i in range(5):
            plank(b, at, 0, .3 + i * .2, length, .33 + i * .2, WARM_BRICK, .05)
    plank(b, at, 3.4, .3, 4.5, 2.35, TIMBER, .06)
    plank(b, at, 3.55, .4, 4.35, 2.2, DARK, .075)
    plank(b, at, 6.3, 1.4, 7.9, 2.6, GLASS, .05)
    plank(b, at, 8.8, 1.4, 10.0, 2.6, DARK, .05)
    plank(b, at, 1.2, 3.1, 2.3, 4.2, GLASS, .05)
    plank(b, at, 6.2, 4.1, 8.0, 5.0, GLASS, .05)
    eaves(b, [(259.2, 170.9), (273, 170.9)], 2.9, .9, .35, (.48, .25, .21))
    west, side = frame((259.2, 170.9), (259.2, 175), (266, 174))
    plank(b, side, 0, .15, west, 1.25, BRICK, .04, 'ART_Concrete')
    plank(b, side, .8, 1.3, 3.3, 2.7, GLASS, .05)
    for y in (1.3, 2.7):
        plank(b, side, .7, y - .05, 3.4, y + .05, DARK, .06)
    solid(b, [(257.4, 172), (259.2, 172), (259.2, 174.6), (257.4, 174.6)], .15, .95, 'ART_Concrete', BRICK)


def stained_arch(b, at, width, sill, spring):
    """The cafe's arched leaded window: warm glass panes under a brown timber frame (0897)."""
    from university_frontage import graphic, line
    w = width / 2
    arch = [(w * math.cos(i * math.pi / 12), spring + w * math.sin(i * math.pi / 12)) for i in range(13)]
    graphic(b, at, [(-w - .08, sill - .08), (w + .08, sill - .08)] + [(x * 1.14, spring + (y - spring) * 1.14) for x, y in arch], (.34, .22, .18), .06)
    glass = ((.74, .62, .36), (.46, .58, .50), (.80, .50, .34), (.50, .52, .62), (.84, .72, .46))
    rows, cols = 6, 4
    top = spring + w
    for r in range(rows):
        for c in range(cols):
            x0, x1 = -w + c * width / cols, -w + (c + 1) * width / cols
            y0, y1 = sill + r * (top - sill) / rows, sill + (r + 1) * (top - sill) / rows
            limit = lambda x: spring + math.sqrt(max(0, w * w - x * x))
            corners = [(x0, y0), (x1, y0), (x1, min(y1, limit(x1))), (x0, min(y1, limit(x0)))]
            if corners[2][1] > y0 + .01 and corners[3][1] > y0 + .01:
                graphic(b, at, corners, glass[(r * 2 + c * 3) % len(glass)], .07)
    # Lead lines: the swirling S of the photographed panel, reduced to two strokes.
    curve = [(.28 * w * math.sin(t * .9) * (1 if t < 3 else -1), sill + (top - sill) * t / 6.3) for t in [i * .45 for i in range(15)]]
    line(b, at, curve, .035, (.24, .18, .18), .08)
    line(b, at, [(-x, y) for x, y in curve], .035, (.24, .18, .18), .08)
    line(b, at, [(0, sill), (0, top)], .03, (.24, .18, .18), .081)


def cafe_dormer(b):
    # The small street gable on the west roof slope, tiled like the main roof (0896-0897).
    from university_frontage import graphic
    x, z0, z1, eave, apex, back = 258.9, 171.6, 175.0, 3.1, 5.7, 262.6
    mid = (z0 + z1) / 2
    colour, tile = (.93, .90, .81), (.48, .25, .21)
    inside = (x + 1, 3.5, mid)
    face(b, [(x, 2.4, z0), (x, 2.4, z1), (x, eave, z1), (x, apex, mid), (x, eave, z0)], 'ART_Plaster', inside, colour)
    for side, z in ((1, z0 - .35), (-1, z1 + .35)):
        low = (x - .45, eave - .3, z)
        face(b, [(x - .45, apex + .18, mid), low, (back, 3.2 + (back - 259.2) * .63, z), (back, apex + .18, mid)], 'HK_RoofTile', (x + 1, 2, mid), tile)
        face(b, [(x, apex - .1, mid), (x - .45, eave - .3, z), (x, eave - .3, z)], 'ART_Timber', (x + 1, 3, mid), (.40, .27, .23))
    bar(b, (x - .5, apex + .2, mid), (back, apex + .2, mid), .07, (.42, .24, .21), 'HK_RoofTile', 5)
    stained_arch(b, sign_at(x, mid, (-1, 0)), 1.25, 2.9, 4.05)


def cafe_signs(b):
    from abstract_props import cylinder
    from university_frontage import label, line, graphic
    # The real street signs: green iron post, double lamp, hanging SANCHO board and the
    # house-shaped board, maroon to the south and pink to the north (0896-0898).
    green = (.22, .38, .32)
    x, z = 256.2, 169.2
    post(b, x, z, 6.0, .07, green, .15)
    bar(b, (x, 5.0, z), (x - 1.75, 5.0, z), .04, green)
    bar(b, (x, 3.2, z), (x - 1.75, 3.2, z), .03, green)
    bar(b, (x, 5.2, z), (x + 1.0, 5.2, z), .03, green)
    for dx in (-.34, .34):
        bar(b, (x, 5.8, z), (x + dx, 5.9, z), .02, green)
        bar(b, (x + dx, 5.82, z), (x + dx, 6.1, z), .1, (.30, .28, .30), 'HK_MetalLight', 7)
    post(b, x + 2.0, z, 3.2, .05, green, .15)
    # Hanging board, readable from both directions along the footway.
    for normal, cx in (((0, -1), x - 1.0), ((0, 1), x - 1.0)):
        at = sign_at(cx, z + normal[1] * .03, normal)
        board(b, at, -.66, 3.25, .66, 4.95, (.95, .93, .86), .0)
        graphic(b, at, [(-.42, 4.25), (.32, 4.2), (.46, 4.5), (.2, 4.45), (.05, 4.75), (-.2, 4.72), (-.25, 4.42), (-.5, 4.5)], (.74, .24, .22), .02)
        graphic(b, at, [(-.14, 4.5), (.08, 4.5), (.04, 4.82), (-.1, 4.82)], (.90, .76, .46), .025)
        label(b, at, 'SANCHO', -.55, 3.86, 1.1, .2, (.20, .26, .48), .02)
        label(b, at, 'Since1981', -.3, 3.7, .6, .09, (.20, .26, .48), .02)
        graphic(b, at, [(-.3, 3.34), (0, 3.28), (.3, 3.34), (.26, 3.6), (0, 3.66), (-.26, 3.6)], (.76, .20, .18), .02)
        label(b, at, 'OC', -.15, 3.38, .3, .18, (.98, .96, .90), .03)
    # The house-shaped menu board.
    shape = [(-1.45, 1.55), (1.45, 1.55), (1.45, 2.85), (0, 3.45), (-1.45, 2.85)]
    south, north = sign_at(x + 2.0, z - .05, (0, -1)), sign_at(x + 2.0, z + .05, (0, 1))
    graphic(b, south, shape, (.44, .15, .27), .0)
    graphic(b, north, shape, (.93, .68, .72), .0)
    label(b, south, 'サンチョ', -.55, 2.15, 1.7, .34, (.98, .95, .88), .02)
    label(b, south, 'COFFEE SHOP', -1.25, 2.72, 1.0, .1, (.95, .86, .70), .02)
    label(b, south, 'OGAWA COFFEE', -1.25, 1.75, 1.0, .09, (.95, .86, .70), .02)
    label(b, north, 'サンチョ', .05, 2.5, 1.2, .24, (.30, .20, .24), .02)
    graphic(b, north, [(-.58, 2.3), (-.02, 2.28), (.02, 2.62), (-.3, 2.8), (-.6, 2.62)], (.76, .20, .18), .02)
    label(b, north, 'OC', -.5, 2.36, .4, .24, (.98, .96, .90), .03)
    for i, text in enumerate(('コーヒー', 'ケーキ', 'お食事')):
        label(b, north, text, -1.3, 2.5 - i * .34, .62 - (i * .1), .17, (.30, .20, .24), .02)
    label(b, north, 'OGAWA COFFEE', -.58, 2.14, .6, .06, (.30, .20, .24), .02)
    # The canopy's own lettering.
    label(b, sign_at(263.9, 169.8, (0, -1)), 'coffee SANCHO', -.95, 2.42, 1.9, .24, (.98, .95, .90), .03)
    door = sign_at(265.2, 170.86, (0, -1))
    board(b, door, -.5, 1.55, .5, 2.3, (.93, .90, .80), .03)
    label(b, door, 'COFFEE SHOP', -.4, 2.04, .8, .1, (.34, .22, .22), .05)
    label(b, door, 'サンチョ', -.36, 1.68, .72, .22, (.34, .22, .22), .05)
    if not b.distant:
        from vegetation import spray
        for i, (dx, dz, r) in enumerate(((.7, -1.1, .24), (1.5, -1.3, .28), (2.6, -1.0, .22), (3.4, .7, .26))):
            first = len(b.faces)
            cylinder(b, (x + dx, .15, z + dz), (x + dx, .52, z + dz), r * .72, 'ART_Concrete', segments=10, end_radius=r)
            paint(b, first, (.72, .42, .30))
            spray(b, (x + dx, .78, z + dz), (.36, .34, .36), i, 'HK_Leaf', 8780 + i, fine=False)


def church(b):
    """Hikone Catholic church (0899-0902): one coherent nave, front gable, rose window and spire."""
    from university_photos import framed_window
    from higashi_school import solid
    from university_frontage import label
    origin, ux, uz = (274.75, 287.62), .9974, -.0725
    vx, vz = -uz, ux
    at = lambda a, y, c: (origin[0] + ux * a + vx * c, y, origin[1] + uz * a + vz * c)
    length, half, eave, ridge = 31.0, 6.55, 4.75, 8.65
    cream, shade = (.87, .84, .76), (.72, .70, .66)
    tile, trim = (.47, .50, .57), (.93, .91, .84)
    inside = at(15, 3, 0)
    def wall(a0, c0, a1, c1, top0, top1, colour=cream):
        face(b, [at(a0, .15, c0), at(a1, .15, c1), at(a1, top1, c1), at(a0, top0, c0)], 'ART_Plaster', inside, colour)
    def side_frame(a0, c0, a1, c1):
        p, q = at(a0, 0, c0), at(a1, 0, c1)
        from higashi_school import frame
        return frame((p[0], p[2]), (q[0], q[2]), (inside[0], inside[2]))
    # Nave walls and the closed gable; the roof sits on them, with real overhangs.
    wall(0, -half, length, -half, eave, eave)
    wall(0, half, length, half, eave, eave)
    wall(length, -half, length, half, eave, eave)
    wall(length, -half, length, 0, eave, ridge)
    wall(length, 0, length, half, ridge, eave)
    wall(0, -half, 0, 0, eave, ridge)
    wall(0, 0, 0, half, ridge, eave)
    for side in (-1, 1):
        over = side * (half + 1.05)
        low = eave - .66
        face(b, [at(-1.0, ridge + .06, 0), at(length + .7, ridge + .06, 0), at(length + .7, low, over), at(-1.0, low, over)], 'HK_RoofTile', at(15, 2, 0), tile)
        face(b, [at(-1.0, ridge - .16, 0), at(length + .7, ridge - .16, 0), at(length + .7, low - .16, over), at(-1.0, low - .16, over)], 'ART_Plaster', at(15, 12, 0), (.80, .78, .72))
        # White barge board, gutter and the short brackets under the front verge.
        face(b, [at(-1.02, ridge + .1, 0), at(-1.02, low + .02, over), at(-1.02, low - .3, over), at(-1.02, ridge - .22, 0)], 'ART_Plaster', at(15, 4, 0), trim)
        face(b, [at(-1.0, low + .02, over), at(length + .7, low + .02, over), at(length + .7, low - .22, over), at(-1.0, low - .22, over)], 'ART_Plaster', at(15, 4, 0), trim)
        for t in (.26, .52, .78):
            c, y = side * half * t, ridge - (ridge - eave) * t
            bar(b, at(0, y - .1, c), at(-.95, y + .02, c), .08, trim, 'ART_Plaster', 4)
    bar(b, at(-1.0, ridge + .1, 0), at(length + .7, ridge + .1, 0), .11, (.40, .43, .50), 'HK_RoofTile', 6)
    # Side window bands, downpipes and a tiled plinth.
    for c in (-half, half):
        l, facade = side_frame(0, c, length, c)
        plank(b, facade, 0, .15, l, .62, shade, .03, 'ART_Concrete')
        for i in range(5):
            u = 3.2 + i * 5.3
            framed_window(b, facade, u, u + 3.6, 1.5, 3.4, columns=3, rows=1, frame='HK_MetalLight')
        for u in (.3, l - .3):
            bar(b, facade(u, .2, .08), facade(u, eave - .2, .08), .05, trim, 'ART_Plaster', 5)
    # West front: a stucco pier on each side of the recessed grey panelled centre.
    l, front = side_frame(0, half, 0, -half)
    plank(b, front, 2.4, .15, 9.4, 8.0, (.70, .71, .71), .02, 'ART_Concrete')
    for u in (3.6, 5.0, 6.4, 7.8):
        plank(b, front, u - .02, 3.4, u + .02, 8.0, (.60, .61, .62), .03)
    for y in (4.2, 5.6, 7.0):
        plank(b, front, 2.4, y - .02, 9.4, y + .02, (.60, .61, .62), .03)
    plank(b, front, 9.4, .15, 13.1, 8.0, cream, .34, 'ART_Plaster')
    plank(b, front, 0, .15, 2.4, 6.0, cream, .18, 'ART_Plaster')
    # Rose window: a pale ring, leaded coloured panes and the white cross over them.
    from university_frontage import graphic
    rose = sign_at(*[front(5.9, 0, 0)[i] for i in (0, 2)], (-ux, -uz))
    cy, r = 5.75, 1.62
    ring = lambda radius, n=32: [(radius * math.cos(i * math.tau / n), cy + radius * math.sin(i * math.tau / n)) for i in range(n)]
    graphic(b, rose, ring(r + .13), (.86, .80, .68), .05)
    panes = ((.46, .56, .62), (.62, .62, .50), (.40, .50, .54), (.70, .62, .44), (.52, .60, .52), (.44, .48, .58))
    for k in range(12):
        a0, a1 = k * math.tau / 12, (k + 1) * math.tau / 12
        for r0, r1, shift in ((.04, .78, 0), (.82, 1.56, 3)):
            graphic(b, rose, [(r0 * math.cos(a0 + .03), cy + r0 * math.sin(a0 + .03)), (r1 * math.cos(a0 + .03), cy + r1 * math.sin(a0 + .03)),
                              (r1 * math.cos(a1 - .03), cy + r1 * math.sin(a1 - .03)), (r0 * math.cos(a1 - .03), cy + r0 * math.sin(a1 - .03))],
                    panes[(k + shift) % len(panes)], .07)
    graphic(b, rose, [(-.07, cy - r), (.07, cy - r), (.07, cy + r), (-.07, cy + r)], (.97, .96, .92), .09)
    graphic(b, rose, [(-.62, cy + .45), (.62, cy + .62), (.62, cy + .74), (-.62, cy + .57)], (.97, .96, .92), .09)
    # Flat metal entrance canopy on slim white posts, dark tiled wall and doors.
    plank(b, front, 3.4, .15, 9.2, 3.0, (.34, .36, .42), .04, 'ART_Concrete')
    plank(b, front, 4.9, .15, 7.7, 2.5, (.20, .18, .22), .06)
    y = 3.28
    corners = [front(2.6, y, 0), front(9.6, y, 0), front(9.6, y - .1, 3.3), front(2.6, y - .1, 3.3)]
    face(b, [corners[0], corners[1], corners[2], corners[3]], 'HK_MetalLight', front(6, 0, 1), (.56, .58, .60))
    face(b, [(p[0], p[1] - .18, p[2]) for p in corners], 'ART_Plaster', front(6, 8, 1), (.84, .83, .78))
    fascia = (.92, .91, .86)
    face(b, [corners[2], corners[3], (corners[3][0], corners[3][1] - .26, corners[3][2]), (corners[2][0], corners[2][1] - .26, corners[2][2])], 'ART_Plaster', front(6, 3, 1), fascia)
    for u in (3.0, 6.1, 9.2):
        p = front(u, 0, 3.1)
        post(b, p[0], p[2], 3.1, .055, fascia, .15, 'ART_Plaster')
    # The sheet-metal spire rises from the ridge just behind the front gable, ball and cross on top.
    base, top = ridge - .6, 12.5
    w = .95
    q = [at(4.2 + da, base, dc) for da, dc in ((-w, -w), (w, -w), (w, w), (-w, w))]
    tip = at(4.2, top, 0)
    metal = (.74, .76, .78)
    for i in range(4):
        face(b, [q[i], q[(i + 1) % 4], tip], 'HK_MetalLight', at(4.2, base, 0), metal)
    bar(b, tip, (tip[0], top + .35, tip[2]), .07, (.56, .58, .60), 'HK_MetalLight', 8)
    bar(b, (tip[0], top + .34, tip[2]), (tip[0], top + 1.25, tip[2]), .025, (.50, .52, .55), segments=5)
    bar(b, at(3.85, top + .92, 0), at(4.55, top + .92, 0), .02, (.50, .52, .55), segments=5)


def church_sign(b):
    from university_frontage import graphic, line
    # The lit roadside sign, mirror and cone beneath the big camphor (0900-0901).
    x, z = 270.9, 271.4
    post(b, x, z, 2.5, .13, (.80, .78, .74), .15, 'ART_Concrete')
    post(b, x + .22, z, 5.1, .07, (.70, .71, .72), .15)
    at = sign_at(x, z - .1, (-.28, -.96))
    board(b, at, -.5, 2.5, .5, 5.1, (.93, .96, .78), .0)
    stack(b, at, 'カトリック教会', -.14, 4.98, .32, (.16, .16, .20), .02)
    line(b, at, [(-.34, 3.5), (-.34, 4.7)], .035, (.46, .36, .58), .02)
    line(b, at, [(-.42, 4.42), (-.26, 4.42)], .035, (.46, .36, .58), .02)
    post(b, 269.6, 268.2, 2.2, .03, (.74, .54, .24), .15)
    bar(b, (269.6, 2.0, 268.1), (269.6, 2.0, 268.0), .2, (.82, .82, .84), 'HK_MetalLight', 10)


def stele(b):
    from higashi_school import solid
    from abstract_props import cylinder
    # Roofed gate post, plastered garden stone and boulders at the cafe garden (0895).
    x, z = 254.9, 119.8
    solid(b, [(x, z), (x + 1.7, z), (x + 1.7, z + .5), (x, z + .5)], .15, 2.1, 'ART_Plaster', (.90, .84, .74))
    face(b, [(x + .05, .9, z - .01), (x + .9, .9, z - .01), (x + .9, 1.6, z - .01), (x + .05, 1.6, z - .01)], 'ART_Concrete', (x, 1, z + 1), DARK)
    from university_frontage import label
    at = sign_at(x + .85, z - .01, (0, -1))
    label(b, at, "Pomme d'Amour", -.75, 1.62, 1.5, .22, (.76, .42, .46), .02)
    for i, width in enumerate((.5, .62, .44, .56)):
        board(b, at, -.72, 1.42 - i * .1, -.72 + width, 1.45 - i * .1, (.90, .88, .82), .02)
    first = len(b.faces)
    cylinder(b, (x + .85, 2.1, z + .2), (x + .85, 2.52, z + .2), .26, 'ART_Concrete', segments=10, end_radius=.14)
    paint(b, first, (.78, .26, .22))
    post(b, x + .05, z + .55, 2.9, .08, TIMBER, .15, 'ART_Timber')
    post(b, x + 1.3, z + .55, 2.9, .08, TIMBER, .15, 'ART_Timber')
    for side in (-1, 1):
        face(b, [(x - .6, 2.95, z + .55), (x + 2.0, 2.95, z + .55), (x + 2.0, 2.5, z + .55 + side * 1.1), (x - .6, 2.5, z + .55 + side * 1.1)],
             'HK_RoofTile', (x + .7, 2, z + .55), TILE)
    if not b.distant:
        first = len(b.faces)
        for dx, dz, r in ((.1, -1.0, .36), (1.2, -.9, .30), (3.2, -2.4, .34)):
            cylinder(b, (x + dx, .15, z + dz), (x + dx, .15 + r * 1.2, z + dz), r, 'HK_Stone', segments=7, end_radius=r * .45)
        paint(b, first, (.60, .55, .54))
    solid(b, [(x + 2.3, z - 1), (x + 6.5, z - 1), (x + 6.5, z - .1), (x + 2.3, z - .1)], .15, .75, 'HK_StoneDark', (.38, .34, .36))


def shops(b):
    from higashi_school import frame, solid
    from university_photos import framed_window
    # Long tiled frontage: dark boards, white plaster bays, lattices, then open shop bays (0903-0907).
    length, at = frame(SHOP_SOUTH[0], SHOP_SOUTH[1], (288, 312))
    plank(b, at, 0, .15, length, 2.75, DARK, .03)
    plank(b, at, 0, 2.75, length, 3.5, PLASTER, .03, 'ART_Plaster')
    for u0, u1 in ((10.6, 14.4),):
        plank(b, at, u0, .75, u1, 2.75, PLASTER, .05, 'ART_Plaster')
    for u0, u1 in ((6.6, 10.2), (14.8, 18.8)):
        plank(b, at, u0, .55, u1, 2.5, TIMBER, .05)
        ribs(b, at, u0 + .05, u1 - .05, .6, 2.45, .14, DARK, .05, .07)
    # Tall door with white striped lower panels.
    plank(b, at, .7, .3, 5.8, 2.7, TIMBER, .05)
    if not b.distant:
        for u in (1.4, 1.75, 2.1, 4.1, 4.45, 4.8):
            plank(b, at, u, .55, u + .16, 1.45, PLASTER, .07, 'ART_Plaster')
    eaves(b, list(SHOP_SOUTH), 3.55, 1.0, .32)
    # The red storehouse tower with a round crest stands on the south end.
    ring = [(279.4, 300.4), (285.6, 300.2), (285.8, 305.8), (279.6, 306)]
    solid(b, ring, 3.2, 6.5, 'ART_Plaster', (.68, .24, .19))
    face(b, [(279.35, 6.5, 300.4), (279.35, 6.5, 306), (279.35, 8.2, 303.2)], 'ART_Plaster', (282, 6, 303), (.68, .24, .19))
    face(b, [(285.85, 6.5, 300.2), (285.85, 6.5, 305.8), (285.85, 8.2, 303)], 'ART_Plaster', (282, 6, 303), (.62, .22, .18))
    for side, z0 in ((1, 300.1), (-1, 306.1)):
        face(b, [(278.9, 6.3, z0), (286.3, 6.3, z0), (286.3, 8.3, 303.1), (278.9, 8.3, 303.1)], 'HK_RoofTile', (282, 6, 303), DARK)
    # Open shop bays with awning, bench, posts and nobori banners.
    length, at = frame(SHOP_NORTH[0], SHOP_NORTH[1], (288, 335))
    plank(b, at, 0, .15, length, 2.7, DARK, .03)
    for i in range(4):
        u = 1 + i * 5.2
        plank(b, at, u, .45, u + 3.8, 2.3, (.62, .52, .40), .05)
        framed_window(b, at, u + .2, u + 3.6, .6, 2.2, columns=3, rows=1, frame='ART_Timber')
    for i in range(int(length / 1.1)):
        plank(b, at, i * 1.1, 2.35, i * 1.1 + .55, 2.7, (.88, .74, .70), .09)
    colours = ((.78, .28, .22), (.90, .86, .76), (.74, .32, .30), (.90, .86, .76), (.55, .24, .34), (.78, .28, .22))
    for i, colour in enumerate(colours):
        z = 326 + i * 3.8
        x = SHOP_NORTH[0][0] - 1.4 + (z - 325) * .042
        post(b, x, z, 3.0, .025, (.78, .78, .74), .01)
        flag = sign_at(x, z + .3, (-1, 0))
        board(b, flag, -.3, 1.0, .3, 2.95, colour, .0)
        if i % 2 == 0:
            from university_frontage import label
            label(b, flag, '栗', -.22, 1.95, .44, .46, (.97, .92, .80), .02)
        else:
            stack(b, flag, 'どら焼き', -.13, 2.85, .27, (.34, .20, .20), .02)
        if i % 2 == 0:
            from higashi_school import solid as block
            block(b, [(x - .75, z - .3), (x - .35, z - .3), (x - .35, z + .1), (x - .75, z + .1)], .01, .62, 'HK_Stone', (.66, .63, .60))
    for z in (328, 337):
        x = SHOP_NORTH[0][0] - .9 + (z - 325) * .042
        bar(b, (x, .45, z), (x, .45, z + 1.6), .13, (.52, .32, .28), 'ART_Timber', 4)


def hotel(b):
    from higashi_school import frame, solid
    from university_photos import framed_window
    # Brick podium, tiled skirt, deep window bands, porch piers and black board screens (0906-0910).
    length, at = frame((282, 358), (281.2, 419), (295, 390))
    if not b.distant:
        for i in range(4):
            plank(b, at, 0, 1.0 + i * .95, length, 1.04 + i * .95, BRICK, .04)
    for u0, u1 in ((3, 9), (10.5, 15), (34, 42), (44, 52)):
        plank(b, at, u0 - .15, 3.45, u1 + .15, 4.95, DARK, .05)
        framed_window(b, at, u0, u1, 3.55, 4.85, columns=3, rows=1, frame='ART_Timber')
    pent(b, [(281.9, 358), (281.1, 419)], 3.15)
    # The plain upper block: pale walls and paired dark windows above the podium roof.
    upper, wall = frame((290, 360), (290, 418), (300, 390))
    for y in (6.0, 8.8, 11.2):
        for i in range(int(upper / 4.6)):
            u = upper * (i + .5) / int(upper / 4.6)
            framed_window(b, wall, u - .8, u + .8, y, y + 1.3, columns=2, rows=1)
    for z in (372.6, 379.4):
        solid(b, [(274.3, z), (275.2, z), (275.2, z + .9), (274.3, z + .9)], .01, 3.4, 'ART_Concrete', WARM_BRICK)
    for lo, hi in ((382, 386.6), (388.4, 394), (395.6, 402)):
        solid(b, [(278.6, lo), (279.0, lo), (279.0, hi), (278.6, hi)], .01, .32, 'ART_Concrete', (.42, .30, .28))
        solid(b, [(278.65, lo), (278.95, lo), (278.95, hi), (278.65, hi)], .32, 1.75, 'ART_Timber', DARK)
        solid(b, [(278.55, lo - .03), (279.05, lo - .03), (279.05, hi + .03), (278.55, hi + .03)], 1.75, 1.82, 'ART_Timber', TILE)
    # Square lantern tower by the road (0908).
    x, z = 272.2, 403.6
    solid(b, [(x, z), (x + 1.3, z), (x + 1.3, z + 1.3), (x, z + 1.3)], .01, 2.4, 'ART_Timber', DARK)
    solid(b, [(x + .1, z + .1), (x + 1.2, z + .1), (x + 1.2, z + 1.2), (x + .1, z + 1.2)], 2.4, 5.1, 'ART_Timber', DARK)
    solid(b, [(x + .08, z + .02), (x + 1.22, z + .02), (x + 1.22, z + 1.28), (x + .08, z + 1.28)], 3.0, 4.7, 'ART_Plaster', PLASTER)
    solid(b, [(x - .3, z - .3), (x + 1.6, z - .3), (x + 1.6, z + 1.6), (x - .3, z + 1.6)], 5.1, 5.35, 'HK_RoofTile', TILE)
    from university_frontage import label
    lantern = sign_at(x, z + .65, (-1, 0))
    stack(b, lantern, '橘', -.42, 4.35, .84, (.16, .15, .20), .02)
    stack(b, lantern, '近江ダイニング', .34, 4.62, .15, (.20, .18, .22), .02)
    fence = sign_at(278.6, 391.2, (-1, 0))
    label(b, fence, '彦根キャッスル リゾート&スパ', -1.7, 1.15, 3.4, .16, (.86, .80, .62), .02)


def street_line(b):
    from road_network import face as ground_face, ccw
    # Edge lines on both sides, the footway's stone edge and the forecourt's parking marks.
    s = data()['street']
    for o, material, width in ((s['road'][0] + .28, 'HK_WhitePaint', .14), (s['road'][1] - .28, 'HK_WhitePaint', .14)):
        for p in band(o, o + width):
            ground_face(b, p, .022, material, False)
    for p in band(s['road'][1] - .02, s['road'][1] + .28):
        ground_face(b, p, .024, 'HK_Curb', False)
    for z in range(304, 354, 6):
        x = 275.2 + (z - 300) * .03
        for a, c in (((x - 1.1, z), (x + 3.4, z + .3)),):
            ground_face(b, ccw([a, c, (c[0], c[1] + .12), (a[0], a[1] + .12)]), .022, 'HK_WhitePaint', False)
    ground_face(b, ccw([(272.4, 300), (272.55, 300), (274.2, 355), (274.05, 355)]), .022, 'HK_SignYellow', False)


def poles(b):
    from higashi_school import solid
    s = data()['street']
    tops = []
    for i, z in enumerate(range(119, 400, 34)):
        x = centre(z) + s['road'][1] + .12
        bar(b, (x, .01, z), (x, 10.2, z), .15, (.70, .68, .64), 'ART_Concrete', 7)
        if not b.distant:
            for j in range(4):
                bar(b, (x, 1.1 + j * .24, z), (x, 1.34 + j * .24, z), .165, (.86, .72, .24) if j % 2 else (.24, .22, .26), 'ART_Concrete', 7)
            bar(b, (x - .9, 9.2, z), (x + .9, 9.2, z), .05, (.46, .44, .46))
            if i % 3 == 1:
                bar(b, (x, 6.6, z), (x - 1.5, 7.2, z), .03, (.60, .58, .58))
                solid(b, [(x + .15, z - .25), (x + .6, z - .25), (x + .6, z + .25), (x + .15, z + .25)], 6.4, 7.5, 'ART_Concrete', (.55, .56, .60))
        tops.append((x, z))
    for a, c in zip(tops, tops[1:]):
        for dx, y in ((-.8, 9.2), (.8, 9.2), (0, 8.2)):
            middle = ((a[0] + c[0]) / 2 + dx, y - .55, (a[1] + c[1]) / 2)
            bar(b, (a[0] + dx, y, a[1]), middle, .014, (.26, .24, .28), segments=3)
            bar(b, middle, (c[0] + dx, y, c[1]), .014, (.26, .24, .28), segments=3)


def hedge(b):
    # The black roadside rail (0899); the clipped hedge is the instanced ART_StreetHedge.
    s = data()['street']
    x = lambda z, o: centre(z) + o
    for z in range(232, 298, 3):
        px = x(z, s['road'][1] + .3)
        bar(b, (px, .01, z), (px, .95, z), .03, DARK, segments=4)
        if z < 295:
            bar(b, (px, .9, z), (x(z + 3, s['road'][1] + .3), .9, z + 3), .03, DARK, segments=4)
            bar(b, (px, .5, z), (x(z + 3, s['road'][1] + .3), .5, z + 3), .02, DARK, segments=4)


def cones(b):
    # Green traffic cones and white bars along the forecourt edge, parking sign and mirror (0906).
    for i, z in enumerate(range(312, 356, 5)):
        x = centre(z) + 7.1
        bar(b, (x, .01, z), (x, .09, z), .26, (.24, .46, .36), 'ART_Patina', 4)
        first = len(b.faces)
        from abstract_props import cylinder
        cylinder(b, (x, .09, z), (x, .95, z), .17, 'ART_Patina', segments=8, end_radius=.04)
        paint(b, first, (.28, .58, .42))
        if i % 2 == 0:
            bar(b, (x, .72, z), (centre(z + 5) + 7.1, .72, z + 5), .028, (.90, .88, .82), segments=4)
    x, z = 272.4, 357.5
    post(b, x, z, 5.2, .06, (.66, .24, .20))
    sign = sign_at(x, z, (-.7, -.7))
    board(b, sign, -.42, 2.2, .42, 4.8, (.34, .27, .29), .07)
    board(b, sign, -.17, 3.85, .17, 4.2, (.92, .90, .84), .09)
    from university_frontage import label
    label(b, sign, 'P', -.09, 3.9, .18, .25, (.30, .24, .26), .11)
    stack(b, sign, '彦根キャッスル', -.13, 3.75, .15, (.92, .90, .84), .09)
    stack(b, sign, 'リゾート&スパ', .07, 3.3, .13, (.92, .90, .84), .09)
    hydrant = sign_at(271.2, 356.8, (-.7, -.7))
    post(b, 271.2, 356.8, 2.9, .03, (.66, .24, .20))
    from university_frontage import graphic
    graphic(b, hydrant, [(.26 * math.cos(i * math.tau / 20), 2.75 + .26 * math.sin(i * math.tau / 20)) for i in range(20)], (.78, .20, .16), .05)
    label(b, hydrant, '消火栓', -.19, 2.67, .38, .15, (.98, .96, .90), .07)
    bar(b, (x, 5.2, z), (x, 5.5, z), .2, (.78, .78, .80), 'HK_MetalLight', 10)


def furniture(b):
    cafe_dormer(b)
    church_sign(b)
    street_line(b)
    poles(b)
    hedge(b)
    cones(b)
    cafe(b)
    cafe_signs(b)
    stele(b)
    shops(b)
    hotel(b)
