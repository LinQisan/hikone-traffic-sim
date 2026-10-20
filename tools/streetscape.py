"""Locally authored details observed in Kyobashi's October 2024 Street View.

Dimensions fit the browser-owned street plan, not a measured survey.
All coordinates below are Unity metres; exports use the ordinary pigment/LOD pipeline.
"""
import json
import math
import os
from abstract_props import beveled_box as box, cylinder, face, car_body, wheel, speed_sign
from display_case import display_kiosk

MODELS = ('ART_CornerShop', 'ART_WhiteStorehouse', 'ART_EavesStorehouse', 'ART_ThreeStorey',
          'ART_NorthLonghouse', 'ART_ParkingPavilion', 'ART_ClippedHedge', 'ART_CastleGrove', 'ART_TownTree',
          'HK_Sign_ParkingDirection',
          'ART_WestCorner', 'HK_Sign_Paired30', 'HK_Sign_Paired40', 'HK_Sign_NoParking',
          'ART_PavingDetails', 'ART_KeiBox', 'HK_ChainFence', 'ART_DisplayKiosk')


def outward_face(b, points, material, inside):
    a, c, d = points[:3]
    u, v = [c[i] - a[i] for i in range(3)], [d[i] - a[i] for i in range(3)]
    n = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
    if sum(n[i] * (a[i] - inside[i]) for i in range(3)) < 0:
        points = list(reversed(points))
    face(b, points, material)


def hip_roof(b, width, front, back, eave, rise):
    # A closed roof volume: broad slopes, hipped ends and weighty diagonal ridges.
    hw, mid = width / 2, (front + back) / 2
    inset = min(width * 0.3, abs(front - back) * 0.38)
    base = [(-hw, eave, front), (hw, eave, front), (hw, eave, back), (-hw, eave, back)]
    left, right = (-hw + inset, eave + rise, mid), (hw - inset, eave + rise, mid)
    inside = (0, eave - 0.08, mid)
    for p in ([base[0], base[1], right, left], [base[2], base[3], left, right],
              [base[3], base[0], left], [base[1], base[2], right]):
        outward_face(b, p, 'ART_Tile', inside)
    bottom = [(x, y - 0.14, z) for x, y, z in base]
    outward_face(b, bottom, 'ART_Timber', inside)
    for i in range(4):
        j = (i + 1) % 4
        outward_face(b, [base[i], bottom[i], bottom[j], base[j]], 'ART_Tile', inside)
    for a, c in ((left, right), (base[0], left), (base[3], left), (base[1], right), (base[2], right)):
        cylinder(b, a, c, 0.075, 'ART_TileRidge', segments=8)
    for i in (() if getattr(b, 'distant', False) else range(1, int(width / 0.28))):
        x = -hw + i * 0.28
        end_x = max(left[0], min(right[0], x))
        for z in (front, back):
            cylinder(b, (x, eave + 0.02, z), (end_x, eave + rise + 0.02, mid),
                     0.025, 'ART_TileRidge', segments=6)


def no_parking(b, y):
    cylinder(b, (0, y, 0.03), (0, y, 0.05), 0.305, 'HK_MetalLight', segments=32)
    cylinder(b, (0, y, 0.05), (0, y, 0.06), 0.30, 'HK_SignRed', segments=32)
    cylinder(b, (0, y, 0.06), (0, y, 0.068), 0.235, 'HK_SignBlue', segments=32)
    cylinder(b, (0.17, y + 0.17, 0.082), (-0.17, y - 0.17, 0.082),
             0.026, 'HK_SignRed', segments=8)


def regulatory_sign(b, name):
    if name == 'HK_Sign_NoParking':
        cylinder(b, (0, 0, 0), (0, 3.25, 0), 0.035, 'HK_MetalLight', segments=10)
        no_parking(b, 2.9)
    else:
        speed_sign(b, name[-2:], y=3.35, pole_top=3.7)
        no_parking(b, 2.65)


def ring(b, center, rx, ry, tube, material, vertical=True, segments=16):
    x, y, z = center
    rings = []
    for i in range(segments):
        a = math.tau * i / segments
        rings.append([(x + (rx + tube * math.cos(t)) * math.cos(a),
                       y + (ry + tube * math.cos(t)) * math.sin(a) if vertical else y + tube * math.sin(t),
                       z + tube * math.sin(t) if vertical else z + (ry + tube * math.cos(t)) * math.sin(a))
                      for t in (0, math.pi / 2, math.pi, math.pi * 1.5)])
    for i, row in enumerate(rings):
        nxt = rings[(i + 1) % segments]
        for k in range(4):
            pts = [row[k], nxt[k], nxt[(k + 1) % 4], row[(k + 1) % 4]]
            face(b, pts if vertical else list(reversed(pts)), material)


def lathe(b, x, z, profile, material):
    rings = [[(x + r * math.cos(i * math.tau / 16), y, z + r * math.sin(i * math.tau / 16))
              for i in range(16)] for y, r in profile]
    face(b, rings[0], material)
    face(b, list(reversed(rings[-1])), material)
    for low, high in zip(rings, rings[1:]):
        for i in range(16):
            j = (i + 1) % 16
            face(b, [low[j], low[i], high[i], high[j]], material)


def bridge_posts(b):
    # Replace only the four source newels, keeping their exact footprint and height.
    for x in (-6.85, 6.85):
        for z in (0, 12.4):
            box(b, (x, 0.80, z), (0.50, 1.50, 0.50), 'HK_Stone', 0.045)
            lathe(b, x, z, [(1.55, 0.21), (1.58, 0.24), (1.61, 0.17),
                            (1.66, 0.20), (1.71, 0.16), (1.76, 0.08), (1.77, 0.012)], 'ART_StoneLight')
            box(b, (x, 1.02, z + (0.252 if z == 0 else -0.252)),
                (0.20, 0.45, 0.008), 'ART_Bronze', 0.002)
            for dy, width in ((-0.10, 0.10), (0.03, 0.12), (0.13, 0.07)):
                box(b, (x, 1.02 + dy, z + (0.256 if z == 0 else -0.256)),
                    (width, 0.018, 0.002), 'ART_StoneLight', 0.0003)


def moat_chain(b, lod=False):
    box(b, (-1, 0.37, 0), (0.24, 0.74, 0.24), 'ART_StoneLight', 0.035)
    box(b, (-1, 0.77, 0), (0.22, 0.06, 0.22), 'HK_Stone', 0.018)
    # A sagging chain read as one dark line. Individually modelled links (1,700 triangles per
    # 2 m) were invisible beyond a few metres yet cost ~12 % of a street view's triangles.
    pts = [(-0.99 + 1.98 * i / 8, 0.60 - 0.16 * (1 - ((-0.99 + 1.98 * i / 8) / 0.99) ** 2), 0)
           for i in range(9)]
    for a, c in zip(pts, pts[1:]):
        cylinder(b, a, c, 0.016 if lod else 0.018, 'ART_Chain', segments=6 if lod else 8)


def tiled_roof(b, width, front, back, eave, rise, gable=False):
    # Thick roof slopes, tile rolls, ridge tiles and the exposed eave ends.
    mid = (front + back) / 2
    for edge in (front, back):
        points = [(-width / 2, eave, edge), (width / 2, eave, edge),
                  (width / 2, eave + rise, mid), (-width / 2, eave + rise, mid)]
        if edge == back:
            points.reverse()
        bottom = [(x, y - 0.13, z) for x, y, z in points]
        face(b, points, 'ART_Tile')
        face(b, list(reversed(bottom)), 'ART_Timber')
        for i in range(4):
            j = (i + 1) % 4
            face(b, [points[i], bottom[i], bottom[j], points[j]], 'ART_Tile')
        for i in (() if getattr(b, 'distant', False) else range(int(width / 0.22) + 1)):
            x = -width / 2 + width * i / int(width / 0.22)
            cylinder(b, (x, eave + 0.018, edge), (x, eave + rise + 0.018, mid),
                     0.027, 'ART_TileRidge', segments=6)
        for t in (() if getattr(b, 'distant', False) else (0.25, 0.5, 0.75)):
            box(b, (0, eave + rise * t + 0.025, edge + (mid - edge) * t),
                (width, 0.025, 0.035), 'ART_TileRidge', 0.004)
    box(b, (0, eave + rise + 0.06, mid), (width + 0.08, 0.15, 0.22), 'ART_TileRidge', 0.035)
    if gable:
        for x in (-width / 2 + 0.35, width / 2 - 0.35):
            pts = [(x, eave - 0.12, back + 0.25), (x, eave - 0.12, front - 0.25),
                   (x, eave + rise - 0.08, mid)]
            face(b, pts if x < 0 else list(reversed(pts)), 'ART_Plaster')


def window(b, x, y, w, h, z=-0.405, slats=False):
    box(b, (x, y, z), (w, h, 0.055), 'ART_Window', 0.01)
    for xx in (x - w / 2, x + w / 2):
        box(b, (xx, y, z + 0.04), (0.065, h + 0.10, 0.055), 'ART_Timber', 0.008)
    for yy in (y - h / 2, y + h / 2):
        box(b, (x, yy, z + 0.04), (w + 0.12, 0.065, 0.055), 'ART_Timber', 0.008)
    for i in (() if getattr(b, 'distant', False) else range(1, int(w / (0.14 if slats else 0.6)))):
        xx = x - w / 2 + i * (0.14 if slats else 0.6)
        box(b, (xx, y, z + 0.065), (0.025, h, 0.03), 'ART_Timber', 0.004)


def frontage(b, name):
    if name in ('ART_CornerShop', 'ART_WhiteStorehouse'):
        from shop_corner import photo_frontage
        return photo_frontage(b, name)
    corner, modern = name == 'ART_CornerShop', name == 'ART_ThreeStorey'
    eaves = name == 'ART_EavesStorehouse'
    width, depth, height = (5.4, 9, 6.0) if corner else (6, 8, 9.0) if modern else (7.2, 9, 6.1)
    box(b, (0, height / 2, -(depth + 0.5) / 2), (width, height, depth - 0.5), 'ART_Concrete' if modern else 'ART_Plaster', 0.025)
    box(b, (0, 0.32, -(depth + 0.5) / 2), (width + 0.03, 0.64, depth - 0.47), 'ART_StoneLight', 0.025)
    box(b, (0, 1.42, -0.45), (width - 0.10, 2.35, 0.10), 'ART_Timber', 0.01)
    if modern:
        for x in (-1.75, 0, 1.75):
            window(b, x, 1.45, 1.35, 2.0)
        # Recessed glazing and continuous balcony bands distinguish the concrete building.
        for y in (4.5, 7.4):
            window(b, 0, y, width - 0.55, 1.75, z=-0.405)
            box(b, (0, y - 1.02, 0.12), (width + 0.18, 0.18, 1.15), 'ART_StoneLight', 0.018)
            box(b, (0, y - 0.62, 0.62), (width + 0.08, 0.70, 0.14), 'ART_Concrete', 0.018)
            for x in (-width / 2, 0, width / 2):
                box(b, (x, y, 0.53), (0.14, 2.1, 0.22), 'ART_Concrete', 0.012)
        hip_roof(b, width + 0.75, 0.6, -depth - 0.45, height, 0.62)
    else:
        for x in (-width * 0.27, width * 0.27):
            if corner:
                window(b, x, 4.55, width * 0.30, 1.35, slats=True)
            window(b, x, 1.55, width * 0.32, 2.0, slats=corner)
        if corner:
            for x in (-width / 2 + 0.08, 0, width / 2 - 0.08):
                box(b, (x, 3.1, -0.33), (0.15, 5.9, 0.18), 'ART_Timber', 0.008)
            for y in (3.15, 5.9):
                box(b, (0, y, -0.33), (width, 0.16, 0.18), 'ART_Timber', 0.01)
            # Timber on the exposed corner wall, with a tiled return canopy.
            for side in (-1, 1):
                for zz in (-0.65, -2.6, -4.6, -6.7, -8.8):
                    box(b, (side * (width / 2 + 0.025), 3.1, zz), (0.12, 5.85, 0.15), 'ART_Timber', 0.01)
                for yy in (3.15, 5.9):
                    box(b, (side * (width / 2 + 0.03), yy, -(depth + 0.5) / 2), (0.12, 0.15, depth - 0.5), 'ART_Timber', 0.01)
            start = len(b.vertices)
            for x in (-2.5, 0.7, 3.0):
                window(b, x, 4.55, 1.55, 1.35, slats=True)
                window(b, x, 1.55, 1.6, 1.95, slats=True)
            center_z = -(depth + 0.5) / 2
            b.vertices[start:] = [(width / 2 - z + 0.5, -center_z + x, y) for x, z, y in b.vertices[start:]]
            for i in range(3):
                box(b, (0.40 + i * 0.46, 2.35, 0.10), (0.43, 0.68, 0.035), 'HK_NorenRed', 0.012)
            tiled_roof(b, width + 0.50, 0.75, -0.72, 3.15, 0.25)
            # The shop canopy returns down Castle Road rather than ending at the corner.
            start = len(b.vertices)
            tiled_roof(b, depth - 0.2, 0.65, -0.70, 3.15, 0.25)
            center_z = -(depth + 0.5) / 2
            b.vertices[start:] = [(z + width / 2, -center_z - x, y) for x, z, y in b.vertices[start:]]
            box(b, (1.85, 0.43, 0.70), (0.48, 0.86, 0.10), 'ART_Timber', 0.015)
            box(b, (1.85, 0.48, 0.76), (0.39, 0.61, 0.025), 'ART_Menu', 0.006)
            for y in (0.28, 0.39, 0.51, 0.64):
                box(b, (1.85, y, 0.778), (0.23, 0.015, 0.006), 'ART_Plaster', 0.001)
        else:
            # White storehouse: black lower boarding, small slit windows and rainwater pipes.
            if eaves:
                for x in (-2.1, -0.7, 0.7, 2.1):
                    window(b, x, 4.65, 0.35, 1.35)
            else:
                window(b, 0, 4.95, 0.78, 0.62)
            for x in (-width / 2 + 0.06, width / 2 - 0.06):
                cylinder(b, (x, 0.08, -0.24), (x, 5.95, -0.24), 0.045, 'ART_Timber', segments=8)
            tiled_roof(b, width + 0.42, 0.10, -0.95, 3.05, 0.18)
        if corner:
            tiled_roof(b, width + 0.65, 0.15, -depth - 0.4, height, 1.45, gable=True)
        elif eaves:
            tiled_roof(b, width + 0.65, 0.15, -depth - 0.4, height, 1.25, gable=True)
        else:
            # The storehouse's gable faces the road; its ridge runs back into the block.
            start = len(b.vertices)
            tiled_roof(b, depth + 1, (width + 0.65) / 2, -(width + 0.65) / 2,
                       height, 1.45, gable=True)
            center_z = -(depth + 0.5) / 2
            b.vertices[start:] = [(z, -center_z - x, y) for x, z, y in b.vertices[start:]]
    # Gutters, downpipe, outdoor condenser and planter make the facade readable nearby.
    cylinder(b, (-width / 2 + 0.08, 0.1, -0.20), (-width / 2 + 0.08, height - 0.1, -0.20), 0.035, 'ART_Chain', segments=8)
    box(b, (width / 2 - 0.65, 0.43, -0.12), (0.80, 0.56, 0.34), 'ART_StoneLight', 0.025)
    ring(b, (width / 2 - 0.65, 0.43, 0.058), 0.20, 0.20, 0.015, 'ART_Chain')
    for i in range(5):
        box(b, (width / 2 - 0.65, 0.28 + i * 0.075, 0.073), (0.38, 0.012, 0.012), 'ART_Chain', 0.002)


def west_corner(b):
    # The western restaurant is a joined compound, with broad plaster panels above timber
    # boarding. The short rear wing and wrapping eaves carry its silhouette; adverts are omitted.
    width, depth, height = 13.8, 14.6, 6.15
    box(b, (0, height / 2, -5.7), (width, height, 10.6), 'ART_Plaster', 0.025)
    box(b, (2.4, 2.9, -12.3), (9.0, 5.8, 4.6), 'ART_Plaster', 0.025)
    box(b, (0, 1.5, -0.38), (width, 2.9, 0.16), 'ART_Timber', 0.012)
    for x in (-5.5, -2.7, 0, 2.7, 5.5):
        window(b, x, 1.5, 1.9, 1.9, z=-0.27, slats=True)
        if x != 0:
            window(b, x, 4.65, 1.75, 1.3, z=-0.31, slats=True)
    for x in (-6.8, -4.1, -1.35, 1.35, 4.1, 6.8):
        box(b, (x, 3.1, -0.24), (0.14, 6.0, 0.18), 'ART_Timber', 0.012)
    for y in (3.1, 5.95):
        box(b, (0, y, -0.23), (width, 0.16, 0.18), 'ART_Timber', 0.012)
    # Exposed east return: transform front-facing joinery onto the Castle Road facade.
    start = len(b.vertices)
    for x in (-4.1, -1.35, 1.35, 4.1):
        window(b, x, 4.6, 1.9, 1.35, z=-0.31, slats=True)
        window(b, x, 1.5, 2.0, 1.9, z=-0.31, slats=True)
    for x in (-5.2, -2.7, 0, 2.7, 5.2):
        box(b, (x, 3.1, -0.24), (0.14, 6.0, 0.18), 'ART_Timber', 0.012)
    for y in (3.1, 5.95):
        box(b, (0, y, -0.23), (10.6, 0.16, 0.18), 'ART_Timber', 0.012)
    tiled_roof(b, 11.1, 0.75, -0.72, 3.1, 0.25)
    b.vertices[start:] = [(-width / 2 + z - 0.4, 5.7 - x, y) for x, z, y in b.vertices[start:]]
    hip_roof(b, width + 0.8, 0.75, -11.6, height, 1.8)
    # A road-facing cross gable breaks the long eaves, as in the western corner view.
    start = len(b.vertices)
    tiled_roof(b, 7.6, 2.8, -2.8, height, 2.15, gable=True)
    b.vertices[start:] = [(z - 2.1, 3.4 - x, y) for x, z, y in b.vertices[start:]]
    start = len(b.vertices)
    tiled_roof(b, 9.7, 0.25, -5.35, 5.8, 1.1, gable=True)
    b.vertices[start:] = [(x - 2.4, z + 9.5, y) for x, z, y in b.vertices[start:]]
    tiled_roof(b, width + 0.6, 0.85, -0.75, 3.1, 0.25)
    for x in (-6.6, 6.6):
        cylinder(b, (x, 0.08, -0.12), (x, 6.0, -0.12), 0.04, 'ART_Chain', segments=8)


def north_longhouse(b):
    # Confirmed low tiled/timber-and-plaster frontage at the northern bend. No guessed rooms,
    # signs or hidden rear elevation: the building is an economical background volume.
    box(b, (0, 1.8, -3.2), (36, 3.6, 5.6), 'ART_Plaster', 0.025)
    box(b, (0, 0.95, -0.34), (36, 1.9, 0.15), 'ART_Timber', 0.012)
    for x in range(-17, 18, 3):
        box(b, (x, 1.9, -0.23), (0.14, 3.5, 0.16), 'ART_Timber', 0.01)
    box(b, (0, 1.65, -0.20), (4.8, 3.3, 0.18), 'ART_Timber', 0.015)
    if not b.distant:
        for x in (-1.75, -1.05, -0.35, 0.35, 1.05, 1.75):
            box(b, (x, 1.6, -0.09), (0.07, 2.8, 0.10), 'ART_Chain', 0.006)
    tiled_roof(b, 37, 0.85, -6.8, 3.65, 1.45, gable=True)


def parking_pavilion(b):
    # The road-facing wall has high small windows, not invented doorways.
    # Small public-service symbols and lettering are omitted rather than approximated as text.
    box(b, (0, 1.65, -3.2), (8.4, 3.3, 5.6), 'ART_Plaster', 0.025)
    box(b, (0, 0.65, -0.34), (8.4, 1.3, 0.12), 'ART_StoneLight', 0.012)
    for x in (-2.5, 0, 2.5):
        window(b, x, 2.45, 0.52, 0.42, z=-0.32)
    if not b.distant:
        for i in range(22):
            box(b, (-4.05 + i * 0.38, 0.65, -0.26), (0.035, 1.18, 0.035), 'ART_Concrete', 0.006)
    tiled_roof(b, 9.2, 0.55, -6.8, 3.3, 1.15, gable=True)


def clipped_hedge(b):
    from vegetation import shrubs
    box(b, (0, 0.09, 0), (8.0, 0.18, 0.85), 'ART_StoneLight', 0.025)
    shrubs(b, [(x, 0.56, 0, 0.90, 0.45, 0.48) for x in (-3.3, -2.0, -0.7, 0.7, 2.0, 3.3)], 1200)


def parking_direction(b):
    cylinder(b, (0, 0, 0), (0, 4.95, 0), 0.065, 'ART_Frame', segments=10)
    cylinder(b, (0, 4.75, 0), (1.3, 4.75, 0), 0.045, 'ART_Frame', segments=8)
    box(b, (0.9, 4.55, 0.03), (2.1, 0.65, 0.10), 'HK_WhitePaint', 0.025)
    box(b, (0.25, 4.55, 0.09), (0.47, 0.47, 0.018), 'HK_SignBlue', 0.01)
    for x, y, w, h in ((0.35, 4.55, 0.045, 0.32), (0.24, 4.70, 0.22, 0.045),
                        (0.24, 4.56, 0.22, 0.045), (0.13, 4.63, 0.045, 0.16)):
        box(b, (x, y, 0.105), (w, h, 0.008), 'HK_WhitePaint', 0.003)
    box(b, (1.32, 4.55, 0.095), (0.68, 0.06, 0.014), 'HK_SignBlue', 0.008)
    for y in (4.37, 4.73):
        cylinder(b, (1.51, y, 0.105), (1.75, 4.55, 0.105), 0.030, 'HK_SignBlue', segments=8)


def planting(b, town=False):
    from vegetation import tree, shrubs
    if town:
        tree(b, 'zelkova', height=10.1, spread=3.2, seed=900)
        shrubs(b, [(0, 0.36, z, 0.40, 0.30, 0.80) for z in (-1.25, 0, 1.25)], 780)
    else:
        # Buried root ends accommodate the bank's 1:3 fall across this rotated pair;
        # placement height remains the authoritative bank height at the asset origin.
        tree(b, 'tabu', base=(-2.4, 0, 0), height=10.6, spread=4.1, seed=910, root_depth=1.5)
        tree(b, 'shii', base=(2.8, 0, 2.5), height=12.2, spread=4.2, seed=940, root_depth=1.5)


_ground_cells = None


def ground_height(x, z, footway=False):
    """Sample the exported partition; flush footways are identified by kind, not height."""
    global _ground_cells
    if _ground_cells is None:
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        with open(os.path.join(root, 'data', 'road_tiles.json')) as f:
            groups = json.load(f)
        _ground_cells = {}
        for name, triangles in groups.items():
            for triangle in triangles:
                xs, zs = triangle[0::3], triangle[2::3]
                for gx in range(math.floor(min(xs) / 4), math.floor(max(xs) / 4) + 1):
                    for gz in range(math.floor(min(zs) / 4), math.floor(max(zs) / 4) + 1):
                        _ground_cells.setdefault((gx, gz), []).append((triangle, name == 'Kyobashi pavement'))
    best = None
    for triangle, pavement in _ground_cells.get((math.floor(x / 4), math.floor(z / 4)), []):
        if footway and not pavement:
            continue
        ax, ay, az, bx, by, bz, cx, cy, cz = triangle
        d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz)
        if abs(d) < 1e-12:
            continue
        a = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d
        c = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d
        e = 1 - a - c
        if min(a, c, e) >= -1e-6:
            h = a * ay + c * by + e * cy
            best = h if best is None else max(h, best)
    return best if footway or best is not None else 0.15


def paving(b):
    def rect(x, z, w, d, material, relief=0.001):
        pts = [(xx, ground_height(xx, zz) + relief, zz) for xx, zz in
               ((x - w / 2, z - d / 2), (x - w / 2, z + d / 2),
                (x + w / 2, z + d / 2), (x + w / 2, z - d / 2))]
        face(b, pts, material)

    # Continuous guidance strips, deliberately interrupted at the three carriageways.
    # The moat-side strip follows the footway as it narrows away from the bridge corners.
    from road_network import shore_taper, town_taper
    for row in ('moat', 'town'):
        for lo, hi in ((-90, 24), (40, 82)):
            for i in range(int((hi - lo) / 0.6)):
                x = lo + i * 0.6 + 0.3
                z = 34.4 - 3.0 * shore_taper(x) if row == 'moat' else 18.6 + 2.0 * town_taper(x)
                if any(ground_height(xx, zz, footway=True) is None
                       for xx in (x - 0.298, x + 0.298) for zz in (z - 0.15, z + 0.15)):
                    continue
                rect(x, z, 0.596, 0.30, 'ART_Tactile')
                for dz in (-0.095, 0, 0.095):
                    rect(x, z + dz, 0.54, 0.025, 'ART_TactileRidge', 0.004)
    from road_network import WALK_CROSSINGS
    for x in WALK_CROSSINGS:
        for z in (19.55, 32.45):
            for dx in (-0.45, -0.15, 0.15, 0.45):
                rect(x + dx, z, 0.296, 0.60, 'ART_Tactile')
                for dz in (-0.21, -0.07, 0.07, 0.21):
                    for off in (-0.07, 0.07):
                        xx, zz = x + dx + off, z + dz
                        h = ground_height(xx, zz)
                        cylinder(b, (xx, h + 0.001, zz), (xx, h + 0.005, zz), 0.018, 'ART_TactileRidge', segments=6)
    # The near corners use stone slabs, with fine joints rather than a photograph texture.
    for lo, hi in ((20.5, 26.5), (37.5, 44.0)):
        for x in range(math.ceil(lo), math.floor(hi)):
            rect(x, 17.3, 0.010, 5.0, 'ART_Joint')
        for z in (15.0, 15.6, 16.2, 16.8, 17.4, 18.0, 18.6, 19.2):
            rect((lo + hi) / 2, z, hi - lo, 0.009, 'ART_Joint')
    for x in (1, 17, 47, 65, 79):
        for z in (21.18, 30.82):
            rect(x, z, 0.70, 0.32, 'ART_Drain')
            for dx in range(11):
                rect(x - 0.30 + dx * 0.06, z, 0.025, 0.28, 'ART_Chain', 0.003)
    for x, z in ((46, 25.8), (13, 26.2), (32, 10)):
        h = ground_height(x, z)
        cylinder(b, (x, h - 0.005, z), (x, h + 0.002, z), 0.32, 'ART_Drain', segments=32)
        ring(b, (x, h + 0.004, z), 0.29, 0.29, 0.006, 'ART_Chain', vertical=False, segments=32)
        for dx in (-0.15, 0, 0.15):
            rect(x + dx, z, 0.035, 0.42, 'ART_Chain', 0.004)
    from shop_corner import apron_details
    apron_details(b)


def kei_box(b):
    # A tall sliding-door kei wagon seen crossing the junction. Its tyre centres, footprint
    # and 1.79 m roof match the existing kei-tall collision/steering dimensions.
    profile = [(-1.697, 1.50), (-1.52, 1.75), (-1.30, 1.79), (0.60, 1.79),
               (0.88, 1.69), (1.16, 1.22), (1.60, 1.16), (1.697, 1.04)]
    car_body(b, 1.475, profile, 0.28, 2.52, (-1.42, 0.97, 0.10), panel_gap=0.001)
    box(b, (0, 0.24, 0), (1.135, 0.14, 2.894), 'ART_Frame', 0.025)
    for side in (-1, 1):
        for z in (-1.26, 1.26):
            wheel(b, side * (1.475 / 2 - 0.075), 0.28, z, 0.28, width=0.15)
        box(b, (side * (1.475 / 2 + 0.08), 1.15, 0.66), (0.16, 0.12, 0.10), 'ART_Frame', 0.025)
        box(b, (side * 0.53, 0.91, 1.68), (0.29, 0.20, 0.045), 'ART_LampGlow', 0.02)
        box(b, (side * 0.56, 1.08, -1.68), (0.18, 0.63, 0.045), 'ART_SignalRed', 0.015)
        box(b, (side * 0.744, 0.91, -0.46), (0.012, 0.018, 1.18), 'ART_FrameLight', 0.003)
        for z in (-0.55, 0.28):
            box(b, (side * 0.747, 0.90, z), (0.025, 0.035, 0.18), 'ART_FrameLight', 0.005)
    box(b, (0, 0.63, 1.685), (0.78, 0.20, 0.025), 'ART_Frame', 0.015)
    for y in (0.57, 0.64, 0.71):
        box(b, (0, y, 1.696), (0.72, 0.018, 0.008), 'ART_FrameLight', 0.003)
    for z in (-1.688, 1.688):
        box(b, (0, 0.44, z), (0.33, 0.165, 0.020), 'ART_SignalYellow', 0.012)


def build(name, mesh_class, lod=False):
    b = mesh_class(name)
    b.abstract = True
    b.distant = lod
    if name == 'HK_ChainFence':
        moat_chain(b, lod)
    elif name == 'ART_PavingDetails':
        paving(b)
    elif name == 'ART_KeiBox':
        kei_box(b)
    elif name == 'ART_DisplayKiosk':
        display_kiosk(b)
    elif name == 'ART_WestCorner':
        west_corner(b)
    elif name == 'ART_NorthLonghouse':
        north_longhouse(b)
    elif name == 'ART_ParkingPavilion':
        parking_pavilion(b)
    elif name == 'ART_ClippedHedge':
        clipped_hedge(b)
    elif name == 'HK_Sign_ParkingDirection':
        parking_direction(b)
    elif name in ('ART_CastleGrove', 'ART_TownTree'):
        planting(b, name == 'ART_TownTree')
    elif name.startswith('HK_Sign_'):
        regulatory_sign(b, name)
    else:
        frontage(b, name)
    return b
