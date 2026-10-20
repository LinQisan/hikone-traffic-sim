"""Shared stone paths, steps and bridges for the castle's observed circulation graph.

Top triangles are exported unchanged to Ground. The hill is cut beneath the same corridors;
Roka remains above the entrance slopes instead of filling the dry cut with a terrain ramp.
"""
import math
from functools import lru_cache
from castle_approach import data

THICKNESS = 0.28
BED_DEPTH = 0.22
MAX_RISER = 0.17


def lerp(a, c, t):
    return tuple(a[k] + (c[k] - a[k]) * t for k in range(len(a)))


def sides(points, half):
    normals = []
    for a, c in zip(points, points[1:]):
        dx, dz = c[0] - a[0], c[2] - a[2]
        length = math.hypot(dx, dz)
        normals.append((-dz / length, dx / length))
    offsets = []
    for i in range(len(points)):
        a, c = normals[max(0, i - 1)], normals[min(i, len(normals) - 1)]
        scale = min(half * 2, half / max(0.5, 1 + a[0] * c[0] + a[1] * c[1]))
        offsets.append(((a[0] + c[0]) * scale, (a[1] + c[1]) * scale))
    return offsets


@lru_cache(maxsize=1)
def segments():
    result = []
    for route in data()['paths']['routes']:
        points = route['points']
        offsets = sides(points, route['width'] / 2)
        for i, (a, c) in enumerate(zip(points, points[1:])):
            result.append(dict(route=route, index=i, a=a, c=c, left=offsets[i], right=offsets[i + 1]))
    return result


def quad(segment, start=0, end=1, y=None, half_extra=0):
    a, c, left, right = (segment[k] for k in ('a', 'c', 'left', 'right'))
    result = []
    half = segment['route']['width'] / 2
    for t, sign in ((start, -1), (end, -1), (end, 1), (start, 1)):
        x, height, z = lerp(a, c, t)
        dx, dz = lerp(left, right, t)
        scale = (half + half_extra) / half
        result.append((x + sign * dx * scale, height if y is None else y, z + sign * dz * scale))
    return result


@lru_cache(maxsize=1)
def tops():
    """Wearing surfaces, including actual horizontal treads at both detail levels."""
    result = []
    for segment in segments():
        route, a, c = (segment[k] for k in ('route', 'a', 'c'))
        rise = c[1] - a[1]
        if route['kind'] == 'stairs' and abs(rise) > MAX_RISER:
            length = math.hypot(c[0] - a[0], c[2] - a[2])
            landing = min(0.2, route['width'] / 2 / length)
            result.append((quad(segment, 0, landing, a[1]), 'HK_Sidewalk', route['id']))
            risers = math.ceil(abs(rise) / MAX_RISER)
            for step in range(risers + 1):
                y = a[1] + rise * step / risers
                start = landing + (1 - landing * 2) * step / (risers + 1)
                end = landing + (1 - landing * 2) * (step + 1) / (risers + 1)
                result.append((quad(segment, start, end, y), 'HK_Sidewalk', route['id']))
            result.append((quad(segment, 1 - landing, 1, c[1]), 'HK_Sidewalk', route['id']))
        else:
            result.append((quad(segment), 'HK_WoodMid' if route['id'] == 'roka-bridge' else 'HK_Sidewalk', route['id']))
    # The Ninomaru approach joins an existing street. Its crossing keeps the road's
    # authored surface instead of laying a raised stone slab across the carriageway.
    from road_network import polygons, ccw, difference, triangulate
    roads = polygons()[0]
    clipped = []
    for points, material, route_id in result:
        if route_id != 'ninomaru-access':
            clipped.append((points, material, route_id))
            continue
        for p in difference([ccw([(x, z) for x, y, z in points])], roads):
            for t in triangulate(p):
                # A repeated last corner keeps the top-record shape uniform; the mesh
                # and ground exporter below omit its zero-area second triangle.
                q = [(x, 0.16, z) for x, z in t]
                clipped.append((q + q[-1:], material, route_id))
    return clipped


@lru_cache(maxsize=1)
def corridors():
    result = []
    for segment in segments():
        route = segment['route']
        if route['kind'] != 'bridge':
            result.append(segment)
        elif route['id'] == 'roka-bridge':
            # Only the gallery/court and the Kanenomaru landing touch earth. The middle
            # crosses the entrance paths about 8.5 m above their meeting point.
            for lo, hi in ((0, 0.025), (26.5 / 44, 1)):
                cut = dict(segment)
                cut.update(a=lerp(segment['a'], segment['c'], lo), c=lerp(segment['a'], segment['c'], hi),
                           left=lerp(segment['left'], segment['right'], lo), right=lerp(segment['left'], segment['right'], hi))
                result.append(cut)
    return result


def terrain_contours():
    tower = data()['compound'][0]
    angle = tower['yaw'] * math.pi / 180
    yield [(tower['x'] + u * tower['size'][0] / 2 * math.cos(angle) + v * tower['size'][1] / 2 * math.sin(angle),
            tower['z'] - u * tower['size'][0] / 2 * math.sin(angle) + v * tower['size'][1] / 2 * math.cos(angle))
           for u, v in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    for segment in corridors():
        for extra in (0, 3):
            yield [(x, z) for x, y, z in quad(segment, half_extra=extra)]
        # Long slopes need intermediate vertices so a terrace boundary cannot pull a
        # path side up to an unrelated height between its endpoints.
        a, c = segment['a'], segment['c']
        count = max(1, math.ceil(math.dist(a, c) / 4))
        fractions = [i / count for i in range(1, count)]
        if segment['route']['kind'] == 'stairs':
            landing = min(0.2, segment['route']['width'] / 2 / math.hypot(c[0] - a[0], c[2] - a[2]))
            fractions += [landing, 1 - landing]
        for t in fractions:
            x, y, z = lerp(a, c, t)
            dx, dz = lerp(segment['left'], segment['right'], t)
            yield [(x - dx, z - dz), (x + dx, z + dz)]
    # The bridge is a void in the hill, not a terrain-supported ramp. Preserve its
    # dry-cut cross sections even when the surrounding natural slope is remodelled.
    for segment in segments():
        if segment['route']['id'] != 'roka-bridge': continue
        # Constrain the full deck/walk corridor, including the landward section
        # beyond the dry cut. Natural terrain must not protrude through its treads.
        yield [(x,z) for x,y,z in quad(segment,half_extra=.35)]
        yield [(x, z) for x, y, z in quad(segment, 0, 26.5 / 44, half_extra=5)]
        for t in (0.025, 0.125, 0.25, 0.4, 26.5 / 44 - 0.10, 26.5 / 44):
            cut = quad(segment, t, t, half_extra=5)
            yield [(cut[i][0], cut[i][2]) for i in (0, 2)]


def surface_height(segment, x, z):
    """The ramp below a flight uses its actual mitered cross sections, not centre distance."""
    a, c = segment['a'], segment['c']
    if segment['route']['kind'] == 'stairs':
        landing = min(0.2, segment['route']['width'] / 2 / math.hypot(c[0] - a[0], c[2] - a[2]))
        pieces = [(0, landing, a[1], a[1]), (landing, 1 - landing, a[1], c[1]), (1 - landing, 1, c[1], c[1])]
    else:
        pieces = [(0, 1, a[1], c[1])]
    for start, end, low, high in pieces:
        p = [(px, low if i in (0, 3) else high, pz) for i, (px, y, pz) in enumerate(quad(segment, start, end, half_extra=0.35))]
        for ids in ((0, 1, 2), (0, 2, 3)):
            (ax, ay, az), (bx, by, bz), (cx, cy, cz) = [p[i] for i in ids]
            d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz)
            if abs(d) < 1e-12: continue
            u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d
            v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d
            if min(u, v, 1 - u - v) >= -1e-6:
                return u * ay + v * by + (1 - u - v) * cy
    return None


def distance(segment, x, z):
    a, c = segment['a'], segment['c']
    dx, dz = c[0] - a[0], c[2] - a[2]
    t = max(0, min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / (dx * dx + dz * dz)))
    if segment['route']['kind'] == 'stairs':
        landing = min(0.2, segment['route']['width'] / 2 / math.hypot(dx, dz))
        progress = min(1, max(0, (t - landing) / (1 - landing * 2)))
    else:
        progress = t
    return math.hypot(x - a[0] - dx * t, z - a[2] - dz * t), a[1] + (c[1] - a[1]) * progress


def bed_height(x, z, original):
    # Preserve the solid turret core while recessing its courtyard for the path layer.
    tower = data()['compound'][0]
    a = tower['yaw'] * math.pi / 180
    dx, dz = x - tower['x'], z - tower['z']
    if abs(dx * math.cos(a) - dz * math.sin(a)) <= tower['size'][0] / 2 + 0.0001 and abs(dx * math.sin(a) + dz * math.cos(a)) <= tower['size'][1] / 2 + 0.0001:
        return tower['floor']
    smooth = lambda t: max(0, min(1, t)) ** 2 * (3 - 2 * max(0, min(1, t)))
    for segment in segments():
        if segment['route']['id'] != 'roka-bridge': continue
        a, c = segment['a'], segment['c']
        dx, dz = c[0] - a[0], c[2] - a[2]
        t = ((x - a[0]) * dx + (z - a[2]) * dz) / (dx * dx + dz * dz)
        end = 26.5 / 44
        deck=surface_height(segment,x,z)
        if deck is not None:original=min(original,deck-BED_DEPTH)
        if not 0 <= t <= end: continue
        d = math.hypot(x - a[0] - t * dx, z - a[2] - t * dz)
        half = segment['route']['width'] / 2
        blend = smooth((half + 5 - d) / 4) * smooth(min(t, end - t) / 0.025)
        target = 18.1 + 8.6 * (1 - smooth(min(t - 0.025, end - t) / 0.10))
        original += (min(original, target) - original) * blend
    best, height = 0, original
    for segment in corridors():
        d, y = distance(segment, x, z)
        half = segment['route']['width'] / 2
        if d > half + 3: continue
        exact = surface_height(segment, x, z)
        if exact is not None:
            y, blend = exact, 1
        else:
            blend = min(1, max(0, (half + 3 - d) / 3))
        blend = blend * blend * (3 - 2 * blend)
        if blend > best:
            best, height = blend, max(0.15, y - BED_DEPTH)
    return original + (height - original) * best


def wall_open(x, z, low, high):
    for segment in segments():
        d, y = distance(segment, x, z)
        if d < segment['route']['width'] / 2 + 0.65 and low - 1.8 < y < high + 0.3:
            return True
    return False


def ground_triangles():
    # Float32 is also used by the GLB exporter. Preserve the same positions in Ground.
    import struct
    packed = lambda v: struct.unpack('f', struct.pack('f', v))[0]
    return {route['id']: [[packed(v) for i in ids for v in points[i]]
                         for points, material, route_id in tops() if route_id == route['id']
                         for ids in ((0, 1, 2), (0, 2, 3)) if points[ids[1]] != points[ids[2]]]
            for route in data()['paths']['routes']}


def mesh(b):
    from streetscape import outward_face
    from abstract_props import cylinder
    site = data()['castle']
    def point(p): return (p[0] - site['x'], p[1], p[2] - site['z'])
    for points, material, route_id in tops():
        centre = tuple(sum(p[k] for p in points) / 4 - (THICKNESS / 2 if k == 1 else 0) for k in range(3))
        bottom = [(x, y - THICKNESS, z) for x, y, z in points]
        faces = [[points[i] for i in ids] for ids in ((0, 1, 2), (0, 2, 3)) if points[ids[1]] != points[ids[2]]]
        faces += [[bottom[i] for i in ids] for ids in ((2, 1, 0), (3, 2, 0)) if bottom[ids[0]] != bottom[ids[1]]]
        faces += [[a, bottom[i], bottom[(i + 1) % 4], points[(i + 1) % 4]] for i, a in enumerate(points) if a != points[(i + 1) % 4]]
        for face in faces:
            outward_face(b, [point(p) for p in face], material, point(centre))
    for route in data()['paths']['routes']:
        if route['kind'] != 'bridge': continue
        if route['id'] == 'roka-bridge':
            a, c = route['points'][0], lerp(route['points'][0], route['points'][-1], 26.5 / 44)
        else:
            a, c = route['points'][1:3]
        dx, dz = c[0] - a[0], c[2] - a[2]
        length = math.hypot(dx, dz)
        for side in (-1, 1):
            offset = (-dz / length * route['width'] / 2 * side, dx / length * route['width'] / 2 * side)
            def at(t, h):
                x, y, z = lerp(a, c, t)
                return point((x + offset[0], y + h, z + offset[1]))
            cylinder(b, at(0, 0.95), at(1, 0.95), 0.075, 'HK_WoodDark', segments=4)
            for i in range(math.ceil(length / 2) + 1):
                t = i / math.ceil(length / 2)
                cylinder(b, at(t, 0), at(t, 1.05), 0.09, 'HK_WoodDark', segments=4)
        if route['id'] == 'roka-bridge':
            for t in (0.22, 0.78):
                x, y, z = lerp(a, c, t)
                for side in (-1, 1):
                    px = x - dz / length * 1.3 * side
                    pz = z + dx / length * 1.3 * side
                    cylinder(b, point((px, 18.1, pz)), point((px, y - THICKNESS, pz)), 0.16, 'HK_WoodDark', segments=4)
