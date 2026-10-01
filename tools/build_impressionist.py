"""Build the web's impressionist mesh set, without changing simulation/collider data.

Blender -b --factory-startup --python tools/build_impressionist.py
The town houses, foliage, closed abstract lamps, signals and vehicles are authored here. Other assets
are read from the original GLBs and rebuilt with raised, coloured brushstroke geometry.
No image textures, screen filter, external Unity generator or Python packages are needed.
"""
import json
import math
import os
import random
import sys
import argparse

import bpy
import bmesh
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import abstract_props

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'models', 'impressionist')
os.makedirs(OUT, exist_ok=True)

# Pigments in sRGB: complementary strokes are chosen separately, rather than
# multiplying a photograph/texture by a pastel tint.
COLORS = {
    'HK_Plaster': (0.89, 0.86, 0.76), 'HK_PlasterWarm': (0.93, 0.83, 0.66),
    'HK_WoodDark': (0.34, 0.29, 0.33), 'HK_WoodMid': (0.58, 0.42, 0.29),
    'HK_WoodLight': (0.76, 0.59, 0.39), 'HK_RoofTile': (0.41, 0.46, 0.57),
    'HK_RoofRidge': (0.34, 0.37, 0.48), 'HK_Stone': (0.61, 0.64, 0.66),
    'HK_StoneDark': (0.48, 0.50, 0.60), 'HK_Namako': (0.47, 0.53, 0.65),
    'HK_Asphalt': (0.56, 0.59, 0.69), 'HK_Sidewalk': (0.85, 0.77, 0.61),
    'HK_Curb': (0.77, 0.75, 0.68), 'HK_WhitePaint': (0.98, 0.93, 0.77),
    'HK_Water': (0.42, 0.63, 0.73), 'HK_Grass': (0.58, 0.64, 0.40),
    'HK_Soil': (0.61, 0.48, 0.36), 'HK_Leaf': (0.45, 0.61, 0.36),
    'HK_LeafDark': (0.28, 0.46, 0.40), 'HK_Sakura': (0.94, 0.68, 0.73),
    'HK_Bark': (0.47, 0.35, 0.29), 'HK_Metal': (0.29, 0.39, 0.46),
    'HK_MetalLight': (0.66, 0.70, 0.77), 'HK_Glass': (0.32, 0.47, 0.59),
    'HK_Shoji': (0.94, 0.89, 0.71), 'HK_TruckCab': (0.84, 0.87, 0.85),
    'HK_Rubber': (0.26, 0.27, 0.35), 'HK_KeiPaint': (0.90, 0.91, 0.87),
    'HK_VanBody': (0.77, 0.79, 0.84), 'HK_VanRib': (0.62, 0.65, 0.73),
    'HK_Noren': (0.32, 0.44, 0.64), 'HK_NorenRed': (0.77, 0.39, 0.29),
    'HK_Lamp': (1.0, 0.88, 0.58), 'HK_Gold': (0.85, 0.67, 0.35),
    'HK_SignRed': (0.83, 0.23, 0.24), 'HK_SignBlue': (0.22, 0.42, 0.74),
    'HK_SignYellow': (0.98, 0.81, 0.29), 'HK_PlateGreen': (0.23, 0.47, 0.36),
    'HK_Guard': (0.45, 0.36, 0.33),
    'ART_Frame': (0.27, 0.34, 0.45), 'ART_FrameLight': (0.52, 0.59, 0.65),
    'ART_LampGlow': (1.0, 0.87, 0.59), 'ART_LampBase': (0.48, 0.48, 0.57),
    'ART_SignalHousing': (0.30, 0.36, 0.46),
    'ART_SignalRed': (0.94, 0.19, 0.16), 'ART_SignalYellow': (1.0, 0.77, 0.13),
    'ART_SignalGreen': (0.17, 0.76, 0.46), 'ART_SignalGlyph': (1.0, 0.96, 0.80),
    'ART_Glass': (0.35, 0.52, 0.66), 'ART_GlassLight': (0.65, 0.76, 0.81),
    'ART_Cargo': (0.80, 0.82, 0.82),
}
EMISSION = {
    'ART_LampGlow': ((1.0, 0.70, 0.32), 0.20),
    'ART_SignalRed': ((1.0, 0.12, 0.06), 0.38),
    'ART_SignalYellow': ((1.0, 0.65, 0.04), 0.38),
    'ART_SignalGreen': ((0.04, 0.85, 0.24), 0.38),
    'ART_SignalGlyph': ((1.0, 0.91, 0.68), 0.18),
}
WARM = (0.96, 0.78, 0.49)
COOL = (0.55, 0.62, 0.82)
PINK = (0.87, 0.65, 0.65)


def linear(c):
    return c / 12.92 if c < 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def blend(a, b, t):
    return tuple(x * (1 - t) + y * t for x, y in zip(a, b))


def U(p):
    x, y, z = p
    return Vector((-x, -z, y))


class BrushMesh:
    def __init__(self, name):
        self.name = name
        self.rng = random.Random(name)
        self.vertices, self.faces, self.pigments, self.slots, self.smooth = [], [], [], [], []
        self.materials = []
        self.strokes = 0
        self.abstract = False
        self.details = []

    def pigment(self, material, amount=0.12, height=0):
        base = COLORS.get(material, (0.73, 0.70, 0.67))
        # Vehicle paint stays neutral so per-car colour still works.
        if material == 'HK_KeiPaint':
            return tuple(min(1, c + self.rng.uniform(-0.07, 0.05)) for c in base)
        accent = self.rng.choice((WARM, COOL, COOL, PINK, base))
        c = blend(base, accent, self.rng.uniform(0, amount))
        shift = self.rng.uniform(-0.035, 0.035)
        return tuple(max(0, min(1, x + shift)) for x in c)

    def polygon(self, pts, material, pigment=None, smooth=False, detail=0):
        if material not in self.materials:
            self.materials.append(material)
        start = len(self.vertices)
        self.vertices.extend(tuple(p) for p in pts)
        self.faces.append(tuple(range(start, start + len(pts))))
        self.slots.append(self.materials.index(material))
        self.pigments.append(pigment or self.pigment(material))
        self.smooth.append(smooth)
        self.details.append(detail)

    def face(self, pts, material, strokes=True):
        pts = [U(p) for p in reversed(pts)]
        self.surface(pts, material, strokes)

    def surface(self, pts, material, strokes=True):
        ground = self.name in ('HK_GroundPaved', 'HK_GroundFar', 'HK_Terrain_Castle')
        architecture = self.name.startswith('HK_Machiya') or self.name == 'HK_Kura'
        pigment = COLORS.get(material) if ground else (self.pigment(material, 0.48) if architecture else None)
        self.polygon(pts, material, pigment,
                     smooth=self.name == 'HK_Terrain_Castle')
        if self.abstract or not strokes or len(pts) < 3:
            return
        # Triangulate a fan for uniform sampling on the actual source surface.
        for i in range(1, len(pts) - 1):
            a, b, c = pts[0], pts[i], pts[i + 1]
            cross = (b - a).cross(c - a)
            area = cross.length / 2
            if area < 0.007:
                continue
            normal = cross.normalized()
            horizontal = abs(normal.z) > 0.7
            # Large/far ground has broad strokes; town and facades have finer ones.
            density = 5 if area < 250 else (0.5 if area < 25000 else 0.018)
            if self.name == 'HK_GroundPaved':
                density = 0.28
            elif self.name == 'HK_GroundFar':
                density = 0.008
            elif self.name == 'HK_Terrain_Castle':
                density = 0.045
            if material == 'HK_WhitePaint':
                density = 16
            if material.startswith('HK_Sign'):
                density = 2
            count = min(9000, int(area * density + self.rng.random()))
            tangent = Vector((1, 0, 0))
            if abs(normal.x) > 0.85:
                tangent = Vector((0, 1, 0))
            tangent = (tangent - normal * tangent.dot(normal)).normalized()
            bitangent = normal.cross(tangent)
            for _ in range(count):
                r, s = self.rng.random(), self.rng.random()
                if r + s > 1:
                    r, s = 1 - r, 1 - s
                p = a + (b - a) * r + (c - a) * s
                scale = 1 if area < 250 else (2.8 if area < 25000 else 12)
                if self.name == 'HK_GroundPaved':
                    scale = 2.6
                length = self.rng.uniform(0.16, 0.48) * scale
                width = length * self.rng.uniform(0.21, 0.45)
                if material == 'HK_WhitePaint':
                    length *= 0.6
                    width *= 0.6
                angle = self.rng.uniform(-0.65, 0.65) + (0.35 if horizontal else 0.85)
                u = tangent * math.cos(angle) + bitangent * math.sin(angle)
                v = normal.cross(u)
                # Fit the entire dab inside the triangle, so traffic markings and
                # curb/facade edges remain legible and don't float beyond surfaces.
                edges = [(b - a).cross(p - a).dot(normal) / (b - a).length,
                         (c - b).cross(p - b).dot(normal) / (c - b).length,
                         (a - c).cross(p - c).dot(normal) / (a - c).length]
                margin = min(edges)
                length = min(length, margin * 1.7)
                width = min(width, margin * 1.3)
                if length < 0.035:
                    continue
                p += normal * self.rng.uniform(0.0015, 0.0045)
                self.dab(p, u * length, v * width, normal, material)

    def dab(self, p, u, v, n, material, strength=0.6):
        # A short irregular impasto stroke: chipped ends and a raised central ridge.
        shape = [(-0.52, -0.16), (-0.32, -0.5), (0.32, -0.44),
                 (0.52, 0.14), (0.28, 0.5), (-0.32, 0.42)]
        pts = [p + u * x + v * y for x, y in shape]
        mid = p + n * 0.002
        pigment = self.pigment(material, strength)
        self.polygon([pts[0], pts[1], pts[2], pts[3], mid], material, pigment, detail=self.strokes + 1)
        self.polygon([pts[3], pts[4], pts[5], pts[0], mid], material,
                     blend(pigment, COLORS.get(material, pigment), 0.22), detail=self.strokes + 1)
        self.strokes += 1

    def box(self, center, size, material, strokes=True, bottom=True):
        cx, cy, cz = center
        x, y, z = [s / 2 for s in size]
        v = [(cx + a, cy + b, cz + c) for a in (-x, x) for b in (-y, y) for c in (-z, z)]
        faces = [(0, 1, 3, 2), (4, 6, 7, 5), (1, 5, 7, 3), (0, 2, 6, 4), (2, 3, 7, 6)]
        if bottom:
            faces.append((0, 4, 5, 1))
        for f in faces:
            self.face([v[i] for i in f], material, strokes)

    def branch(self, start, end, radius, material='HK_Bark'):
        a, b = U(start), U(end)
        axis = (b - a).normalized()
        t = axis.cross(Vector((0, 1, 0))).normalized()
        q = axis.cross(t)
        ring = [t * math.cos(i * math.tau / 7) + q * math.sin(i * math.tau / 7) for i in range(7)]
        for i in range(7):
            j = (i + 1) % 7
            self.surface([a + ring[i] * radius, a + ring[j] * radius,
                          b + ring[j] * radius * 0.55, b + ring[i] * radius * 0.55], material)
        self.surface([a + v * radius for v in reversed(ring)], material, False)
        self.surface([b + v * radius * 0.55 for v in ring], material, False)

    def crown(self, center, radius, material, seed):
        rng = random.Random(seed)
        c = U(center)
        rx, ry, rz = radius[0], radius[2], radius[1]
        # Rounded lobes with interrupted silhouettes, replacing large ico-balls/cones.
        rings = []
        for j in range(5):
            phi = math.pi * (j + 0.05) / 4.1
            ring = []
            for i in range(9):
                theta = math.tau * i / 9
                k = rng.uniform(0.92, 1.08)
                ring.append(c + Vector((rx * math.sin(phi) * math.cos(theta) * k,
                                        ry * math.sin(phi) * math.sin(theta) * k,
                                        rz * math.cos(phi) * k)))
            rings.append(ring)
        for j in range(4):
            for i in range(9):
                ni = (i + 1) % 9
                pigment = self.pigment(material, 0.42)
                self.polygon([rings[j][i], rings[j + 1][i], rings[j + 1][ni], rings[j][ni]],
                             material, pigment, smooth=True)
        # Separate tiny leaf/blossom masses break the crown outline in true 3D.
        for _ in range(18):
            z = rng.uniform(-0.96, 0.96)
            theta = rng.uniform(0, math.tau)
            r = math.sqrt(1 - z * z)
            n = Vector((r * math.cos(theta), r * math.sin(theta), z))
            p = c + Vector((n.x * rx, n.y * ry, n.z * rz)) * rng.uniform(0.99, 1.06)
            u = n.cross(Vector((0, 0, 1))).normalized()
            v = n.cross(u)
            self.dab(p, u * rng.uniform(0.16, 0.34), v * rng.uniform(0.08, 0.17), n,
                     material, 0.8)

    def finish(self, lod=False):
        mesh = bpy.data.meshes.new(self.name)
        # Keep strokes at the silhouette extrema too, so switching LOD does not shrink a crown.
        extrema = set()
        if lod:
            for axis in range(3):
                extrema.add(min(range(len(self.vertices)), key=lambda i: self.vertices[i][axis]))
                extrema.add(max(range(len(self.vertices)), key=lambda i: self.vertices[i][axis]))
        selected = [i for i, detail in enumerate(self.details)
                    if not lod or not detail or detail % 16 == 0 or extrema.intersection(self.faces[i])]
        mesh.from_pydata(self.vertices, [], [self.faces[i] for i in selected])
        mesh.update()
        for name in self.materials:
            mat = bpy.data.materials.get(name)
            if mat is None:
                mat = bpy.data.materials.new(name)
            mat.use_nodes = True
            mat.node_tree.nodes.clear()
            bsdf = mat.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
            bsdf.inputs['Base Color'].default_value = (1, 1, 1, 1)
            bsdf.inputs['Roughness'].default_value = 0.95
            if name in EMISSION:
                emission, strength = EMISSION[name]
                bsdf.inputs['Emission Color'].default_value = (*[linear(c) for c in emission], 1)
                bsdf.inputs['Emission Strength'].default_value = strength
            color = mat.node_tree.nodes.new('ShaderNodeVertexColor')
            color.layer_name = 'Pigment'
            output = mat.node_tree.nodes.new('ShaderNodeOutputMaterial')
            mat.node_tree.links.new(color.outputs['Color'], bsdf.inputs['Base Color'])
            mat.node_tree.links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])
            mesh.materials.append(mat)
        colors = mesh.color_attributes.new(name='Pigment', type='BYTE_COLOR', domain='CORNER')
        for poly, i in zip(mesh.polygons, selected):
            slot, pigment, smooth = self.slots[i], self.pigments[i], self.smooth[i]
            poly.material_index = slot
            poly.use_smooth = smooth
            rgba = (*[linear(c) for c in pigment], 1)
            for i in poly.loop_indices:
                colors.data[i].color = rgba
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.00001)
        bm.to_mesh(mesh)
        bm.free()
        ob = bpy.data.objects.new(self.name, mesh)
        bpy.context.collection.objects.link(ob)
        return ob


def roof(b, width, front, back, eave, rise):
    # Gently sagging eaves and curved ridges replace perfectly straight prisms.
    mid = (front + back) / 2
    columns = 12
    for rear in (False, True):
        edge = back if rear else front
        for row in range(4):
            t0, t1 = row / 4, (row + 1) / 4
            for i in range(columns):
                def point(ii, t):
                    x = (ii / columns - 0.5) * (width + 0.8)
                    arch = 0.12 * (2 * ii / columns - 1) ** 2
                    return (x, eave + rise * t + 0.13 * math.sin(t * math.pi) + arch,
                            edge + (mid - edge) * t)
                pts = [point(i, t0), point(i + 1, t0), point(i + 1, t1), point(i, t1)]
                b.face(list(reversed(pts)) if rear else pts, 'HK_RoofTile')
                underside = [(x, y - 0.16, z) for x, y, z in pts]
                b.face(underside if rear else list(reversed(underside)), 'HK_WoodDark', strokes=False)
                if row == 0:
                    b.face([pts[1], pts[0], underside[0], underside[1]] if rear else
                           [pts[0], pts[1], underside[1], underside[0]], 'HK_WoodMid')
    b.box((0, eave + rise + 0.12, mid), (width + 0.95, 0.20, 0.26), 'HK_RoofRidge')
    for x in (-width / 2, width / 2):
        b.box((x, eave + rise + 0.25, mid), (0.16, 0.48, 0.26), 'HK_RoofRidge')


def house(name, width, depth, height, variant):
    b = BrushMesh(name)
    front = -0.5
    wall_height = height + 0.33
    # Broad plaster masses, selective timber marks and recessed openings.
    # Front wall is a gently irregular panel surface, rather than a texture plane.
    for i in range(16):
        x0, x1 = -width / 2 + width * i / 16, -width / 2 + width * (i + 1) / 16
        for j in range(13):
            y0, y1 = wall_height * j / 13, wall_height * (j + 1) / 13
            def p(x, y):
                z = front + 0.018 * math.sin(x * 2.9 + y * 1.7)
                if abs(x) < width / 2 - 0.01:
                    x += 0.065 * math.sin(y * 2 + x * 3)
                if 0.01 < y < wall_height - 0.01:
                    y += 0.055 * math.cos(x * 1.7 + y * 2.4)
                return (x, y, z)
            b.face([p(x0, y0), p(x1, y0), p(x1, y1), p(x0, y1)], 'HK_Plaster')
    b.face([(-width / 2, 0, -depth), (-width / 2, 0, front),
            (-width / 2, wall_height, front), (-width / 2, wall_height, -depth)], 'HK_PlasterWarm')
    b.face([(width / 2, 0, front), (width / 2, 0, -depth),
            (width / 2, wall_height, -depth), (width / 2, wall_height, front)], 'HK_Plaster')
    b.face([(width / 2, 0, -depth), (-width / 2, 0, -depth),
            (-width / 2, wall_height, -depth), (width / 2, wall_height, -depth)], 'HK_PlasterWarm')
    b.box((0, 0.16, (front - depth) / 2), (width + 0.06, 0.32, depth + front), 'HK_Stone')
    for x in (-width / 2 + 0.12, width / 2 - 0.12):
        b.branch((x, 0.25, front + 0.05), (x + 0.035, height, front + 0.06), 0.11, 'HK_WoodMid')
    b.box((0, 3.18, front + 0.08), (width, 0.18, 0.12), 'HK_WoodMid')
    for x in (-width * 0.25, width * 0.25):
        b.box((x, 4.5, front + 0.025), (width * 0.22, 1.03, 0.08), 'HK_Glass')
        for dx in (-width * 0.11, 0, width * 0.11):
            b.box((x + dx, 4.5, front + 0.085), (0.065, 1.12, 0.07), 'HK_WoodMid')
        b.box((x, 4.0, front + 0.085), (width * 0.23, 0.09, 0.08), 'HK_WoodLight')
    if variant == 'K':
        b.box((0, 0.91, front + 0.04), (width - 0.1, 1.35, 0.06), 'HK_Namako')
        b.box((0, 1.40, front + 0.14), (2.0, 2.5, 0.20), 'HK_PlasterWarm')
        b.box((0, 1.26, front + 0.26), (1.4, 2.15, 0.07), 'HK_WoodDark')
    else:
        b.box((0, 1.52, front + 0.018), (width - 0.35, 2.5, 0.08), 'HK_Glass' if variant == 'B' else 'HK_WoodDark')
        # Fewer, uneven slats leave a painter's suggestion of joinery.
        for i in range(14 if variant != 'B' else 7):
            x = -width / 2 + 0.3 + (width - 0.6) * i / (13 if variant != 'B' else 6)
            b.box((x, 1.55, front + 0.1), (0.08, 2.6, 0.06), 'HK_WoodMid')
        door_x = width * 0.22 if variant != 'B' else 0
        for i in range(3):
            b.box((door_x + (i - 1) * 0.58, 2.65 - 0.04 * (i % 2), front + 0.22),
                  (0.56, 0.70 + 0.07 * (i % 2), 0.03), 'HK_NorenRed' if variant == 'B' else 'HK_Noren')
        roof(b, width - 0.15, front + 1.15, front - 0.2, 3.25, 0.46)
    roof(b, width, front + 0.80, -depth - 0.65, height + 0.08, (depth + 1.45) * 0.23)
    for x, reverse in ((-width / 2, False), (width / 2, True)):
        pts = [(x, wall_height, front), (x, wall_height, -depth),
               (x, height + 0.06 + (depth + 1.45) * 0.23, (front + 0.8 - depth - 0.65) / 2)]
        b.face(list(reversed(pts)) if reverse else pts, 'HK_Plaster')
    return b


def tree(name):
    b = BrushMesh(name)
    rng = b.rng
    h = {'HK_Tree_Zelkova': 8.5, 'HK_Tree_Sakura': 6, 'HK_Tree_RoundLow': 8,
         'HK_Tree_Cedar': 11, 'HK_Tree_Pine': 7.4}.get(name, 7)
    sakura, cedar, pine = 'Sakura' in name, 'Cedar' in name, 'Pine' in name
    material = 'HK_Sakura' if sakura else 'HK_Leaf'
    b.branch((0, 0, 0), (0.13, h * 0.38, 0.08), 0.22)
    if cedar:
        # Broken, overlapping sprays replace three opaque seven-sided cones.
        for level in range(6):
            y = h * (0.34 + level * 0.105)
            r = 2.15 * (1 - level / 6.9)
            for i in range(3):
                a = i * math.tau / 3 + level * 0.61
                b.crown((math.cos(a) * r * 0.40, y, math.sin(a) * r * 0.40),
                        (r * 0.62, 0.83, r * 0.62), 'HK_LeafDark', level * 30 + i)
    else:
        lobes = 9 if name == 'HK_Tree_RoundLow' else (13 if not pine else 10)
        for i in range(lobes):
            a = i * 2.39996
            y = h * rng.uniform(0.54, 0.84)
            r = rng.uniform(0.5, 1.65) * (0.75 if sakura else 1)
            x, z = math.cos(a) * r, math.sin(a) * r
            b.branch((0.13, h * 0.32, 0.08), (x, y - 0.3, z), 0.09)
            size = rng.uniform(0.72, 1.28) * (1.0 if sakura else 1.15)
            b.crown((x, y, z), (size, size * (0.40 if pine else 0.82), size * 0.92),
                    'HK_LeafDark' if pine else material, i + 103)
    return b


def lamp():
    return abstract_props.build('HK_StreetLamp', BrushMesh)


def rebuild(name):
    # Read the source in Blender so its transforms, handedness and primitive groups
    # are respected. Keep safety-relevant silhouettes and original road elevations.
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'data', 'models', name + '.glb'))
    imported = set(bpy.data.objects) - before
    b = BrushMesh(name)
    for ob in imported:
        if ob.type != 'MESH':
            continue
        for poly in ob.data.polygons:
            material = ob.data.materials[poly.material_index].name.split('.')[0]
            pts = [ob.matrix_world @ ob.data.vertices[i].co for i in poly.vertices]
            b.surface(pts, material)
    for ob in imported:
        bpy.data.objects.remove(ob, do_unlink=True)
    return b


def existing_lod(name):
    """Thin relief strokes in the saved art itself; never regenerate its silhouette."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, name + '.glb'))
    objects = [ob for ob in set(bpy.data.objects) - before if ob.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects:
        ob.data.transform(ob.matrix_world)
        ob.matrix_world.identity()
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    ob = bpy.context.object
    ob.name = name
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    # glTF splits vertices at pigment and normal boundaries. Weld positions while
    # preserving the corner colours, then identify the seven-vertex brush ridges.
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.00001)
    extrema = set()
    for axis in range(3):
        extrema.add(min(bm.verts, key=lambda v: v.co[axis]))
        extrema.add(max(bm.verts, key=lambda v: v.co[axis]))
    visited, remove, stroke = set(), [], 0
    for start in bm.verts:
        if start in visited:
            continue
        component, pending = set(), [start]
        visited.add(start)
        while pending:
            vertex = pending.pop()
            component.add(vertex)
            for edge in vertex.link_edges:
                other = edge.other_vert(vertex)
                if other not in visited:
                    visited.add(other)
                    pending.append(other)
        faces = {face for vertex in component for face in vertex.link_faces}
        if len(component) == 7 and len(faces) == 6:
            stroke += 1
            if stroke % 16 and not extrema.intersection(component):
                remove.extend(faces)
    bmesh.ops.delete(bm, geom=remove, context='FACES')
    bm.to_mesh(ob.data)
    bm.free()
    return ob


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--only', nargs='+', help='Rebuild selected assets; retain the rest of the manifest.')
    parser.add_argument('--save-library', action='store_true', help='Save an editable Blender library of the abstract props.')
    parser.add_argument('--lod-only', action='store_true', help='Generate distant meshes while retaining authored silhouettes and full-detail files.')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    # Remove imported Blender material name suffixes from the outset.
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat)
    houses = {'HK_Machiya_A': (7.2, 9, 5.5, 'A'), 'HK_Machiya_A_Narrow': (5.4, 9, 5.5, 'A'),
              'HK_Machiya_B': (6, 9, 6.1, 'B'), 'HK_Machiya_C': (8.4, 10, 6.5, 'C'),
              'HK_Kura': (6, 8, 6.2, 'K')}
    manifest = {'version': 1, 'style': 'mesh-pigment-impasto', 'models': {}}
    if args.only or args.lod_only:
        with open(os.path.join(OUT, 'manifest.json')) as f:
            manifest = json.load(f)
    names = {file[:-4] for file in os.listdir(os.path.join(ROOT, 'data', 'models')) if file.endswith('.glb')}
    names.update(abstract_props.SIGNAL_MODELS)
    if args.only and set(args.only) - names:
        parser.error('Unknown models: ' + ', '.join(sorted(set(args.only) - names)))
    for name in sorted(names):
        if args.only and name not in args.only:
            continue
        if args.lod_only:
            b = None
        elif name in houses:
            b = house(name, *houses[name])
        elif name.startswith('HK_Tree_'):
            b = tree(name)
        elif name in abstract_props.MODEL_NAMES:
            b = abstract_props.build(name, BrushMesh)
        else:
            b = rebuild(name)
        # A regular rebuild always refreshes both levels, so regenerated art cannot
        # leave missing or stale distant geometry behind.
        for distant in ([True] if args.lod_only else [False, True]):
            ob = existing_lod(name) if args.lod_only else b.finish(lod=distant)
            bpy.ops.object.select_all(action='DESELECT')
            ob.select_set(True)
            bpy.context.view_layer.objects.active = ob
            path = os.path.join(OUT, name + ('.lod.glb' if distant else '.glb'))
            bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format='GLB',
                                      export_yup=True, export_materials='EXPORT', export_normals=True,
                                      export_texcoords=False, export_all_vertex_colors=True)
            if distant:
                manifest['models'][name]['lod'] = {'triangles': sum(len(p.vertices) - 2 for p in ob.data.polygons),
                                                  'bytes': os.path.getsize(path)}
            else:
                manifest['models'][name] = {'triangles': sum(len(p.vertices) - 2 for p in ob.data.polygons),
                                          'strokes': b.strokes, 'bytes': os.path.getsize(path),
                                          'remodeled': name in houses or name.startswith('HK_Tree_') or name in abstract_props.MODEL_NAMES}
                if b.abstract:
                    manifest['models'][name]['design'] = 'abstract-closed-solids-v2'
            print('IMPRESSIONIST', name, manifest['models'][name], flush=True)
            bpy.data.objects.remove(ob, do_unlink=True)
        # Imported source materials and their textures must not contaminate the
        # next mesh's neutral vertex-colour material with an old Base Color map.
        for mat in list(bpy.data.materials):
            bpy.data.materials.remove(mat)
    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2)
    if args.save_library:
        for i, name in enumerate(abstract_props.MODEL_NAMES):
            before = set(bpy.data.objects)
            bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, name + '.glb'))
            for ob in set(bpy.data.objects) - before:
                if ob.parent is None:
                    ob.location += Vector(((i % 3) * 14, (i // 3) * 12, 0))
        for area in bpy.context.screen.areas:
            if area.type == 'VIEW_3D':
                area.spaces.active.shading.type = 'MATERIAL'
                area.spaces.active.region_3d.view_location = Vector((14, 12, 2))
                area.spaces.active.region_3d.view_distance = 46
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'abstract-props.blend'))
    print('IMPRESSIONIST_COMPLETE', len(manifest['models']), flush=True)


if __name__ == '__main__':
    main()
