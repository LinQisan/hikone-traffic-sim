"""Nishi school road and the Higashi approach on foot, owner photos 0855-0866.

world/school-road.json owns placements and estimates. Stones, plaster and timber keep broken warm
and cool colour with violet-brown darks, so the painted shaders stay Renoir-like on realistic
forms; signs are clean graphic planes. No photograph is used as a texture.
"""
import json
import math
import os
import random
from functools import lru_cache

from higashi_school import box, face, frame, solid
from east_street import bar, plank, ribs

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BAMBOO = (.62, .56, .44)
RUST = (.55, .29, .20)
SLATE = (.36, .37, .40)
SHINGLE = (.42, .39, .37)
WEATHERED = (.36, .30, .27)
SIGN_BLUE = (.13, .36, .68)
SIGN_RED = (.78, .15, .14)
WHITE = (.95, .95, .92)
INK = (.14, .16, .19)


@lru_cache(maxsize=1)
def data():
    with open(os.path.join(ROOT, 'world', 'school-road.json')) as f:
        return json.load(f)


def masonry(b, a, c, lo, hi, inside, batter=.08):
    """One flat battered face; the shared castle texture supplies every stone and joint."""
    length, at = frame(a, c, inside)
    if length < .2:
        return
    points = [at(0, lo, batter * (hi-lo)), at(length, lo, batter * (hi-lo)),
              at(length, hi, 0), at(0, hi, 0)]
    face(b, points, 'ART_CastleStone', at(length / 2, (lo + hi) / 2, -1), (1, 1, 1))


def ivy(b, a, c, top, inside, seed):
    """Ivy spills over the coping and down the joints, leaf by leaf."""
    if b.distant:
        return
    rng = random.Random(seed)
    length, at = frame(a, c, inside)
    centre = at(length / 2, top / 2, -1)
    for i in range(int(length * 3)):
        u, y = rng.uniform(0, length), top - abs(rng.gauss(0, top * .32))
        o = .27 + (top - y) * .16
        r = rng.uniform(.07, .14)
        tone = rng.choice(((.30, .42, .22), (.40, .50, .26), (.24, .35, .22)))
        face(b, [at(u, y + r, o), at(u + r, y, o), at(u, y - r, o), at(u - r, y, o)], 'HK_Leaf', centre, tone)


def bamboo_fence(b, a, c):
    """Otemae parking boundary (0866): stout posts, two rails and close split-bamboo pickets."""
    from abstract_props import cylinder
    length = math.dist(a, c)
    ux, uz = (c[0] - a[0]) / length, (c[1] - a[1]) / length
    n = max(1, math.ceil(length / 1.8))
    for i in range(n + 1):
        x, z = a[0] + ux * length * i / n, a[1] + uz * length * i / n
        bar(b, (x, .01, z), (x, 1.16, z), .05, (.40, .35, .29), 'ART_Facade', 5)
    for y in (.42, .86):
        bar(b, (a[0], y, a[1]), (c[0], y, c[1]), .026, BAMBOO, 'ART_Facade', 4)
    if b.distant:
        return
    rng = random.Random(int(abs(a[0] * 31 + a[1] * 7)))
    for i in range(int(length / .24)):
        u = (i + .5) * .24
        x, z = a[0] + ux * u, a[1] + uz * u
        top = rng.uniform(.98, 1.1)
        bar(b, (x - uz * .03, .05, z + ux * .03), (x - uz * .03, top, z + ux * .03), .022,
            tuple(v + rng.uniform(-.05, .03) for v in BAMBOO), 'ART_Facade', 4)


def cypress(b, x, z, height, seed):
    """A flame-shaped cypress on a bare leaning trunk: many small dark pads, brighter at the tips."""
    from abstract_props import cylinder
    from vegetation import _tuft
    rng = random.Random(seed)
    lean = rng.uniform(-.5, .5), rng.uniform(-.5, .5)
    foot = .9
    cylinder(b, (x, .01, z), (x + lean[0] * .4, foot + .6, z + lean[1] * .4), .13, 'HK_Bark', segments=5, end_radius=.09)
    levels = 5 if b.distant else 14
    for i in range(levels):
        t = (i + .5) / levels
        radius = .95 * (1 - t) ** .8 + .1
        y = foot + (height - foot) * t
        cx, cz = x + lean[0] * t, z + lean[1] * t
        _tuft(b, (cx, y, cz), (radius * .8, (height - foot) / levels * 1.1, radius * .8), i, 'HK_LeafDeep', seed + i * 41, False)
        if b.distant:
            continue
        # Upswept sprays break the outline into the flame-like edge of 0990 and 0997.
        for k in range(7):
            angle = rng.uniform(0, math.tau)
            at = (cx + math.cos(angle) * radius * .8, y + rng.uniform(-.2, .4), cz + math.sin(angle) * radius * .8)
            _tuft(b, at, (.17, .6, .17), angle, 'HK_LeafDeep' if k % 3 else 'HK_LeafDark', seed + i * 41 + k + 1, False)


def rust_fence(b, line):
    """0859: a concrete block footing under white-painted, rusted panel fencing."""
    from abstract_props import cylinder
    rng = random.Random(859)
    for a, c in zip(line, line[1:]):
        length = math.dist(a, c)
        u = (c[0] - a[0]) / length, (c[1] - a[1]) / length
        n = -u[1] * .13, u[0] * .13
        solid(b, [(a[0] + n[0], a[1] + n[1]), (c[0] + n[0], c[1] + n[1]), (c[0] - n[0], c[1] - n[1]), (a[0] - n[0], a[1] - n[1])],
              .01, .72, 'ART_Concrete', (.56, .56, .52))
        count = max(1, round(length / 2.1))
        for i in range(count + 1):
            x, z = a[0] + (c[0] - a[0]) * i / count, a[1] + (c[1] - a[1]) * i / count
            cylinder(b, (x, .72, z), (x, 2.05, z), .035, 'ART_StoneLight', segments=4)
            if i < count:
                e, f = a[0] + (c[0] - a[0]) * (i + 1) / count, a[1] + (c[1] - a[1]) * (i + 1) / count
                for y in (.82, 2.0):
                    bar(b, (x, y, z), (e, y, f), .022, (.84, .82, .74), 'ART_Timber', 4)
                if not b.distant:
                    for k in range(1, 9):
                        t = k / 9
                        tone = RUST if rng.random() < .35 else (.72, .66, .56)
                        bar(b, (x + (e - x) * t, .82, z + (f - z) * t), (x + (e - x) * t, 2.0, z + (f - z) * t), .011, tone, 'ART_Timber', 3)


def offset(line, distance):
    out = []
    for i, p in enumerate(line):
        a, c = line[max(0, i - 1)], line[min(len(line) - 1, i + 1)]
        length = math.dist(a, c)
        out.append((p[0] - (c[1] - a[1]) / length * distance, p[1] + (c[0] - a[0]) / length * distance))
    return out


def along(line, step):
    for a, c in zip(line, line[1:]):
        length = math.dist(a, c)
        for i in range(max(1, round(length / step))):
            t = i * step / length
            if t < 1:
                yield a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t


def gable(b, ring, eave, rise, wall, roof, wall_material='ART_Facade', roof_material='ART_Tile', overhang=.5):
    """Closed walls and a gable along the ring's first edge, with deep eaves and soffits."""
    a, c, d, e = ring
    centre = (sum(p[0] for p in ring) / 4, sum(p[1] for p in ring) / 4)
    solid(b, list(ring), .15, eave, wall_material, wall)
    mid_a, mid_c = ((a[0] + e[0]) / 2, (a[1] + e[1]) / 2), ((c[0] + d[0]) / 2, (c[1] + d[1]) / 2)
    inside = (centre[0], eave - .5, centre[1])
    face(b, [(a[0], eave, a[1]), (e[0], eave, e[1]), (mid_a[0], eave + rise, mid_a[1])], wall_material, inside, wall)
    face(b, [(c[0], eave, c[1]), (d[0], eave, d[1]), (mid_c[0], eave + rise, mid_c[1])], wall_material, inside, wall)
    length = math.dist(a, c)
    ux, uz = (c[0] - a[0]) / length, (c[1] - a[1]) / length
    wide = lambda p, s: (p[0] + ux * s * overhang, p[1] + uz * s * overhang)
    for near, far, top_a, top_c in ((a, c, mid_a, mid_c), (e, d, mid_a, mid_c)):
        dx, dz = near[0] - top_a[0], near[1] - top_a[1]
        depth = math.hypot(dx, dz)
        drop = overhang * rise / depth
        p = wide((near[0] + dx / depth * overhang, near[1] + dz / depth * overhang), -1)
        q = wide((far[0] + dx / depth * overhang, far[1] + dz / depth * overhang), 1)
        points = [(p[0], eave - drop, p[1]), (q[0], eave - drop, q[1]),
                  (wide(top_c, 1)[0], eave + rise, wide(top_c, 1)[1]), (wide(top_a, -1)[0], eave + rise, wide(top_a, -1)[1])]
        points = [(x, y + .06, z) for x, y, z in points]
        face(b, points, roof_material, inside, roof)
        face(b, [(x, y - .06, z) for x, y, z in points], 'ART_Timber', (centre[0], eave + rise + 5, centre[1]), (.27, .23, .25))


def planks(b, a, c, lo, hi, inside, seed):
    """Vertical weathered boards, each a slightly different silver-brown."""
    rng = random.Random(seed)
    length, at = frame(a, c, inside)
    step = 1.4 if b.distant else .34
    for i in range(int(length / step)):
        # Each board's own tone is the broken colour; a brush overlay turns fine boards to noise.
        shade = rng.uniform(.82, 1.14)
        tone = tuple(v * shade for v in WEATHERED)
        plank(b, at, i * step + .012, lo, (i + 1) * step - .012, hi, tone, .025, 'ART_Joint')


def lean_to(b, ring, eave):
    """Rust and faded-blue corrugated lean-tos across the street-facing wall (0861)."""
    a, c = ring[0], ring[1]
    centre = (sum(p[0] for p in ring) / 4, sum(p[1] for p in ring) / 4)
    length, at = frame(a, c, centre)
    tones = (RUST, (.47, .25, .20), (.38, .44, .50), (.52, .36, .26))
    n = 4
    for i in range(n):
        u0, u1 = length * i / n + .08, length * (i + 1) / n - .08
        solid(b, [at(u0, 0, 0)[::2], at(u1, 0, 0)[::2], at(u1, 0, 2.6)[::2], at(u0, 0, 2.6)[::2]], .15, 2.05, 'ART_Joint', (.40, .25, .21))
        roof = [at(u0, eave - .25, 0), at(u1, eave - .25, 0), at(u1, 2.2, 3.0), at(u0, 2.2, 3.0)]
        face(b, roof, 'ART_Joint', (*at(length / 2, 0, 0)[:1], 0, at(length / 2, 0, 0)[2]), tones[i])
        if not b.distant:
            for k in range(int((u1 - u0) / .5)):
                x = u0 + .25 + k * .5
                bar(b, at(x, eave - .23, .02), at(x, 2.22, 3.02), .012, tuple(v * .92 for v in tones[i]), 'ART_Joint', 3)


def building(b, item):
    """Photographed west-lot buildings, on their existing mapped footprints."""
    kind = item['id']
    ring = [tuple(p) for p in item['footprint']]
    if len(ring) != 4 or kind not in ('school-lane-shed', 'moat-timber-house', 'moat-store'):
        return False
    centre = (sum(p[0] for p in ring) / 4, sum(p[1] for p in ring) / 4)
    eave = .15 + item['height']
    if kind == 'school-lane-shed':
        # 0858/0860: salmon render, deep eaves, a dark open bay with a timber lower wall.
        gable(b, ring, eave, item['rise'] + .5, (.74, .55, .45), SLATE)
        length, at = frame(ring[0], ring[1], centre)
        plank(b, at, length * .45, .2, length * .92, 2.65, (.20, .19, .21), .03)
        plank(b, at, length * .45, .2, length * .92, 1.1, (.40, .29, .25), .05)
        return True
    gable(b, ring, eave, item['rise'] + .6, WEATHERED, SHINGLE, roof_material='ART_Joint')
    for a, c in zip(ring, ring[1:] + ring[:1]):
        planks(b, a, c, .2, eave, centre, int(abs(a[0])))
    if kind == 'moat-timber-house':
        lean_to(b, ring, eave)
    return True


def villa(b):
    """A grey rendered two-storey lodge with a hipped slate roof (0858-0860)."""
    from university_photos import framed_window
    from university import data as campus_data
    q = data()['villa']
    ring = campus_data()['schoolVilla']['footprint']
    x, z = (sum(p[k] for p in ring) / 4 for k in (0, 1))
    w, d = math.dist(ring[0], ring[1]) / 2, math.dist(ring[1], ring[2]) / 2
    ca, sa = (ring[1][0] - ring[0][0]) / (2 * w), (ring[1][1] - ring[0][1]) / (2 * w)
    top = .15 + q['height']
    wall = (.46, .45, .42)
    solid(b, ring, .15, top, 'ART_Facade', wall)
    centre = (x, z)
    for a, c in zip(ring, ring[1:] + ring[:1]):
        length, at = frame(a, c, centre)
        plank(b, at, 0, top - .25, length, top, (.30, .29, .29), .05)
        for u in (.25, .5, .75):
            framed_window(b, at, length * u - .45, length * u + .45, 3.5, 4.8, width=.04, columns=2, rows=2)
    length, at = frame(ring[0], ring[1], centre)
    plank(b, at, length / 2 - .7, .15, length / 2 + .7, 2.4, (.55, .50, .44), .03)
    plank(b, at, length / 2 - .5, .15, length / 2 + .5, 2.2, (.22, .21, .23), .05)
    eave = [(x + u * ca - v * sa, z + u * sa + v * ca) for u, v in ((-w - .8, -d - .8), (w + .8, -d - .8), (w + .8, d + .8), (-w - .8, d + .8))]
    ridge = [(x + u * ca, z + u * sa) for u in (-w * .3, w * .3)]
    inside = (x, top + .3, z)
    y, peak = top - .1, top + q['rise']
    p = lambda v: (v[0], y, v[1])
    r = lambda v: (v[0], peak, v[1])
    for quad in ([p(eave[0]), p(eave[1]), r(ridge[1]), r(ridge[0])], [p(eave[2]), p(eave[3]), r(ridge[0]), r(ridge[1])],
                 [p(eave[3]), p(eave[0]), r(ridge[0])], [p(eave[1]), p(eave[2]), r(ridge[1])]):
        face(b, quad, 'ART_Tile', inside, SLATE)
    face(b, [p(v) for v in eave], 'ART_Timber', (x, y + 1, z), (.25, .24, .26))
    box(b, lambda u, yy, v: (x - 2.4 + u, yy, z + 1.2 + v), 0, 0, .8, .8, top, peak + .9, 'ART_Facade', wall)


def no_parking(b, x, z, facing):
    from abstract_props import cylinder
    from university_frontage import graphic, rect, label
    at = lambda u, y, o: (x - facing[1] * u + facing[0] * o, y, z + facing[0] * u + facing[1] * o)
    cylinder(b, (x, .15, z), (x, 2.75, z), .035, 'ART_StoneLight', segments=6)
    circle = lambda r: [(r * math.cos(i * math.tau / 24), 2.5 + r * math.sin(i * math.tau / 24)) for i in range(24)]
    graphic(b, at, circle(.3), SIGN_RED, .04)
    graphic(b, at, circle(.25), SIGN_BLUE, .046)
    graphic(b, at, [(-.2, 2.33), (-.15, 2.28), (.2, 2.67), (.15, 2.72)], SIGN_RED, .052)
    rect(b, at, -.27, 2.0, .54, .19, WHITE, .04)
    label(b, at, '区域内', -.23, 2.04, .46, .11, INK, .05)


def junction_ring():
    q = data()['junctionBed']
    corners = [tuple(p) for p in q['outline']]
    ring=[]
    for i,p in enumerate(corners):
        a,c=corners[i-1],corners[(i+1)%len(corners)]
        before=tuple(p[j]+(a[j]-p[j])*.16 for j in range(2))
        after=tuple(p[j]+(c[j]-p[j])*.16 for j in range(2))
        for t in (0,.5,1):ring.append(tuple((1-t)**2*before[j]+2*t*(1-t)*p[j]+t*t*after[j] for j in range(2)))
    return ring


def junction_ground():
    q = data()['junctionBed']
    ring = junction_ring()
    centre = (sum(p[0] for p in ring)/len(ring),sum(p[1] for p in ring)/len(ring))
    return [[(a[0],q['profile']['kerb'],a[1]),(c[0],q['profile']['kerb'],c[1]),
             (centre[0],q['profile']['mound'],centre[1])] for a,c in zip(ring,ring[1:]+ring[:1])]


def junction_bed(b):
    """0997/1002: rounded stone kerb, earth mound and short timber terraces."""
    from abstract_props import cylinder
    from south_promenade import cherry
    q = data()['junctionBed']
    ring = junction_ring()
    kerb, mound = q['profile']['kerb'], q['profile']['mound']
    solid(b, ring, .01, kerb, 'ART_Concrete', (.38, .38, .34))
    centre = (sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring))
    for a,c in zip(ring,ring[1:]+ring[:1]):
        face(b,[(a[0],kerb,a[1]),(c[0],kerb,c[1]),(centre[0],mound,centre[1])],
             'HK_Soil',(centre[0],0,centre[1]),(.47,.43,.32))
    for a, c in zip(ring, ring[1:] + ring[:1]):
        length = math.dist(a, c)
        n = max(1, round(length / 1.1))
        for i in range(n):
            s, t = i / n, (i + .94) / n
            p = (a[0] + (c[0] - a[0]) * s, kerb + .02, a[1] + (c[1] - a[1]) * s)
            e = (a[0] + (c[0] - a[0]) * t, kerb + .02, a[1] + (c[1] - a[1]) * t)
            bar(b, p, e, .07, (.60,.58,.50), 'ART_Boulder', 6)
    if not b.distant:
        for i in range(9):
            t = i / 8
            x = centre[0]-2+t*4
            z = centre[1]-.9+t*.9
            bar(b, (x-.5,.42+t*.13,z-.3), (x+.5,.45+t*.13,z+.3), .055, (.55,.50,.39), 'ART_Timber', 5)
    no_parking(b, *q['sign'], (-.7, -.7))
    x, z = q['pole']
    cylinder(b, (x, .15, z), (x + .12, 4.6, z), .045, 'ART_Timber', segments=5)
    x,z=q['cherry']
    root = kerb
    for triangle in junction_ground():
        (ax,ay,az),(bx,by,bz),(cx,cy,cz)=triangle
        denominator=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz)
        if abs(denominator)<1e-10:continue
        u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/denominator
        v=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/denominator
        if min(u,v,1-u-v)>=-1e-6:
            root=u*ay+v*by+(1-u-v)*cy
            break
    bare_cherry(b, x,z,root,4)


def bare_cherry(b, x, z, y, seed):
    """Cut-back, nearly bare cherry: stout scarred trunk and dark tapering twigs."""
    rng = random.Random(seed)
    bark = (.27, .24, .25)
    top = (x + .2, y + 2.6, z - .1)
    bar(b, (x, y - .1, z), (x + .1, y + 1.3, z), .42, bark, 'ART_TreeBark', 9)
    bar(b, (x + .1, y + 1.3, z), top, .3, bark, 'ART_TreeBark', 8)
    for i in range(8):
        a = i * 2.39996 + rng.uniform(-.3, .3)
        reach = rng.uniform(2.6, 4.4)
        mid = (top[0] + math.cos(a) * reach * .55, top[1] + rng.uniform(.9, 1.6), top[2] + math.sin(a) * reach * .55)
        tip = (top[0] + math.cos(a) * reach, mid[1] + rng.uniform(.6, 1.5), top[2] + math.sin(a) * reach)
        bar(b, top, mid, .075, bark, 'ART_TreeBark', 6)
        bar(b, mid, tip, .03, bark, 'ART_TreeBark', 5)
        if b.distant:
            continue
        for k in range(5):
            s = a + rng.uniform(-.9, .9)
            t = rng.uniform(.3, 1)
            start = tuple(mid[n] + (tip[n] - mid[n]) * t for n in range(3))
            end = (start[0] + math.cos(s) * rng.uniform(.7, 1.6), start[1] + rng.uniform(-.1, 1.1), start[2] + math.sin(s) * rng.uniform(.7, 1.6))
            bar(b, start, end, .012, (.31, .27, .27), 'ART_TreeBark', 4)


def cypress_screen(b):
    q = data()['cypress']
    from university import data as university_data
    line = university_data()['tennisFrontage']['fenceRuns'][0][:2]
    # The continuous road-relative fence and its gate opening belong to moat_street.
    for i, (x, z) in enumerate(along(offset(line, -2.3), 2.9)):
        cypress(b, x, z, q['height'] * (1 + .08 * math.sin(i * 1.7)), 8590 + i)


def nishi_cypress(b):
    q = data()['nishiCypress']
    for i, (x, z) in enumerate(along([tuple(p) for p in q['line']], q['spacing'])):
        cypress(b, x, z, q['height'] * random.Random(8800 + i).uniform(.88, 1.1), 8800 + i)


def road_diamonds(b):
    from road_network import face as paint
    for x, z, turn in data()['diamonds']['points']:
        angle = math.radians(turn)
        ring = lambda u, v: (x + math.sin(angle) * v + math.cos(angle) * u, z + math.cos(angle) * v - math.sin(angle) * u)
        rhombus = lambda w, h: [ring(0, -h), ring(w, 0), ring(0, h), ring(-w, 0)]
        paint(b, rhombus(.75, 1.9), .021, 'ART_PathGreen', False)
        outer, inner = rhombus(.62, 1.5), rhombus(.42, 1.0)
        for i in range(4):
            a, c, d, e = outer[i], outer[(i + 1) % 4], inner[(i + 1) % 4], inner[i]
            paint(b, [a, c, d, e], .022, 'HK_WhitePaint', False)


def nishi_details(b):
    """Weathered roofed notice case. The gate author owns the two banners."""
    from abstract_props import cylinder
    from university_frontage import rect
    x, z = -595.2, 255.5
    frame_at = lambda u, y, o: (x + u * .3, y, z + u - o * .95)
    cylinder(b, (x, .01, z), (x, 2.35, z), .05, 'ART_Timber', segments=6)
    plank(b, lambda u, y, o: (x + o, y, z + u), -.5, 1.55, .5, 2.25, (.91, .90, .84), .035)
    box(b, lambda u, y, v: (x + v, y, z + u), 0, 0, 1.32, .5, 2.34, 2.42, 'ART_Timber', (.22, .20, .22))
    # 0992 resolves the short timber notice beside the crossing pole.
    from university_frontage import label,graphic
    q=data()['smokingNotice'];x,z=q['point'];nx,nz=q['normal']
    at=lambda u,y,o:(x-nz*u+nx*o,y,z+nx*u+nz*o)
    bar(b,(x,.01,z),(x,1.28,z),.035,WEATHERED,'ART_Timber',5)
    box(b,at,0,0,.50,.055,.90,1.24,'ART_Timber',(.35,.28,.25))
    graphic(b,at,[(-.29,1.24),(0,1.33),(.29,1.24)],(.35,.28,.25),.035)
    label(b,at,'路上喫煙',-.20,1.10,.40,.065,WHITE,.039)
    label(b,at,'禁止地区です',-.21,.99,.42,.065,WHITE,.039)


def samurai_wall(b):
    """0863: a mortared stone base, streaked grey plaster, tile coping and white end wall."""
    q = data()['samuraiWall']
    line = [tuple(p) for p in q['line']]
    road_side = (-80, 175)
    top = q['base'] + q['height']
    for i, (a, c) in enumerate(zip(line, line[1:])):
        masonry(b, a, c, .01, q['base'], road_side, batter=-.02)
        back = [(p[0], p[1] - .45) for p in (a, c)]
        solid(b, [a, c, back[1], back[0]], q['base'], top, 'ART_Facade', (.60, .60, .57))
        length, at = frame(a, c, (a[0], a[1] - 3))
        rng = random.Random(863 + i)
        if not b.distant:
            for k in range(int(length * 1.3)):
                u = rng.uniform(0, length - .1)
                y = rng.uniform(q['base'] + .5, top - .2)
                plank(b, at, u, y - rng.uniform(.3, 1.1), u + rng.uniform(.05, .28), y, (.48, .49, .48), .01)
        for y, depth, hi in ((top, .6, top + .08), (top + .08, .42, top + .3)):
            n = -(c[1] - a[1]) / length, (c[0] - a[0]) / length
            ends = [(p[0] + n[0] * s * depth - 0, p[1] + n[1] * s * depth - .22) for p, s in ((a, 1), (c, 1), (c, -1), (a, -1))]
            solid(b, ends, y, hi, 'ART_Tile', (.33, .34, .37))
    e = line[-1]
    solid(b, [(e[0], e[1]), (e[0] + 5.2, e[1] + .7), (e[0] + 5.2, e[1] + .2), (e[0], e[1] - .5)], .01, 3.6, 'ART_Plaster', (.93, .92, .86))
    solid(b, [(e[0], e[1] + .3), (e[0] + 5.2, e[1] + 1.0), (e[0] + 5.2, e[1] - .1), (e[0], e[1] - .8)], 3.6, 3.85, 'ART_Tile', (.30, .31, .34))


def rampart(b):
    """The stone rampart along the bank foot, seen across the moat and parking in 0866."""
    from castle_approach import data as approach
    q = data()['rampart']
    lo, hi = q['range']
    line = [p for p in approach()['innerBank'] if lo <= p[0] <= hi and p[1] < 240]
    for i, (a, c) in enumerate(zip(line, line[1:])):
        masonry(b, a, c, q['base'], q['height'], (a[0] + 20, a[1] + 40), batter=.16)
        ivy(b, a, c, q['height'], (a[0] + 20, a[1] + 40), 8680 + i)
    # The mapped wall of the east moat stands back from the water behind a grass ledge.
    with open(os.path.join(ROOT, 'world', 'castle-moat.json')) as f:
        east = json.load(f)['rampart']
    line = east['line']
    for i, (a, c) in enumerate(zip(line, line[1:])):
        hill = (-120, 420)
        masonry(b, a, c, east['base'], east['height'], hill, batter=.22)
        ivy(b, a, c, east['height'], hill, 8740 + i)


def school_planting(b):
    from abstract_props import cylinder
    from field_photos import palm
    from vegetation import _tuft, spray
    from university_frontage import label, rect
    q = data()['schoolPlanting']
    # Clipped azaleas in one kerbed bed, behind short posts and a chain.
    a, c = q['shrubs'][0], q['shrubs'][-1]
    bed = [(a[0] - 1.2, a[1] - 1.6), (c[0] - 1.2, c[1] + 1.6), (c[0] + 1.0, c[1] + 1.6), (a[0] + 1.0, a[1] - 1.6)]
    solid(b, bed, .01, .22, 'ART_Concrete', (.74, .73, .68))
    posts = [(p[0] - 1.45, p[1]) for p in q['shrubs']]
    for p, e in zip(posts, posts[1:]):
        bar(b, (p[0], .62, p[1]), ((p[0] + e[0]) / 2, .5, (p[1] + e[1]) / 2), .012, (.25, .26, .27), 'ART_Chain', 3)
        bar(b, ((p[0] + e[0]) / 2, .5, (p[1] + e[1]) / 2), (e[0], .62, e[1]), .012, (.25, .26, .27), 'ART_Chain', 3)
    for p in posts:
        cylinder(b, (p[0], .01, p[1]), (p[0], .7, p[1]), .035, 'ART_Timber', segments=5)
    for i, (x, z) in enumerate(q['shrubs'] + q['leftShrubs']):
        _tuft(b, (x, .68, z), (1.16, .62, 1.16), i, 'HK_LeafDark', 8640 + i, not b.distant)
    for i, (x, z) in enumerate(q['steles']):
        at = lambda u, y, o: (x + u, y, z + o)
        box(b, at, 0, 0, 1.7, .9, .15, .42, 'ART_StoneLight', (.68, .67, .62))
        box(b, at, 0, 0, 1.25, .36, .42, 1.55, 'ART_StoneLight', (.80, .79, .74))
    for x, z in q['palms']:
        palm(b, x, z, 4.6)
    for i, (x, z) in enumerate(along([tuple(p) for p in q['hedge']], 2)):
        spray(b, (x, 1.5, z), (2.1, 1.9, 2.1), i, 'HK_LeafDark', 8650 + i, not b.distant)
    # Dark direction post at the west corner; destinations are read from 0865.
    x, z = q['directions']
    at = lambda u, y, o: (x + o, y, z - u)
    cylinder(b, (x, .01, z), (x, 2.4, z), .05, 'ART_Timber', segments=6)
    for side in (1, -1):
        board = lambda u, y, o: at(-u * side, y, o * side)
        rect(b, board, -.55, 1.15, 1.1, 1.05, (.13, .14, .16), .07)
        for text, y, colour in (('大手門', 1.9, WHITE), ('彦根駅', 1.62, WHITE), ('バスP', 1.34, WHITE)):
            label(b, board, text, -.47, y, .62, .17, colour, .08)
        rect(b, board, .24, 1.25, .24, .8, (.92, .77, .20), .075)


def furniture(b):
    from nishi_school import data as nishi
    cypress_screen(b)
    nishi_cypress(b)
    junction_bed(b)
    villa(b)
    nishi_details(b)
    samurai_wall(b)
    rampart(b)
    school_planting(b)
    for item in nishi()['walls']:
        ring = item['outline']
        centre = (sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring))
        for i, (a, c) in enumerate(zip(ring, ring[1:] + ring[:1])):
            if math.dist(a, c) > 3:
                ivy(b, a, c, item['height'], centre, 8550 + i)


def hill_wood(b):
    """A closed canopy over the castle hill: each crown a scalloped mass of a different green."""
    from castle_approach import data as approach, hill_height
    from vegetation import _tuft
    b.abstract = True
    d = approach()
    rng = random.Random(1622)
    segments = [(p, q) for route in d['paths']['routes'] for p, q in zip(route['points'], route['points'][1:])]
    keep = [(d['castle']['x'], d['castle']['z'], 42)] + [(c['x'], c['z'], 24) for c in d['compound']]
    def near_path(x, z):
        for a, c in segments:
            dx, dz = c[0] - a[0], c[2] - a[2]
            t = max(0, min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / max(1e-6, dx * dx + dz * dz)))
            if math.hypot(x - a[0] - dx * t, z - a[2] - dz * t) < 10:
                return True
        return False
    terraces = [t['footprint'] for t in d['terraces']]
    def point_inside(x, z, ring):
        hit = False
        for (ax, az), (cx, cz) in zip(ring, ring[1:] + ring[:1]):
            if (az > z) != (cz > z) and x < ax + (z - az) * (cx - ax) / (cz - az):
                hit = not hit
        return hit
    step = 10
    count = 0
    for i in range(int(-720 / step), int(140 / step)):
        for j in range(int(230 / step), int(680 / step)):
            x, z = i * step + rng.uniform(-4, 4), j * step + rng.uniform(-4, 4)
            y = hill_height(x, z)
            if y < 2.2 or near_path(x, z) or any(math.hypot(x - p, z - q) < r for p, q, r in keep):
                continue
            if any(point_inside(x, z, t) for t in terraces):
                continue
            rx, ry = rng.uniform(4.6, 7), rng.uniform(4.5, 6.5)
            material = rng.choice(('HK_LeafDark', 'HK_LeafDeep', 'HK_LeafDeep', 'HK_LeafDeep'))
            _tuft(b, (x, y + ry + 2.6, z), (rx, ry, rx * rng.uniform(.85, 1.1)), rng.uniform(0, math.tau), material, 16000 + count, False)
            # Small billows break the crown's outline, as evergreen oak canopy does.
            for k in range(5):
                a, reach = rng.uniform(0, math.tau), rng.uniform(.55, .95)
                top = (x + math.cos(a) * rx * reach, y + ry * (2.4 - reach * rng.uniform(.5, .9)) + 2.6, z + math.sin(a) * rx * reach)
                scale = rng.uniform(.3, .46)
                _tuft(b, top, (rx * scale, ry * scale * .85, rx * scale), rng.uniform(0, math.tau), material, 26000 + count * 6 + k, False)
            count += 1
    print('HILL_WOOD crowns', count, flush=True)
    return b
