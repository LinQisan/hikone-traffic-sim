"""The inner moat street on foot, owner photos 1005-1050 (2026-10-31).

world/inner-moat-street.json owns outlines, placements and estimates. Roofs are strips of slightly
different greys, and boards take one tone each: fine pieces read as noise under a brush overlay.
Signs are clean graphic planes. No photograph is used as a texture.
"""
import json
import math
import os
import random
from functools import lru_cache

from higashi_school import box, face, frame, solid
from east_street import bar, plank
from school_road import BAMBOO, INK, RUST, WHITE, masonry, no_parking, rust_fence

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOF = (.37, .37, .38)
BOARD = (.44, .37, .30)
PALE = (.80, .78, .71)
RENDER = (.66, .61, .54)
DARK = (.27, .23, .21)
GREY = (.50, .49, .47)


@lru_cache(maxsize=1)
def data():
    with open(os.path.join(ROOT, 'world', 'inner-moat-street.json')) as f:
        return json.load(f)


def centre(ring):
    return sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring)


def inset(ring, amount):
    c = centre(ring)
    return [(p[0] + (c[0] - p[0]) * amount, p[1] + (c[1] - p[1]) * amount) for p in ring]


def lerp(p, q, t):
    return tuple(u + (v - u) * t for u, v in zip(p, q))


def roof(b, ring, eave, rise, wall, overhang=.6, tone=ROOF):
    """A gable along the first edge. Each tile course is one strip with its own tone."""
    rng = random.Random(int(abs(ring[0][0]) * 10))
    a, c, d, e = ring
    mid_a, mid_c = lerp(a, e, .5), lerp(c, d, .5)
    length = math.dist(a, c)
    u = (c[0] - a[0]) / length, (c[1] - a[1]) / length
    middle = centre(ring)
    inside = (middle[0], eave - .3, middle[1])
    material = 'ART_Facade' if sum(wall) > 1.6 else 'ART_Joint'
    face(b, [(a[0], eave, a[1]), (e[0], eave, e[1]), (mid_a[0], eave + rise, mid_a[1])], material, inside, wall)
    face(b, [(c[0], eave, c[1]), (d[0], eave, d[1]), (mid_c[0], eave + rise, mid_c[1])], material, inside, wall)
    top_a = (mid_a[0] - u[0] * overhang, eave + rise, mid_a[1] - u[1] * overhang)
    top_c = (mid_c[0] + u[0] * overhang, eave + rise, mid_c[1] + u[1] * overhang)
    strips = 4 if b.distant else 11
    for foot_a, foot_c in ((a, c), (e, d)):
        depth = math.dist(foot_a, mid_a)
        reach = 1 + overhang / depth
        low = eave + rise - rise * reach
        low_a = (mid_a[0] + (foot_a[0] - mid_a[0]) * reach - u[0] * overhang, low, mid_a[1] + (foot_a[1] - mid_a[1]) * reach - u[1] * overhang)
        low_c = (mid_c[0] + (foot_c[0] - mid_c[0]) * reach + u[0] * overhang, low, mid_c[1] + (foot_c[1] - mid_c[1]) * reach + u[1] * overhang)
        for i in range(strips):
            s, t = i / strips, (i + 1) / strips
            shade = rng.uniform(.84, 1.16)
            quad = [lerp(top_a, low_a, s), lerp(top_c, low_c, s), lerp(top_c, low_c, t), lerp(top_a, low_a, t)]
            face(b, quad, 'ART_Joint', inside, tuple(v * shade for v in tone))
    bar(b, (top_a[0], eave + rise + .05, top_a[2]), (top_c[0], eave + rise + .05, top_c[2]), .13, tuple(v * .8 for v in tone), 'ART_Joint', 5)


def skirt(b, ring, y, depth=.9, tone=ROOF, sides=(0, 2)):
    """A pent roof on the long walls, between the storeys."""
    middle = centre(ring)
    rng = random.Random(int(abs(ring[0][1]) * 10))
    for i in sides:
        a, c = ring[i], ring[(i + 1) % 4]
        length, at = frame(a, c, middle)
        for k in range(2 if b.distant else 5):
            s, t = k / (2 if b.distant else 5), (k + 1) / (2 if b.distant else 5)
            near, far = .02 + s * depth, .02 + t * depth
            drop = .42
            quad = [at(-.25, y - s * drop, near), at(length + .25, y - s * drop, near), at(length + .25, y - t * drop, far), at(-.25, y - t * drop, far)]
            shade = rng.uniform(.85, 1.15)
            face(b, quad, 'ART_Joint', (middle[0], y - 2, middle[1]), tuple(v * shade for v in tone))


def boards(b, a, c, lo, hi, inside, seed, tone=BOARD):
    """Vertical boards, one tone each by lightness only."""
    rng = random.Random(seed)
    length, at = frame(a, c, inside)
    step = 1.4 if b.distant else .34
    for i in range(int(length / step)):
        shade = rng.uniform(.82, 1.14)
        board = tuple(v * shade for v in tone)
        plank(b, at, i * step + .012, lo, (i + 1) * step - .012, hi, board, .025, 'ART_Joint')


def windows(b, at, length, y0, y1, count, tone=(.50, .44, .38)):
    for i in range(count):
        u = length * (i + .5) / count
        plank(b, at, u - .62, y0 - .06, u + .62, y1 + .06, tone, .03, 'ART_Joint')
        plank(b, at, u - .55, y0, u + .55, y1, (.25, .28, .31), .04, 'ART_Joint')
        if not b.distant:
            for k in (.33, .66):
                plank(b, at, u - .55 + 1.1 * k - .018, y0, u - .55 + 1.1 * k + .018, y1, tone, .05, 'ART_Joint')


def tiled(b, ring, height, rise, wall=PALE, lower=(.34, .27, .24), roof_tone=ROOF):
    """Low tiled house: boarded lower wall, pale panel above, heavy gable."""
    eave = .15 + height
    middle = centre(ring)
    solid(b, list(ring), .15, eave, 'ART_Facade', wall)
    for i, (a, c) in enumerate(zip(ring, ring[1:] + ring[:1])):
        length, at = frame(a, c, middle)
        if not b.distant and length > 3:
            boards(b, a, c, .2, min(eave, 1.9), middle, int(abs(a[1]) * 7) + i)
        else:
            plank(b, at, 0, .2, length, min(eave, 1.9), lower, .03, 'ART_Joint')
        plank(b, at, 0, 1.9, length, 2.0, DARK, .05, 'ART_Joint')
        if i % 2 == 0 and length > 5:
            windows(b, at, length, 2.1, min(eave - .15, 3.0), max(1, int(length / 4)))
    roof(b, ring, eave, rise, wall, .7, roof_tone)


def barn(b, ring, height, rise):
    """1006: a tall weathered board barn with a rust pent roof and old lean-tos."""
    eave = .15 + height
    middle = centre(ring)
    solid(b, list(ring), .15, eave, 'ART_Joint', BOARD)
    for i, (a, c) in enumerate(zip(ring, ring[1:] + ring[:1])):
        boards(b, a, c, .2, eave, middle, 1006 + i)
    roof(b, ring, eave, rise, BOARD, .5, (.34, .33, .33))
    skirt(b, ring, 3.0, 1.1, (.45, .24, .19))


def two_storey(b, ring, height, rise):
    """1027: tiled skirt roof round the ground floor, a smaller upper floor and balcony."""
    middle = centre(ring)
    ground = .15 + height
    solid(b, list(ring), .15, ground, 'ART_Facade', PALE)
    for i, (a, c) in enumerate(zip(ring, ring[1:] + ring[:1])):
        length, at = frame(a, c, middle)
        plank(b, at, 0, .2, length, 1.0, (.42, .38, .33), .03, 'ART_Joint')
        windows(b, at, length, 1.1, 2.5, max(1, int(length / 4)))
    skirt(b, ring, ground + .25, 1.0, sides=(0, 1, 2, 3))
    upper = inset(ring, .22)
    top = ground + 2.7
    solid(b, upper, ground, top, 'ART_Facade', PALE)
    for i, (a, c) in enumerate(zip(upper, upper[1:] + upper[:1])):
        length, at = frame(a, c, middle)
        plank(b, at, 0, top - .25, length, top, DARK, .05, 'ART_Joint')
        if i % 2 == 0:
            windows(b, at, length, ground + .9, top - .4, max(1, int(length / 4)))
    roof(b, upper, top, rise, PALE, .9)
    # The rail reads against the sky in 1027.
    length, at = frame(upper[0], upper[1], middle)
    for k in range(int(length / (.8 if b.distant else .2))):
        plank(b, at, k * (.8 if b.distant else .2), ground + .3, k * (.8 if b.distant else .2) + .06, ground + 1.2, (.84, .83, .80), .55, 'ART_Joint')
    plank(b, at, 0, ground + 1.2, length, ground + 1.27, (.84, .83, .80), .55, 'ART_Joint')


def white_gable(b, ring, height, rise, wall=PALE):
    eave = .15 + height
    middle = centre(ring)
    solid(b, list(ring), .15, eave, 'ART_Facade', wall)
    for i, (a, c) in enumerate(zip(ring, ring[1:] + ring[:1])):
        length, at = frame(a, c, middle)
        boards(b, a, c, .2, 2.5, middle, 1050 + i)
        plank(b, at, 0, 2.5, length, 2.6, DARK, .05, 'ART_Joint')
        if i % 2 == 0:
            windows(b, at, length, 3.0, 4.4, max(1, int(length / 5)))
    roof(b, ring, eave, rise, wall, .6)


def modern(b, ring, height):
    """1023, 1031: white upper walls, dark bands and an off-centre slate tower."""
    middle = centre(ring)
    top = .15 + height
    solid(b, list(ring), .15, top, 'ART_Facade', PALE)
    a, c, d, e = ring
    for i, (p, q) in enumerate(zip(ring, ring[1:] + ring[:1])):
        length, at = frame(p, q, middle)
        plank(b, at, 0, .15, length, .7, (.50, .49, .47), .03, 'ART_Joint')
        for u in range(0, int(length), 4):
            plank(b, at, u + 1.7, .7, u + 2.0, top, GREY, .05, 'ART_Joint')
        windows(b, at, length, 1.1, 2.5, max(1, int(length / 5)))
        windows(b, at, length, 4.4, 5.8, max(1, int(length / 5)))
    # Banded pent roof and a dark parapet, both slightly overhanging.
    solid(b, [lerp(p, middle, -.08) for p in ring], 3.1, 3.5, 'ART_Joint', GREY)
    solid(b, [lerp(p, middle, -.10) for p in ring], top, top + .35, 'ART_Joint', (.30, .32, .35))
    tower = [lerp(a, e, .36), lerp(c, d, .36), lerp(c, d, .62), lerp(a, e, .62)]
    tower = [lerp(tower[0], tower[1], .9), lerp(tower[0], tower[1], 1.02), lerp(tower[3], tower[2], 1.02), lerp(tower[3], tower[2], .9)]
    solid(b, tower, .15, top + 1.0, 'ART_Joint', (.21, .23, .27))


def estate(b, ring, height, rise):
    """1033: long tiled house with a raised boarded lantern storey at the east end."""
    tiled(b, ring, height, rise)
    middle = centre(ring)
    a, c, d, e = ring
    room = [lerp(lerp(a, c, .55), lerp(e, d, .55), .2), lerp(lerp(a, c, .85), lerp(e, d, .85), .2),
            lerp(lerp(a, c, .85), lerp(e, d, .85), .8), lerp(lerp(a, c, .55), lerp(e, d, .55), .8)]
    eave = .15 + height + rise + 1.9
    timber = (.58, .46, .36)
    solid(b, room, .15 + height, eave, 'ART_Joint', timber)
    for i, (p, q) in enumerate(zip(room, room[1:] + room[:1])):
        boards(b, p, q, .15 + height, eave, middle, 1033 + i, timber)
    roof(b, room, eave, 1.1, timber, .9)


def dark_house(b, ring, height, rise):
    """1036: blackened boards with white panels high in the gable."""
    eave = .15 + height
    middle = centre(ring)
    solid(b, list(ring), .15, eave, 'ART_Joint', (.30, .27, .25))
    for i, (a, c) in enumerate(zip(ring, ring[1:] + ring[:1])):
        boards(b, a, c, .2, eave, middle, 1036 + i, (.31, .27, .25))
    roof(b, ring, eave, rise, (.82, .80, .74), .7)


def building(b, item):
    ring = [tuple(p) for p in item['ring']]
    kind, height, rise = item['kind'], item['height'], item['rise']
    if kind == 'barn':
        barn(b, ring, height, rise)
    elif kind == 'white-gable':
        white_gable(b, ring, height, rise)
    elif kind == 'pale-gable':
        white_gable(b, ring, height, rise, (.55, .60, .64))
    elif kind == 'two-storey':
        two_storey(b, ring, height, rise)
    elif kind == 'modern':
        modern(b, ring, height)
    elif kind == 'estate':
        estate(b, ring, height, rise)
    elif kind == 'dark-house':
        dark_house(b, ring, height, rise)
    else:
        tiled(b, ring, height, rise)


def low_wall(b, line, top, seed, inside):
    """Mortared rubble: a dark core with low-relief stones, as 1042 and 1036."""
    for i, (a, c) in enumerate(zip(line, line[1:])):
        masonry(b, tuple(a), tuple(c), .15, top, inside(a), seed + i, batter=.03, scale=.42)


def wall_side(line, sign):
    return lambda a: (a[0], a[1] + sign)


def core(b, line, top, thick, material, tone):
    for a, c in zip(line, line[1:]):
        length = math.dist(a, c)
        n = -(c[1] - a[1]) / length * thick / 2, (c[0] - a[0]) / length * thick / 2
        solid(b, [(a[0] + n[0], a[1] + n[1]), (c[0] + n[0], c[1] + n[1]), (c[0] - n[0], c[1] - n[1]), (a[0] - n[0], a[1] - n[1])], .15, top, material, tone)


def slab_wall(b, line, top):
    """1050: long pale cast slabs with dark joints."""
    rng = random.Random(1050)
    core(b, line, top, .3, 'ART_Joint', (.34, .33, .31))
    for a, c in zip(line, line[1:]):
        for sign in (1, -1):
            mid = lerp(a, c, .5)
            length, at = frame(a, c, (mid[0], mid[1] + sign))
            shade = rng.uniform(.62, .76)
            plank(b, at, .03, .17, length - .03, top - .03, (shade, shade * .97, shade * .88), .17, 'ART_Joint')


def concrete_block_wall(b, line, top, seed):
    """1033: grey block courses, a coping and pierced vent blocks."""
    rng = random.Random(seed)
    core(b, line, top, .22, 'ART_Joint', (.30, .30, .31))
    for a, c in zip(line, line[1:]):
        mid = lerp(a, c, .5)
        length, at = frame(a, c, (mid[0], mid[1] - 4))
        step = .9 if not b.distant else 1.8
        rows = 2 if b.distant else 5
        for r in range(rows):
            y0, y1 = .18 + r * (top - .25) / rows, .15 + (r + 1) * (top - .25) / rows
            for k in range(int(length / step) + 1):
                u0 = k * step + (r % 2) * step / 2
                if u0 > length - .1:
                    continue
                shade = rng.uniform(.40, .52)
                plank(b, at, u0 + .02, y0, min(length, u0 + step) - .02, y1, (shade, shade * .97, shade * .92), .13, 'ART_Joint')
        plank(b, at, -.05, top - .05, length + .05, top + .07, (.46, .46, .45), .15, 'ART_Joint')


def hedge(b, line, seed):
    """1042: multi-stemmed shrubs cut into a loose row, not a solid box."""
    from vegetation import _tuft
    from abstract_props import cylinder
    rng, stems = random.Random(seed), random.Random(seed + 1)
    for a, c in zip(line, line[1:]):
        length = math.dist(a, c)
        count = max(1, int(length / 1.3))
        for i in range(count):
            x, z = lerp(a, c, (i + .5) / count)
            # Both LODs draw the same billows' envelope; the distant one drops inner ones.
            if not b.distant and i % 2 == 0:
                for k in range(3):
                    tx, tz = x + stems.uniform(-.45, .45), z + stems.uniform(-.3, .3)
                    cylinder(b, (x + stems.uniform(-.1, .1), .15, z), (tx, 1.2, tz), .03, 'ART_TreeBark', segments=3)
            for k in range(7):
                material = 'HK_LeafDark' if rng.random() < .6 else 'HK_LeafDeep'
                size = rng.uniform(.42, .68)
                centre_point = (x + rng.uniform(-.85, .85), rng.uniform(1.25, 2.9), z + rng.uniform(-.55, .55))
                angle = rng.uniform(0, 6)
                if not b.distant or k % 2 == 0 or i == 0 or i == count - 1:
                    _tuft(b, centre_point, (size, size * .85, size * .9), angle, material, seed + i * 11 + k, False)


def ditch(b, line):
    """1029, 1033: an open drain with a block lip beside the footway."""
    for a, c in zip(line, line[1:]):
        length = math.dist(a, c)
        n = -(c[1] - a[1]) / length * .32, (c[0] - a[0]) / length * .32
        quad = [(a[0] + n[0], .165, a[1] + n[1]), (c[0] + n[0], .165, c[1] + n[1]), (c[0] - n[0], .165, c[1] - n[1]), (a[0] - n[0], .165, a[1] - n[1])]
        face(b, quad, 'ART_Joint', (a[0], 0, a[1]), (.42, .40, .37))
        for sign in (1, -1):
            s = [(p[0] + n[0] * sign * 1.3, p[1] + n[1] * sign * 1.3) for p in (a, c)]
            core(b, s, .2, .16, 'ART_Joint', (.60, .58, .52))


def surface(b, ring, y, material, tone):
    from road_network import ccw, triangulate
    for t in triangulate(ccw([tuple(p) for p in ring])):
        face(b, [(x, y, z) for x, z in t], material, (t[0][0], y - 1, t[0][1]), tone)


def lane(b, line, width, tone=(.40, .41, .44)):
    for a, c in zip(line, line[1:]):
        length = math.dist(a, c)
        n = -(c[1] - a[1]) / length * width / 2, (c[0] - a[0]) / length * width / 2
        quad = [(a[0] + n[0], .163, a[1] + n[1]), (c[0] + n[0], .163, c[1] + n[1]), (c[0] - n[0], .163, c[1] - n[1]), (a[0] - n[0], .163, a[1] - n[1])]
        face(b, quad, 'HK_Asphalt', (a[0], 0, a[1]), tone)


def pole(b, x, z, top=10.5):
    from abstract_props import cylinder
    cylinder(b, (x, .15, z), (x, top, z), .15, 'ART_Concrete', segments=7)
    if b.distant:
        return
    cylinder(b, (x - .7, top - .9, z), (x + .7, top - .9, z), .04, 'HK_MetalLight', segments=4)
    plank(b, lambda u, y, o: (x + u, y, z + .17 + o), -.09, .8, .09, 2.4, (.80, .62, .16), .0, 'ART_Joint')


def wires(b, points, top=10.5):
    for p, q in zip(points, points[1:]):
        for dy, off in ((-.9, -.65), (-.9, .65), (-.2, 0)):
            mid = ((p[0] + q[0]) / 2 + off, top + dy - .45, (p[1] + q[1]) / 2)
            bar(b, (p[0] + off, top + dy, p[1]), mid, .012, (.16, .16, .18), 'ART_Joint', 3)
            bar(b, mid, (q[0] + off, top + dy, q[1]), .012, (.16, .16, .18), 'ART_Joint', 3)


def street_lamp(b, x, z):
    """1030, 1038: a tall dark post with a square lantern."""
    from abstract_props import cylinder
    cylinder(b, (x, .15, z), (x, 4.6, z), .07, 'ART_TreeBark', segments=6)
    box(b, lambda u, y, v: (x + u, y, z + v), 0, 0, .34, .34, 4.6, 5.05, 'ART_LampGlow', (.94, .88, .68))
    box(b, lambda u, y, v: (x + u, y, z + v), 0, 0, .48, .48, 5.05, 5.15, 'ART_Joint', DARK)


def gate_pillar(b, x, z, tangent=1):
    """1046: dressed stone in panels under a heavy cap."""
    at = lambda u, y, v: (x + u, y, z + v)
    box(b, at, 0, 0, 1.2, 1.0, .15, .5, 'ART_Boulder', (.46, .46, .42))
    box(b, at, 0, 0, 1.0, .8, .5, 2.9, 'ART_Boulder', (.52, .51, .46))
    box(b, at, 0, 0, 1.24, 1.04, 2.9, 3.15, 'ART_Boulder', (.44, .44, .40))
    if not b.distant:
        for k in range(3):
            y = .85 + k * .7
            plank(b, lambda u, yy, o: (x + u, yy, z + .4 + o), -.5, y, .5, y + .025, (.24, .24, .25), .004, 'ART_Joint')


def sign_panel(b, at, x, y, w, h, tone=WHITE, depth=.04):
    from university_frontage import rect
    rect(b, at, x, y, w, h, tone, depth)


def street_gate(b, q):
    """1046, 1047: the car-park entrance. Fee text is the photographed sign, not a tariff."""
    from abstract_props import cylinder
    from university_frontage import label, rect
    west, east = q['west'], q['east']
    gate_pillar(b, *west)
    gate_pillar(b, *east)
    z = (west[1] + east[1]) / 2
    # Sunken gate rails and the slot grating across the entrance.
    for dz, tone in ((-.5, (.27, .25, .24)), (.25, (.27, .25, .24)), (-1.1, (.12, .13, .14))):
        surface(b, [(west[0] - .4, z + dz), (east[0] + .4, z + dz), (east[0] + .4, z + dz + .16), (west[0] - .4, z + dz + .16)], .17, 'ART_Joint', tone)
    # The rusted gate is pushed back against the west pillar.
    gx = west[0] - .9
    leaf = lambda u, y, o: (gx + o, y, z - 2.9 + u)
    tone = (.50, .31, .23)
    for k in range(7):
        plank(b, leaf, k * .3, .3, k * .3 + .15, 1.9, tone, 0, 'ART_Joint')
    for y in (.45, 1.75):
        plank(b, leaf, 0, y, 1.95, y + .1, tone, .02, 'ART_Joint')
    # Booth: ribbed grey container with a bamboo blind at the street end.
    bx, bz = q['booth']
    ring = [(bx - 3, bz - 1.3), (bx + 3, bz - 1.3), (bx + 3, bz + 1.3), (bx - 3, bz + 1.3)]
    solid(b, ring, .17, 2.6, 'ART_Facade', (.52, .54, .50))
    solid(b, [(bx - 3.1, bz - 1.4), (bx + 3.1, bz - 1.4), (bx + 3.1, bz + 1.4), (bx - 3.1, bz + 1.4)], 2.6, 2.72, 'ART_Joint', (.40, .41, .41))
    plank(b, lambda u, y, o: (bx + 3 + o, y, bz + 1.3 - u), 0, .2, 2.6, 2.5, BAMBOO, .08, 'ART_Joint')
    # Fee pylon at the west pillar, facing the street.
    px, pz = west[0] + .9, west[1] + .7
    at = lambda u, y, o: (px - u, y, pz + o)
    cylinder(b, (px - .35, .15, pz), (px - .35, 1.0, pz), .03, 'HK_MetalLight', segments=4)
    cylinder(b, (px + .35, .15, pz), (px + .35, 1.0, pz), .03, 'HK_MetalLight', segments=4)
    rect(b, at, -.42, .9, .84, 1.9, WHITE, .03)
    rect(b, at, -.42, 2.35, .84, .45, (.74, .14, .13), .036)
    label(b, at, '駐車料金', -.36, 2.46, .72, .24, WHITE, .04)
    label(b, at, '1000円', -.34, 1.75, .68, .3, INK, .04)
    rect(b, at, -.42, .9, .84, .2, (.13, .30, .60), .036)
    label(b, at, '普通車', -.3, 1.38, .6, .2, INK, .04)
    # The A-frame board on the kerb.
    ax, az = bx + 4.2, bz + 3.2
    at = lambda u, y, o: (ax - u, y, az + o)
    rect(b, at, -.5, .35, 1.0, 1.15, WHITE, 0)
    label(b, at, '駐車料金', -.44, 1.2, .88, .2, INK, .01)
    label(b, at, '1000円', -.42, .78, .84, .3, (.76, .14, .12), .01)
    label(b, at, 'ご用意下さい', -.44, .46, .88, .15, INK, .01)
    for dx in (-.5, .5):
        bar(b, (ax + dx, .17, az - .4), (ax + dx, 1.5, az), .025, (.82, .82, .78), 'ART_Joint', 4)
    # Cone.
    cx, cz = ax + 1.0, az + .3
    cylinder(b, (cx, .17, cz), (cx, .9, cz), .12, 'ART_Joint', segments=6)
    paint_last(b, 7, (.86, .28, .12))


def paint_last(b, count, tone):
    for i in range(len(b.faces) - count * 3, len(b.faces)):
        b.pigments[i] = tone


def info_board(b, x, z):
    """1042, 1044: a dark gabled explanation board on two legs; its text is not transcribed."""
    from abstract_props import cylinder
    at = lambda u, y, o: (x + u, y, z + o)
    for u in (-1.9, 1.9):
        cylinder(b, (x + u, .15, z), (x + u, 1.5, z), .09, 'ART_Timber', segments=5)
    solid(b, [(x - 2.4, z - .07), (x + 2.4, z - .07), (x + 2.4, z + .07), (x - 2.4, z + .07)], 1.1, 3.8, 'ART_Joint', (.16, .17, .19))
    face(b, [(x - 2.5, 3.76, z + .08), (x + 2.5, 3.76, z + .08), (x, 4.5, z + .08)], 'ART_Joint', (x, 3.9, z), (.16, .17, .19))
    if not b.distant:
        rng = random.Random(1044)
        for k in range(16):
            y = 3.45 - k * .13
            plank(b, at, -2.1, y, -2.1 + rng.uniform(3.2, 4.2), y + .04, (.70, .71, .70), .09, 'ART_Joint')


def mirror(b, x, z):
    """1045: an orange post with a round traffic mirror, and the P sign by the kerb."""
    from abstract_props import cylinder
    from university_frontage import graphic, label, rect
    first = len(b.faces)
    cylinder(b, (x, .15, z), (x, 3.0, z), .05, 'ART_Joint', segments=5)
    for i in range(first, len(b.faces)):
        b.pigments[i] = (.86, .42, .12)
    at = lambda u, y, o: (x + u, y, z - o)
    circle = [(.38 * math.cos(i * math.tau / 16), 3.0 + .38 * math.sin(i * math.tau / 16)) for i in range(16)]
    graphic(b, at, circle, (.86, .42, .12), .04)
    graphic(b, at, [(p[0] * .86, 3.0 + (p[1] - 3.0) * .86) for p in circle], (.64, .70, .72), .05)
    px = x + 4.5
    at = lambda u, y, o: (px + u, y, z - o)
    cylinder(b, (px, .15, z), (px, 1.4, z), .025, 'HK_MetalLight', segments=4)
    rect(b, at, -.3, .9, .6, .7, (.13, .36, .68), .03)
    label(b, at, 'P', -.16, 1.0, .32, .5, WHITE, .04)


def lot_details(b, q):
    """1007, 1018-1022: tennis-court gate, contractor banner and the carved stone posts."""
    from abstract_props import cylinder
    from university_frontage import label, rect
    for x, z in q['gatePillars']:
        box(b, lambda u, y, v: (x + u, y, z + v), 0, 0, .84, .84, .15, 2.1, 'ART_Joint', (.46, .47, .47))
    x, z = q['gatePillars'][0]
    at = lambda u, y, o: (x - u, y, z + o)
    rect(b, at, -.34, 1.2, .68, .54, WHITE, .43)
    label(b, at, '滋賀大学', -.28, 1.56, .56, .13, INK, .44)
    label(b, at, '彦根キャンパス', -.28, 1.41, .56, .11, INK, .44)
    label(b, at, 'テニスコート', -.28, 1.26, .56, .11, INK, .44)
    x, z = q['banner']
    at = lambda u, y, o: (x + u, y, z + o)
    cylinder(b, (x, .15, z), (x, 2.0, z), .02, 'HK_MetalLight', segments=4)
    rect(b, at, -.2, .35, .4, 1.6, (.20, .56, .34), .02)
    rect(b, at, -.16, .39, .32, 1.52, WHITE, .025)
    x, z = q['keepOut']
    at = lambda u, y, o: (x + u, y, z + o)
    rect(b, at, -.4, .4, .8, 1.1, (.74, .74, .72), 0)
    for sx, sz in q['steles']:
        box(b, lambda u, y, v: (sx + u, y, sz + v), 0, 0, .34, .34, .15, 1.75, 'ART_StoneLight', (.68, .67, .63))
    x, z = q['barrier']
    for dx in (-1.1, 1.1):
        bar(b, (x + dx, .15, z - .3), (x + dx, .95, z), .03, (.30, .60, .36), 'ART_Joint', 4)
        bar(b, (x + dx, .15, z + .3), (x + dx, .95, z), .03, (.30, .60, .36), 'ART_Joint', 4)
    bar(b, (x - 1.1, .95, z), (x + 1.1, .95, z), .03, (.84, .84, .82), 'ART_Joint', 4)


def build(name, mesh_class, lod=False):
    from abstract_props import cylinder
    b = mesh_class(name)
    b.abstract, b.distant = True, lod
    q = data()
    surface(b, q['carPark']['ring'], .162, 'ART_Gravel', (.68, .64, .57))
    lanes = q['lanes']
    for key in ('south', 'back', 'north'):
        lane(b, lanes[key], lanes['width'])
    for item in q['buildings']:
        building(b, item)
    for line in q['ditch']:
        ditch(b, line)
    walls = q['lowWalls']
    slab_wall(b, walls['moatPlot'], .75)
    for i, key in enumerate(('stoneA', 'stoneB', 'stoneC', 'stoneD')):
        core(b, [(x, z - .2) for x, z in walls[key]], 1.05, .28, 'ART_Joint', (.36, .36, .35))
        low_wall(b, walls[key], 1.05, 1042 + 40 * i, wall_side(walls[key], -2))
    for i, line in enumerate(q['hedges'].values()):
        hedge(b, line, 1043 + 200 * i)
    concrete_block_wall(b, q['estateWall'], 1.9, 1033)
    concrete_block_wall(b, q['modernWall'], 1.15, 1023)
    street_gate(b, q['gate'])
    info_board(b, *q['board'])
    for p in q['poles']:
        pole(b, *p)
    wires(b, q['poles'])
    for p in q['lamps']:
        street_lamp(b, *p)
    no_parking(b, *q['noParking'][0], (0, -1))
    no_parking(b, *q['noParking'][1], (0, 1))
    mirror(b, *q['mirror'])
    rust_fence(b, [tuple(p) for p in q['lot']['fence']])
    lot_details(b, q['lot'])
    return b
