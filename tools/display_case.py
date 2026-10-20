"""Kyobashi's glazed display case, authored from the owner's close-up photograph.

Local coordinates are Unity metres; dimensions are estimates, not a measured survey.
The clear panes, worn timber, sheet metal and printed glass graphic remain mesh-native.
"""
import json
import math
import os

from abstract_props import face

WOOD, METAL, ROOF, INK = 'ART_DisplayTimber', 'ART_DisplayMetal', 'ART_DisplayRoof', 'ART_DisplayInk'
WHITE, BLACK = (0.95, 0.96, 0.93), (0.08, 0.13, 0.14)
ORANGE, GREEN, BLUE = (0.88, 0.58, 0.27), (0.12, 0.53, 0.28), (0.08, 0.59, 0.72)
_lettering = None


def graphic(b, outline, color, z):
    # Outline x is the reader's left-to-right direction, mirrored into Unity coordinates.
    points = [(-x, y, z) for x, y in outline]
    area = sum(a[0] * c[1] - c[0] * a[1] for a, c in zip(points, points[1:] + points[:1]))
    if area < 0:
        points.reverse()
    face(b, points, INK, pigment=color)


def ribbon(b, path, width, color, z):
    for a, c in zip(path, path[1:]):
        dx, dy = c[0] - a[0], c[1] - a[1]
        length = math.hypot(dx, dy)
        nx, ny = -dy / length * width / 2, dx / length * width / 2
        graphic(b, [(a[0] + nx, a[1] + ny), (c[0] + nx, c[1] + ny),
                    (c[0] - nx, c[1] - ny), (a[0] - nx, a[1] - ny)], color, z)


def lettering(b, key, center, y, width, height, z, shadow=False):
    global _lettering
    if _lettering is None:
        with open(os.path.join(os.path.dirname(__file__), 'reference', 'display-case-lettering.json')) as f:
            _lettering = json.load(f)['lines']
    line = _lettering[key]
    points = [(center + (u - 0.5) * width, y + v * height) for u, v in line['points']]
    if shadow:
        for triangle in line['triangles']:
            graphic(b, [(points[i][0] + 0.002, points[i][1] - 0.002) for i in triangle], BLACK, z)
    for triangle in line['triangles']:
        graphic(b, [points[i] for i in triangle], WHITE, z + 0.001)


def campaign(b, z):
    # Readable in the photo: castle/striped oval, green leaf, cyan river and white lettering.
    cx, cy, rx, ry = -0.12, 1.56, 0.17, 0.285
    segments = 20 if b.distant else 32
    oval = [(cx + rx * math.cos(i * math.tau / segments), cy + ry * math.sin(i * math.tau / segments))
            for i in range(segments)]
    graphic(b, oval, WHITE, z)
    # An opaque white backing makes the reverse of the applied logo legible as a sticker.
    face(b, [(-x, y, z - 0.002) for x, y in oval], INK, pigment=WHITE)
    for i in range(8):
        lo = cy - ry + 0.018 + i * 0.07
        hi = min(cy + ry - 0.006, lo + 0.034)
        xl, xh = [rx * math.sqrt(max(0, 1 - ((y - cy) / ry) ** 2)) - 0.006 for y in (lo, hi)]
        graphic(b, [(cx - xl, lo), (cx + xl, lo), (cx + xh, hi), (cx - xh, hi)], ORANGE, z + 0.002)
    # White stepped walls and dark sweeping eaves reproduce the printed keep silhouette.
    graphic(b, [(cx - 0.077, 1.30), (cx + 0.075, 1.30), (cx + 0.075, 1.51),
                (cx + 0.052, 1.68), (cx + 0.022, 1.77), (cx - 0.025, 1.77),
                (cx - 0.054, 1.68), (cx - 0.077, 1.51)], WHITE, z + 0.003)
    for y, width in ((1.43, 0.19), (1.52, 0.17), (1.61, 0.145), (1.70, 0.105), (1.77, 0.065)):
        ribbon(b, [(cx - width / 2, y), (cx - width * 0.23, y + 0.018),
                   (cx, y + 0.048), (cx + width * 0.23, y + 0.018), (cx + width / 2, y)],
               0.011, BLACK, z + 0.004)
    for y, count in ((1.36, 4), (1.46, 3), (1.55, 3), (1.64, 2), (1.72, 1)):
        for i in range(count):
            x = cx + (i - (count - 1) / 2) * 0.033
            graphic(b, [(x - 0.007, y), (x + 0.007, y), (x + 0.007, y + 0.028), (x - 0.007, y + 0.028)], BLACK, z + 0.005)
    # The leaf overlaps the lower-right portion of the orange oval and castle.
    leaf = [(cx - 0.012, 1.32), (cx + 0.045, 1.335), (cx + 0.105, 1.39),
            (cx + 0.14, 1.48), (cx + 0.145, 1.58), (cx + 0.09, 1.555),
            (cx + 0.04, 1.495), (cx + 0.005, 1.40)]
    graphic(b, leaf, GREEN, z + 0.006)
    graphic(b, [(cx - 0.075, 1.32), (cx - 0.018, 1.31), (cx + 0.05, 1.32),
                (cx + 0.025, 1.35), (cx - 0.02, 1.37)], (0.60, 0.72, 0.33), z + 0.007)
    # Rounded double bend in the river mark, kept as a flat printed ribbon.
    controls = [((-0.32, 1.24), (-0.10, 1.24), (0.04, 1.24), (0.04, 1.195)),
                ((0.04, 1.195), (0.04, 1.15), (-0.12, 1.20), (-0.12, 1.15)),
                ((-0.12, 1.15), (-0.12, 1.115), (-0.03, 1.125), (0.16, 1.125))]
    river = []
    steps = 4 if b.distant else 10
    for curve in controls:
        for i in range(steps):
            t = i / steps
            weights = ((1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t * t, t ** 3)
            river.append(tuple(sum(p[axis] * weight for p, weight in zip(curve, weights)) for axis in range(2)))
    river.append(controls[-1][-1])
    ribbon(b, river, 0.026, WHITE, z + 0.003)
    ribbon(b, river, 0.016, BLUE, z + 0.004)
    lettering(b, 'year', -0.08, 0.83, 0.43, 0.105, z + 0.005)
    if not b.distant:
        lettering(b, 'town', -0.10, 1.005, 0.65, 0.066, z + 0.005, shadow=True)
        lettering(b, 'campaign', 0, 0.65, 1.15, 0.118, z + 0.005)


def display_kiosk(b):
    w, d = 1.42, 1.04
    bottom, top = 0.53, 1.985
    mid, height = (bottom + top) / 2, top - bottom
    solid = lambda center, size, material: b.box(center, size, material, strokes=False)
    # Flattened irregular stone pads support the full-length weathered posts.
    for sx in (-1, 1):
        for sz in (-1, 1):
            x, z = sx * (w / 2 - 0.04), sz * (d / 2 - 0.04)
            stone = []
            for y, radius in ((0.004, 0.105), (0.036, 0.125), (0.08, 0.09)):
                stone.append([(x + math.cos(i * math.tau / 8) * radius * (1 + (i % 3 - 1) * 0.10),
                               y, z + math.sin(i * math.tau / 8) * radius * 0.85) for i in range(8)])
            for lower, upper in zip(stone, stone[1:]):
                for i in range(8):
                    j = (i + 1) % 8
                    face(b, [lower[i], upper[i], upper[j], lower[j]], 'ART_StoneLight')
            face(b, stone[0], 'ART_StoneLight')
            face(b, list(reversed(stone[-1])), 'ART_StoneLight')
            solid((x, 1.035, z), (0.075, 1.99, 0.075), WOOD)
            # Narrow worn fibres follow the timber; no pale lattice crosses the glazing.
            for i in range(3 if b.distant else 10):
                y = 0.16 + i * (0.56 if b.distant else 0.18)
                offset = (i % 3 - 1) * 0.018
                length = min(0.28 + (i % 4) * 0.045, 2.015 - y)
                color = (0.59 + (i % 2) * 0.05, 0.55, 0.46)
                for points in ([(x + offset - 0.003, y, z + sz * 0.038), (x + offset + 0.004, y + 0.025, z + sz * 0.038),
                                (x + offset + 0.002, y + length, z + sz * 0.038), (x + offset - 0.002, y + length - 0.04, z + sz * 0.038)],
                               [(x + sx * 0.038, y, z + offset - 0.003), (x + sx * 0.038, y + 0.02, z + offset + 0.004),
                                (x + sx * 0.038, y + length, z + offset + 0.002), (x + sx * 0.038, y + length - 0.03, z + offset - 0.002)]):
                    face(b, points, WOOD, pigment=color)
    solid((0, 0.29, 0), (w - 0.08, 0.36, d - 0.08), METAL)
    # Shallow pressed-metal ribs, with lighter upper lips and darker undersides.
    for i in range(0, 14, 2 if b.distant else 1):
        y = 0.13 + i * 0.024
        for side in (-1, 1):
            for dy, color in ((0, (0.76, 0.78, 0.75)), (-0.006, (0.37, 0.42, 0.41))):
                face(b, [(-w / 2 + 0.07, y + dy, side * (d / 2 - 0.035)), (w / 2 - 0.07, y + dy, side * (d / 2 - 0.035)),
                         (w / 2 - 0.07, y + dy + 0.004, side * (d / 2 - 0.035)), (-w / 2 + 0.07, y + dy + 0.004, side * (d / 2 - 0.035))], METAL, pigment=color)
                face(b, [(side * (w / 2 - 0.035), y + dy, -d / 2 + 0.07), (side * (w / 2 - 0.035), y + dy, d / 2 - 0.07),
                         (side * (w / 2 - 0.035), y + dy + 0.004, d / 2 - 0.07), (side * (w / 2 - 0.035), y + dy + 0.004, -d / 2 + 0.07)], METAL, pigment=color)
    solid((0, 0.095, 0), (w, 0.085, d), WOOD)
    solid((0, 0.50, 0), (w, 0.075, d), WOOD)
    for side in (-1, 1):
        for i in range(3 if b.distant else 6):
            x = -0.59 + i * (0.42 if b.distant else 0.22)
            face(b, [(x, 0.474, side * (d / 2 + 0.001)), (x + 0.15, 0.477, side * (d / 2 + 0.001)),
                     (x + 0.12, 0.494, side * (d / 2 + 0.001)), (x + 0.02, 0.488, side * (d / 2 + 0.001))],
                 WOOD, pigment=(0.43, 0.43, 0.34))
    solid((0, 0.542, 0), (w - 0.15, 0.014, d - 0.15), WOOD)
    solid((0, 2.005, 0), (w + 0.015, 0.075, d + 0.015), WOOD)
    # Large uninterrupted panes, seated in thin metal channels inside the heavy wood frame.
    for side in (-1, 1):
        z = side * (d / 2 - 0.04)
        b.face([(-w / 2 + 0.075, bottom, z), (w / 2 - 0.075, bottom, z),
                (w / 2 - 0.075, top, z), (-w / 2 + 0.075, top, z)],
               'ART_DisplayGlass', strokes=False, pigment=(0.82, 0.91, 0.87))
        x = side * (w / 2 - 0.04)
        b.face([(x, bottom, -d / 2 + 0.075), (x, bottom, d / 2 - 0.075),
                (x, top, d / 2 - 0.075), (x, top, -d / 2 + 0.075)],
               'ART_DisplayGlass', strokes=False, pigment=(0.82, 0.91, 0.87))
        for edge in (-1, 1):
            solid((side * (w / 2 - 0.08), mid, edge * (d / 2 - 0.039)), (0.012, height, 0.012), METAL)
    campaign(b, d / 2 - 0.037)
    # Broad, shallow sheet-metal roof; its front fascia follows the photographed thin drip edge.
    hw, eave, ridge, over = w / 2 + 0.16, 2.025, 2.235, d / 2 + 0.16
    for side in (-1, 1):
        upper = [(-hw, eave, side * over), (hw, eave, side * over), (hw, ridge, 0), (-hw, ridge, 0)]
        for points, material in ((upper, ROOF), ([(x, y - 0.024, z) for x, y, z in upper], WOOD)):
            face(b, points, material)
            face(b, list(reversed(points)), material)
        solid((0, eave - 0.008, side * over), (hw * 2, 0.028, 0.024), ROOF)
        for seam in (-0.45, 0.45):
            face(b, [(seam - 0.003, eave + 0.001, side * over), (seam + 0.003, eave + 0.001, side * over),
                     (seam + 0.003, ridge + 0.001, 0), (seam - 0.003, ridge + 0.001, 0)], ROOF, pigment=(0.48, 0.53, 0.52))
    for side in (-1, 1):
        x = side * (w / 2 - 0.005)
        face(b, [(x, eave - 0.03, -over + 0.10), (x, eave - 0.03, over - 0.10), (x, ridge - 0.025, 0)], WOOD)
        face(b, [(x, ridge - 0.025, 0), (x, eave - 0.03, over - 0.10), (x, eave - 0.03, -over + 0.10)], WOOD)
    solid((0, ridge - 0.003, 0), (hw * 2, 0.025, 0.046), ROOF)
