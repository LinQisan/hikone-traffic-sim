"""Reviewed Kyobashi–Otemon buildings. Source outlines live in src/world/generators/castle-approach.js.

The same coordinates drive roads, terrain cuts, collision and the editor. Roof/facade heights
are approximate visual masses, not a survey or a reconstruction of hidden building interiors.
"""
import json
import os
import subprocess
import math
import random
from functools import lru_cache

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS = ('ART_CastleApproach',)
_data = None


def data():
    global _data
    if _data is None:
        script = "import {APPROACH_DATA} from './src/world/generators/castle-approach.js';console.log(JSON.stringify(APPROACH_DATA));"
        _data = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', script], cwd=ROOT))
    return _data


@lru_cache(maxsize=1)
def hill_surface():
    """One triangulated hill for the landmark mesh and the rising Otemon path.

    Constrained terrace edges keep each surviving building on its own level. The northern
    boundary follows the inner moat, including the long west ridge; heights are approximate.
    """
    site = data()['castle']
    cx, cz, crest = site['x'], site['z'], site['height']
    bank = data()['innerBank'] + data()['northBank']
    angles = sorted(set([i * math.tau / 36 for i in range(36)] +
                        [math.atan2((z - cz) / 170, (x - cx) / 140) % math.tau for x, z in bank]))
    cross = lambda ax, az, bx, bz: ax * bz - az * bx
    feet = []
    for angle in angles:
        dx, dz = 140 * math.cos(angle), 170 * math.sin(angle)
        intersections = []
        for a, c in zip(bank, bank[1:] + bank[:1]):
            sx, sz = c[0] - a[0], c[1] - a[1]
            determinant = cross(dx, dz, sx, sz)
            if abs(determinant) < 1e-9:
                continue
            ax, az = a[0] - cx, a[1] - cz
            t = cross(ax, az, sx, sz) / determinant
            u = cross(ax, az, dx, dz) / determinant
            if t > 0 and -1e-8 <= u <= 1 + 1e-8:
                intersections.append(t)
        scale = min(intersections) if intersections else 1
        feet.append((dx * scale, dz * scale))
    profile = [(0, crest), (0.20, crest), (0.40, crest - 3), (0.55, 30), (0.67, 16), (0.85, 5), (1, 0.15)]
    rings = [[(cx + x * radius, y, cz + z * radius) for x, z in feet] for radius, y in profile]
    from mathutils import Vector
    from mathutils.geometry import delaunay_2d_cdt
    def inside(point, polygon):
        x, z = point
        hit = False
        for a, c in zip(polygon, polygon[1:] + polygon[:1]):
            if (a[1] > z) != (c[1] > z) and x < a[0] + (c[0] - a[0]) * (z - a[1]) / (c[1] - a[1]):
                hit = not hit
        return hit
    terraces = data()['terraces']
    vertices, edges, lookup = [], [], {}
    def vertex(x, z):
        key = (round(x, 6), round(z, 6))
        if key not in lookup:
            lookup[key] = len(vertices)
            vertices.append(Vector((x, z)))
        return lookup[key]
    def contour(points):
        ids = [vertex(x, z) for x, z in points]
        edges.extend(zip(ids, ids[1:] + (ids[:1] if len(ids) > 2 else [])))
    for ring in rings:
        for x, y, z in ring:
            vertex(x, z)
    # Even interior samples prevent huge triangular planes between radial contours and
    # local courts. Jitter avoids a visible grid while retaining a stable baked surface.
    rng = random.Random(1730)
    for ix in range(math.floor(min(x for x, z in bank) / 9), math.ceil(max(x for x, z in bank) / 9)):
        for iz in range(math.floor(min(z for x, z in bank) / 9), math.ceil(max(z for x, z in bank) / 9)):
            x, z = ix * 9 + rng.uniform(2, 7), iz * 9 + rng.uniform(2, 7)
            if inside((x, z), bank): vertex(x, z)
    contour(bank)
    for terrace in terraces:
        contour(terrace['footprint'])
        if terrace['floor'] > 1:
            p = terrace['footprint']
            mx, mz = sum(x for x, z in p) / 4, sum(z for x, z in p) / 4
            contour([(mx + (x - mx) * 1.12, mz + (z - mz) * 1.12) for x, z in p])

    def height(x, z):
        # Continuous wooded slopes, with a broader west ridge and local stone courts.
        smooth = lambda t: (max(0, min(1, t)) ** 2) * (3 - 2 * max(0, min(1, t)))
        shore_distance=min(point_segment_distance(x,z,a,c) for a,c in zip(bank,bank[1:]+bank[:1]))
        if shore_distance < .001:return .15
        dx, dz = x - cx, z - cz
        # Keep the established core relief and bridge clearances. The concave
        # northwest spur needs a continuous shore-distance profile: a summit ray
        # there can switch between two shore hits and create an inland shelf.
        intersections=[]
        for a,c in zip(bank,bank[1:]+bank[:1]):
            sx,sz=c[0]-a[0],c[1]-a[1];det=cross(dx,dz,sx,sz)
            if abs(det)<1e-9:continue
            ax,az=a[0]-cx,a[1]-cz
            t,u=cross(ax,az,sx,sz)/det,cross(ax,az,dx,dz)/det
            if t>0 and -1e-7<=u<=1+1e-7:intersections.append(t)
        radial=max(0,min(1,1/min(intersections))) if intersections else 0
        shore=max(0,min(1,1-shore_distance/150))
        west_blend=smooth((cx-x-60)/110)
        r=radial+(shore-radial)*west_blend
        y = crest
        for (a, h), (c, k) in zip(profile, profile[1:]):
            if a <= r <= c:
                y = h + (k - h) * smooth((r - a) / (c - a))
                break
        west = data()['compound'][0]
        wx, wz = west['x'] - cx, west['z'] - cz
        t = max(0, min(1, (dx * wx + dz * wz) / (wx * wx + wz * wz)))
        distance = math.hypot(dx - t * wx, dz - t * wz)
        blend = smooth((75 - distance) / 52)
        y = max(y, 0.15 + 41.85 * blend * min(1, max(0, (1 - r) / 0.18)))
        # Low-frequency relief follows the slope, fading at the shore and summit.
        y += (math.sin(dx / 31 + dz / 47) * 1.1 + math.sin(dx / 17 - dz / 39) * 0.65) * math.sin(math.pi * r) ** 2
        total, weighted = 1, y
        for terrace in terraces:
            p = terrace['footprint']
            distance = min(point_segment_distance(x, z, a, c) for a, c in zip(p, p[1:] + p[:1]))
            if inside((x, z), p) or distance < 1e-5: return terrace['floor']
            apron = 3.2 if terrace['floor'] > 1 else 0
            if distance < apron + 44:
                weight = (1 - smooth((distance - apron) / 44)) ** 2 * (18 / max(distance, 0.001)) ** 2
                target = terrace['floor'] - (5 * smooth(distance / apron) if apron else 0)
                weighted += target * weight
                total += weight
        # Blend overlapping aprons continuously. Choosing one by proximity introduced
        # a height discontinuity along the bisector between different court levels.
        return weighted / total

    # New path vertices must sample the previous triangulated slope. Re-evaluating the
    # radial approximation at them would raise unsampled ground beside a low terrace.
    base_points, _, base_faces, *_ = delaunay_2d_cdt(vertices, edges, [], 0, 1e-6)
    base_heights = [height(p.x, p.y) for p in base_points]
    base_triangles = [[(base_points[i].x, base_heights[i], base_points[i].y) for i in f] for f in base_faces]
    base_index = triangle_index(base_triangles)
    def original_height(x, z):
        for triangle in base_index.get((math.floor(x / 16), math.floor(z / 16)), []):
            if not min(p[0] for p in triangle) - 1e-5 <= x <= max(p[0] for p in triangle) + 1e-5 or not min(p[2] for p in triangle) - 1e-5 <= z <= max(p[2] for p in triangle) + 1e-5:
                continue
            (ax, ay, az), (bx, by, bz), (cx, cy, cz) = triangle
            d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz)
            if abs(d) < 1e-12: continue
            u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d
            v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d
            if min(u, v, 1 - u - v) >= -1e-5: return u * ay + v * by + (1 - u - v) * cy
        return height(x, z)
    vertices = list(base_points)
    lookup = {(round(p.x, 6), round(p.y, 6)): i for i, p in enumerate(vertices)}
    edges = list({tuple(sorted((a, c))) for f in base_faces for a, c in zip(f, f[1:] + f[:1])})
    from castle_paths import terrain_contours, bed_height
    for polygon in terrain_contours():
        contour(polygon)
    points, _, faces, *_ = delaunay_2d_cdt(vertices, edges, [], 0, 1e-6)
    heights = [bed_height(p.x, p.y, original_height(p.x, p.y)) for p in points]
    triangles = []
    for face in faces:
        mx = sum(points[i].x for i in face) / len(face)
        mz = sum(points[i].y for i in face) / len(face)
        if not inside((mx, mz), bank): continue
        triangle = [(points[i].x, heights[i], points[i].y) for i in face]
        cap = any(t['floor'] > 1 and all(abs(y - t['floor']) < 0.001 for x, y, z in triangle) for t in terraces)
        triangles.append((triangle, cap))
    return rings, triangles


def point_segment_distance(x, z, a, c):
    dx, dz = c[0] - a[0], c[1] - a[1]
    t = max(0, min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)))
    return math.hypot(x - a[0] - t * dx, z - a[1] - t * dz)


def triangle_index(triangles):
    result = {}
    for triangle in triangles:
        for ix in range(math.floor(min(p[0] for p in triangle) / 16), math.floor(max(p[0] for p in triangle) / 16) + 1):
            for iz in range(math.floor(min(p[2] for p in triangle) / 16), math.floor(max(p[2] for p in triangle) / 16) + 1):
                result.setdefault((ix, iz), []).append(triangle)
    return result


@lru_cache(maxsize=1)
def hill_index():
    return triangle_index([triangle for triangle, cap in hill_surface()[1]])


@lru_cache(maxsize=32768)
def hill_height(x, z):
    for triangle in hill_index().get((math.floor(x / 16), math.floor(z / 16)), []):
        (ax, ay, az), (bx, by, bz), (cx, cy, cz) = triangle
        if not min(ax, bx, cx) - 1e-7 <= x <= max(ax, bx, cx) + 1e-7 or not min(az, bz, cz) - 1e-7 <= z <= max(az, bz, cz) + 1e-7:
            continue
        d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz)
        if abs(d) < 1e-12:
            continue
        u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d
        v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d
        if min(u, v, 1 - u - v) >= -1e-7:
            return u * ay + v * by + (1 - u - v) * cy
    return 0.15


def building(b, item):
    from streetscape import outward_face
    p = item['footprint']
    top, base = item['height'] + 0.15, 0.15
    centre = (sum(x for x, z in p) / 4, (top + base) / 2, sum(z for x, z in p) / 4)
    timber = item['roof'] == 'tile'
    wall = 'ART_Plaster' if timber else 'ART_Concrete'
    for a, c in zip(p, p[1:] + p[:1]):
        outward_face(b, [(a[0], base, a[1]), (c[0], base, c[1]),
                         (c[0], top, c[1]), (a[0], top, a[1])], wall, centre)
        dx, dz = c[0] - a[0], c[1] - a[1]
        length = (dx * dx + dz * dz) ** 0.5
        # Recess-free glazing bands sit 2 cm outside the correct face. Keep fewer divisions
        # in the distant mesh, while retaining the same building and roof silhouettes.
        nx, nz = (a[0] + c[0]) / 2 - centre[0], (a[1] + c[1]) / 2 - centre[2]
        normal = (-dz / length, dx / length)
        sign = 1 if normal[0] * nx + normal[1] * nz > 0 else -1
        nx, nz = normal[0] * sign * 0.02, normal[1] * sign * 0.02
        rows = [1.4] if timber else [2.0 + i * 3.2 for i in range(max(1, round(item['height'] / 3.4)))]
        if timber:
            outward_face(b, [(a[0] + nx, base, a[1] + nz), (c[0] + nx, base, c[1] + nz),
                             (c[0] + nx, 2.1, c[1] + nz), (a[0] + nx, 2.1, a[1] + nz)], 'ART_Timber', centre)
            continue
        columns = 1 if b.distant else max(1, int(length / 3.2))
        for y in rows:
            for i in range(columns):
                lo, hi = (i + 0.16) / columns, (i + 0.84) / columns
                window = [(a[0] + dx * t + nx, yy, a[1] + dz * t + nz)
                          for t, yy in ((lo, y), (hi, y), (hi, y + 1.2), (lo, y + 1.2))]
                outward_face(b, window, 'ART_Timber' if timber else 'ART_Window', centre)
    outward_face(b, [(x, base, z) for x, z in p], wall, centre)
    roof = [(x, top, z) for x, z in p]
    if item['roof'] == 'flat':
        outward_face(b, roof, 'ART_Tile', centre)
        return
    # The first edge follows the observed long ridge; hipped ends close the roof volume.
    a, c, d, e = roof
    left = ((a[0] + e[0]) / 2, top + item['rise'], (a[2] + e[2]) / 2)
    right = ((c[0] + d[0]) / 2, top + item['rise'], (c[2] + d[2]) / 2)
    material = 'HK_RoofTile' if timber else 'ART_RedRoof' if item['roof'] == 'red' else 'ART_Tile'
    for face in ([a, c, right, left], [d, e, left, right], [e, a, left], [c, d, right]):
        outward_face(b, face, material, centre)


def build(name, mesh_class, lod=False):
    b = mesh_class(name)
    b.abstract, b.distant = True, lod
    for item in data()['buildings']:
        building(b, item)
    from road_network import distant_approach_mesh
    distant_approach_mesh(b)
    return b
