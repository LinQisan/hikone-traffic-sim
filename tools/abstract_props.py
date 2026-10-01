"""Closed, newly authored abstract props. Unity coordinates, metres, +Z car front.

Shape precedes ornament: tapered lanterns, thick circular signals, lofted car
volumes and true wheel clearances. This module never reads an existing mesh.
"""
import math
from mathutils import Vector

SIGNAL_MODELS = ('ART_Signal_Car', 'ART_Signal_Pedestrian', 'ART_Signal_Support')
VEHICLE_MODELS = ('WEB_Sedan', 'HK_Kei_Tall', 'HK_Kei_Hatch', 'HK_Truck_Large', 'HK_Truck_Medium')
MODEL_NAMES = (*SIGNAL_MODELS, *VEHICLE_MODELS, 'HK_StreetLamp')


def identity(p):
    return p


def face(b, points, material, transform=identity, pigment=None):
    pts = [Vector(transform(p)) for p in points]
    if pigment is None and material == 'HK_KeiPaint':
        n = (pts[1] - pts[0]).cross(pts[2] - pts[0]).normalized()
        # These are pigment planes, independent of screen or viewing distance.
        pigment = ((1.0, 0.97, 0.89) if n.y > 0.35 else
                   (0.52, 0.57, 0.67) if n.y < -0.35 else
                   (0.78, 0.84, 0.94) if n.x < -0.2 else (0.93, 0.89, 0.80))
    if material.startswith('ART_Signal'):
        # Signal colours stay distinct instead of receiving complementary paint.
        pigment = {
            'ART_SignalRed': (0.94, 0.19, 0.16),
            'ART_SignalYellow': (1.0, 0.77, 0.13),
            'ART_SignalGreen': (0.17, 0.76, 0.46),
            'ART_SignalGlyph': (1.0, 0.96, 0.80),
        }.get(material, pigment)
    b.polygon([Vector((-p.x, -p.z, p.y)) for p in reversed(pts)], material, pigment)


def outline(width, height, bevel):
    x, y = width / 2, height / 2
    c = min(bevel, x * 0.45, y * 0.45)
    # Clockwise in XY. All lofts have matching rings and closed end caps.
    return [(-x + c, -y), (-x, -y + c), (-x, y - c), (-x + c, y),
            (x - c, y), (x, y - c), (x, -y + c), (x - c, -y)]


def loft(b, rings, material, transform=identity):
    face(b, rings[0], material, transform)
    face(b, list(reversed(rings[-1])), material, transform)
    for a, c in zip(rings, rings[1:]):
        for i in range(len(a)):
            j = (i + 1) % len(a)
            face(b, [a[i], c[i], c[j], a[j]], material, transform)


def beveled_box(b, center, size, material, bevel=0.06, transform=identity):
    x, y, z = center
    w, h, d = size
    c = min(bevel, w * 0.2, h * 0.2, d * 0.2)
    rings = []
    for depth, inset in ((-d / 2, c), (-d / 2 + c, 0), (d / 2 - c, 0), (d / 2, c)):
        rings.append([(x + xx, y + yy, z + depth) for xx, yy in outline(w - inset * 2, h - inset * 2, c)])
    loft(b, rings, material, transform)


def cylinder(b, start, end, radius, material, segments=16, end_radius=None, bevel=0, transform=identity):
    a, c = Vector(start), Vector(end)
    axis = (c - a).normalized()
    ref = Vector((0, 1, 0)) if abs(axis.y) < 0.9 else Vector((1, 0, 0))
    u = (ref - axis * ref.dot(axis)).normalized()
    v = axis.cross(u)
    rt = radius if end_radius is None else end_radius
    length = (c - a).length
    t = min(bevel, length * 0.20, radius * 0.20)
    profiles = [(a, radius), (c, rt)] if not t else [
        (a, radius - t), (a + axis * t, radius), (c - axis * t, rt), (c, rt - t)]
    rings = [[p + r * (u * math.cos(i * math.tau / segments) + v * math.sin(i * math.tau / segments))
              for i in range(segments)] for p, r in profiles]
    face(b, list(reversed(rings[0])), material, transform)
    face(b, rings[-1], material, transform)
    for lower, upper in zip(rings, rings[1:]):
        for i in range(segments):
            j = (i + 1) % segments
            face(b, [lower[i], lower[j], upper[j], upper[i]], material, transform)


def panel(b, points, material, inside, transform=identity, pigment=None):
    pts = [Vector(p) for p in points]
    n = (pts[1] - pts[0]).cross(pts[2] - pts[0]).normalized()
    center = sum(pts, Vector()) / len(pts)
    if n.dot(center - Vector(inside)) < 0:
        pts.reverse()
        n.negate()
    back = [p + n * 0.001 for p in pts]
    front = [p + n * 0.009 for p in pts]
    face(b, list(reversed(back)), material, transform, pigment)
    face(b, front, material, transform, pigment)
    for i in range(len(pts)):
        j = (i + 1) % len(pts)
        face(b, [back[i], back[j], front[j], front[i]], material, transform, pigment)


def lantern(b):
    beveled_box(b, (0, 0.16, 0), (0.43, 0.32, 0.43), 'ART_LampBase', 0.07)
    cylinder(b, (0, 0.32, 0), (0.02, 4.85, 0.035), 0.092, 'ART_Frame',
             end_radius=0.065, segments=12)
    cylinder(b, (0.02, 4.85, 0.035), (0, 4.85, 1.2), 0.065, 'ART_Frame',
             end_radius=0.046, segments=12)
    # A closed, gently tapered eight-sided glass volume. Its warm bottom is real.
    rings = []
    for height, w, d in ((4.26, 0.40, 0.40), (4.34, 0.44, 0.44), (4.80, 0.50, 0.50)):
        # Map the cross-section's second axis to depth; keep a consistent winding.
        rings.append([(x, height, 1.2 - y) for x, y in outline(w, d, 0.075)])
    # The clockwise ring has a -Y normal: the bottom faces down, the top up.
    face(b, rings[0], 'ART_LampGlow')
    face(b, list(reversed(rings[-1])), 'ART_LampGlow')
    for low, high in zip(rings, rings[1:]):
        for i in range(8):
            j = (i + 1) % 8
            face(b, [low[i], high[i], high[j], low[j]], 'ART_LampGlow')
    beveled_box(b, (0, 4.22, 1.2), (0.49, 0.105, 0.49), 'ART_LampBase', 0.023)
    # Thick sloping cap, sealed below; its apex is an octagonal ridge, not a plane.
    cylinder(b, (0, 4.795, 1.2), (0, 5.11, 1.2), 0.405, 'ART_Frame',
             segments=8, end_radius=0.095)
    for x in (-0.18, 0.18):
        for z in (1.02, 1.38):
            cylinder(b, (x, 4.25, z), (x * 1.22, 4.81, 1.2 + (z - 1.2) * 1.22),
                     0.023, 'ART_Frame', segments=6, end_radius=0.020)


def signal_lens(b, x, y, radius, material, front=0.16):
    cylinder(b, (x, y, front - 0.03), (x, y, front + 0.024), radius + 0.026,
             'ART_Frame', segments=24, bevel=0.012)
    cylinder(b, (x, y, front + 0.020), (x, y, front + 0.049), radius,
             material, segments=24, bevel=0.006)
    # Closed semicircular sun visor with front/back and end walls.
    arc = [math.radians(18 + 144 * i / 12) for i in range(13)]
    outer = [(x + (radius + 0.052) * math.cos(t), y + (radius + 0.052) * math.sin(t)) for t in arc]
    inner = [(x + (radius + 0.023) * math.cos(t), y + (radius + 0.023) * math.sin(t)) for t in reversed(arc)]
    polygon = outer + inner
    if sum(polygon[i][0] * polygon[(i + 1) % len(polygon)][1] - polygon[(i + 1) % len(polygon)][0] * polygon[i][1]
           for i in range(len(polygon))) > 0:
        polygon.reverse()
    loft(b, [[(xx, yy, front + zz) for xx, yy in polygon] for zz in (-0.012, 0.15)], 'ART_Frame')


def person(b, x, y, walking, front):
    cylinder(b, (x, y + 0.046, front), (x, y + 0.046, front + 0.006), 0.013,
             'ART_SignalGlyph', segments=12)
    # Five thick painted gestures; all are capped solids.
    limbs = [((x, y + 0.025), (x, y - 0.018))]
    if walking:
        limbs += [((x, y + 0.008), (x - 0.028, y - 0.009)), ((x, y + 0.008), (x + 0.026, y + 0.020)),
                  ((x, y - 0.014), (x - 0.032, y - 0.052)), ((x, y - 0.014), (x + 0.027, y - 0.047))]
    else:
        limbs += [((x, y + 0.015), (x - 0.023, y - 0.014)), ((x, y + 0.015), (x + 0.023, y - 0.014)),
                  ((x, y - 0.014), (x - 0.014, y - 0.055)), ((x, y - 0.014), (x + 0.014, y - 0.055))]
    for (ax, ay), (cx, cy) in limbs:
        cylinder(b, (ax, ay, front + 0.005), (cx, cy, front + 0.005), 0.008,
                 'ART_SignalGlyph', segments=6)


def signals(b, name):
    if name == 'ART_Signal_Support':
        cylinder(b, (0, -1, 0), (0, 1, 0), 0.5, 'ART_Frame', segments=12, end_radius=0.43)
    elif name == 'ART_Signal_Car':
        beveled_box(b, (0, 0, 0), (1.78, 0.62, 0.27), 'ART_SignalHousing', 0.085)
        for x, color in ((-0.59, 'ART_SignalRed'), (0, 'ART_SignalYellow'), (0.59, 'ART_SignalGreen')):
            signal_lens(b, x, 0, 0.192, color)
    else:
        beveled_box(b, (0, 0, 0), (0.427, 0.687, 0.235), 'ART_SignalHousing', 0.052)
        for y, color, walking in ((0.162, 'ART_SignalRed', False), (-0.162, 'ART_SignalGreen', True)):
            signal_lens(b, 0, y, 0.105, color, front=0.125)
            person(b, 0, y, walking, 0.177)


def interpolate(profile, z):
    for (a, h), (c, k) in zip(profile, profile[1:]):
        if a <= z <= c:
            return h + (k - h) * (z - a) / (c - a)
    return profile[0][1] if z < profile[0][0] else profile[-1][1]


def car_body(b, width, profile, radius, wheelbase, cabin, transform=identity, center_z=0):
    hw = width / 2
    # The shell follows the wheel arches, with a fully closed underside above tyres.
    zs = {z for z, _ in profile}
    for axle in (-wheelbase / 2, wheelbase / 2):
        for i in range(9):
            zs.add(axle + (radius + 0.045) * math.cos(math.pi * i / 8))
    zs = sorted(z for z in zs if profile[0][0] <= z <= profile[-1][0])

    def bottom(z):
        floor = 0.30
        for axle in (-wheelbase / 2, wheelbase / 2):
            dz = abs(z - axle)
            if dz < radius + 0.045:
                floor = max(floor, radius + math.sqrt((radius + 0.045) ** 2 - dz * dz))
        return floor

    def section(z):
        h = interpolate(profile, z)
        belt = min(0.92 if width > 1.6 else 1.01, h - 0.15)
        floor = min(bottom(z), belt - 0.10)
        top_width = hw * (0.78 if h > 1.15 else 0.92)
        return floor, belt, h, top_width

    rings = []
    for z in zs:
        floor, belt, h, wt = section(z)
        rings.append([(-hw * 0.90, floor, z + center_z), (-hw, floor + 0.05, z + center_z),
                      (-hw, belt, z + center_z), (-wt, h - 0.075, z + center_z),
                      (-wt * 0.90, h, z + center_z), (wt * 0.90, h, z + center_z),
                      (wt, h - 0.075, z + center_z), (hw, belt, z + center_z),
                      (hw, floor + 0.05, z + center_z), (hw * 0.90, floor, z + center_z)])
    loft(b, rings, 'HK_KeiPaint', transform)
    inside = (0, 0.8, center_z)
    rear, front, divider = cabin

    def glass_point(side, z, t):
        _, belt, h, wt = section(z)
        y = belt + (h - 0.075 - belt) * t
        x = hw + (wt - hw) * t
        return (side * x, y, z + center_z)

    for side in (-1, 1):
        for start, end in ((rear, divider - 0.045), (divider + 0.045, front)):
            breaks = sorted({start, end, *[z for z, _ in profile if start < z < end]})
            for a, c in zip(breaks, breaks[1:]):
                panel(b, [glass_point(side, a, 0.14), glass_point(side, c, 0.14),
                          glass_point(side, c, 0.83), glass_point(side, a, 0.83)],
                      'ART_Glass', inside, transform)
        # A single warm handle is enough to suggest a door.
        p = glass_point(side, divider + 0.16, 0.04)
        beveled_box(b, (p[0], p[1] - 0.07, p[2]), (0.04, 0.035, 0.20),
                    'ART_FrameLight', 0.007, transform)
    for low, high in ((front + 0.17, front - 0.30), (rear - 0.17, rear + 0.20)):
        low = max(profile[0][0] + 0.06, min(profile[-1][0] - 0.06, low))
        high = max(profile[0][0] + 0.06, min(profile[-1][0] - 0.06, high))
        # Match every bend of the actual roof surface, then offset outwards.
        # A single inset quad disappears inside a changing roof profile.
        start, end = sorted((low, high))
        breaks = sorted({start, end, *[z for z, _ in profile if start < z < end]})
        for a, c in zip(breaks, breaks[1:]):
            _, _, h0, w0 = section(a)
            _, _, h1, w1 = section(c)
            panel(b, [(-w0 * 0.81, h0 + 0.002, a + center_z), (w0 * 0.81, h0 + 0.002, a + center_z),
                      (w1 * 0.81, h1 + 0.002, c + center_z), (-w1 * 0.81, h1 + 0.002, c + center_z)],
                  'ART_Glass', inside, transform)


def wheel(b, x, y, z, radius, transform=identity, width=0.16):
    cylinder(b, (x - width / 2, y, z), (x + width / 2, y, z), radius,
             'HK_Rubber', segments=16, bevel=0.025, transform=transform)
    side = 1 if x > 0 else -1
    outer = x + side * width / 2
    cylinder(b, (outer, y, z), (outer + side * 0.006, y, z), radius * 0.56,
             'ART_FrameLight', segments=12, transform=transform)


def car(b, name):
    sedan, tall = name == 'WEB_Sedan', name == 'HK_Kei_Tall'
    w, h, length, r, wb = (1.76, 1.45, 4.60, 0.31, 2.70) if sedan else (1.475, 1.79 if tall else 1.525, 3.394, 0.28, 2.52)
    if sedan:
        profile = [(-2.30, 0.70), (-2.10, 0.88), (-1.45, 1.01), (-0.78, 1.40),
                   (-0.25, h), (0.34, h), (0.82, 1.08), (1.55, 0.88), (2.15, 0.86), (2.30, 0.86)]
        cabin = (-1.24, 0.66, -0.22)
    elif tall:
        profile = [(-1.697, 1.47), (-1.48, 1.74), (-1.20, h), (0.28, h), (0.60, 1.72),
                   (1.12, 1.02), (1.55, 0.88), (1.697, 0.86)]
        cabin = (-1.42, 0.73, -0.28)
    else:
        profile = [(-1.697, 0.87), (-1.45, 1.24), (-1.12, 1.49), (-0.68, h),
                   (0.14, h), (0.50, 1.29), (0.96, 0.92), (1.55, 0.88), (1.697, 0.86)]
        cabin = (-1.26, 0.66, -0.27)
    car_body(b, w, profile, r, wb, cabin)
    hw, front, rear = w / 2, length / 2, -length / 2
    beveled_box(b, (0, 0.23, 0), (w - 0.34, 0.14, length - 0.50), 'ART_Frame', 0.025)
    for side in (-1, 1):
        for z in (-wb / 2, wb / 2):
            wheel(b, side * (hw - 0.075), r, z, r, width=0.15)
        beveled_box(b, (side * (hw + 0.08), 1.08 if sedan else 1.15, 0.66),
                    (0.16, 0.12, 0.10), 'ART_Frame', 0.025)
        beveled_box(b, (side * (hw - 0.26), 0.66, front - 0.022),
                    (0.38 if sedan else 0.29, 0.13, 0.05), 'ART_LampGlow', 0.014)
        beveled_box(b, (side * (hw - 0.23), 0.64 if sedan else 0.90, rear + 0.022),
                    (0.31 if sedan else 0.18, 0.14 if sedan else 0.28, 0.05), 'ART_SignalRed', 0.012)
    beveled_box(b, (0, 0.45, front - 0.008), (0.62, 0.09, 0.016), 'ART_Frame', 0.003)
    for z in (front - 0.010, rear + 0.010):
        beveled_box(b, (0, 0.48, z), (0.33, 0.165, 0.020),
                    'HK_WhitePaint' if sedan else 'ART_SignalYellow', 0.012)


def truck(b, name):
    large = name == 'HK_Truck_Large'
    length, w, h, cab_len, cab_h, radius = (11.8, 2.49, 3.62, 2.30, 3.05, 0.52) if large else (8.6, 2.30, 3.62, 1.95, 2.80, 0.46)
    half, hw = length / 2, w / 2
    # Author in the car's +Z convention, then rotate to the parked trucks' -X front.
    turn = lambda p: (-p[2], p[1], p[0])
    cab_center = half - cab_len / 2
    profile = [(-cab_len / 2, cab_h - 0.10), (-cab_len / 2 + 0.18, cab_h),
               (cab_len / 2 - 0.22, cab_h), (cab_len / 2, cab_h - 0.12)]
    rings = []
    for z, top in profile:
        rings.append([(x, y + (0.60 + top) / 2, z + cab_center)
                      for x, y in outline(w, top - 0.60, 0.15)])
    loft(b, rings, 'HK_KeiPaint', turn)
    inside = (0, 1.6, cab_center)
    panel(b, [(-hw + 0.22, 1.72, half + 0.004), (hw - 0.22, 1.72, half + 0.004),
              (hw - 0.28, cab_h - 0.29, half + 0.004), (-hw + 0.28, cab_h - 0.29, half + 0.004)],
          'ART_Glass', inside, turn)
    for side in (-1, 1):
        panel(b, [(side * hw, 1.63, half - cab_len + 0.24), (side * hw, 1.63, half - 0.27),
                  (side * hw, cab_h - 0.27, half - 0.34), (side * hw, cab_h - 0.27, half - cab_len + 0.24)],
              'ART_Glass', inside, turn)
        beveled_box(b, (side * (hw + 0.22), cab_h - 0.54, half - 0.12),
                    (0.14, 0.42, 0.11), 'ART_Frame', 0.035, turn)
        beveled_box(b, (side * (hw + 0.10), cab_h - 0.31, half - 0.12),
                    (0.26, 0.035, 0.035), 'ART_FrameLight', 0.007, turn)
        beveled_box(b, (side * (hw - 0.38), 0.91, half + 0.025),
                    (0.37, 0.20, 0.05), 'ART_LampGlow', 0.02, turn)
    cargo_front = half - cab_len - 0.15
    cargo_bottom = radius * 2 + 0.05
    rings = []
    for z in (-half, -half + 0.14, cargo_front - 0.12, cargo_front):
        inset = 0.10 if z in (-half, cargo_front) else 0
        rings.append([(x, y + (cargo_bottom + h) / 2, z)
                      for x, y in outline(w - 2 * inset, h - cargo_bottom - 2 * inset, 0.12)])
    loft(b, rings, 'ART_Cargo', turn)
    # Large light planes suggest the cargo sides instead of rows of tiny ribs.
    for side in (-1, 1):
        for fraction in (0.26, 0.57, 0.82):
            z = -half + (cargo_front + half) * fraction
            beveled_box(b, (side * (hw + 0.012), (cargo_bottom + h) / 2, z),
                        (0.024, h - cargo_bottom - 0.40, 0.065), 'ART_FrameLight', 0.006, turn)
    beveled_box(b, (0, radius + 0.12, 0), (w * 0.59, 0.24, length - 0.8), 'ART_Frame', 0.035, turn)
    axles = (half - 1.35, -half + 3.10, -half + 1.80) if large else (half - 1.15, -half + 2.30)
    for z in axles:
        for side in (-1, 1):
            wheel(b, side * (hw - 0.16), radius, z, radius, turn, width=0.30)
    beveled_box(b, (0, 0.62, half + 0.06), (w + 0.02, 0.26, 0.16), 'ART_Frame', 0.035, turn)
    beveled_box(b, (0, 0.64, half + 0.15), (0.33, 0.20, 0.02), 'HK_PlateGreen', 0.005, turn)
    beveled_box(b, (0, 1.29, half + 0.022), (w * 0.56, 0.23, 0.044), 'ART_Frame', 0.008, turn)
    for side in (-1, 1):
        beveled_box(b, (side * (hw - 0.30), 0.75, -half - 0.03), (0.36, 0.16, 0.04),
                    'ART_SignalRed', 0.012, turn)
    beveled_box(b, (0, 0.51, -half + 0.05), (w - 0.10, 0.14, 0.12), 'ART_Frame', 0.015, turn)


def build(name, mesh_class):
    b = mesh_class(name)
    b.abstract = True
    if name == 'HK_StreetLamp':
        lantern(b)
    elif name in SIGNAL_MODELS:
        signals(b, name)
        if name != 'ART_Signal_Support':
            # The source's lens geometry is on local -Z (not the cube's +Z).
            # Reflect Blender Y, which represents Unity depth, and fix winding.
            b.vertices = [(x, -y, z) for x, y, z in b.vertices]
            b.faces = [tuple(reversed(indices)) for indices in b.faces]
    elif name.startswith('HK_Truck'):
        truck(b, name)
    else:
        car(b, name)
    return b
