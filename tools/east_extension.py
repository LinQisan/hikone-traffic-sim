"""Native geographic mesh author. Frozen OSM-derived polygons need no GIS library at build time."""
import json
import math
import os
from functools import lru_cache

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with open(os.path.join(ROOT, 'world', 'geographic-frame.json')) as f:
    FRAME = json.load(f)
# Generic mapped houses are split by region; the reviewed street and photo work stay in Buildings.
REGION_MODELS = ('ART_EastHikoneWest', 'ART_EastHikoneSouth', 'ART_EastHikoneNorth')
MODELS = ('ART_EastHikoneSurface', 'ART_EastHikoneWater', 'ART_EastHikoneBuildings') + REGION_MODELS


@lru_cache(maxsize=1)
def data():
    with open(os.path.join(ROOT, 'world', 'east-hikone.json')) as f:
        return json.load(f)


# One pigment for every seam closure, so stacked retained layers cannot flicker against each other.
SKIRT = (0.52, 0.5, 0.47)
WINDOW = (0.44, 0.52, 0.6)


class Ownership:
    """Geographic coverage: a 2 m state raster for quick accept/reject, exact convex pieces at seams."""
    CELL = 2.0

    def __init__(self):
        east, world = FRAME['east'], FRAME['world']
        self.ring = [tuple(p) for p in east['coverage']]
        self.pieces = []
        for piece in east['pieces']:
            area = sum(a[0] * c[1] - c[0] * a[1] for a, c in zip(piece, piece[1:] + piece[:1]))
            self.pieces.append([tuple(p) for p in (piece if area > 0 else list(reversed(piece)))])
        self.x0, self.z0 = world['xMin'] - 4, world['zMin'] - 4
        self.nx = int((world['xMax'] - world['xMin'] + 8) / self.CELL) + 1
        self.nz = int((world['zMax'] - world['zMin'] + 8) / self.CELL) + 1
        state = [[0] * self.nx for _ in range(self.nz)]
        edges = list(zip(self.ring, self.ring[1:] + self.ring[:1]))
        for j in range(self.nz):
            z = self.z0 + (j + .5) * self.CELL
            xs = sorted(a[0] + (z - a[1]) * (c[0] - a[0]) / (c[1] - a[1]) for a, c in edges if (a[1] > z) != (c[1] > z))
            for x1, x2 in zip(xs[0::2], xs[1::2]):
                for i in range(max(0, int((x1 - self.x0) / self.CELL)), min(self.nx, int((x2 - self.x0) / self.CELL) + 1)):
                    if x1 <= self.x0 + (i + .5) * self.CELL <= x2:
                        state[j][i] = 1
        # Cells touched by the boundary (and their neighbours) need exact treatment.
        self.edge_cells = {}
        for a, c in edges:
            steps = max(1, int(math.dist(a, c) / (self.CELL / 4)))
            for k in range(steps + 1):
                x, z = a[0] + (c[0] - a[0]) * k / steps, a[1] + (c[1] - a[1]) * k / steps
                i, j = int((x - self.x0) / self.CELL), int((z - self.z0) / self.CELL)
                for di in (-1, 0, 1):
                    for dj in (-1, 0, 1):
                        if 0 <= j + dj < self.nz and 0 <= i + di < self.nx:
                            state[j + dj][i + di] = 2
                self.edge_cells.setdefault((i, j), set()).add((a, c))
        # Summed-area tables of interior and boundary cells.
        self.sums = []
        for value in (1, 2):
            table = [[0] * (self.nx + 1) for _ in range(self.nz + 1)]
            for j in range(self.nz):
                row, above, here = 0, table[j], table[j + 1]
                for i in range(self.nx):
                    row += state[j][i] == value
                    here[i + 1] = above[i + 1] + row
            self.sums.append(table)
        self.piece_cells = {}
        for n, piece in enumerate(self.pieces):
            for key in self._cells(piece, 20):
                self.piece_cells.setdefault(key, []).append(n)

    def _cells(self, points, size):
        xs, zs = [p[0] for p in points], [p[-1] for p in points]
        return [(i, j) for i in range(math.floor(min(xs) / size), math.floor(max(xs) / size) + 1)
                for j in range(math.floor(min(zs) / size), math.floor(max(zs) / size) + 1)]

    def _count(self, table, i0, j0, i1, j1):
        return table[j1 + 1][i1 + 1] - table[j0][i1 + 1] - table[j1 + 1][i0] + table[j0][i0]

    def state(self, points):
        """0: wholly retained, 1: wholly inside the geographic coverage, 2: crosses its boundary."""
        xs, zs = [p[0] for p in points], [p[-1] for p in points]
        i0, i1 = int((min(xs) - self.x0) / self.CELL), int((max(xs) - self.x0) / self.CELL)
        j0, j1 = int((min(zs) - self.z0) / self.CELL), int((max(zs) - self.z0) / self.CELL)
        if i1 < 0 or j1 < 0 or i0 >= self.nx or j0 >= self.nz:
            return 0
        i0, j0, i1, j1 = max(i0, 0), max(j0, 0), min(i1, self.nx - 1), min(j1, self.nz - 1)
        if self._count(self.sums[1], i0, j0, i1, j1):
            return 2
        inside = self._count(self.sums[0], i0, j0, i1, j1)
        return 1 if inside == (i1 - i0 + 1) * (j1 - j0 + 1) else 0 if inside == 0 else 2

    def nearby_pieces(self, points):
        found = set()
        for key in self._cells(points, 20):
            found.update(self.piece_cells.get(key, ()))
        return [self.pieces[n] for n in sorted(found)]

    def on_boundary(self, p, tolerance=1e-3):
        i, j = int((p[0] - self.x0) / self.CELL), int((p[-1] - self.z0) / self.CELL)
        for a, c in self.edge_cells.get((i, j), ()):
            dx, dz = c[0] - a[0], c[1] - a[1]
            length = math.hypot(dx, dz)
            along = ((p[0] - a[0]) * dx + (p[-1] - a[1]) * dz) / length
            if -tolerance <= along <= length + tolerance and abs(dx * (p[-1] - a[1]) - dz * (p[0] - a[0])) / length < tolerance:
                return True
        return False

    def contains(self, x, z):
        inside = False
        for a, c in zip(self.ring, self.ring[1:] + self.ring[:1]):
            if (a[1] > z) != (c[1] > z) and x < a[0] + (z - a[1]) * (c[0] - a[0]) / (c[1] - a[1]):
                inside = not inside
        return inside


@lru_cache(maxsize=1)
def ownership():
    return Ownership()


def clip_half(poly, a, c, keep_left):
    """Clip a 3D polygon (x, y, z) against the line a→c in the X/Z plane, interpolating heights."""
    dx, dz = c[0] - a[0], c[1] - a[1]
    tolerance = math.hypot(dx, dz) * 1e-9
    out = []
    side = lambda p: (lambda d: 0 if abs(d) < tolerance else d)(dx * (p[2] - a[1]) - dz * (p[0] - a[0]))
    for p, q in zip(poly, poly[1:] + poly[:1]):
        dp, dq = side(p), side(q)
        inside = dp >= 0 if keep_left else dp <= 0
        other = dq >= 0 if keep_left else dq <= 0
        if inside:
            out.append(p)
        if inside != other and dp != dq:
            t = dp / (dp - dq)
            out.append(tuple(p[i] + (q[i] - p[i]) * t for i in range(3)))
    return out if len(out) >= 3 else []


def dedupe(poly):
    """Merge vertices closer than 0.01 mm; Float32 recipes would collapse them to one point."""
    out = []
    for v in poly:
        if not out or sum((v[k]-out[-1][k])**2 for k in range(3)) > 1e-10:
            out.append(v)
    while len(out) > 1 and sum((out[0][k]-out[-1][k])**2 for k in range(3)) <= 1e-10:
        out.pop()
    return out


def drop_collinear(poly):
    """Remove vertices on the straight line between their neighbours: a fan triangulation
    through them would create zero-area triangles with undefined normals."""
    changed = True
    while changed and len(poly) > 3:
        changed = False
        for i in range(len(poly)):
            a, v, c = poly[i-1], poly[i], poly[(i+1) % len(poly)]
            u, w = [v[k]-a[k] for k in range(3)], [c[k]-v[k] for k in range(3)]
            cross = (u[1]*w[2]-u[2]*w[1], u[2]*w[0]-u[0]*w[2], u[0]*w[1]-u[1]*w[0])
            if sum(x*x for x in cross) < 1e-12 * max(1e-12, sum(x*x for x in u) * sum(x*x for x in w)):
                poly = poly[:i] + poly[i+1:]
                changed = True
                break
    return poly


def clip_existing_face(points):
    """Subtract the geographic coverage from a retained face, interpolating heights at seams."""
    own = ownership()
    state = own.state(points)
    if state != 2:
        return [] if state == 1 else [points]
    result = [points]
    for piece in own.nearby_pieces(points):
        pieces = []
        for p in result:
            remaining = p
            for a, c in zip(piece, piece[1:] + piece[:1]):
                outside = clip_half(remaining, a, c, False)
                if outside:
                    pieces.append(outside)
                remaining = clip_half(remaining, a, c, True)
                if not remaining:
                    break
        result = pieces
    return result


def skirts(pieces, original_points):
    """Vertical closures from a clipped ground face down to the moat datum, where the seam meets
    mapped water. Land/road seams keep the fill's own step faces and stay walkable.

    Only near-horizontal faces receive them; cut walls/roofs are already closed volumes.
    Faces point away from the retained piece.
    """
    a, c, d = original_points[:3]
    u, v = [c[i] - a[i] for i in range(3)], [d[i] - a[i] for i in range(3)]
    n = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
    length = math.sqrt(sum(x * x for x in n))
    if length < 1e-12 or abs(n[1]) / length < .3:
        return []
    own, result = ownership(), []
    for piece in pieces:
        cx, cz = sum(p[0] for p in piece) / len(piece), sum(p[2] for p in piece) / len(piece)
        for p, q in zip(piece, piece[1:] + piece[:1]):
            if math.dist((p[0], p[2]), (q[0], q[2])) < 1e-4 or min(p[1], q[1]) < -1.49:
                continue
            middle = ((p[0] + q[0]) / 2, (p[2] + q[2]) / 2)
            if not (own.on_boundary((p[0], p[2])) and own.on_boundary((q[0], q[2])) and own.on_boundary(middle)):
                continue
            length = math.dist((p[0], p[2]), (q[0], q[2]))
            ox, oz = (q[2]-p[2])/length*.05, -(q[0]-p[0])/length*.05
            if (middle[0]+ox-cx)*ox + (middle[1]+oz-cz)*oz < 0:
                ox, oz = -ox, -oz
            if not mapped_water(middle[0]+ox, middle[1]+oz):
                continue
            quad = [p, q, (q[0], -1.5, q[2]), (p[0], -1.5, p[2])]
            u, v = [q[i] - p[i] for i in range(3)], [quad[2][i] - p[i] for i in range(3)]
            n = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
            if n[0] * (middle[0] - cx) + n[2] * (middle[1] - cz) < 0:
                quad = list(reversed(quad))
            result.append(quad)
    return result


def clip_existing_builder(b):
    from mathutils import Vector
    original = b.polygon
    def polygon(vertices, material, pigment=None, smooth=False, detail=0):
        # Authors can call abstract_props.face() directly, bypassing BrushMesh.face().
        # Polygon is the shared boundary; its input uses Blender's converted axes.
        points = [(-p[0], p[2], -p[1]) for p in vertices]
        pieces = clip_existing_face(points)
        changed = len(pieces) != 1 or len(pieces[0]) != len(points) or any(tuple(a) != tuple(c) for a,c in zip(pieces[0],points))
        if changed:
            b.clip_revision = getattr(b, 'clip_revision', 0) + 1
            if pigment and isinstance(pigment[0], (list, tuple)):
                pigment = tuple(sum(c[i] for c in pigment) / len(pigment) for i in range(3))
        for p in pieces:
            if changed:
                p = drop_collinear(dedupe(p))
                if len(p) < 3:
                    continue
                normal = [sum((a[(j+1)%3]-c[(j+1)%3])*(a[(j+2)%3]+c[(j+2)%3])
                              for a,c in zip(p,p[1:]+p[:1])) for j in range(3)]
                if sum(n*n for n in normal) < 1e-14:
                    continue
            original([Vector((-x,-z,y)) for x,y,z in p], material, pigment, smooth, detail)
        if changed:
            for quad in skirts(pieces, points):
                original([Vector((-x,-z,y)) for x,y,z in reversed(quad)], 'HK_Stone', SKIRT)
    b.polygon = polygon
    return b


def clip_finished_builder(b, origin):
    """Clip composites after their local sections have received their final placement.

    Retain untouched native operations with remapped face/vertex ranges. Flattening every
    woodland primitive would unnecessarily inflate transport and construction work.
    """
    from mathutils import Vector
    old = {k: getattr(b,k) for k in ('vertices','faces','slots','pigments','smooth','details')}
    for k in old:
        setattr(b,k,[])
    face_map, vertex_map, changed = {}, {}, set()
    for i, ids in enumerate(old['faces']):
        face_map[i] = len(b.faces)
        points = [(-old['vertices'][v][0]+origin[0], old['vertices'][v][2]+origin[1],
                   -old['vertices'][v][1]+origin[2]) for v in ids]
        pieces = clip_existing_face(points)
        same = len(pieces)==1 and pieces[0]==points
        if not same:
            changed.add(i)
        pigment = old['pigments'][i]
        if not same and isinstance(pigment[0], (list,tuple)):
            pigment = tuple(sum(c[k] for c in pigment)/len(pigment) for k in range(3))
        for p in pieces:
            if not same:
                p = drop_collinear(dedupe(p))
                if len(p)<3:
                    continue
                normal = [sum((a[(k+1)%3]-c[(k+1)%3])*(a[(k+2)%3]+c[(k+2)%3])
                              for a,c in zip(p,p[1:]+p[:1])) for k in range(3)]
                if sum(n*n for n in normal)<1e-14:
                    continue
            if same:
                vertex_map.update({v:len(b.vertices)+j for j,v in enumerate(ids)})
            b.polygon([Vector((-(x-origin[0]),-(z-origin[2]),y-origin[1])) for x,y,z in p],
                      b.materials[old['slots'][i]],pigment,old['smooth'][i],old['details'][i])
        if not same:
            for quad in skirts(pieces, points):
                b.polygon([Vector((-(x-origin[0]),-(z-origin[2]),y-origin[1])) for x,y,z in reversed(quad)],
                          'HK_Stone',SKIRT,False,0)
    face_map[len(old['faces'])] = len(b.faces)
    if hasattr(b,'operations'):
        b.operations = [(op,params,matrix,face_map[start],face_map[end],vertex_map[vertex],before)
                        for op,params,matrix,start,end,vertex,before in b.operations
                        if vertex in vertex_map and not any(i in changed for i in range(start,end))]
    return b


def building_region(building):
    """The asset that authors a footprint: west of X=-250, south of Z=20, north of Z=480, or central."""
    from field_photos import data as photos
    from east_street import data as street
    from higashi_school import east_replaced
    from university_photos import ALLEY_PROFILES
    reviewed = building['id'] in photos()['buildings'] or building['id'] in street()['houses'] or building['id'] in ALLEY_PROFILES
    if reviewed or building['id'] in east_replaced():
        return 'ART_EastHikoneBuildings'
    ring = building['outlines'][0]
    x, z = sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring)
    return 'ART_EastHikoneWest' if x < -250 else 'ART_EastHikoneSouth' if z < 20 else 'ART_EastHikoneNorth' if z > 480 else 'ART_EastHikoneBuildings'


def final_surfaces():
    """Source partition with the school island's courts and the walked east street applied."""
    from higashi_school import island_cut
    from east_street import overlay
    source = dict(data()['surfaces'])
    land, grass, grounds = island_cut(source.get('land', []), source.get('grass', []))
    # The rampart falls 4 m in 12 m: refine its long source triangles so the slope is real.
    from field_photos import split_triangles
    rampart = lambda t: 118 < sum(p[0] for p in t) / len(t) < 200 and min(p[1] for p in t) < 118 and max(p[1] for p in t) > 98
    grass = [q for t in grass for q in (split_triangles([t], 3) if rampart(t) else [t])]
    return overlay(dict(source, land=land, grass=grass)), grounds


def bank_height(x, z):
    """Inherit the existing castle-bank profile at the seam; fade to town datum by X=200."""
    from road_network import north_bank_height, north_shore
    if x >= 200 or x < 0 or z < north_shore(x):
        return .15
    t = max(0, min(1, (200-x)/16))
    return .15 + (north_bank_height(x,z)-.15)*t*t*(3-2*t)


def flat(b, triangles, height, material):
    for t in triangles:
        # Match road_network's clockwise top faces in the imported left-handed map frame.
        signed = sum(a[0] * c[1] - c[0] * a[1] for a, c in zip(t, t[1:] + t[:1]))
        b.face([(x, height(x,z) if callable(height) else height, z) for x, z in (list(reversed(t)) if signed > 0 else t)], material, strokes=False)


def water_edges():
    edges = {}
    for t in data()['surfaces']['water']:
        for a,c in zip(t,t[1:]+t[:1]):
            key = tuple(sorted((tuple(a),tuple(c))))
            if key in edges:
                del edges[key]
            else:
                edges[key] = (a,c)
    return edges.values()


def crop_edge(a,c):
    own = ownership()
    return own.on_boundary(a, 1e-4) and own.on_boundary(c, 1e-4) and own.on_boundary(((a[0]+c[0])/2,(a[1]+c[1])/2), 1e-4)


@lru_cache(maxsize=1)
def water_cells():
    cells = {}
    for t in data()['surfaces']['water']:
        xs,zs = [p[0] for p in t],[p[1] for p in t]
        for i in range(math.floor(min(xs)/8),math.floor(max(xs)/8)+1):
            for j in range(math.floor(min(zs)/8),math.floor(max(zs)/8)+1):
                cells.setdefault((i,j),[]).append(t)
    return cells


def mapped_water(x, z):
    for a,c,d in water_cells().get((math.floor(x/8),math.floor(z/8)),[]):
        determinant = (c[1]-d[1])*(a[0]-d[0])+(d[0]-c[0])*(a[1]-d[1])
        if abs(determinant)<1e-10:
            continue
        u = ((c[1]-d[1])*(x-d[0])+(d[0]-c[0])*(z-d[1]))/determinant
        v = ((d[1]-a[1])*(x-d[0])+(a[0]-d[0])*(z-d[1]))/determinant
        if min(u,v,1-u-v)>=-1e-6:
            return True
    return False


@lru_cache(maxsize=1)
def deck_cells():
    cells = {}
    for kind in ('road','walk','lot'):
        for t in data()['surfaces'].get(kind, []):
            xs,zs = [p[0] for p in t],[p[1] for p in t]
            for i in range(math.floor(min(xs)/8),math.floor(max(xs)/8)+1):
                for j in range(math.floor(min(zs)/8),math.floor(max(zs)/8)+1):
                    cells.setdefault((i,j),[]).append(t)
    return cells


@lru_cache(maxsize=None)
def shore_height(x,z):
    # Deck and footway edges meet their own datum; no 14 cm wall crosses a mapped bridge.
    for kind in ('deck',):
        for a,c,d in deck_cells().get((math.floor(x/8),math.floor(z/8)),[]):
            determinant = (c[1]-d[1])*(a[0]-d[0])+(d[0]-c[0])*(a[1]-d[1])
            if abs(determinant)<1e-10:
                continue
            u = ((c[1]-d[1])*(x-d[0])+(d[0]-c[0])*(z-d[1]))/determinant
            v = ((d[1]-a[1])*(x-d[0])+(a[0]-d[0])*(z-d[1]))/determinant
            if min(u,v,1-u-v)>=-1e-5:
                return .01
    return bank_height(x,z)


def seam_faces():
    """Close retained road/plot steps at ownership cuts using the exported ground profiles."""
    with open(os.path.join(ROOT,'data','road_tiles.json')) as f:
        tiles = json.load(f)
    triangles = [t for ts in tiles.values() for t in ts]
    def index(ts):
        cells = {}
        for t in ts:
            xs,zs = t[0::3],t[2::3]
            for x in range(math.floor(min(xs)/4),math.floor(max(xs)/4)+1):
                for z in range(math.floor(min(zs)/4),math.floor(max(zs)/4)+1):
                    cells.setdefault((x,z),[]).append(t)
        return cells
    def sample(cells,x,z):
        best = None
        for ax,ay,az,bx,by,bz,cx,cy,cz in cells.get((math.floor(x/4),math.floor(z/4)),[]):
            d = (bz-cz)*(ax-cx)+(cx-bx)*(az-cz)
            if abs(d)<1e-12:
                continue
            u = ((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/d
            v = ((cz-az)*(x-cx)+(ax-cx)*(z-cz))/d
            if min(u,v,1-u-v)>=-1e-6:
                y = u*ay+v*by+(1-u-v)*cy
                best = y if best is None else max(best,y)
        return best
    ground = index(triangles)
    kinds = {k:index([[v for x,z in t for v in (x,0,z)] for t in ts])
             for k,ts in data()['surfaces'].items()}
    boundary = FRAME['east']['coverage']
    # Inward normal: left of each edge for a counter-clockwise ring.
    turn = 1 if sum(p[0]*q[1]-q[0]*p[1] for p,q in zip(boundary,boundary[1:]+boundary[:1])) > 0 else -1
    for a,c in zip(boundary,boundary[1:]+boundary[:1]):
        dx,dz = c[0]-a[0],c[1]-a[1]
        length = math.hypot(dx,dz)
        if length < 1e-6:
            continue
        nx,nz = -dz/length*turn,dx/length*turn
        candidates = {}
        for k in range(int(length/2)+2):
            x,z = a[0]+dx*min(k*2,length)/length,a[1]+dz*min(k*2,length)/length
            for t in ground.get((math.floor(x/4),math.floor(z/4)),[]):
                candidates[id(t)] = t
        cuts = {0.0,length}
        for t in candidates.values():
            for i in range(3):
                j = (i+1)%3
                px,pz,qx,qz = t[3*i],t[3*i+2],t[3*j],t[3*j+2]
                ex,ez = qx-px,qz-pz
                denominator = dx*ez-dz*ex
                if abs(denominator) < 1e-12:
                    continue
                s = ((px-a[0])*ez-(pz-a[1])*ex)/denominator
                r = ((px-a[0])*dz-(pz-a[1])*dx)/denominator
                if 0 < s < 1 and -1e-9 <= r <= 1+1e-9:
                    cuts.add(round(s*length,7))
        # Dense samples too: a partition vertex rounded just off the seam must not hide a step.
        cuts.update(k*.25 for k in range(1,int(length/.25)+1) if k*.25 < length)
        cuts = sorted(cuts)
        for p,q in zip(cuts,cuts[1:]):
            if q-p<1e-6:
                continue
            middle = (p+q)/2
            x,z = a[0]+dx*middle/length,a[1]+dz*middle/length
            # Do not build a barrier across a mapped deck, water or a continuing road.
            kind = next((k for k in ('road','walk','lot','water','grass','land')
                         if k in kinds and sample(kinds[k],x+nx*.003,z+nz*.003) is not None),None)
            if kind not in ('land','grass'):
                continue
            inside = sample(ground,x+nx*.003,z+nz*.003)
            outside = sample(ground,x-nx*.003,z-nz*.003)
            inside,outside = .15 if inside is None else inside,.15 if outside is None else outside
            if abs(inside-outside)<.001:
                continue
            # One rectangle per segment at the middle's heights; segments are short.
            low, high = min(inside,outside), max(inside,outside)
            p0,p1 = [((a[0]+dx*t/length,low,a[1]+dz*t/length),(a[0]+dx*t/length,high,a[1]+dz*t/length)) for t in (p,q)]
            face = [p0[0],p0[1],p1[1],p1[0]]
            # Face the lower side, whichever way the ring runs.
            u,v = [face[1][i]-face[0][i] for i in range(3)],[face[2][i]-face[0][i] for i in range(3)]
            normal = (u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])
            lower = (nx,nz) if inside<outside else (-nx,-nz)
            yield face if normal[0]*lower[0]+normal[2]*lower[1] > 0 else list(reversed(face))


def build(name, mesh_class, lod=False):
    b = mesh_class(name)
    b.abstract, b.distant = True, lod
    d = data()
    if name == 'ART_EastHikoneSurface':
        if not hasattr(b,'operations'):
            from road_network import export_castle_paths
            export_castle_paths()
            export_plan()
        surfaces, grounds = final_surfaces()
        for kind, height, material in [('road',.01,'HK_Asphalt'),('walk',.01,'HK_Sidewalk'),('lot',.01,'HK_Asphalt')]:
            flat(b, surfaces[kind], height, material)
        flat(b, surfaces['land'], bank_height, 'HK_Sidewalk')
        flat(b, surfaces['grass'], bank_height, 'HK_Grass')
        for material, pieces in surfaces['extra'].items():
            flat(b, pieces, .01, material)
        for material, pieces in grounds.items():
            flat(b, pieces, .15, material)
        flat(b, d['paint'], .022, 'HK_WhitePaint')
        # Expose the true mapped shoreline against the existing project's water datum.
        for a,c in water_edges():
            if not crop_edge(a,c):
                b.face([(a[0],-1.35,a[1]),(a[0],shore_height(*a),a[1]),
                        (c[0],shore_height(*c),c[1]),(c[0],-1.35,c[1])], 'HK_Stone', strokes=False)
        for face in seam_faces():
            b.face(face,'HK_Sidewalk',strokes=False)
    elif name in REGION_MODELS:
        for building in d['buildings']:
            if building_region(building) == name:
                house(b, building)
    elif name == 'ART_EastHikoneWater':
        flat(b, d['surfaces']['water'], -1.35, 'HK_Water')
    else:
        for building in d['buildings']:
            if building_region(building) == 'ART_EastHikoneBuildings':
                house(b, building)
        from university_photos import alley_street
        alley_street(b,d)
        from field_photos import furniture
        furniture(b)
        from higashi_school import building as school_building, island, east_owned
        for item in island()['buildings']:
            if east_owned(item):
                school_building(b, item)
        from east_street import furniture as street_furniture
        street_furniture(b)
    return b


def outward(b, points, material, inside, pigment):
    a, c, e = points[:3]
    u, v = [c[i] - a[i] for i in range(3)], [e[i] - a[i] for i in range(3)]
    n = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
    if sum(n[i] * (a[i] - inside[i]) for i in range(3)) < 0:
        points = list(reversed(points))
    b.face(points, material, strokes=False, pigment=pigment)


def house(b, building):
    """Mapped footprint walls to an estimated eave, then a gable or flat roof.

    Heights are OSM values where present and otherwise explicit type/area estimates
    (heightBasis). Pitched roofs are reserved for compact house-like outlines.
    """
    from field_photos import photographed_building
    from higashi_school import east_replaced
    from east_street import house as street_house
    if building['id'] in east_replaced() or photographed_building(b,building) or street_house(b,building):
        return
    from university_photos import alley_wall
    eave = .15 + building['height']
    roof = building.get('roof')
    wall, tile = b.pigment('HK_Plaster', .3), b.pigment('HK_RoofTile', .35)
    # Open roof structures (canopies) have no walls; their columns are not mapped.
    for ring in ([] if building['kind'] == 'roof' else building.get('wallOutlines', building['outlines'])):
        turn = 1 if sum(p[0]*q[1]-q[0]*p[1] for p,q in zip(ring, ring[1:]+ring[:1])) > 0 else -1
        for a, c in zip(ring, ring[1:] + ring[:1]):
            length = math.dist(a, c)
            if length < 1e-4:
                continue
            # A point just inside the footprint orients each wall, including concave outlines.
            mx, mz = (a[0]+c[0])/2 - (c[1]-a[1])/length*.1*turn, (a[1]+c[1])/2 + (c[0]-a[0])/length*.1*turn
            if alley_wall(b,building,a,c,eave,(mx,eave/2,mz)):
                continue
            outward(b, [(a[0],bank_height(*a),a[1]),(a[0],eave,a[1]),(c[0],eave,c[1]),(c[0],bank_height(*c),c[1])],
                    'HK_Plaster', (mx, eave/2, mz), wall)
            # One window band per storey on walls long enough to read from the street, just proud
            # of the plaster so it cannot flicker. Sheds and canopies stay plain.
            if length < 2.8 or building['height'] < 3:
                continue
            ox, oz = (c[1]-a[1])/length*.03*turn, -(c[0]-a[0])/length*.03*turn
            inset = min(.9, length*.18)
            for floor in range(max(1, round(building["height"]/3))):
                y0 = .15 + floor*3 + .95
                if y0 + 1.1 > eave - .2:
                    break
                ua, uc = inset/length, 1-inset/length
                p0 = (a[0]+(c[0]-a[0])*ua+ox, a[1]+(c[1]-a[1])*ua+oz)
                p1 = (a[0]+(c[0]-a[0])*uc+ox, a[1]+(c[1]-a[1])*uc+oz)
                outward(b, [(p0[0],y0,p0[1]),(p0[0],y0+1.1,p0[1]),(p1[0],y0+1.1,p1[1]),(p1[0],y0,p1[1])],
                        'ART_Window', (mx, y0, mz), WINDOW)
    if not roof:
        flat(b, building['triangles'], eave, 'HK_RoofTile')
        return
    p = roof['rect']
    cx, cz = sum(q[0] for q in p)/4, sum(q[1] for q in p)/4
    def out(q, amount=.25):
        dx, dz = q[0]-cx, q[1]-cz
        length = math.hypot(dx, dz)
        return (q[0]+dx/length*amount*1.414, eave, q[1]+dz/length*amount*1.414)
    e = [out(q) for q in p]
    ridge = [((e[1][0]+e[2][0])/2, eave+roof['rise'], (e[1][2]+e[2][2])/2),
             ((e[3][0]+e[0][0])/2, eave+roof['rise'], (e[3][2]+e[0][2])/2)]
    inside = (cx, eave+roof['rise']*.3, cz)
    outward(b, [e[0], e[1], ridge[0], ridge[1]], 'HK_RoofTile', inside, tile)
    outward(b, [e[2], e[3], ridge[1], ridge[0]], 'HK_RoofTile', inside, tile)
    # Gable ends close the attic between the walls and the ridge.
    outward(b, [(p[1][0],eave,p[1][1]), (p[2][0],eave,p[2][1]), ridge[0]], 'HK_Plaster', inside, wall)
    outward(b, [(p[3][0],eave,p[3][1]), (p[0][0],eave,p[0][1]), ridge[1]], 'HK_Plaster', inside, wall)
    # The eave soffit keeps the overhang closed when seen from the street.
    flat(b, [[(q[0],q[2]) for q in e[:3]], [(q[0],q[2]) for q in (e[0],e[2],e[3])]], eave-.02, 'HK_RoofTile')


def export_plan():
    from road_network import surface_kind, AREA_EPS
    path = os.path.join(ROOT, 'data', 'road_tiles.json')
    with open(path) as f:
        existing = json.load(f)
    groups = {}
    for name, ts in existing.items():
        if name.startswith('East Hikone '):
            continue
        groups[name] = []
        for t in ts:
            p = [tuple(t[i:i+3]) for i in range(0,9,3)]
            for q in clip_existing_face(p):
                for i in range(1,len(q)-1):
                    a,c,d = q[0],q[i],q[i+1]
                    if abs((c[0]-a[0])*(d[2]-a[2])-(c[2]-a[2])*(d[0]-a[0])) > AREA_EPS * 2:
                        groups[name].append(list(a) + list(c) + list(d))
    surfaces, grounds = final_surfaces()
    surfaces = dict(surfaces, grass=surfaces['grass'] + [t for pieces in grounds.values() for t in pieces],
                    lot=surfaces['lot'] + [t for pieces in surfaces['extra'].values() for t in pieces])
    for kind, label, height in [('road','carriageway',.01),('walk','pavement',.01),('lot','parking',.01),('land','grounds',bank_height),('grass','green grounds',bank_height)]:
        groups['East Hikone ' + label] = [[v for x,z in t for v in (x,height(x,z) if callable(height) else height,z)] for t in surfaces.get(kind, [])]
    with open(path, 'w') as f:
        json.dump(groups, f, separators=(',', ':'))
    # Clip the old water blockers by the exact same ownership rule used for render meshes.
    for name in ['map.json', 'walls.json']:
        path = os.path.join(ROOT, 'data', name)
        with open(path) as f:
            meta = json.load(f)
        walls = []
        for wall in meta['walls']:
            if wall.get('name','').startswith('East moat '):
                continue
            p = [(wall['polygon'][i],0,wall['polygon'][i+1]) for i in range(0,len(wall['polygon']),2)]
            for q in clip_existing_face(p):
                if abs(sum(a[0]*c[2]-c[0]*a[2] for a,c in zip(q,q[1:]+q[:1]))) > 1e-7:
                    walls.append(dict(wall, polygon=[v for x,y,z in q for v in (x,z)]))
        walls += [{'name': 'East moat ' + str(i), 'polygon': [v for p in t for v in p]}
                  for i,t in enumerate(data()['waterWalls'])]
        meta['walls'], meta['world'] = walls, FRAME['world']
        if name == 'map.json':
            meta['surfaces'] = [{'kind': surface_kind(k), 'triangles': [v for t in ts for i,v in enumerate(t) if i%3 != 1]}
                                for k,ts in groups.items()]
        with open(path, 'w') as f:
            json.dump(meta, f, separators=(',', ':'))
