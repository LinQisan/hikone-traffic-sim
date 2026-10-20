"""Moat-road markings and bank vegetation fitted to the supplied aerial reference.

Unity metres, with the imported carriageway and practice routes retained. The image
guides silhouettes and spacing; pigments stay in the town's impressionist palette.
"""
import math
from abstract_props import cylinder

MODELS = ('ART_MoatRoadSurface', 'ART_MoatRoadPaint', 'ART_MoatTree_Broad',
          'ART_MoatTree_Airy', 'ART_MoatBankPatch')


def area(points):
    return sum(a[0] * c[1] - c[0] * a[1] for a, c in zip(points, points[1:] + points[:1]))


def road_paint(b, details_only=False):
    def polygon(points):
        if len(points) < 3 or abs(area(points)) < 1e-6:
            return
        # Match the source marking height: road placement 0.01 + paint surface 0.012.
        if area(points) > 0:
            points = list(reversed(points))
        b.face([(x, 0.022, z) for x, z in points], 'HK_WhitePaint')

    def strip(a, c, width=0.15):
        dx, dz = c[0] - a[0], c[1] - a[1]
        length = math.hypot(dx, dz)
        nx, nz = -dz / length * width / 2, dx / length * width / 2
        polygon([(a[0] - nx, a[1] - nz), (c[0] - nx, c[1] - nz),
                 (c[0] + nx, c[1] + nz), (a[0] + nx, a[1] + nz)])

    # Long edge lines, continuous through the straight modules rather than a ten-metre repeat.
    for start, end in (() if details_only else ((-120, 0), (20, 22), (42, 82))):
        for z in (22.45, 29.55):
            strip((start, z), (end, z))
    # Join the retained T-junction's north edge (x4..16), without overlaying its paint.
    for start, end in (() if details_only else ((0, 4), (16, 20))):
        strip((start, 29.55), (end, 29.55))
    for x in (() if details_only else range(-118, -24, 9)):
        strip((x, 26), (x + 4.5, 26))
    if not details_only:
        strip((-24, 26), (0, 26))
        strip((20, 26), (22, 26))
        strip((42, 26.4), (54, 26.4))

    # A tapered hatched guide area between the two traffic envelopes on the east approach.
    # Do not paint the existing event lanes (eastbound about z28, westbound about z23.4).
    wedge = [(54, 26.4), (69, 24.95), (81, 25.95), (69, 26.75)]
    for a, c in zip(wedge, wedge[1:] + wedge[:1]):
        strip(a, c)

    def clip(points, value, keep_above):
        out = []
        for a, c in zip(points, points[1:] + points[:1]):
            da, dc = a[0] + a[1] - value, c[0] + c[1] - value
            ia, ic = da >= 0 if keep_above else da <= 0, dc >= 0 if keep_above else dc <= 0
            if ia:
                out.append(a)
            if ia != ic:
                t = da / (da - dc)
                out.append((a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t))
        return out

    for i in range(17):
        v = 80 + i * 1.7
        polygon(clip(clip(wedge, v, True), v + 0.21, False))

    # Stop bars are behind the crosswalks, leaving the crossing surfaces intact.
    from road_network import STOP_BARS
    strip((STOP_BARS[1], 22.50), (STOP_BARS[1], 25.85), 0.35)
    strip((STOP_BARS[0], 26.15), (STOP_BARS[0], 29.50), 0.35)
    strip((28.50, 14.10), (31.85, 14.10), 0.35)
    strip((32.15, 37.75), (35.50, 37.75), 0.35)

    def arrow(x, z, direction, turn=False):
        dx, dz = direction
        transform = lambda p: (x + dx * p[0] - dz * p[1], z + dz * p[0] + dx * p[1])
        polygon([transform(p) for p in [(-1.45, -0.10), (0.60, -0.10), (0.60, -0.43),
                                        (1.45, 0), (0.60, 0.43), (0.60, 0.10), (-1.45, 0.10)]])
        if turn:
            polygon([transform(p) for p in [(-0.35, 0), (-0.13, 0), (-0.13, -0.65),
                                            (0.20, -0.65), (-0.25, -1.12), (-0.70, -0.65), (-0.35, -0.65)]])

    arrow(52.6, 23.8, (-1, 0), turn=True)
    arrow(-12.0, 28.0, (1, 0))
    arrow(30.0, 11.0, (0, 1))


def bank_tree(b, airy):
    from vegetation import tree
    b.abstract = True
    # Two leafy-season cherry forms along the moat: upright and old, spreading crowns.
    tree(b, 'cherry', height=9.0 if airy else 7.6, spread=3.1 if airy else 4.1,
         lean=(0.12, 1.45), seed=231 if airy else 271)


def bank_patch(b):
    # An irregular low strip, with breaks between placements instead of a clipped box hedge.
    outline = [(-3.0, -0.45), (-2.1, -0.85), (0.1, -0.65), (2.8, -0.38),
               (3.1, 0.35), (2.0, 0.92), (0.0, 1.10), (-2.4, 0.80)]
    for i, a in enumerate(outline):
        c = outline[(i + 1) % len(outline)]
        b.face([(0, 0.08, 0), (c[0], 0.01, c[1]), (a[0], 0.01, a[1])], 'HK_Grass')
    from vegetation import shrubs
    centers = []
    for i, x in enumerate((-2.5, -1.7, -0.8, 0.2, 1.0, 2.0, 2.6)):
        z = b.rng.uniform(-0.15, 0.65)
        y = b.rng.uniform(0.25, 0.43)
        centers.append((x, y, z, 0.72, 0.46 + b.rng.random() * 0.15, 0.67))
    shrubs(b, centers, 510)
    for i in range(22):
        x, z = b.rng.uniform(-2.8, 2.8), b.rng.uniform(0.5, 1.0)
        h = b.rng.uniform(0.18, 0.42)
        b.face([(x - 0.035, 0.01, z), (x + 0.035, 0.01, z), (x + 0.08, h, z + 0.18)], 'HK_Grass')


def build(name, mesh_class, lod=False):
    b = mesh_class(name)
    b.distant = lod
    if name == 'ART_MoatRoadPaint':
        road_paint(b)
    elif name == 'ART_MoatBankPatch':
        bank_patch(b)
    else:
        bank_tree(b, name.endswith('Airy'))
    return b
