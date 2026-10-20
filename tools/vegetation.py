"""Species-informed, baked vegetation in Unity metres; no textures or runtime animation.

Hikone's green plan identifies tabu/shii woodland. FFPRI's tree descriptions guide the
spreading tabu, vase-shaped zelkova and horizontal old-pine boughs. Individual positions,
ages and pruning are artistic approximations, not a botanical survey. See the art notes.
"""
import math
import random
from mathutils import Vector
from abstract_props import cylinder


def _tuft(b, center, size, angle, material, seed, fine=True):
    """Scalloped, softly shaded foliage with small oval touches of broken colour.

    Shared corner pigments interpolate across the volume. No large triangular paint
    planes or pointed radial fans remain; the silhouette and brushwork are separate.
    """
    rng = random.Random(seed)
    distant = getattr(b, 'distant', False)
    rx, ry, rz = size
    ca, sa = math.cos(angle), math.sin(angle)
    phase = seed * 0.071
    def point(lat, theta):
        r = math.cos(lat)
        lobe = 1 + 0.075 * math.sin(theta * 3 + phase + lat) + 0.045 * math.cos(theta * 5 - phase)
        u, v = rx * r * math.cos(theta) * lobe, rz * r * math.sin(theta) * lobe
        h = ry * (math.sin(lat) + 0.065 * r * math.sin(theta * 2 + phase))
        return Vector((center[0] + u * ca - v * sa, center[1] + h, center[2] + u * sa + v * ca))
    def vertices(lats, count):
        return [point(-math.pi / 2, 0), *[point(lat, i * math.tau / count) for lat in lats for i in range(count)],
                point(math.pi / 2, 0)]
    high_lats = (-0.85, 0.0, 0.85)
    reference = vertices(high_lats, 12)
    lats, count = high_lats, 12
    points = reference
    ico_faces = ((0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11),
                 (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
                 (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9),
                 (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1))
    if distant:
        t = (1 + math.sqrt(5)) / 2
        unit = [Vector(v).normalized() for v in ((-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0),
                (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t), (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1))]
        points = [point(math.asin(v.y), math.atan2(v.z, v.x)) for v in unit]
    # Both tessellations retain each volume's exact envelope, including irregular lobes.
    if distant:
        for axis in range(3):
            lo, hi = min(p[axis] for p in reference), max(p[axis] for p in reference)
            old_lo, old_hi = min(p[axis] for p in points), max(p[axis] for p in points)
            for p in points:
                p[axis] = lo + (p[axis] - old_lo) * (hi - lo) / (old_hi - old_lo)
    tones = []
    for p in points:
        q = p - Vector(center)
        light = max(0, min(1, 0.50 + q.y / ry * 0.30 - q.x / rx * 0.13 + q.z / rz * 0.10))
        shadow, sun = (0.32, 0.45, 0.37), (0.62, 0.68, 0.37)
        drift = 0.018 * math.sin(q.x * 2.1 + q.y * 1.8 + phase)
        tones.append(tuple(a + (c - a) * light + drift - (0.025 if material == 'HK_LeafDark' else 0)
                           for a, c in zip(shadow, sun)))
    faces = []
    def face(indices):
        pts, colors = [points[i] for i in indices], [tones[i] for i in indices]
        normal = (pts[1] - pts[0]).cross(pts[2] - pts[0])
        if normal.dot(sum(pts, Vector()) / len(pts) - Vector(center)) < 0:
            pts.reverse(); colors.reverse()
        b.face(pts, material, strokes=False, pigment=list(reversed(colors)))
        b.smooth[-1] = True
        faces.append(pts)
    if distant:
        for indices in ico_faces:
            face(indices)
    else:
        for i in range(count):
            j = (i + 1) % count
            face([0, 1 + i, 1 + j])
            for ring in range(len(lats) - 1):
                first, second = 1 + ring * count, 1 + (ring + 1) * count
                face([first + i, second + i, second + j, first + j])
            first = 1 + (len(lats) - 1) * count
            face([len(points) - 1, first + j, first + i])
    if not fine or distant:
        return
    # Small opaque ovals sit on the actual hull facets, like separate brush touches.
    eligible = [pts for pts in faces if sum(p.y for p in pts) / len(pts) > center[1] - ry * 0.25]
    palette = ((0.64, 0.69, 0.39), (0.53, 0.63, 0.37), (0.40, 0.54, 0.42), (0.63, 0.60, 0.39))
    for i in range(2):
        a, c, d = rng.choice(eligible)[:3]
        normal = (c - a).cross(d - a).normalized()
        origin = (a + c + d) / 3 + normal * 0.004
        u = (c - a).normalized() * min((c - a).length * 0.12, rx * 0.09)
        v = normal.cross(u) * 0.48
        pts = [origin + u * math.cos(k * math.tau / 6) + v * math.sin(k * math.tau / 6) for k in range(6)]
        b.face(pts, material, strokes=False, pigment=palette[(seed + i) % len(palette)])
        b.strokes += 1
        b.details[-1] = b.strokes


def spray(b, center, size, angle, material, seed, fine=True):
    """Interlocking small tufts leave a broken edge instead of one inflated leaf shell."""
    rng = random.Random(seed + 431)
    offsets = ((-0.48, 0.08, -0.16), (0.47, -0.05, -0.20), (-0.18, 0.45, 0.20),
               (0.12, -0.41, 0.17), (0.10, 0.06, 0.48), (-0.05, 0.0, -0.48), (0.0, 0.10, 0.0)) if fine else (
               (-0.32, 0.0, -0.18), (0.31, 0.16, -0.12), (0.0, -0.12, 0.30))
    ca, sa = math.cos(angle), math.sin(angle)
    for i, (x, y, z) in enumerate(offsets):
        x, z = x * size[0], z * size[2]
        at = (center[0] + x * ca - z * sa, center[1] + y * size[1], center[2] + x * sa + z * ca)
        scale = rng.uniform(0.43, 0.54) if fine else rng.uniform(0.66, 0.76)
        radii = (size[0] * scale, size[1] * scale * rng.uniform(0.82, 1.1), size[2] * scale)
        _tuft(b, at, radii, angle + rng.uniform(-0.35, 0.35), material, seed + i * 97, fine)


def _mix(a, c, t):
    return tuple(x + (y - x) * t for x, y in zip(a, c))


def _leaf_spray(b, center, size, angle, seed, season, fine):
    """Folded opaque leaves in three dimensions, with a lighter distant leaf grouping.

    Every blade has broad shoulders, a folded midrib and a front and back. A sample
    supplies the distant crown, fitted to the complete spray's actual envelope.
    """
    rng = random.Random(seed)
    ca, sa = math.cos(angle), math.sin(angle)
    distant = getattr(b, 'distant', False)
    palette = ((0.23, 0.36, 0.25), (0.42, 0.51, 0.22), (0.89, 0.73, 0.23),
               (0.98, 0.67, 0.19), (0.85, 0.35, 0.15))
    offsets = ((-0.43, 0.03, -0.15), (0.39, 0.13, -0.20),
               (-0.12, 0.35, 0.25), (0.13, -0.27, 0.22)) if fine else ((-0.28, 0.10, -0.12), (0.28, -0.05, 0.18))
    for k, (dx, dy, dz) in enumerate(offsets):
        origin = Vector((center[0] + (dx * ca - dz * sa) * size[0],
                         center[1] + dy * size[1],
                         center[2] + (dx * sa + dz * ca) * size[2]))
        radii = Vector((size[0] * 0.63, size[1] * 0.86, size[2] * 0.63))
        phase = rng.uniform(0, math.tau)
        heat = max(0, min(0.999, season + rng.uniform(-0.13, 0.13))) * (len(palette) - 1)
        tone = _mix(palette[int(heat)], palette[int(heat) + 1], heat % 1)
        blades = []
        count = 24 if fine else 4
        for i in range(count):
            a = phase + i * 2.39996
            y = 1 - 2 * (i + 0.5) / count
            r = math.sqrt(1 - y * y)
            at = Vector((math.cos(a) * radii.x * r, y * radii.y, math.sin(a) * radii.z * r))
            # Irregular, overlapping sprays fill a volume rather than a stack of discs.
            at *= rng.uniform(0.50, 0.96)
            heading = a + rng.uniform(-0.8, 0.8)
            tilt = rng.uniform(-0.85, 0.85)
            length = min(radii.x, radii.z) * (0.62 if fine else 1.30) * rng.uniform(0.75, 1.2)
            u = Vector((math.cos(heading), tilt, math.sin(heading))).normalized() * length
            v = Vector((-math.sin(heading), rng.uniform(-0.30, 0.30), math.cos(heading))).normalized() * length * 0.34
            normal = u.cross(v).normalized()
            if fine:
                # Six vertices and eight faces keep a closed, folded hexagonal blade.
                # The raised midrib and shoulder floor replace two extra fan centres.
                fold = -normal * length * 0.07
                blades.append([at - u * 0.55 + fold, at - u * 0.23 + v * 0.80, at + u * 0.17 + v,
                               at + u * 0.55 + fold, at + u * 0.17 - v, at - u * 0.23 - v * 0.80])
            else:
                # Distant woodland needs a broad four-corner blade, not near leaf shoulders.
                leaf = [at - u * 0.55, at - u * 0.23 + v * 0.80, at + u * 0.17 + v,
                        at + u * 0.55, at + u * 0.17 - v, at - u * 0.23 - v * 0.80,
                        at + normal * length * 0.07, at - normal * length * 0.04]
                blades.append([leaf[0], (leaf[1] + leaf[2]) / 2, leaf[3], (leaf[4] + leaf[5]) / 2, leaf[6], leaf[7]])
        blades = [[Vector((q.x * ca - q.z * sa, q.y, q.x * sa + q.z * ca)) for q in blade] for blade in blades]
        chosen = blades
        if distant:
            # Three broad blades preserve coverage from above, below and the side.
            chosen = [[q * 1.70 for q in blades[i]] for i in ((0, count // 3, count * 2 // 3) if fine else (0, count // 2))]
            for axis in range(3):
                lo, hi = min(q[axis] for blade in blades for q in blade), max(q[axis] for blade in blades for q in blade)
                old_lo, old_hi = min(q[axis] for blade in chosen for q in blade), max(q[axis] for blade in chosen for q in blade)
                for blade in chosen:
                    for q in blade:
                        q[axis] = lo + (q[axis] - old_lo) * (hi - lo) / (old_hi - old_lo)
        for i, blade in enumerate(chosen):
            leaf_tone = _mix(tone, (0.99, 0.79, 0.31), 0.08 + (i % 7) * 0.035)
            pts = [origin + q for q in blade]
            faces = ((0, 1, 2), (0, 2, 3), (0, 3, 4), (0, 4, 5),
                     (1, 5, 4), (1, 4, 2), (0, 5, 1), (3, 2, 4)) if fine else (
                     (4, 1, 0), (5, 0, 1), (4, 2, 1), (5, 1, 2),
                     (4, 3, 2), (5, 2, 3), (4, 0, 3), (5, 3, 0))
            for indices in faces:
                b.face([pts[n] for n in indices], 'HK_Leaf', strokes=False, pigment=leaf_tone)
                b.smooth[-1] = True
            b.strokes += 1


def _broadleaf(b, species, base, height, spread, seed, lean, fine, root_depth):
    """Concept-sheet broadleaf: flared forks, tiered foliage and coherent autumn patches."""
    rng = random.Random(seed)
    distant = getattr(b, 'distant', False)
    evergreen = species in ('tabu', 'shii')
    radius = height * 0.037

    def p(x, y, z):
        return Vector((base[0] + x + lean[0] * y / height,
                       base[1] + y, base[2] + z + lean[1] * y / height))

    def wood(path, start_radius, end_radius, seed_offset=0):
        # A continuous bent tube keeps the trunk and boughs from reading as stacked rods.
        count = 5 if not fine else 7 if distant else 9
        rings = []
        for j, at in enumerate(path):
            axis = (path[min(j + 1, len(path) - 1)] - path[max(0, j - 1)]).normalized()
            ref = Vector((1, 0, 0)) if abs(axis.y) > 0.8 else Vector((0, 1, 0))
            u = axis.cross(ref).normalized()
            v = axis.cross(u)
            r = start_radius + (end_radius - start_radius) * j / (len(path) - 1)
            rings.append([at + (u * math.cos(k * math.tau / count) + v * math.sin(k * math.tau / count))
                          * r * (1 + 0.10 * math.sin(k * 2.7 + seed_offset)) for k in range(count)])
        for j, (lower, upper) in enumerate(zip(rings, rings[1:])):
            for k in range(count):
                n = (k + 1) % count
                pts = [lower[k], lower[n], upper[n], upper[k]]
                colors = []
                for q in pts:
                    light = 0.48 + 0.24 * math.sin(q.x * 1.7 + q.z * 0.7) + 0.11 * math.sin(k * 4.1 + j)
                    colors.append(_mix((0.25, 0.27, 0.25), (0.70, 0.61, 0.44), light))
                b.face(pts, 'ART_TreeBark', strokes=False, pigment=list(reversed(colors)))
                b.smooth[-1] = True
                if fine and not distant and start_radius > 0.12 and k % 2 == 0:
                    # Raised, narrow bark flakes follow the grain of each bent segment.
                    # They are authored surfaces, with the same pigment draw as the trunk.
                    a, c = lower[k].lerp(lower[n], 0.24), lower[k].lerp(lower[n], 0.42)
                    d, e = upper[k].lerp(upper[n], 0.28), upper[k].lerp(upper[n], 0.39)
                    normal = (pts[1] - pts[0]).cross(pts[2] - pts[0]).normalized() * 0.003
                    flake = [a.lerp(d, 0.08) + normal, c.lerp(e, 0.17) + normal,
                             c.lerp(e, 0.78) + normal, a.lerp(d, 0.90) + normal]
                    color = (0.66, 0.60, 0.47) if (j + k) % 3 else (0.36, 0.39, 0.35)
                    b.face(flake, 'ART_TreeBark', strokes=False, pigment=color)
        b.face(list(reversed(rings[0])), 'ART_TreeBark', strokes=False)
        b.face(rings[-1], 'ART_TreeBark', strokes=False)

    trunk = [p(0, -root_depth, 0), p(-radius * 0.16, height * 0.13, radius * 0.14),
             p(radius * 0.23, height * 0.28, 0), p(-radius * 0.12, height * 0.39, radius * 0.18)]
    wood(trunk, radius * 1.12, radius * 0.62)
    # Short buttresses stay inside the original planting footprint at body height.
    for i in range(4):
        a = i * math.tau / 4 + 0.3
        wood([p(math.cos(a) * radius * 1.30, -root_depth, math.sin(a) * radius * 1.30),
              p(math.cos(a) * radius * 0.35, height * 0.08, math.sin(a) * radius * 0.35)],
             radius * 0.34, radius * 0.18, i)

    branch_count = 6
    for i in range(branch_count):
        a = i * 2.39996 + rng.uniform(-0.24, 0.24)
        reach = spread * rng.uniform(0.83, 1.10)
        # Lower lateral limbs and rising inner forks form one irregular domed crown.
        top = height * (0.59 + (i % 3) * 0.105 + rng.uniform(-0.025, 0.025))
        start = trunk[2] if i % 2 else trunk[3]
        elbow = p(math.cos(a) * reach * 0.29, height * (0.46 + (i % 3) * 0.045), math.sin(a) * reach * 0.29)
        fork = p(math.cos(a) * reach * 0.66, top - height * 0.055, math.sin(a) * reach * 0.66)
        wood([start, elbow, fork], radius * (0.70 - (i % 3) * 0.045), radius * 0.14, i)
        for j in range(3):
            heading = a + (j - 1) * 0.42
            distance = reach * (0.90 if j == 1 else 1.0)
            y = top + height * (0.045 if j == 1 else rng.uniform(-0.025, 0.02))
            tip = p(math.cos(heading) * distance, y, math.sin(heading) * distance)
            if fine and not distant:
                wood([fork, fork.lerp(tip, 0.52) + Vector((0, height * 0.015, 0)), tip],
                     radius * 0.115, radius * 0.025, i + j)
            # Gold and copper belong to entire boughs; shaded/evergreen pockets stay green.
            season = (0.18 if evergreen else 0.43) + 0.22 * math.sin(a + seed * 0.017) + (i % 3) * 0.065
            _leaf_spray(b, tip, (spread * 0.46, height * 0.115, spread * 0.40),
                        heading, seed + i * 137 + j * 31, season, fine)
    for i, (dx, dy, dz) in enumerate(((-0.18, 0.77, 0.12), (0.16, 0.88, -0.16), (-0.03, 0.92, 0.08))):
        _leaf_spray(b, p(spread * dx, height * dy, spread * dz),
                    (spread * 0.54, height * 0.09, spread * 0.47), i * 2.1,
                    seed + 907 + i * 31, (0.32 if evergreen else 0.62) + i * 0.055, fine)


def tree(b, species, base=(0, 0, 0), height=10, spread=4, seed=1, lean=(0, 0), fine=True, root_depth=0):
    """Explicit trunk -> primary bough -> forked twig -> foliage hierarchy."""
    if species not in ('pine', 'cedar'):
        return _broadleaf(b, species, base, height, spread, seed, lean, fine, root_depth)
    rng = random.Random(seed)
    evergreen = species in ('tabu', 'shii')
    cherry, pine, cedar = species == 'cherry', species == 'pine', species == 'cedar'
    fork = 0.32 if evergreen else 0.38 if species == 'zelkova' else 0.33
    count = 8 if cedar else 4
    radius = height * (0.030 if evergreen or cherry else 0.024)
    def p(x, y, z):
        return (base[0] + x + lean[0] * y / height, base[1] + y, base[2] + z + lean[1] * y / height)
    def wood(a, c, radius, segments, end_radius):
        start = len(b.faces)
        cylinder(b, a, c, radius, 'HK_Bark', segments=segments, end_radius=end_radius)
        # Warm bark and reflected violet share gradients instead of faceted stripes.
        for i in range(start, len(b.faces)):
            colors = []
            for index in b.faces[i]:
                x, z, y = b.vertices[index]
                light = 0.5 + 0.25 * math.sin(x * 1.3 + z * 0.9) + 0.10 * math.sin(y * 1.7)
                cool, warm = ((0.34, 0.35, 0.37), (0.48, 0.40, 0.31)) if pine else ((0.39, 0.35, 0.40), (0.60, 0.46, 0.31))
                colors.append(tuple(a + (c - a) * light for a, c in zip(cool, warm)))
            b.pigments[i], b.smooth[i] = colors, True
    trunk = [p(0, -root_depth, 0), p(0.10, height * 0.19, -0.05), p(-0.06, height * fork, 0.10)]
    if pine:
        trunk.append(p(0.22, height * 0.78, -0.1))
    elif cedar:
        trunk.append(p(0, height * 0.98, 0))
    for i, (a, c) in enumerate(zip(trunk, trunk[1:])):
        wood(a, c, radius * (1 - i * 0.23), segments=7, end_radius=radius * (0.71 - i * 0.23))
    for i in range(count):
        angle = i * 2.39996 + rng.uniform(-0.28, 0.28)
        reach = spread * rng.uniform(0.68, 1.02)
        if species == 'zelkova':
            elbow_y, tip_y = height * 0.56, height * rng.uniform(0.70, 0.86)
        elif pine:
            elbow_y = height * (0.48 + i * 0.075)
            tip_y = elbow_y + height * 0.05
            reach *= 1.07 - i * 0.09
        elif cedar:
            elbow_y = height * (0.33 + i * 0.075)
            tip_y = elbow_y - height * 0.025
            reach *= 1.1 - i * 0.11
        else:
            elbow_y = height * (0.46 + rng.uniform(-0.04, 0.06))
            tip_y = height * rng.uniform(0.58, 0.80)
        start = p(0, min(height * fork, elbow_y - height * 0.1), 0)
        elbow = p(math.cos(angle) * reach * 0.48, elbow_y, math.sin(angle) * reach * 0.48)
        end = p(math.cos(angle) * reach * 0.82, tip_y, math.sin(angle) * reach * 0.82)
        if pine or cedar:
            start = p(0.1, elbow_y - height * 0.035, 0)
        wood(start, elbow, radius * 0.50, segments=6, end_radius=radius * 0.27)
        if not getattr(b, 'distant', False):
            wood(elbow, end, radius * 0.27, segments=5, end_radius=radius * 0.09)
        # Separate forks leave narrow sky gaps; neither crown nor trunk is a single ball.
        for j, turn in enumerate((-0.40, 0.43)):
            a = angle + turn
            distance = reach * (1 if j < 2 else 0.60)
            y = tip_y + height * (rng.uniform(-0.065, 0.035) if j < 2 else -0.10)
            tip = p(math.cos(a) * distance, y, math.sin(a) * distance)
            if not getattr(b, 'distant', False):
                wood(elbow if j == 2 else end, tip, radius * 0.12, segments=5, end_radius=radius * 0.035)
            scale = spread * (0.51 if evergreen else 0.47 if cherry else 0.43)
            if not fine: scale *= 1.15
            thickness = height * (0.16 if evergreen else 0.15 if cherry else 0.15)
            if pine or cedar:
                scale, thickness = spread * 0.37, height * 0.045
            if species == 'shii':
                thickness *= 1.08
            mat = 'HK_LeafDark' if pine or cedar or (evergreen and (i + j) % 3 == 0) else 'HK_Leaf'
            spray(b, tip, (scale * 1.15, thickness, scale * 0.78), a, mat, seed + i * 19 + j, fine)
    if not pine and not cedar:
        # Staggered inner foliage veils the forks while leaving irregular sky windows.
        for k, (dx, dy, dz) in enumerate(((-0.22, 0.66, 0.12), (0.20, 0.79, -0.16), (-0.05, 0.90, 0.08))):
            spray(b, p(spread * dx, height * dy, spread * dz),
                  (spread * 0.58, height * 0.14, spread * 0.52), k * 2.1, 'HK_Leaf', seed + 801 + k, fine)
    if not pine and not cedar:
        # Short pendant boughs break the common umbrella edge and veil the trunk forks.
        for k, (dx, dy, dz) in enumerate(((0.28, 0.40, 0.12), (-0.32, 0.45, -0.20), (0.05, 0.50, 0.35))):
            tip = p(spread * dx, height * dy, spread * dz)
            wood(p(0, height * fork, 0), tip, radius * 0.22, segments=5, end_radius=radius * 0.055)
            spray(b, tip, (spread * 0.34, height * 0.085, spread * 0.30),
                  k * 2.3 + 0.6, 'HK_LeafDark' if k == 1 else 'HK_Leaf', seed + 921 + k, fine)
    if cedar:
        spray(b, p(0, height * 0.97, 0), (0.4, height * 0.04, 0.4), 0, 'HK_LeafDark', seed + 991, fine)


def shrubs(b, centers, seed=1):
    for i, (x, y, z, width, height, depth) in enumerate(centers):
        cylinder(b, (x, 0, z), (x + 0.05, y, z), 0.035, 'HK_Bark', segments=5, end_radius=0.012)
        spray(b, (x, y, z), (width, height, depth), i * 1.9, 'HK_LeafDark' if i % 3 == 0 else 'HK_Leaf', seed + i)
