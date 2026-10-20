"""Surviving Hikone castle buildings, painted as one distant batch.

The city heritage descriptions distinguish the three-storey Nishinomaru turret, paired
Tenbin corner turrets, Taikomon gate, reconstructed palace and low Sawaguchi wings.
Dimensions/elevations are visual approximations; no vanished gate is reconstructed.
"""
import math
from hikone_castle import box, roof, window, facade_transform, place_section
from streetscape import outward_face
from abstract_props import cylinder
from castle_approach import data


def hall(b, x, z, width, depth, bottom, height, rise=2.0, timber=True):
    top = bottom + height
    box(b, (x, bottom + height / 2, z), (width, height, depth), 'HK_Plaster')
    if timber:
        box(b, (x, bottom + 0.65, z), (width + 0.035, 1.3, depth + 0.035), 'HK_WoodDark')
    roof(b, width + 1.5, depth + 1.5, top - 0.12, rise, x=x, z=z)
    for side in range(4):
        span, reach = (width, depth / 2) if side % 2 == 0 else (depth, width / 2)
        start = len(b.vertices)
        transform = facade_transform(side, reach + 0.025)
        count = max(1, int(span / (6 if b.distant else 3.5)))
        for i in range(count):
            window(b, (i - (count - 1) / 2) * span / count, bottom + 1.6,
                   0.65, min(1, height - 1.8), transform)
        place_section(b, start, 0, (x, 0, z))


def turret(b, x, z, width, depth, levels, bottom=0):
    for level in range(levels):
        inset = level * 1.8
        hall(b, x, z, width - inset, depth - inset, bottom + level * 3.5, 3.8,
             2.5 if level == levels - 1 else 1.7, timber=level == 0)


def nishinomaru(b):
    # Two single-storey connecting wings flank the separate three-storey watchtower.
    turret(b, 0, 0, 12, 10, 3)
    hall(b, 13, 0, 15, 6, 0, 3.7)
    hall(b, 0, -11, 7, 12, 0, 3.7)


def tenbin(b):
    # A U-shaped balance: two two-storey ends joined by a lower gallery, open to the north.
    # Keep the central portal open all the way to the court behind the gallery.
    for x in (-8.5, 8.5):
        box(b, (x, 1.9, -1), (11, 3.8, 7), 'HK_Plaster')
        box(b, (x, 0.65, -1), (11.04, 1.3, 7.04), 'HK_WoodDark')
    box(b, (0, 3.35, -1), (6, 0.9, 7), 'HK_Plaster')
    roof(b, 29.5, 8.5, 3.68, 2)
    for x in (-11, -6, 6, 11):
        window(b, x, 1.6, 0.65, 1, facade_transform(2, 4.525))
    for x in (-15, 15):
        turret(b, x, 0, 8, 8, 2)
        hall(b, x, 6, 7, 6, 0, 3.8)
    # The shared path generator owns the deck and its height under the central opening.


def taikomon(b):
    # Open central portal beneath the upper gatehouse, with a low connecting wing.
    for x in (-4.8, 4.8):
        box(b, (x, 1.5, 0), (3.4, 3, 5.6), 'HK_WoodDark')
    hall(b, 0, 0, 13, 6, 3, 3.4, 2.3, timber=False)
    hall(b, 11.5, 0, 10, 5.5, 0, 3.6)


def omotegoten(b):
    # Interlocking low halls around courts, following the museum's tiled roof footprint.
    # The palace is at the foot of the hill, not another keep on the summit.
    for x, z, w, d in [(-10, 21, 15, 25), (7, 24, 18, 20), (-10, 0, 16, 18),
                        (9, 0, 17, 17), (-11, -21, 17, 25), (8, -23, 20, 22),
                        (0, -10, 35, 7), (-1, 10, 32, 6)]:
        hall(b, x, z, w, d, 0, 3.6, 2.6)


def sawaguchi(b):
    # The gate itself was removed in the Meiji era. Keep the gap between the two wings.
    hall(b, -10, 0, 28, 7, 0, 4.2)
    turret(b, -25, 0, 9, 8, 2)
    hall(b, 18, 12, 8, 26, 0, 4.2)


def retaining_walls(b, terrace):
    p, top = terrace['footprint'], terrace['floor']
    cx, cz = sum(x for x, z in p) / 4, sum(z for x, z in p) / 4
    site = data()['castle']
    for a, c in zip(p, p[1:] + p[:1]):
        length = math.dist(a, c)
        columns = max(2, round(length / (5 if b.distant else 2.5)))
        for row in range(3):
            for col in range(columns):
                from castle_paths import wall_open
                u = (col + 0.5) / columns
                if wall_open(a[0] + (c[0] - a[0]) * u, a[1] + (c[1] - a[1]) * u, top - 5, top):
                    continue
                pts = []
                for u, v in ((col / columns, row / 3), ((col + 1) / columns, row / 3),
                             ((col + 1) / columns, (row + 1) / 3), (col / columns, (row + 1) / 3)):
                    x, z = a[0] + (c[0] - a[0]) * u, a[1] + (c[1] - a[1]) * u
                    x, z = cx + (x - cx) * (1 + (1 - v) * 0.12), cz + (z - cz) * (1 + (1 - v) * 0.12)
                    pts.append((x - site['x'], top - 5 * (1 - v), z - site['z']))
                outward_face(b, pts, 'ART_StoneLight' if (row + col) % 3 else 'HK_Stone',
                             (cx - site['x'], top - 2.5, cz - site['z']))


def compound(b):
    site = data()['castle']
    builders = dict(nishinomaru=nishinomaru, tenbin=tenbin, taikomon=taikomon,
                    omotegoten=omotegoten, sawaguchi=sawaguchi)
    for item in data()['compound']:
        start = len(b.vertices)
        builders[item['id']](b)
        if item['id'] == 'omotegoten':
            # The observed palace is elongated along its NW/SE ridge, with low halls.
            for i in range(start, len(b.vertices)):
                x, z, y = b.vertices[i]
                b.vertices[i] = (x * 1.35, z * 1.45, y)
        place_section(b, start, item['yaw'], (item['x'] - site['x'], item['floor'], item['z'] - site['z']))
    for terrace in data()['terraces']:
        if terrace['floor'] > 1: retaining_walls(b, terrace)
    from castle_paths import mesh
    mesh(b)
