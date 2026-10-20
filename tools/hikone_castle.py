"""Hikone's three-storey keep and its distant wooded hill, authored from Maps and city references.

Unity metres, +Z towards the keep's south-facing courtyard. Broad plaster, irregular stonework,
curved tiled eaves and the gable silhouette matter; interiors and individual tiles are omitted.
"""
import math
import random
from abstract_props import face, cylinder
from streetscape import outward_face

MODELS = ('ART_HikoneKeep', 'HK_Terrain_Hikone', 'ART_HikoneCompound')


def box(b, center, size, material, transform=lambda p: p):
    # Simple closed blocks, with painted planes rather than hundreds of tiny bevel faces.
    x, y, z = center
    w, h, d = (v / 2 for v in size)
    points = [(x + i, y + j, z + k) for i in (-w, w) for j in (-h, h) for k in (-d, d)]
    for ids in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (1, 5, 7, 3), (0, 2, 6, 4)):
        pts = [transform(points[i]) for i in ids]
        outward_face(b, pts, material, transform(center))


def facade_transform(side, depth):
    a = side * math.pi / 2
    def transform(p):
        x, y, z = p
        z += depth
        return (x * math.cos(a) + z * math.sin(a), y, -x * math.sin(a) + z * math.cos(a))
    return transform


def polyline(b, points, radius, material, transform=lambda p: p, segments=6):
    for a, c in zip(points, points[1:]):
        cylinder(b, a, c, radius, material, segments=segments, transform=transform)


def place_section(b, start, yaw, pivot):
    # Apply a local Unity transform to a just-authored section before the normal GLB export.
    a = yaw * math.pi / 180
    for i in range(start, len(b.vertices)):
        vx, vz, vy = b.vertices[i]
        x, z = -vx, -vz
        px = pivot[0] + x * math.cos(a) + z * math.sin(a)
        pz = pivot[2] - x * math.sin(a) + z * math.cos(a)
        b.vertices[i] = (-px, -pz, vy + pivot[1])


def roof(b, width, depth, eave, rise, x=0, z=0):
    # Irimoya: a hipped lower skirt with vertical triangular ends and two upper gable slopes.
    # The same profile is retained in the distant model to preserve the distinctive eaves.
    half, hd = width / 2, depth / 2
    inset = depth * 0.23
    inner = half - inset
    middle = eave + rise * 0.49
    def point(px, pz, py):
        return (px + x, py + 0.48 * (abs(px) / half) ** 4 + 0.16 * (abs(pz) / hd) ** 4, pz + z)
    perimeter = [point(-half, hd, eave), point(half, hd, eave), point(half, -hd, eave), point(-half, -hd, eave)]
    upper = [point(-inner, hd * 0.50, middle), point(inner, hd * 0.50, middle),
             point(inner, -hd * 0.50, middle), point(-inner, -hd * 0.50, middle)]
    ridge = [(x - inner, eave + rise, z), (x + inner, eave + rise, z)]
    inside = (x, eave - 0.1, z)
    for i in range(4):
        j = (i + 1) % 4
        # Evaluate the lifted eave along its span, rather than joining lifted corners by a
        # straight line. Three rows give the slope its concave sweep without modelling tiles.
        raw_edge = [(-half, eave, hd), (half, eave, hd), (half, eave, -hd), (-half, eave, -hd)]
        raw_top = [(-inner, middle, hd * 0.5), (inner, middle, hd * 0.5),
                   (inner, middle, -hd * 0.5), (-inner, middle, -hd * 0.5)]
        mix = lambda a, c, t: tuple(a[k] + (c[k] - a[k]) * t for k in range(3))
        def surface(u, v):
            edge = mix(raw_edge[i], raw_edge[j], u)
            top = mix(raw_top[i], raw_top[j], u)
            px, _, pz = mix(edge, top, v)
            return point(px, pz, eave + (middle - eave) * v ** 1.18)
        columns, rows = (6, 1) if b.distant else (12, 3)
        for column in range(columns):
            u, v = column / columns, (column + 1) / columns
            for row in range(rows):
                a, c = row / rows, (row + 1) / rows
                outward_face(b, [surface(u, a), surface(v, a), surface(v, c), surface(u, c)], 'HK_RoofTile', inside)
            a, c = surface(u, 0), surface(v, 0)
            ba, bc = (a[0], a[1] - 0.20, a[2]), (c[0], c[1] - 0.20, c[2])
            outward_face(b, [a, ba, bc, c], 'HK_PlasterWarm', inside)
            ia = (x + (a[0] - x) * 0.82, eave - 0.20, z + (a[2] - z) * 0.82)
            ic = (x + (c[0] - x) * 0.82, eave - 0.20, z + (c[2] - z) * 0.82)
            outward_face(b, [ba, bc, ic, ia], 'HK_PlasterWarm', (x, eave + rise, z))
            cylinder(b, a, c, 0.09, 'HK_RoofRidge', segments=4)
    outward_face(b, upper[:2] + [ridge[1], ridge[0]], 'HK_RoofTile', inside)
    outward_face(b, [upper[2], upper[3], ridge[0], ridge[1]], 'HK_RoofTile', inside)
    outward_face(b, [upper[3], upper[0], ridge[0]], 'HK_Plaster', inside)
    outward_face(b, [upper[1], upper[2], ridge[1]], 'HK_Plaster', inside)
    outward_face(b, [(x + (p[0] - x) * 0.82, eave - 0.20, z + (p[2] - z) * 0.82)
                     for p in perimeter], 'HK_PlasterWarm', (x, eave + rise, z))
    for a, c in ((ridge[0], ridge[1]), (perimeter[0], upper[0]), (perimeter[1], upper[1]),
                 (perimeter[2], upper[2]), (perimeter[3], upper[3]), (upper[0], ridge[0]),
                 (upper[3], ridge[0]), (upper[1], ridge[1]), (upper[2], ridge[1])):
        cylinder(b, a, c, 0.12, 'HK_RoofRidge', segments=6)
    if not b.distant:
        # Sparse tile rolls indicate direction; individual tiles would be invisible from Kyobashi.
        for n in range(-int(half / 0.7), int(half / 0.7) + 1):
            px = n * 0.7
            for side in (-1, 1):
                a = point(px, side * hd, eave + 0.03)
                c = point(max(-inner, min(inner, px)), side * hd * 0.5, middle + 0.03)
                cylinder(b, a, c, 0.025, 'HK_RoofRidge', segments=4)


def gable(b, width, y, height, depth, transform, curved=False):
    # Chidori triangular pediments and undulating karahafu share a closed, shallow roof volume.
    columns = 16 if curved else 8
    profile = []
    for i in range(columns + 1):
        x = (i / columns - 0.5) * width
        u = abs(2 * x / width)
        rise = (math.cos(u * math.pi / 2) ** 2 * (1 - 0.35 * math.sin(u * math.pi))
                + 0.13 * u ** 5) if curved else 1 - u + 0.10 * u ** 5
        profile.append((x, y + height * rise, 0))
    inside = transform((0, y + 0.1, -depth / 2))
    infill = [(-width / 2, y, 0)] + profile + [(width / 2, y, 0)]
    outward_face(b, [transform(p) for p in infill], 'HK_Plaster', inside)
    back = [(x, py + 0.12, -depth) for x, py, _ in profile]
    for a, c, r, s in zip(profile, profile[1:], back[1:], back):
        outward_face(b, [transform(p) for p in (a, c, r, s)], 'HK_RoofTile', inside)
        lower_a, lower_c = (a[0], a[1] - 0.16, a[2]), (c[0], c[1] - 0.16, c[2])
        outward_face(b, [transform(p) for p in (a, lower_a, lower_c, c)], 'HK_WoodDark', inside)
    for end in (0, -1):
        x, py, _ = profile[end]
        outward_face(b, [transform(p) for p in ((x, y, 0), (x, py, 0), (x, py + 0.12, -depth), (x, y, -depth))], 'HK_RoofTile', inside)
    if b.distant:
        for a, c in zip(profile, profile[1:]):
            points = [(a[0], a[1] + 0.08, 0.07), (a[0], a[1] - 0.18, 0.07),
                      (c[0], c[1] - 0.18, 0.07), (c[0], c[1] + 0.08, 0.07)]
            face(b, points, 'HK_RoofRidge', transform)
    else:
        polyline(b, [(x, py + 0.03, 0.06) for x, py, _ in profile], 0.13, 'HK_RoofRidge', transform)
        polyline(b, [(x * 0.92, py - 0.22, 0.035) for x, py, _ in profile], 0.065, 'HK_Plaster', transform)
    if curved:
        cylinder(b, (0, y + height - 0.32, 0.06), (0, y + height - 0.32, 0.105), 0.16,
                 'HK_Gold', segments=8, transform=transform)


def window(b, x, y, width, height, transform, bell=False):
    if bell:
        outline = [(-0.5, 0), (-0.5, 0.67), (-0.43, 0.88), (-0.26, 1.0),
                   (-0.12, 1.06), (0, 1.18), (0.12, 1.06), (0.26, 1.0), (0.43, 0.88), (0.5, 0.67), (0.5, 0)]
        pts = [(x + u * width, y + v * height, 0.055) for u, v in outline]
        face(b, list(reversed(pts)), 'HK_WoodDark', transform)
        if not b.distant: polyline(b, pts + [pts[0]], 0.07, 'HK_WoodDark', transform)
    else:
        box(b, (x, y + height / 2, 0.04), (width, height, 0.07), 'HK_WoodDark', transform)
    for dx in (() if b.distant else (-width * 0.28, 0, width * 0.28)):
        box(b, (x + dx, y + height * 0.43, 0.09), (0.045, height * 0.8, 0.045), 'HK_WoodMid', transform)


def stone_base(b):
    rng = random.Random(8307)
    def edge(u, t, side):
        inset = 1 - (1 - t) ** 1.45
        w, d = 12.4 - 2.15 * inset, 11.35 - 1.95 * inset
        if side == 0: return ((2 * u - 1) * w, 5.2 * t, d)
        if side == 1: return (w, 5.2 * t, (1 - 2 * u) * d)
        if side == 2: return ((1 - 2 * u) * w, 5.2 * t, -d)
        return (-w, 5.2 * t, (2 * u - 1) * d)
    rows, columns = (4, 6) if b.distant else (6, 9)
    for side in range(4):
        for row in range(rows):
            cuts = [0] + sorted((i + rng.uniform(-0.2, 0.2)) / columns for i in range(1, columns)) + [1]
            for left, right in zip(cuts, cuts[1:]):
                # Pigment seams follow the battered wall; no floating individual stone boxes.
                points = [edge(left, row / rows, side), edge(right, row / rows, side),
                          edge(right, (row + 1) / rows, side), edge(left, (row + 1) / rows, side)]
                pigment = 'HK_Stone' if rng.random() < 0.28 else 'ART_StoneLight'
                if b.distant:
                    outward_face(b, points, pigment, (0, 2.6, 0))
                else:
                    outward_face(b, points, 'HK_StoneDark', (0, 2.6, 0))
                    width = right - left
                    outline = [(0.04, 0.18), (0.15, 0.035), (0.84, 0.04), (0.97, 0.21),
                               (0.96, 0.80), (0.80, 0.97), (0.18, 0.95), (0.035, 0.78)]
                    normal = [(0, 0, 1), (1, 0, 0), (0, 0, -1), (-1, 0, 0)][side]
                    rock = []
                    for u, v in outline:
                        p = edge(left + width * (u + rng.uniform(-0.018, 0.018)),
                                 (row + v + rng.uniform(-0.015, 0.015)) / rows, side)
                        rock.append(tuple(p[k] + normal[k] * 0.025 for k in range(3)))
                    outward_face(b, rock, pigment, (0, 2.6, 0))
    box(b, (0, 5.14, 0), (20.5, 0.12, 18.8), 'HK_Stone')
    box(b, (0, 0.03, 0), (24.8, 0.06, 22.7), 'HK_StoneDark')


def keep(b):
    stone_base(b)
    for width, depth, bottom, top in ((17.8, 15.6, 5.2, 9.4), (12.8, 11.2, 10.1, 14.0), (8.6, 7.6, 14.7, 18.2)):
        box(b, (0, (bottom + top) / 2, 0), (width, top - bottom, depth), 'HK_Plaster')
        if bottom == 5.2:
            box(b, (0, 5.75, 0), (width + 0.04, 1.10, depth + 0.04), 'HK_WoodDark')
        for side in range(4):
            span, reach = (width, depth / 2) if side % 2 == 0 else (depth, width / 2)
            transform = facade_transform(side, reach + 0.025)
            for x in (-span * 0.28, span * 0.28):
                window(b, x, bottom + 0.85, 1.8 if bottom == 5.2 else 1.35 if bottom < 14 else 1.2,
                       0.95 if bottom == 5.2 else 1.4,
                       transform, bell=bottom > 9)
            if not b.distant and bottom == 5.2:
                for x in range(-int(span / 2), int(span / 2) + 1):
                    box(b, (x, 5.75, 0.04), (0.055, 1.05, 0.055), 'HK_WoodMid', transform)
    roof(b, 21.0, 18.8, 9.3, 3.3)
    roof(b, 15.9, 14.0, 13.9, 2.7)
    roof(b, 11.2, 10.5, 18.0, 2.7)
    # The broad first-storey chidori and the second-storey curved pediments make Hikone's profile.
    for side in (0, 2):
        gable(b, 11.4, 9.52, 3.7, 4.1, facade_transform(side, 9.35))
        gable(b, 8.1, 14.08, 2.7, 3.4, facade_transform(side, 7.0))
        gable(b, 5.3, 18.15, 1.65, 1.5, facade_transform(side, 5.22), curved=True)
    for side in (1, 3):
        gable(b, 8.5, 9.58, 3.05, 4.3, facade_transform(side, 10.45))
        gable(b, 5.5, 14.12, 1.85, 3.8, facade_transform(side, 7.9), curved=True)
    for side in range(4):
        reach = 4.1 if side % 2 == 0 else 4.6
        transform = facade_transform(side, reach)
        # Corner verandas, with an open centre rather than a continuous invented wraparound deck.
        span = 4.5 if side % 2 == 0 else 3.7
        for sign in (-1, 1):
            a, c = sign * (span - 1.7), sign * span
            box(b, ((a + c) / 2, 14.88, 0), (1.9, 0.16, 0.55), 'HK_WoodDark', transform)
            for y in (15.12, 15.62):
                cylinder(b, (a, y, 0.25), (c, y, 0.25), 0.055, 'HK_WoodDark', segments=6, transform=transform)
            for t in (0, 0.5, 1):
                x = a + (c - a) * t
                cylinder(b, (x, 14.96, 0.25), (x, 15.68, 0.25), 0.045, 'HK_WoodDark', segments=6, transform=transform)
    # Restrained paired shachi silhouettes on the highest ridge.
    for sign in (-1, 1):
        x = sign * (5.6 - 10.5 * 0.23)
        polyline(b, [(x, 20.70, 0), (x + sign * 0.18, 21.02, 0),
                     (x + sign * 0.06, 21.38, 0), (x - sign * 0.16, 21.55, 0)], 0.12, 'HK_RoofRidge')
    # The satellite plan shows a square attached turret at the north corner, then a long wing
    # turning towards the east. It does not share the keep's diagonal roof axis.
    box(b, (7.8, 2, -8.3), (8.0, 4.0, 7.8), 'HK_Stone')
    box(b, (7.8, 5.8, -8.3), (7.8, 3.6, 7.6), 'HK_Plaster')
    roof(b, 9.0, 8.8, 7.7, 2.2, x=7.8, z=-8.3)
    start = len(b.vertices)
    box(b, (-11, 2, -0.4), (22.2, 4.0, 7.0), 'HK_Stone')
    box(b, (-11, 5.55, -0.4), (22.0, 3.1, 6.6), 'HK_Plaster')
    roof(b, 23.5, 8.0, 7.2, 1.9, x=-11, z=-0.4)
    for x in (-20, -15.5, -11, -6.5, -2):
        window(b, x, 4.65, 0.65, 0.95, facade_transform(0, 2.92))
    place_section(b, start, -37, (8, 0, -9))


def hill(b):
    from castle_approach import data, hill_surface, hill_height
    site = data()['castle']
    for triangle, cap in hill_surface()[1]:
        points = [(x - site['x'], y, z - site['z']) for x, y, z in triangle]
        # Terraces make the hill concave. Orient each height-field triangle upward;
        # a single point under the summit can flip the sides of a lower courtyard.
        below = tuple(sum(p[k] for p in points) / 3 - (1 if k == 1 else 0) for k in range(3))
        # Slope vegetation is not a tree-leaf shell. Broad, quiet soil/ground-cover
        # pigments and shared smooth normals remove the old giant green facets.
        outward_face(b, points, 'ART_StoneLight' if cap else 'HK_Grass', below)
        if not cap:
            b.smooth[-1] = True
            mx, my, mz = (sum(p[k] for p in triangle) / 3 for k in range(3))
            shade = 0.5 + 0.25 * math.sin(mx / 19 + mz / 27) + 0.25 * math.sin(mz / 13 - mx / 35)
            b.pigments[-1] = (0.38 + 0.10 * shade, 0.46 + 0.10 * shade, 0.30 + 0.07 * shade)
    # A jittered woodland replaces radial rows of 30 m canopy balls. Each tree is supported
    # by the shared hill surface; primary boughs remain visible between smaller leaf sprays.
    from vegetation import tree
    from castle_paths import segments, distance
    rng = random.Random(1606)
    bank = data()['innerBank'] + data()['northBank']
    def inside(x, z, polygon):
        return sum((a[1] > z) != (c[1] > z) and
                   x < a[0] + (c[0] - a[0]) * (z - a[1]) / (c[1] - a[1])
                   for a, c in zip(polygon, polygon[1:] + polygon[:1])) % 2
    i = 0
    spacing = 22
    for row in range(math.ceil((max(z for x, z in bank) - min(z for x, z in bank)) / spacing)):
        for col in range(math.ceil((max(x for x, z in bank) - min(x for x, z in bank)) / spacing)):
            x = min(x for x, z in bank) + col * spacing + rng.uniform(2, spacing - 2)
            z = min(z for x, z in bank) + row * spacing + rng.uniform(2, spacing - 2)
            size, height = rng.uniform(6.2, 8.4), rng.uniform(11.5, 17.0)
            if not inside(x, z, bank) or any(inside(x, z, t['footprint']) for t in data()['terraces']):
                continue
            from castle_approach import point_segment_distance
            if min(point_segment_distance(x, z, a, c) for a, c in zip(bank, bank[1:] + bank[:1])) < size + 2:
                continue
            y = hill_height(x, z)
            # Trunks stay outside the path; high boughs can shade a lower path. A
            # grade-separated bridge still clears every crown at its own deck height.
            blocked = False
            for segment in segments():
                d, path_y = distance(segment, x, z)
                half = segment['route']['width'] / 2
                if d < half + 1.2 or (d < size * 1.8 + half + 1 and y + height * 0.42 < path_y + 1.9 < y + height * 1.2):
                    blocked = True
                    break
            if blocked:
                continue
            def near_building(item):
                a = item['yaw'] * math.pi / 180
                dx, dz = x - item['x'], z - item['z']
                u, v = dx * math.cos(a) - dz * math.sin(a), dx * math.sin(a) + dz * math.cos(a)
                return math.hypot(max(0, abs(u) - item['size'][0] / 2 - 5),
                                  max(0, abs(v) - item['size'][1] / 2 - 5)) < size * 1.8
            if any(near_building(item) for item in data()['compound']):
                continue
            tree(b, 'shii' if i % 3 == 0 else 'tabu', base=(x - site['x'], y, z - site['z']),
                 height=height, spread=size, seed=1606 + i * 37, lean=(rng.uniform(-1, 1), rng.uniform(-1, 1)), fine=False)
            i += 1


def build(name, mesh_class, lod=False):
    b = mesh_class(name)
    b.abstract = True
    b.distant = lod
    if name == 'ART_HikoneKeep': keep(b)
    elif name == 'ART_HikoneCompound':
        from castle_compound import compound
        compound(b)
    else: hill(b)
    return b
