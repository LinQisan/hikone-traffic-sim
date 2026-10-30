"""Import an OSM snapshot into the existing local frame and a clipped, disjoint surface plan.

Optional offline author dependency: Python 3 with Shapely >= 2.1. Neither Blender authors nor
browser startup need Shapely or network access. See docs/geography.md for provenance.
"""
import argparse
import hashlib
import heapq
import json
import math
import pathlib
import subprocess
import xml.etree.ElementTree as ET

from shapely import constrained_delaunay_triangles, make_valid
from shapely.geometry import Point, LineString, Polygon, box
from shapely.ops import unary_union, polygonize
from shapely import minimum_rotated_rectangle

ROOT = pathlib.Path(__file__).resolve().parent.parent
FRAME = json.loads((ROOT / 'world/geographic-frame.json').read_text())
COVERAGE = None  # Derived from the retained authored polygon once node positions are known.
ALLOWED = {'name', 'name:en', 'highway', 'building', 'building:levels', 'height', 'min_height',
           'natural', 'water', 'waterway', 'landuse', 'leisure', 'bridge', 'layer', 'lanes', 'width',
           'oneway', 'sidewalk:both', 'sidewalk:left', 'sidewalk:right', 'footway', 'crossing',
           'crossing:markings', 'crossing:signals', 'traffic_signals', 'traffic_signals:direction',
           'surface', 'access', 'service', 'tunnel', 'ref', 'amenity', 'parking'}
GREEN = {'natural': ('wood', 'scrub', 'grassland', 'heath'),
         'landuse': ('forest', 'grass', 'meadow', 'farmland', 'recreation_ground', 'cemetery', 'village_green', 'orchard'),
         'leisure': ('park', 'garden', 'pitch', 'playground', 'golf_course')}
# Line waterways without their own area: estimated channel widths, as for unmeasured streets.
CHANNEL = {'river': 6.0, 'canal': 4.0, 'stream': 2.5, 'drain': 1.8, 'ditch': 1.2}
SMALL_HOUSE = ('yes', 'house', 'detached', 'residential', 'semidetached_house', 'terrace', 'farm')


def derive_coverage(xy, ways, tags):
    """World extent minus the retained authored core; mapped inner-moat water is not retained."""
    spec = FRAME['east']['retained']
    world = FRAME['world']
    core = Polygon(spec['polygon'])
    for cut in spec.get('excludeWater', []):
        way = ways[cut['osm'].split('/')[1]]
        core = core.difference(Polygon([xy[n.attrib['ref']] for n in way.findall('nd')]).intersection(box(*cut['within'])))
    core = max(polygons(make_valid(core)), key=lambda p: p.area)
    coverage = box(world['xMin'], world['zMin'], world['xMax'], world['zMax']).difference(core)
    coverage = make_valid(coverage.simplify(.05))
    parts = polygons(coverage)
    if len(parts) != 1 or parts[0].interiors:
        raise ValueError('Geographic coverage must be one polygon without holes')
    coverage = parts[0]
    ring = [[round(x, 4), round(z, 4)] for x, z in list(coverage.exterior.coords)[:-1]]
    coverage = Polygon(ring)
    pieces = [[[round(x, 4), round(z, 4)] for x, z in list(t.exterior.coords)[:-1]]
              for t in constrained_delaunay_triangles(coverage).geoms if t.area > 1e-6]
    FRAME['east']['coverage'], FRAME['east']['pieces'] = ring, pieces
    FRAME['east'].pop('cutouts', None)
    (ROOT / 'world/geographic-frame.json').write_text(json.dumps(FRAME, indent=2) + '\n')
    return coverage


def green_kind(t):
    return next((t[k] for k, values in GREEN.items() if t.get(k) in values), None)


def estimated_height(kind, area, levels, height):
    """Measured height, storeys × 3 m, or an explicit type/footprint estimate (no source height)."""
    if height:
        return height, 'OSM height'
    if levels:
        return levels * 3, 'OSM storeys × 3 m (estimate)'
    if kind in ('garage', 'garages', 'carport', 'shed', 'roof', 'hut', 'kiosk', 'toilets', 'greenhouse'):
        value = 2.6
    elif kind in ('temple', 'shrine', 'church'):
        value = 6.5
    elif kind in ('apartments', 'commercial', 'retail', 'office', 'school', 'university', 'hospital',
                  'public', 'civic', 'government', 'hotel', 'dormitory', 'kindergarten'):
        value = 7 if area < 200 else 10 if area < 900 else 13
    elif kind in ('industrial', 'warehouse', 'factory'):
        value = 7
    else:
        value = 3.2 if area < 30 else 6.2 if area < 260 else 7.5 if area < 900 else 10
    return value, 'estimate from OSM building type and footprint area'


def gable(poly, kind, basis):
    """Pitched roof frame for compact estimated houses, long axis first; otherwise flat."""
    if basis.startswith('OSM height') or kind not in SMALL_HOUSE or not 30 <= poly.area <= 260:
        return None
    rect = minimum_rotated_rectangle(poly)
    if rect.geom_type != 'Polygon' or poly.area / rect.area < .86:
        return None
    p = list(rect.exterior.coords)[:4]
    if math.dist(p[0], p[1]) < math.dist(p[1], p[2]):
        p = p[1:] + p[:1]
    short = math.dist(p[1], p[2])
    return {'shape': 'gable', 'rect': [[round(x, 4), round(z, 4)] for x, z in p], 'rise': round(min(2.2, short * .32), 3)}


def polygons(geometry):
    if geometry.is_empty:
        return []
    if geometry.geom_type == 'Polygon':
        return [geometry]
    return [p for g in getattr(geometry, 'geoms', []) for p in polygons(g)]


def triangles(geometry, bank=False):
    result = []
    shapes = [geometry]
    if bank:
        stitch = box(120,84,200,146)
        detail = geometry.intersection(stitch)
        shapes = [geometry.difference(stitch)]
        if not detail.is_empty:
            shapes += [detail.intersection(box(x,z,x+2,z+2)) for x in range(120,200,2) for z in range(84,146,2)]
    for poly in [p for g in shapes for p in polygons(make_valid(g))]:
        for t in constrained_delaunay_triangles(poly).geoms:
            if t.area > 1e-7:
                result.append([[round(x, 5), round(z, 5)] for x, z in list(t.exterior.coords)[:-1]])
    return result


def rings(geometry):
    return [[[round(x, 5), round(z, 5)] for x, z in list(p.exterior.coords)[:-1]] for p in polygons(geometry)]


def number(text):
    try:
        return float(str(text).replace(' m', '').strip())
    except (ValueError, TypeError):
        return None


def north_routes(roads, walks):
    """Keep the castle's existing walking graph connected through mapped footways."""
    road = next(r for r in roads if r['id']=='way/121393434')
    start = next(r for r in walks if r['id']=='way/1376436165')['nodes'][0]
    end = next(r for r in walks if r['id']=='way/1374082602')['nodes'][1]
    graph, locations = {}, {}
    for walk in walks:
        if walk.get('access') in ('no','private'):
            continue
        for i,n in enumerate(walk['nodes']):
            locations[n] = walk['points'][i]
            if i:
                previous = walk['nodes'][i-1]
                distance = math.dist(walk['points'][i-1],walk['points'][i])
                graph.setdefault(previous,[]).append((n,distance))
                graph.setdefault(n,[]).append((previous,distance))
    queue, distance, previous = [(0,start)], {start:0}, {}
    while queue:
        cost,n = heapq.heappop(queue)
        if n==end:
            break
        if cost>distance[n]:
            continue
        for other,step in graph.get(n,[]):
            if cost+step<distance.get(other,math.inf):
                distance[other],previous[other] = cost+step,n
                heapq.heappush(queue,(cost+step,other))
    if end not in previous:
        raise ValueError('Mapped Sawaguchi footways do not connect to the castle approach')
    path,n = [],end
    while True:
        path.insert(0,locations[n])
        if n==start:
            break
        n=previous[n]
    bridge = next(r for r in walks if r['id']=='way/1376682862')['points']
    sidewalk = next(r for r in walks if r['id']=='way/1374082602')['points']
    return {'innerRoad': [p for p in road['points'] if p[1]>=348], 'sawaguchiAccess':path,
            'omoteApproach': [sidewalk[-1],*list(reversed(bridge[:-1]))]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--osm', type=pathlib.Path, required=True)
    parser.add_argument('--water', type=pathlib.Path, required=True, help='Full OSM relation 3548105; bbox APIs can omit remote members.')
    parser.add_argument('--source-url', default='https://api.openstreetmap.org/api/0.6/map?bbox=136.2530,35.2700,136.2600,35.2763')
    args = parser.parse_args()
    root = ET.parse(args.osm).getroot()
    root.extend(ET.parse(args.water).getroot())
    nodes = {n.attrib['id']: n for n in root.findall('node')}
    ways = {w.attrib['id']: w for w in root.findall('way')}
    tags = lambda e: {t.attrib['k']: t.attrib['v'] for t in e.findall('tag') if t.attrib['k'] in ALLOWED}
    locations = [[float(n.attrib['lat']), float(n.attrib['lon'])] for n in nodes.values()]
    script = "import fs from 'node:fs';import{geographicPoint}from'./src/world/geography/coordinates.ts';console.log(JSON.stringify(JSON.parse(fs.readFileSync(0,'utf8')).map(p=>geographicPoint(...p))));"
    local = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', script],
                       cwd=ROOT, input=json.dumps(locations).encode()))
    xy = dict(zip(nodes, local))
    global COVERAGE
    COVERAGE = derive_coverage(xy, ways, tags)
    coords = lambda w: [xy[n.attrib['ref']] for n in w.findall('nd')]
    wgs = lambda w: [[float(nodes[n.attrib['ref']].attrib['lon']), float(nodes[n.attrib['ref']].attrib['lat'])] for n in w.findall('nd')]
    roads, walks, water, green, buildings, features, references = [], [], [], [], [], [], []
    road_polys, walk_polys, water_polys, green_polys, building_polys, lot_polys = [], [], [], [], [], []
    wooded = []
    relation_members, skipped_relations = set(), []
    for rel in {r.attrib['id']: r for r in root.findall('relation')}.values():
        t = tags(rel)
        if t.get('natural') != 'water':
            continue
        members = rel.findall('member')
        if any(m.attrib['ref'] not in ways for m in members if m.attrib['type'] == 'way'):
            skipped_relations.append(rel.attrib['id'])
            continue
        boundaries = {}
        for role in ['outer', 'inner']:
            lines = [LineString(coords(ways[m.attrib['ref']])) for m in members
                     if m.attrib['type'] == 'way' and m.attrib.get('role') == role]
            boundaries[role] = unary_union(list(polygonize(unary_union(lines))))
        shape = boundaries['outer'].difference(boundaries['inner']).intersection(COVERAGE)
        if not shape.is_empty:
            water_polys.append(shape)
            water.append({'id': 'relation/' + rel.attrib['id'], 'name': t.get('name'), 'polygons': rings(shape)})
            relation_members.update(m.attrib['ref'] for m in members if m.attrib['type'] == 'way')
    for id, w in ways.items():
        pts, t = coords(w), tags(w)
        closed = len(pts) >= 4 and pts[0] == pts[-1]
        lot = closed and t.get('amenity') == 'parking' and t.get('parking') not in ('underground', 'multi-storey')
        polygon_kind = closed and bool(t.get('building') or t.get('natural') == 'water' or green_kind(t) or lot)
        channel = (not closed and t.get('waterway') in CHANNEL and not t.get('tunnel')
                   and number(t.get('layer') or 0) is not None and number(t.get('layer') or 0) >= 0)
        if not (polygon_kind or t.get('highway') or channel):
            continue
        shape = make_valid(Polygon(pts)) if polygon_kind else LineString(pts)
        if not shape.intersects(COVERAGE):
            continue
        references.append({'id': 'way/' + id, 'version': int(w.attrib['version']), 'timestamp': w.attrib['timestamp'], 'tags': t})
        features.append({'type': 'Feature', 'properties': {'osm': 'way/' + id, **t}, 'geometry': {'type': 'Polygon' if polygon_kind else 'LineString', 'coordinates': [wgs(w)] if polygon_kind else wgs(w)}})
        if t.get('building'):
            poly = shape.intersection(COVERAGE)
            if poly.area < .5:
                continue
            height, basis = estimated_height(t['building'], shape.area, number(t.get('building:levels')), number(t.get('height')))
            building = {'id': 'way/' + id, 'name': t.get('name'), 'height': round(height, 2), 'heightBasis': basis,
                        'kind': t.get('building'),
                        'triangles': triangles(poly, bank=True), 'outlines': rings(poly)}
            roof = gable(shape, t['building'], basis) if poly.area > shape.area - .01 else None
            if roof:
                building['roof'] = roof
            buildings.append(building)
            building_polys.append(poly)
        elif t.get('natural') == 'water':
            if id not in relation_members:
                poly = shape.intersection(COVERAGE)
                water_polys.append(poly)
                water.append({'id': 'way/' + id, 'name': t.get('name'), 'polygons': rings(poly)})
        elif lot:
            lot_polys.append(shape.intersection(COVERAGE))
        elif channel:
            width = number(t.get('width')) or CHANNEL[t['waterway']]
            poly = shape.buffer(width / 2, cap_style=2, join_style=2).intersection(COVERAGE)
            water_polys.append(poly)
            water.append({'id': 'way/' + id, 'name': t.get('name'), 'kind': t['waterway'], 'width': width,
                          'widthBasis': 'OSM width' if t.get('width') else 'waterway-class estimate',
                          'polygons': rings(poly)})
        elif polygon_kind:
            poly = shape.intersection(COVERAGE)
            kind = green_kind(t)
            green.append({'id': 'way/' + id, 'name': t.get('name'), 'kind': kind, 'polygons': rings(poly)})
            green_polys.append(poly)
            if kind in ('wood', 'forest', 'park', 'garden', 'scrub', 'orchard'):
                wooded.append((kind, poly))
        elif t.get('highway'):
            kind = t['highway']
            if kind in ('steps', 'construction', 'proposed'):
                continue
            is_walk = kind in ('footway', 'path', 'pedestrian', 'cycleway')
            # Widths are explicitly estimates when OSM provides no width. Sidewalks are
            # separate mapped lines; never add an invented sidewalk around every road.
            width = number(t.get('width')) or (2.0 if is_walk else 8.2 if kind == 'primary' else 7.0 if kind in ('secondary', 'tertiary') else 4.4 if kind in ('residential', 'unclassified') else 3.6)
            entry = {'id': 'way/' + id, 'name': t.get('name'), 'kind': kind, 'width': width,
                     'widthBasis': 'OSM width' if t.get('width') else 'road-class estimate checked against GSI aerial scale',
                     'points': [[round(x, 5), round(z, 5)] for x, z in pts],
                     'nodes': [n.attrib['ref'] for n in w.findall('nd')], 'oneway': t.get('oneway'),
                     'lanes': t.get('lanes'), 'bridge': t.get('bridge'), 'crossing': t.get('footway') == 'crossing'}
            entry.update(tunnel=t.get('tunnel'), access=t.get('access'))
            # A passage node is a standing/connection point, not a wall across the doorway.
            # Retain a half-width landing around its ends for body clearance.
            poly = shape.buffer(width / 2, cap_style=1 if t.get('tunnel')=='building_passage' else 2,
                                join_style=2).intersection(COVERAGE)
            (walks if is_walk else roads).append(entry)
            (walk_polys if is_walk else road_polys).append(poly)
    # Mapped junction crossings take their signal status from crossing nodes, rather than a
    # contradictory older tag on a connecting footway. Unmarked crossings receive no zebra.
    facilities, trees = [], []
    for id, n in nodes.items():
        t = tags(n)
        x, z = xy[id]
        if not COVERAGE.covers(Point(x, z)):
            continue
        if t.get('natural') == 'tree':
            trees.append({'id': 'node/' + id, 'x': round(x, 5), 'z': round(z, 5)})
        if t.get('highway') in ('crossing', 'traffic_signals'):
            facilities.append({'id': 'node/' + id, 'x': round(x, 5), 'z': round(z, 5), 'tags': t})
    # An estimated centre-line buffer cannot overrule a mapped building boundary.
    # Retain the source footprints and narrow only the uncertain road/path margins.
    building_shape = unary_union(building_polys)
    passages = unary_union([LineString(r['points']).buffer(r['width']/2, cap_style=1, join_style=2)
                            for r in roads+walks if r.get('tunnel') == 'building_passage']).intersection(COVERAGE)
    for building, poly in zip(buildings, building_polys):
        solid = poly.difference(passages)
        building['solidTriangles'] = [] if building['kind'] == 'roof' else triangles(solid, bank=True)
        if not passages.is_empty and poly.intersects(passages):
            # Walls follow the solid outline; the roof still spans the mapped passage.
            building['wallOutlines'] = rings(solid)
    building_barrier = building_shape.difference(passages)
    carriageway = unary_union(road_polys).difference(building_barrier)
    footway = unary_union(walk_polys).difference(unary_union([carriageway, building_barrier]))
    water_shape = unary_union(water_polys).difference(unary_union([carriageway, footway]))
    parking = unary_union(lot_polys).difference(unary_union([carriageway, footway, water_shape, building_barrier]))
    grass = unary_union(green_polys).difference(unary_union([carriageway, footway, water_shape, parking]))
    land = COVERAGE.difference(unary_union([carriageway, footway, water_shape, grass, parking]))
    # Mapped woods, parks and gardens receive an illustrative deterministic planting, clear of
    # streets, paths, water, parking and buildings. Individually mapped trees are kept as mapped.
    clear = unary_union([carriageway, footway, water_shape, parking, building_shape]).buffer(2.4)
    for kind, poly in wooded:
        spacing = 9 if kind in ('wood', 'forest', 'scrub') else 13
        x0, z0, x1, z1 = poly.bounds
        for i in range(int((x1 - x0) / spacing) + 1):
            for j in range(int((z1 - z0) / spacing) + 1):
                h = (int(x0 * 7 + i * 131 + j * 977) * 2654435761) % 4294967296 / 4294967296
                x = x0 + (i + .2 + .6 * h) * spacing
                z = z0 + (j + .2 + .6 * ((h * 7.13) % 1)) * spacing
                at = Point(x, z)
                if poly.contains(at) and not clear.contains(at):
                    trees.append({'id': 'planting/' + kind, 'x': round(x, 3), 'z': round(z, 3),
                                  'kind': 'grove' if spacing == 9 else 'town'})
    for tree in trees:
        at = Point(tree['x'], tree['z'])
        tree['ground'] = .01 if carriageway.covers(at) or footway.covers(at) or parking.covers(at) else .15
    paint = []
    for crossing in facilities:
        t = crossing['tags']
        if t.get('crossing:markings') not in ('zebra', 'yes'):
            continue
        at = Point(crossing['x'], crossing['z'])
        candidates = [(LineString(r['points']).distance(at), r) for r in roads if r['kind'] != 'service']
        if not candidates:
            continue
        distance, road = min(candidates, key=lambda r: r[0])
        if distance > road['width'] / 2 + 1:
            continue
        line = LineString(road['points']);s = line.project(at)
        a, b = line.interpolate(max(0, s - 1)), line.interpolate(min(line.length, s + 1))
        dx, dz = b.x - a.x, b.y - a.y;length = math.hypot(dx, dz)
        ux, uz = dx / length, dz / length;nx, nz = -uz, ux
        crossing.update(direction=[ux, uz], road=road['id'], controlled=t.get('crossing') == 'traffic_signals')
        for v in range(math.ceil(road['width'] / .85)):
            offset = -road['width'] / 2 + .35 + v * .85
            cx, cz = crossing['x'] + nx * offset, crossing['z'] + nz * offset
            stripe = Polygon([(cx + nx * aa + ux * bb, cz + nz * aa + uz * bb) for aa, bb in [(-.21,-1.3),(.21,-1.3),(.21,1.3),(-.21,1.3)]])
            paint.extend(triangles(stripe.intersection(carriageway)))
    surfaces = {'road': triangles(carriageway), 'walk': triangles(footway), 'lot': triangles(parking),
                'water': triangles(water_shape), 'grass': triangles(grass, bank=True), 'land': triangles(land, bank=True)}
    # Coverage and topology evidence are persisted independently from generated meshes.
    for kind, shape in [('road', carriageway), ('walk', footway), ('lot', parking), ('water', water_shape), ('grass', grass), ('land', land)]:
        if not shape.is_valid:
            raise ValueError('Invalid ' + kind + ' partition')
    data = {'format': 'hikone-geographic-extension', 'version': 1, 'date': '2026-10-29',
            'attribution': '© OpenStreetMap contributors; https://www.openstreetmap.org/copyright',
            'license': 'https://opendatacommons.org/licenses/odbl/1-0/',
            'source': {'url': args.source_url,
                       'sha256': hashlib.sha256(args.osm.read_bytes()).hexdigest(), 'elements': references,
                       'waterRelationURL': 'https://api.openstreetmap.org/api/0.6/relation/3548105/full',
                       'waterRelationSha256': hashlib.sha256(args.water.read_bytes()).hexdigest(),
                       'incompleteWaterRelationsSkipped': skipped_relations},
            'frame': 'geographic-frame.json', 'coverage': FRAME['east']['coverage'],
            'roads': roads, 'walks': walks, 'water': water, 'green': green, 'buildings': buildings,
            'facilities': facilities, 'trees': trees, 'surfaces': surfaces, 'paint': paint,
            'waterWalls': triangles(water_shape),
            'summary': {'roads': len(roads), 'walks': len(walks), 'buildings': len(buildings),
                        'buildingsWithHeight': sum(b['height'] is not None for b in buildings),
                        'buildingsWithSourceHeight': sum(not b['heightBasis'].startswith('estimate') for b in buildings),
                        'pitchedRoofs': sum('roof' in b for b in buildings),
                        'waterFeatures': len(water), 'greenAreas': len(green), 'mappedTrees': sum(t['id'].startswith('node/') for t in trees),
                        'plantedTrees': sum(not t['id'].startswith('node/') for t in trees),
                        'crossings': sum('direction' in f for f in facilities),
                        'coverageArea': COVERAGE.area, 'surfaceArea': sum(Polygon(t).area for ts in surfaces.values() for t in ts)}}
    if FRAME['east'].get('northCorrection') and not any(e['id']=='way/1124658681' for e in references):
        entry = ways['1124658681']
        data['source']['elements'].append({'id':'way/1124658681','version':int(entry.attrib['version']),
                                            'timestamp':entry.attrib['timestamp'],'tags':tags(entry)})
    (ROOT / 'world/east-hikone.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    layout = {'attribution': data['attribution'], 'license': data['license'], 'coverage': data['coverage'],
              'summary': data['summary'], 'trees': trees,
              # Per-building camera bounds; the merged render batch would otherwise cover whole districts.
              'buildings': [{'height': b['height'], 'rise': b.get('roof', {}).get('rise', 0),
                             'outlines': [[[round(x, 2), round(z, 2)] for x, z in o] for o in b['outlines']]}
                            for b in buildings if b['kind'] != 'roof'],
              'places': [{'name': f['tags']['name'] + '（信号交差点）', 'x': f['x'], 'z': f['z']}
                         for f in facilities if f['tags'].get('name') and f['tags'].get('highway') == 'traffic_signals']}
    layout['places'] += [{'name': b['name'] + '（建物輪郭）',
                          'x': sum(p[0] for p in b['outlines'][0])/len(b['outlines'][0]),
                          'z': sum(p[1] for p in b['outlines'][0])/len(b['outlines'][0])}
                         for b, poly in zip(buildings, building_polys)
                         if b.get('name') and b['outlines'] and poly.area >= 250]
    if FRAME['east'].get('northCorrection'):
        layout['reviewedRoutes'] = north_routes(roads,walks)
        layout['reviewedRoutes']['omoteLanding'] = coords(ways['73533338'])[0]
        layout['reviewedRoutes']['museumEntry'] = list(reversed(coords(ways['1124658681'])[:-1]))
    (ROOT / 'world/east-hikone-layout.json').write_text(json.dumps(layout, ensure_ascii=False, separators=(',', ':')) + '\n')
    (ROOT / 'world/east-hikone-source.geojson').write_text(json.dumps({'type': 'FeatureCollection', 'attribution': data['attribution'], 'license': data['license'], 'features': features}, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(json.dumps(data['summary'], indent=2))


if __name__ == '__main__':
    main()
