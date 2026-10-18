"""Reviewed Kyobashi–Otemon buildings. Source outlines live in src/castle-approach.js.

The same coordinates drive roads, terrain cuts, collision and the editor. Roof/facade heights
are approximate visual masses, not a survey or a reconstruction of hidden building interiors.
"""
import json
import os
import subprocess
import math
from functools import lru_cache

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS = ('ART_CastleApproach',)
_data = None


def data():
    global _data
    if _data is None:
        script = "import {APPROACH_DATA} from './src/castle-approach.js';console.log(JSON.stringify(APPROACH_DATA));"
        _data = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', script], cwd=ROOT))
    return _data


@lru_cache(maxsize=1)
def hill_surface():
    """One triangulated hill for the landmark mesh and the rising Otemon path.

    The reviewed inner bank replaces the old ellipse on the bridge-facing slope. The
    unreviewed northern half retains its former silhouette; hill heights remain approximate.
    """
    site = data()['castle']
    cx, cz, crest = site['x'], site['z'], site['height']
    bank = data()['innerBank']
    angles = sorted(set([i * math.tau / 36 for i in range(36)] +
                        [math.atan2((z - cz) / 170, (x - cx) / 140) % math.tau for x, z in bank]))
    cross = lambda ax, az, bx, bz: ax * bz - az * bx
    feet = []
    for angle in angles:
        dx, dz = 140 * math.cos(angle), 170 * math.sin(angle)
        intersections = []
        for a, c in zip(bank, bank[1:]):
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
    profile = [(0, crest), (0.20, crest), (0.40, crest - 3), (0.67, 16), (0.85, 5), (1, 0.15)]
    rings = [[(cx + x * radius, y, cz + z * radius) for x, z in feet] for radius, y in profile]
    triangles = []
    for row, (inner, outer) in enumerate(zip(rings, rings[1:])):
        for i in range(len(feet)):
            j = (i + 1) % len(feet)
            if row:
                triangles.append(([inner[i], outer[j], inner[j]], False))
            triangles.append(([inner[i], outer[i], outer[j]], row == 0))
    return rings, triangles


@lru_cache(maxsize=32768)
def hill_height(x, z):
    for triangle, cap in hill_surface()[1]:
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
