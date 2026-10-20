"""Local frontage and apron finishes observed beside the photographed display case.

The dimensions fit the existing map. Storefront details are shallow modelled recesses,
not surveyed interiors. The asphalt/stone finishes replace town-plot faces at 0.15 m.
"""
import json
import os

WOOD, PLASTER, STONE = 'ART_DisplayTimber', 'ART_ShopPlaster', 'ART_ShopStone'
APRON_FINISHES = (
    ('ART_ApronAsphalt', [(46.25, 14.9), (50.9, 14.9), (50.9, 18.25), (46.6, 18.25)]),
    (STONE, [(42.6, 14.9), (46.25, 14.9), (46.6, 17.35), (42.6, 17.35)]),
)


def pane(b, x, y, width, height, z, material='ART_DisplayGlass'):
    b.face([(x - width / 2, y - height / 2, z), (x + width / 2, y - height / 2, z),
            (x + width / 2, y + height / 2, z), (x - width / 2, y + height / 2, z)],
           material, strokes=False, pigment=(0.80, 0.87, 0.83) if material == 'ART_DisplayGlass' else None)


def lean_roof(b, width, front, back, eave, rise, transform=lambda p: p):
    """Thin tiled lean-to, sloping down from the wall rather than a second gable."""
    from abstract_props import face, cylinder
    upper = [(-width / 2, eave, front), (width / 2, eave, front),
             (width / 2, eave + rise, back), (-width / 2, eave + rise, back)]
    lower = [(x, y - 0.085, z) for x, y, z in upper]
    face(b, upper, 'ART_Tile', transform)
    face(b, list(reversed(lower)), WOOD, transform)
    for i in range(4):
        j = (i + 1) % 4
        face(b, [upper[i], lower[i], lower[j], upper[j]], 'ART_TileRidge', transform)
    if not b.distant:
        count = max(1, round(width / 0.23))
        for i in range(count + 1):
            x = -width / 2 + width * i / count
            cylinder(b, transform((x, eave + 0.012, front)),
                     transform((x, eave + rise + 0.012, back)), 0.026, 'ART_TileRidge', segments=6)
        for t in (0.32, 0.66):
            y, z = eave + rise * t + 0.024, front + (back - front) * t
            face(b, [transform((-width / 2, y, z - 0.012)), transform((width / 2, y, z - 0.012)),
                     transform((width / 2, y, z + 0.012)), transform((-width / 2, y, z + 0.012))], 'ART_TileRidge')
    # A continuous thin gutter and short drip brackets along the front edge.
    cylinder(b, transform((-width / 2, eave - 0.045, front + 0.012)),
             transform((width / 2, eave - 0.045, front + 0.012)), 0.032, 'ART_Chain', segments=8)


def upper_window(b, x, y, width, height):
    solid = lambda c, s, m: b.box(c, s, m, strokes=False)
    solid((x, y, -0.415), (width, height, 0.065), WOOD)
    for xx in (x - width / 2, x + width / 2):
        solid((xx, y, -0.35), (0.075, height + 0.12, 0.10), WOOD)
    for yy in (y - height / 2, y + height / 2):
        solid((x, yy, -0.35), (width + 0.12, 0.075, 0.10), WOOD)
    count = 6 if b.distant else 15
    for i in range(1, count):
        solid((x - width / 2 + width * i / count, y, -0.325), (0.022, height, 0.06), 'ART_ShopWoodWear')


def shop(b):
    from abstract_props import cylinder
    from streetscape import tiled_roof, window
    solid = lambda c, s, m: b.box(c, s, m, strokes=False)
    width, depth, height = 5.4, 9, 6.0
    # Recess the ground-floor backing, leaving the clear front windows in front of it.
    solid((0, 1.5, -5.0), (width, 3.0, 8.0), WOOD)
    solid((0, 4.45, -4.75), (width, 3.10, 8.5), PLASTER)
    solid((0, 0.09, -4.75), (width + 0.03, 0.18, 8.53), STONE)
    for x in (-2.62, -0.45, 0.67, 2.62):
        solid((x, 1.45, -0.39), (0.11, 2.9, 0.15), WOOD)
    for y in (0.23, 2.74):
        solid((0, y, -0.38), (width, 0.13, 0.16), WOOD)
    # The wide display window, narrow entrance and fixed pane behind the cabinet.
    for x, w in ((-1.53, 2.05), (0.10, 0.96), (1.64, 1.84)):
        pane(b, x, 1.48, w, 2.35, -0.36)
        solid((x, 0.29, -0.37), (w, 0.075, 0.10), WOOD)
    solid((-1.53, 2.27, -0.35), (2.05, 0.16, 0.012), 'ART_DisplayInk')
    solid((0.43, 1.35, -0.31), (0.035, 0.22, 0.055), 'ART_DisplayMetal')
    # A small timber lattice at the side of the entrance.
    for i in range(3 if b.distant else 7):
        solid((0.75 + i * (0.25 if b.distant else 0.09), 1.53, -0.40), (0.025, 2.32, 0.035), WOOD)
    # Shallow shelves and a few ceramic display silhouettes visible through the glazing.
    for y in (0.48, 1.02):
        solid((-1.53, y, -0.68), (1.96, 0.045, 0.43), 'ART_ShopWoodWear')
        for i in range(3 if b.distant else 6):
            x = -2.28 + i * (0.70 if b.distant else 0.29)
            solid((x, y + 0.11, -0.59), (0.14, 0.18, 0.12), 'ART_DisplayInk' if i % 3 else 'HK_NorenRed')
            if not b.distant:
                cylinder(b, (x, y + 0.18, -0.59), (x, y + 0.26, -0.59), 0.052, 'ART_DisplayInk', segments=6)
    for x in (-width / 2 + 0.08, 0, width / 2 - 0.08):
        solid((x, 4.45, -0.35), (0.14, 3.05, 0.18), WOOD)
    for y in (3.15, 5.9):
        solid((0, y, -0.35), (width, 0.17, 0.18), WOOD)
    for x in (-1.45, 1.45):
        upper_window(b, x, 4.55, 1.62, 1.4)
    # Retain the existing side elevation and roof envelope beyond the photographed front.
    for side in (-1, 1):
        for zz in (-0.65, -2.6, -4.6, -6.7, -8.8):
            solid((side * (width / 2 + 0.025), 3.1, zz), (0.12, 5.85, 0.15), WOOD)
        for yy in (3.15, 5.9):
            solid((side * (width / 2 + 0.03), yy, -4.75), (0.12, 0.15, depth - 0.5), WOOD)
    start = len(b.vertices)
    for x in (-2.5, 0.7, 3.0):
        window(b, x, 4.55, 1.55, 1.35, slats=True)
        window(b, x, 1.55, 1.6, 1.95, slats=True)
    b.vertices[start:] = [(width / 2 - z + 0.5, 4.75 + x, y) for x, z, y in b.vertices[start:]]
    lean_roof(b, width + 0.5, 0.74, -0.48, 2.72, 0.43)
    lean_roof(b, depth - 0.2, 0.65, -0.55, 2.72, 0.43,
              transform=lambda p: (-width / 2 - p[2], p[1], -4.75 + p[0]))
    tiled_roof(b, width + 0.65, 0.15, -depth - 0.4, height, 1.45, gable=True)
    cylinder(b, (-2.60, 0.1, -0.21), (-2.60, height - 0.1, -0.21), 0.035, 'ART_Chain', segments=8)


def boarded_neighbor(b):
    from abstract_props import cylinder
    from streetscape import tiled_roof, window
    solid = lambda c, s, m: b.box(c, s, m, strokes=False)
    width, depth, height = 7.2, 9, 6.1
    solid((0, 4.43, -4.75), (width, 3.34, 8.5), 'ART_DisplayInk')
    solid((0, 1.48, -4.75), (width, 2.56, 8.5), WOOD)
    solid((0, 0.10, -4.75), (width + 0.03, 0.20, 8.53), STONE)
    solid((0, 1.48, -0.425), (width, 2.56, 0.15), WOOD)
    # Broad closed vertical boarding and sliding timber leaves, as seen left of the case.
    for i in range(0, 25, 2 if b.distant else 1):
        x = -3.46 + i * 0.285
        solid((x, 1.48, -0.335), (0.016, 2.50, 0.022), 'ART_ShopWoodWear')
    for x in (-3.5, -1.2, 1.2, 3.5):
        solid((x, 1.5, -0.30), (0.11, 2.66, 0.13), WOOD)
    for y in (0.23, 2.66, 3.02):
        solid((0, y, -0.29), (width + 0.02, 0.12 if y != 3.02 else 0.32, 0.16), WOOD)
        solid((-width / 2 - 0.015, y, -4.75), (0.10, 0.12 if y != 3.02 else 0.32, 8.5), WOOD)
    for i in range(0, 30, 2 if b.distant else 1):
        solid((-width / 2 - 0.012, 1.48, -0.64 - i * 0.28), (0.025, 2.5, 0.016), 'ART_ShopWoodWear')
    solid((1.32, 1.2, -0.20), (0.04, 0.13, 0.035), 'ART_DisplayMetal')
    window(b, 0, 4.95, 0.78, 0.62)
    for x in (-width / 2 + 0.06, width / 2 - 0.06):
        cylinder(b, (x, 0.08, -0.24), (x, 5.95, -0.24), 0.045, WOOD, segments=8)
    lean_roof(b, width + 0.42, 0.10, -0.95, 2.72, 0.33)
    lean_roof(b, 8.5, 0.10, -0.95, 2.72, 0.33,
              transform=lambda p: (-width / 2 - p[2], p[1], -4.75 + p[0]))
    # The existing road-facing upper gable remains in its imported-map registration.
    start = len(b.vertices)
    tiled_roof(b, depth + 1, (width + 0.65) / 2, -(width + 0.65) / 2, height, 1.45, gable=True)
    b.vertices[start:] = [(z, 4.75 - x, y) for x, z, y in b.vertices[start:]]


def photo_frontage(b, name):
    shop(b) if name == 'ART_CornerShop' else boarded_neighbor(b)


def apron_details(b):
    """Fine stone joints and a shallow threshold drain on the existing 0.15 m town plot."""
    from abstract_props import face
    from road_network import difference, intersection, ccw, overlap, bounds
    from streetscape import ground_height
    stone = APRON_FINISHES[1][1]
    # Reuse exported walking surfaces instead of recomputing the entire regional road plan.
    with open(os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'road_tiles.json')) as f:
        groups = json.load(f)
    cuts = []
    for triangles in groups.values():
        for triangle in triangles:
            p = [(triangle[i], triangle[i + 2]) for i in (0, 3, 6)]
            if overlap(bounds(p), bounds(stone)):
                cuts.append(ccw(p))
    plots = difference([stone], cuts)

    def on_stone(points, material):
        outline = ccw([(x, z) for x, _, z in points])
        clipped = intersection(outline, stone)
        if clipped:
            for plot in plots:
                piece = intersection(clipped, plot)
                if piece:
                    cx = sum(x for x, z in piece) / len(piece)
                    cz = sum(z for x, z in piece) / len(piece)
                    if abs(ground_height(cx, cz) - 0.15) > 0.001:
                        continue
                    inset = []
                    for x, z in piece:
                        if abs(ground_height(x, z) - 0.15) > 0.001:
                            distance = ((cx - x) ** 2 + (cz - z) ** 2) ** 0.5
                            t = min(0.5, 0.004 / max(distance, 0.0001))
                            x, z = x + (cx - x) * t, z + (cz - z) * t
                        inset.append((x, points[0][1], z))
                    face(b, list(reversed(inset)), material)

    for x in (42.9, 43.5, 44.1, 44.7, 45.3, 45.9):
        points = [(x - 0.004, 0.151, 15.24), (x + 0.004, 0.151, 15.24),
                  (x + 0.004, 0.151, 17.27), (x - 0.004, 0.151, 17.27)]
        on_stone(points, 'ART_Joint')
    for z in (15.35, 15.95, 16.55, 17.15):
        on_stone([(42.66, 0.151, z - 0.004), (46.20, 0.151, z - 0.004),
                  (46.20, 0.151, z + 0.004), (42.66, 0.151, z + 0.004)], 'ART_Joint')
    # The dark drain line hugs the shop front rather than cutting the walking line.
    on_stone([(42.65, 0.151, 15.24), (46.25, 0.151, 15.24),
              (46.25, 0.151, 15.33), (42.65, 0.151, 15.33)], 'ART_Drain')
    if not b.distant:
        for i in range(24):
            x = 42.70 + i * 0.15
            on_stone([(x, 0.152, 15.25), (x + 0.016, 0.152, 15.25),
                      (x + 0.016, 0.152, 15.32), (x, 0.152, 15.32)], 'ART_DisplayMetal')
