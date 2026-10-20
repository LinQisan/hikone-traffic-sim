"""Connected Shiga University / western moat, from the browser-owned geographic plan.

Campus identities and the two historic halls follow the university's official map and photos.
Satellite roof outlines remain approximate; no imagery or hidden interiors are exported.
"""
import json
import math
import os
import subprocess
import struct
import random
from functools import lru_cache

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS = ('ART_ShigaCampus', 'ART_WestMoat')
EXTENT = [(-1060, -100), (-220, -100), (-220, 870), (-1060, 870)]


@lru_cache(maxsize=1)
def data():
    script = "import {UNIVERSITY_DATA} from './src/university-layout.js';console.log(JSON.stringify(UNIVERSITY_DATA));"
    return json.loads(subprocess.check_output(['node', '--input-type=module', '-e', script], cwd=ROOT))


def cut(polygons, cutters):
    """Far-world booleans discard sub-mm slivers caused by cancellation near shared edges.

    The near junction retains its stricter seam partition. Here Float32 ULPs are already
    ~0.06 mm; repeated clipping of numerical zero-area fragments must not multiply them.
    """
    from road_network import bounds, overlap
    def area(poly):
        if len(poly) < 3:
            return 0
        x,z = poly[0]
        return abs(sum((a[0]-x)*(b[1]-z)-(b[0]-x)*(a[1]-z)
                       for a,b in zip(poly,poly[1:]+poly[:1]))) / 2
    def clip(poly,a,b,positive):
        dx,dz=b[0]-a[0],b[1]-a[1]
        tolerance=math.hypot(dx,dz)*.00001
        def distance(p):
            d=dx*(p[1]-a[1])-dz*(p[0]-a[0])
            return 0 if abs(d)<tolerance else d
        out=[]
        for p,q in zip(poly,poly[1:]+poly[:1]):
            dp,dq=distance(p),distance(q)
            inside=dp>=0 if positive else dp<=0
            other=dq>=0 if positive else dq<=0
            if inside:out.append(p)
            if inside != other:
                t=dp/(dp-dq)
                out.append((p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t))
        return out if area(out)>.00001 else []
    def subtract(poly,cutter):
        if not overlap(bounds(poly),bounds(cutter)):return [poly]
        remaining,out=poly,[]
        for a,b in zip(cutter,cutter[1:]+cutter[:1]):
            outside=clip(remaining,a,b,False)
            if outside:out.append(outside)
            remaining=clip(remaining,a,b,True)
            if not remaining:break
        return out
    result = polygons
    for cutter in cutters:
        result = [q for poly in result for q in subtract(poly, cutter)]
    clean=[]
    for q in result:
        q=[tuple(struct.unpack('f',struct.pack('f',v))[0] for v in p) for p in q]
        q=[p for i,p in enumerate(q) if math.dist(p,q[i-1])>.001]
        if len(q)>=3 and area(q)>.0001:clean.append(q)
    return clean


def union(polygons):
    from road_network import ccw
    result, previous = [], []
    for p in polygons:
        p=ccw(p)
        result.extend(cut([p], previous))
        previous.append(p)
    return result


@lru_cache(maxsize=1)
def plan():
    from road_network import strip, triangulate, ccw, inner_moat
    difference = cut
    d = data()
    cx,cz=d['forecourt']
    circle=lambda r:[(cx+r*math.cos(i*math.tau/24),cz+r*math.sin(i*math.tau/24)) for i in range(24)]
    island,court=circle(5),circle(12)
    roads = union([p for path, half in ((d['road'],4),(d['lane'],2.2),(d['frontLane'],1.8),(d['link'],3.0),
                    *[(line,2.5) for line in d['schoolLanes']]) for p in strip(path, -half, half)]
                    +triangulate(ccw(d['schoolCourt'])))
    paths = union([p for path in [d['entrance'], *d['paths']] for p in strip(path, -2.4, 2.4)]
                  + strip(d['schoolLotEntry'],-1.7,1.7))
    shoulders = union([p for path, half in ((d['road'],6.5),(d['lane'],2.6),(d['frontLane'],2.1),
                       (d['link'][:6],5.0),(d['link'][5:],3.3)) for p in strip(path, -half, half)])
    paths = union(paths + difference(shoulders, roads) + triangulate(ccw(court)))
    apron=[t for t in triangulate(ccw(d['apron']))]
    paths = union(paths + apron + [t for q in d['paving'] for t in triangulate(ccw(q))])
    paths = difference(paths, roads + [island])
    print('UNIVERSITY_PLAN streets', len(roads), len(paths), flush=True)
    # Both banks are geographic outlines. A fixed-width road ribbon previously
    # flooded the tennis peninsula and continued around the wrong town junction.
    water = union([t for p in (d['moat'], d['innerWater']) for t in triangulate(ccw(p))])
    bridge = strip(d['link'],-5.0,5.0) + strip(d['entrance'],-3.0,3.0) + strip(d['frontLane'],-2.1,2.1)
    water = difference(water, bridge + [t for poly in (d['land'],d['townLand'],d['gateLanding']) for t in triangulate(ccw(poly))])
    print('UNIVERSITY_PLAN water', len(water), flush=True)
    lawns = [t for poly in (d['land'],d['northLand'],d['schoolLand'],d['gateLanding']) for t in triangulate(ccw(poly))]
    fields = [t for f in d['fields'] for t in triangulate(ccw(f['footprint']))]
    lot = cut(triangulate(ccw(d['schoolLot'])),roads+paths)
    town = [t for t in triangulate(ccw(d['townLand']))]
    original_lawns = difference(union(lawns),town)
    native_street=strip(d['outerMoatStreet'],-5.5,5.5)
    native_water=triangulate(inner_moat())
    pool=triangulate(ccw(d['schoolPool']['water']))
    pool_deck=cut(triangulate(ccw(d['schoolPool']['deck'])),pool)
    lawns = difference(original_lawns, roads + paths + water + fields + lot + native_street + native_water +pool+pool_deck)
    town = difference(town,roads + paths + water + fields)
    lawns = union(lawns + triangulate(ccw(island)))
    print('UNIVERSITY_PLAN lawns', len(lawns), flush=True)
    # This low grass sheet can remain beneath raised plots and 1 cm roads. Only depressed
    # water needs a hole; cutting every path into hidden ground needlessly multiplies faces.
    base = difference([EXTENT], water + native_water)
    print('UNIVERSITY_PLAN base', len(base), flush=True)
    # Exclude buildings from paths only where their authored outlines actually intersect.
    buildings = [t for item in d['buildings'] + d['schoolBuildings'] + d['neighbors'] for t in triangulate(ccw(item['footprint']))]
    paths = difference(paths, buildings)
    curbs=union([q for side in (-1,1) for q in strip(d['road'],side*4,side*4.2)])
    curbs=cut(curbs,strip(d['entrance'],-3,3)+strip(d['lane'],-2.2,2.2)+strip(d['frontLane'],-2.1,2.1)+strip(d['link'],-5,5))
    lot_paths=cut(paths,cut(paths,strip(d['schoolLotEntry'],-1.7,1.7)))
    return dict(roads=roads, paths=paths, water=water, lawns=lawns, base=base, fields=fields,lot=lot,lotPaths=lot_paths,
                pool=pool,poolDeck=pool_deck,curbs=curbs,town=town)


def land_cutters():
    p = plan()
    return p['roads'] + p['paths'] + p['water']


def ground_groups():
    from road_network import triangles
    p = plan()
    # Walk surfaces use the same Float32 triangles as the exported model.
    return {'Shiga University streets': [t for q in p['roads'] for t in triangles(q, 0.01)],
            'Shiga University paths': [t for q in p['paths'] for t in triangles(q, 0.01)],
            'Shiga University kerbs': [t for q in p['curbs'] for t in triangles(q, 0.16)],
            'Shiga University grounds': [t for q in p['lawns'] + p['fields'] + p['town'] + p['lot'] + p['poolDeck'] for t in triangles(q, 0.15)]}


def export_plan():
    """Refresh this extension only; retain editor image registration and unrelated ground groups."""
    groups = ground_groups()
    path = os.path.join(ROOT, 'data', 'road_tiles.json')
    with open(path) as f:
        old = json.load(f)
    old = {k: v for k, v in old.items() if not k.startswith('Shiga University ')}
    old.update(groups)
    with open(path, 'w') as f:
        json.dump(old, f, separators=(',', ':'))
    walls = [dict(name='University moat ' + str(i), polygon=[v for p in q for v in p])
             for i, q in enumerate(plan()['water'])]
    for name in ('walls.json', 'map.json'):
        path = os.path.join(ROOT, 'data', name)
        with open(path) as f:
            meta = json.load(f)
        meta['walls'] = [w for w in meta['walls'] if not w['name'].startswith('University moat ')] + walls
        if name == 'map.json':
            # The full editor overview has its own registration. Ground refreshes retain
            # that registration and the separate practice bounds.
            meta['surfaces'] = [dict(kind=('carriageway' if k in ('Kyobashi carriageway', 'Shiga University streets')
                                         else 'ground' if k.endswith('grounds') or k == 'Kyobashi raised bank'
                                         else 'sidewalk'),
                                     triangles=[v for t in ts for i, v in enumerate(t) if i % 3 != 1])
                                for k, ts in old.items()]
        with open(path, 'w') as f:
            json.dump(meta, f, separators=(',', ':'))


def crop_far_ground(b, points, material):
    """Remove the authoritative extension footprint from the old generic grass sheet."""
    from road_network import ccw, face
    # Blender Z is up; the original mesh is already mirrored into export coordinates.
    poly = [(-p.x, -p.y) for p in points]
    for q in cut([ccw(poly)], [EXTENT]):
        face(b, q, points[0].z, material)


def frame_point(item, u, y, v):
    p = item['footprint']
    # The first edge is the long observed roof axis, the fourth is the cross axis.
    a, c, _, e = p
    return (a[0] + (c[0] - a[0]) * u + (e[0] - a[0]) * v, y,
            a[1] + (c[1] - a[1]) * u + (e[1] - a[1]) * v)


def historic_hall(b, item):
    from streetscape import outward_face
    from abstract_props import cylinder
    p = item['footprint']
    centre = (sum(x for x, z in p) / 4, 4, sum(z for x, z in p) / 4)
    f = lambda u, y, v: frame_point(item, u, y, v)
    hall = item['id'] == 'auditorium'
    top = 8.55 if hall else 6.25
    first_face=len(b.faces)
    # The auditorium has white clapboard and mint pilasters, not grey classroom concrete.
    for side in (0, 1):
        outward_face(b, [f(0,.15,side),f(1,.15,side),f(1,top,side),f(0,top,side)], 'ART_Plaster', centre)
    for end in (0, 1):
        outward_face(b, [f(end,.15,0),f(end,.15,1),f(end,top,1),f(end,top,0)], 'ART_Plaster', centre)
    for side in (0, 1):
        if not b.distant and hall:
            for y in [1.0 + i * .32 for i in range(23)]:
                v=side+(side*2-1)*.0015
                outward_face(b, [f(0,y,v),f(1,y,v),f(1,y+.025,v),f(0,y+.025,v)], 'ART_StoneLight', centre)
        wall_side = side + (side * 2 - 1) * .001
        for i in range(1, 9 if hall else 6):
            u = i / (9 if hall else 6)
            for y in ((1.7, 5.1) if hall else (1.4, 4.0)):
                outward_face(b, [f(u-.022,y,wall_side),f(u+.022,y,wall_side),f(u+.022,y+2.2,wall_side),f(u-.022,y+2.2,wall_side)], 'ART_Window', centre)
                if not b.distant:
                    for uu in (u-.027,u+.027,u):
                        cylinder(b,f(uu,y-.05,wall_side),f(uu,y+2.25,wall_side),.055,'ART_Patina' if hall else 'ART_Timber',segments=4)
    for end in (0,1):
        outward_face(b,[f(end,top,0),f(end,top,1),f(end,top+item['rise'],.5)],'ART_Plaster',centre)
    roof = 'ART_Patina' if hall else 'ART_RedRoof'
    for side in (0,1):
        outward_face(b,[f(-.015,top,side),f(1.015,top,side),f(1.015,top+item['rise'],.5),f(-.015,top+item['rise'],.5)],roof,centre)
    # Entry on the short southeast end; the long facade retains its rhythm of tall windows.
    outward_face(b,[f(1.002,.15,.40),f(1.002,.15,.60),f(1.002,4.1,.60),f(1.002,4.1,.40)],'ART_Timber',centre)
    if hall:
        # Tall windows, mint pilasters and the circular gable light distinguish the front.
        for v in (.13,.28,.72,.87):
            outward_face(b,[f(1.003,1.2,v-.025),f(1.003,1.2,v+.025),
                f(1.003,7.7,v+.025),f(1.003,7.7,v-.025)],'ART_Window',centre)
            for vv in (v-.033,v+.033):
                cylinder(b,f(1.006,1.1,vv),f(1.006,7.8,vv),.07,'ART_Patina',segments=4)
        outward_face(b,[f(1.003,5.3,.42),f(1.003,5.3,.58),f(1.003,7.7,.58),f(1.003,7.7,.42)],'ART_Window',centre)
        for v in (.34,.66):
            cylinder(b,f(1.025,.15,v),f(1.025,4.55,v),.24,'ART_StoneLight',segments=8)
        outward_face(b,[f(1.04,4.3,.31),f(1.04,4.3,.69),f(1.04,4.65,.69),f(1.04,4.65,.31)],'ART_StoneLight',centre)
        depth=math.dist(p[0],p[3])
        disk=[f(1.006,top+2.2+.62*math.sin(i*math.tau/24),.5+.62/depth*math.cos(i*math.tau/24)) for i in range(24)]
        outward_face(b,disk,'ART_Window',centre)
        for i in range(24):
            a,c=i*math.tau/24,(i+1)*math.tau/24
            points=[f(1.009,top+2.2+r*math.sin(t),.5+r/depth*math.cos(t)) for r,t in ((.65,a),(.65,c),(.81,c),(.81,a))]
            outward_face(b,points,'ART_Patina',centre)
        for end in (0,1):
            for v in (0,1):
                cylinder(b,f(end,top,v),f(end,top+item['rise'],.5),.10,'ART_Patina',segments=6)
                cylinder(b,f(end,.18,v),f(end,top,v),.14,'ART_Patina',segments=6)
        # Roof lantern and three curved dormers: the identifying silhouette in official photos.
        at = f(.52,top+item['rise'],.5)
        cylinder(b,at,(at[0],at[1]+2.1,at[2]),.82,'ART_Patina',segments=12)
        rings = [(2.1,.84),(2.45,.80),(2.72,.55),(2.9,.06)]
        for (y,r),(yy,rr) in zip(rings,rings[1:]):
            for i in range(12):
                angle, a2 = i*math.tau/12,(i+1)*math.tau/12
                outward_face(b,[(at[0]+r*math.cos(angle),at[1]+y,at[2]+r*math.sin(angle)),
                  (at[0]+r*math.cos(a2),at[1]+y,at[2]+r*math.sin(a2)),
                  (at[0]+rr*math.cos(a2),at[1]+yy,at[2]+rr*math.sin(a2)),
                  (at[0]+rr*math.cos(angle),at[1]+yy,at[2]+rr*math.sin(angle))],roof,at)
        for u in (.24,.47,.72):
            pts=[f(u-.026,top+1.9,0.12),f(u+.026,top+1.9,.12)]
            pts += [f(u+.026*math.cos(a),top+1.9+1.05*math.sin(a),.12) for a in [i*math.pi/8 for i in range(9)]]
            outward_face(b,pts,roof,centre)
    else:
        # Open central balcony and timber posts, rather than a solid decorative box.
        for u in (.35,.65):
            cylinder(b,f(u,3.1,1.08),f(u,6.25,1.08),.11,'ART_Timber',segments=6)
        for y in (3.1,4.0):
            cylinder(b,f(.33,y,1.08),f(.67,y,1.08),.08,'ART_Timber',segments=6)
    for k in range(first_face,len(b.faces)):
        material=b.materials[b.slots[k]]
        if material=='ART_Plaster':
            b.pigments[k]=(.88,.91,.86) if hall else (.91,.86,.73)


def trees(b, points, seed, spacing=17, spread=3.2, setback=0, avoid_streets=False, silhouette=False):
    from vegetation import tree
    for n,(a,c) in enumerate(zip(points,points[1:])):
        length=math.dist(a,c)
        for i in range(max(1,int(length/spacing))):
            t=(i+.5)/max(1,int(length/spacing))
            x,z=a[0]+(c[0]-a[0])*t,a[1]+(c[1]-a[1])*t
            x-=(c[1]-a[1])/length*setback
            z+=(c[0]-a[0])/length*setback
            if avoid_streets:
                from castle_approach import point_segment_distance
                d=data()
                streets=[(d['link'],3.8),*[(line,3.3) for line in d['schoolLanes']]]
                if any(point_segment_distance(x,z,p,q)<half for line,half in streets for p,q in zip(line,line[1:])):
                    continue
            # Reuse the painted bough/spray hierarchy; the extension must not bring
            # back the old three-disc umbrella crowns beside the corrected gate.
            distant=b.distant
            try:
                if silhouette:b.distant=True
                tree(b,'cherry',base=(x,.15,z),height=7.4,spread=spread,
                     seed=seed+n*37+i*13,fine=False)
            finally:
                b.distant=distant



def buildings(b, items):
    from castle_approach import building
    from abstract_props import cylinder
    for item in items:
        if item['id'] in ('auditorium','ryosui'):
            historic_hall(b,item)
        elif item['id']=='moat-timber-house':
            from streetscape import outward_face
            f=lambda u,y,v:frame_point(item,u,y,v)
            centre=f(.5,2.7,.5)
            for side in (0,1):
                outward_face(b,[f(0,.15,side),f(1,.15,side),f(1,5.55,side),f(0,5.55,side)],'HK_WoodDark',centre)
                for u in (.15,.35,.55,.75,.9):
                    v=side+(side*2-1)*.002
                    for y in (1.0,3.6):
                        outward_face(b,[f(u-.055,y,v),f(u+.055,y,v),f(u+.055,y+1.1,v),f(u-.055,y+1.1,v)],'HK_Glass',centre)
                for u in (0,.25,.5,.75,1):
                    cylinder(b,f(u,.15,side),f(u,5.55,side),.055,'ART_Timber',segments=4)
                cylinder(b,f(0,3.1,side),f(1,3.1,side),.085,'HK_WoodMid',segments=4)
            for end in (0,1):
                outward_face(b,[f(end,.15,0),f(end,.15,1),f(end,5.55,1),f(end,5.55,0)],'HK_WoodDark',centre)
            a,c,d,e=[f(u,5.5,v) for u,v in ((-.06,-.08),(1.06,-.08),(1.06,1.08),(-.06,1.08))]
            left,right=f(.18,7.65,.5),f(.82,7.65,.5)
            for q in ([a,c,right,left],[d,e,left,right],[e,a,left],[c,d,right]):outward_face(b,q,'HK_RoofTile',centre)
        else:
            building(b,item)
            if item['id'].startswith('frontage-'):
                # Dark paired upper windows and ground glazing break the town houses'
                # blank masses; all opaque geometry stays in the existing pigment batch.
                p=item['footprint'];cx=sum(x for x,z in p)/4;cz=sum(z for x,z in p)/4
                from streetscape import outward_face
                for a,c in zip(p,p[1:]+p[:1]):
                    length=math.dist(a,c);ux,uz=(c[0]-a[0])/length,(c[1]-a[1])/length
                    nx,nz=-uz,ux
                    if nx*((a[0]+c[0])/2-cx)+nz*((a[1]+c[1])/2-cz)<0:nx,nz=-nx,-nz
                    columns=max(1,int(length/(5 if b.distant else 3.5)))
                    for i in range(columns):
                        t=(i+.5)/columns;x,z=a[0]+(c[0]-a[0])*t,a[1]+(c[1]-a[1])*t
                        def at(u,y):return (x+ux*u+nx*.025,y,z+uz*u+nz*.025)
                        for y in (1.0,3.6):
                            outward_face(b,[at(-.62,y),at(.62,y),at(.62,y+1.1),at(-.62,y+1.1)],'ART_Window',(cx,2.5,cz))
                            if not b.distant:
                                cylinder(b,at(0,y),at(0,y+1.1),.025,'ART_Timber',segments=4)


def gate_name(b, x, z, tangent, normal):
    """Bake four Japanese characters into the gate pillar; no runtime canvas or font request."""
    import bpy
    font_path=next((p for p in (os.environ.get('HIKONE_JAPANESE_FONT',''),
        '/System/Library/Fonts/Hiragino Sans GB.ttc',
        '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc') if os.path.isfile(p)),None)
    if font_path is None:
        raise RuntimeError('Set up a Japanese-capable font for the campus gate before rebuilding.')
    curve=bpy.data.curves.new('Campus gate inscription','FONT')
    curve.body='滋\n賀\n大\n学'
    curve.font=bpy.data.fonts.load(font_path)
    curve.size=.32
    curve.space_line=1.05
    curve.align_x='CENTER'
    curve.resolution_u=3
    ob=bpy.data.objects.new('Campus gate inscription',curve)
    bpy.context.collection.objects.link(ob)
    mesh=bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    for face in mesh.polygons:
        points=[mesh.vertices[i].co for i in face.vertices]
        b.face([(x+tangent[0]*p.x+normal[0]*.405,1.8+p.y,z+tangent[1]*p.x+normal[1]*.405) for p in points],'ART_Timber',False)
    bpy.data.meshes.remove(mesh)
    bpy.data.objects.remove(ob,do_unlink=True)
    bpy.data.curves.remove(curve)


@lru_cache(maxsize=1)
def water_edges():
    from road_network import bounds, triangulate, inner_moat
    p,d=plan(),data()
    def inside(point,polys):
        x,z=point
        for poly,box in polys:
            if not box[0]-.001<=x<=box[2]+.001 or not box[1]-.001<=z<=box[3]+.001:continue
            hit=False
            for a,c in zip(poly,poly[1:]+poly[:1]):
                if (a[1]>z)!=(c[1]>z) and x<a[0]+(c[0]-a[0])*(z-a[1])/(c[1]-a[1]):hit=not hit
            if hit:return True
        return False
    water=[(q,bounds(q)) for q in p['water']+triangulate(inner_moat())]
    paved=[(q,bounds(q)) for q in p['roads']+p['paths']]
    raised=[(q,bounds(q)) for q in p['lawns']+p['fields']]
    points={tuple(v) for q in p['water'] for v in q}
    edges=[]
    for poly in p['water']:
        for a,c in zip(poly,poly[1:]+poly[:1]):
            dx,dz=c[0]-a[0],c[1]-a[1];length=math.hypot(dx,dz)
            if length<.001:continue
            ts={0,1}
            for x,z in points:
                if abs(dx*(z-a[1])-dz*(x-a[0]))/length<.001:
                    t=((x-a[0])*dx+(z-a[1])*dz)/(length*length)
                    if 0<t<1:ts.add(t)
            ts=sorted(ts)
            for lo,hi in zip(ts,ts[1:]):
                if (hi-lo)*length<.002:continue
                at=lambda t:(a[0]+dx*t,a[1]+dz*t)
                mid=at((lo+hi)/2);nx,nz=-dz/length,dx/length
                left=(mid[0]+nx*.015,mid[1]+nz*.015)
                right=(mid[0]-nx*.015,mid[1]-nz*.015)
                l,r=inside(left,water),inside(right,water)
                if l==r:continue
                outside=right if l else left
                top=.01 if inside(outside,paved) else .15 if inside(outside,raised) else 0
                from castle_approach import point_segment_distance
                if min(point_segment_distance(*mid,a,c) for a,c in zip(d['castleBank'],d['castleBank'][1:]))<.01:top=.15
                edges.append((at(lo),at(hi),top,(outside[0],top-.1,outside[1])))
    return edges


def prism(b,a,c,lo,hi,width,material):
    from streetscape import outward_face
    dx,dz=c[0]-a[0],c[1]-a[1]
    length=math.hypot(dx,dz)
    nx,nz=-dz/length*width/2,dx/length*width/2
    polygon=[(a[0]+nx,a[1]+nz),(c[0]+nx,c[1]+nz),
             (c[0]-nx,c[1]-nz),(a[0]-nx,a[1]-nz)]
    centre=((a[0]+c[0])/2,(lo+hi)/2,(a[1]+c[1])/2)
    for p,q in zip(polygon,polygon[1:]+polygon[:1]):
        outward_face(b,[(p[0],lo,p[1]),(q[0],lo,q[1]),(q[0],hi,q[1]),(p[0],hi,p[1])],material,centre)
    outward_face(b,[(x,hi,z) for x,z in polygon],material,centre)


def gatehouse(b,footprint):
    from streetscape import outward_face
    item=dict(footprint=footprint)
    f=lambda u,y,v:frame_point(item,u,y,v)
    centre=f(.5,1.5,.5)
    for side in (0,1):
        outward_face(b,[f(0,.15,side),f(1,.15,side),f(1,2.95,side),f(0,2.95,side)],'ART_Plaster',centre)
        for u in (.15,.5,.85):
            v=side+(side*2-1)*.001
            outward_face(b,[f(u-.12,.95,v),f(u+.12,.95,v),f(u+.12,2.55,v),f(u-.12,2.55,v)],'ART_Window',centre)
    for end in (0,1):
        outward_face(b,[f(end,.15,0),f(end,.15,1),f(end,2.95,1),f(end,2.95,0)],'ART_Plaster',centre)
    left,right=f(.16,4.0,.5),f(.84,4.0,.5)
    a,c,d,e=[f(u,2.9,v) for u,v in ((-.04,-.07),(1.04,-.07),(1.04,1.07),(-.04,1.07))]
    for face in ([a,c,right,left],[d,e,left,right],[e,a,left],[c,d,right]):
        outward_face(b,face,'HK_RoofTile',centre)


def boundary_mesh(b,runs):
    from abstract_props import cylinder
    for run in runs:
        solid=run['kind']=='wall'
        for a,c in zip(run['points'],run['points'][1:]):
            length=math.dist(a,c)
            def at(t):return (a[0]+(c[0]-a[0])*t,a[1]+(c[1]-a[1])*t)
            material='HK_StoneDark' if solid else 'ART_Timber' if run['kind']=='palisade' else 'HK_Metal'
            if solid:
                prism(b,a,c,.15,.87,.3,material)
                prism(b,a,c,1.35,1.49,.28,'HK_Stone')
            else:
                prism(b,a,c,.15,.38,.22,'HK_StoneDark')
                for y in (.65,1.45):prism(b,a,c,y,y+.065,.065,material)
            count=max(1,math.ceil(length/(3.6 if solid else 3)))
            for i in range(count+1):
                x,z=at(i/count)
                b.box((x,.91,z),(.4 if solid else .12,1.52,.4 if solid else .12),material,False)
                if solid:b.box((x,1.72,z),(.46,.12,.46),'HK_Stone',False)
            spacing=(.9 if b.distant else .3) if run['kind']=='palisade' else 1.2 if solid else 1.5
            count=max(1,math.ceil(length/spacing))
            for i in range(1,count):
                x,z=at(i/count)
                b.box((x,1.1,z),(.07,.85,.07),material,False)


def bridge_edges(b,line):
    from road_network import strip
    # The public road crosses the moat neck on a short, flush deck. The low rail
    # follows the deck, with gaps at both street junctions; nothing spans the gate.
    from abstract_props import cylinder
    for side in (-1,1):
        ribbon=strip(line,side*4.25,side*4.35)
        for q in ribbon:
            a,c=q[0],q[1]
            if math.dist(a,c)<.5:continue
            prism(b,a,c,-1.35,.01,.5,'HK_StoneDark')
            count=max(1,math.ceil(math.dist(a,c)/3))
            for i in range(count+1):
                t=i/count;x,z=a[0]+(c[0]-a[0])*t,a[1]+(c[1]-a[1])*t
                b.box((x,.55,z),(.22,1.1,.22),'HK_Stone',False)
            for y in (.55,1.05):
                cylinder(b,(a[0],y,a[1]),(c[0],y,c[1]),.045,'HK_Metal',segments=4)


def campus_street_detail(b,d):
    """Baked street details, registered to the reviewed gate/frontage plan."""
    from abstract_props import cylinder
    from road_network import face, strip, bounds
    # White parking bays sit only on the exported paving, outside building footprints.
    paved=[(q,bounds(q)) for q in plan()['paths']]
    def on_paving(x,z):
        return any(box[0]<=x<=box[2] and box[1]<=z<=box[3] and
            all((c[0]-a[0])*(z-a[1])-(c[1]-a[1])*(x-a[0])>=-.0001
                for a,c in zip(q,q[1:]+q[:1])) for q,box in paved)
    for a,c in d['parking']:
        length=math.dist(a,c);ux,uz=(c[0]-a[0])/length,(c[1]-a[1])/length
        nx,nz=-uz,ux
        for i in range(int(length/2.6)+1):
            x,z=a[0]+ux*i*2.6,a[1]+uz*i*2.6
            line=[(x+nx*t,z+nz*t) for t in (-2.2,2.2)]
            if all(on_paving(*p) for p in line):
                for q in strip(line,-.055,.055):face(b,q,.022,'HK_WhitePaint',False)
    # A low, open cycle shelter, on the inside of the campus's long front wall.
    a,c=d['parking'][0];length=math.dist(a,c)
    ux,uz=(c[0]-a[0])/length,(c[1]-a[1])/length
    nx,nz=-uz,ux
    for x,z in d['detail']['shelters']:
        def at(u,y,v):return (x+ux*u+nx*v,y,z+uz*u+nz*v)
        for u in (-3.7,3.7):
            for v in (-1.4,1.4):cylinder(b,at(u,.01,v),at(u,2.5,v),.055,'HK_Metal',segments=4)
        b.face([at(-4,2.5,-1.7),at(4,2.5,-1.7),at(4,2.7,1.7),at(-4,2.7,1.7)],'ART_Patina',False)
        b.face([at(-4,2.49,-1.7),at(-4,2.69,1.7),at(4,2.69,1.7),at(4,2.49,-1.7)],'ART_Patina',False)
    # Campus shuttle stop beside the front parking apron; no invented timetable.
    x,z=d['detail']['busStop']
    cylinder(b,(x,.01,z),(x,2.8,z),.045,'HK_Metal',segments=8)
    b.box((x,2.5,z),(.48,.52,.12),'HK_WhitePaint',False)
    b.box((x,2.53,z-.065),(.36,.16,.02),'ART_Patina',False)
    b.box((x,1.55,z),(.36,.65,.1),'ART_StoneLight',False)
    # Concrete distribution poles and continuous sagging spans. All geometry is static;
    # the lowest cable stays above 6 m, with no poles placed in a gate opening.
    poles=d['detail']['poles']
    for x,z in poles:
        cylinder(b,(x,.01,z),(x,10.6,z),.16,'HK_MetalLight',segments=8,end_radius=.10,steps=8)
        for y in (7.6,9.5):
            cylinder(b,(x-nx,y,z-nz),(x+nx,y,z+nz),.04,'HK_Metal',segments=4)
            for side in (-.8,0,.8):
                cylinder(b,(x+nx*side,y,z+nz*side),(x+nx*side,y+.22,z+nz*side),.055,'HK_WhitePaint',segments=6)
    for a,c in zip(poles,poles[1:]):
        for offset,y in ((-.8,9.72),(0,9.72),(.8,9.72),(0,7.82)):
            pts=[(a[0]+(c[0]-a[0])*t+nx*offset,y-.65*4*t*(1-t),
                  a[1]+(c[1]-a[1])*t+nz*offset) for t in [i/12 for i in range(13)]]
            for p,q in zip(pts,pts[1:]):cylinder(b,p,q,.018,'HK_Metal',segments=3)
    # Narrow grey drainage strips follow the local lane edges at footway level.
    for line,half in ((d['lane'],2.25),(d['frontLane'],1.85)):
        for side in (-1,1):
            for q in strip(line,side*half,side*(half+.18)):
                face(b,q,.012,'HK_Stone',False)


def school_street_detail(b,d):
    """Photo-matched open lot, low stone edging and school-side utility corridor."""
    from abstract_props import cylinder
    from road_network import face, strip, triangulate, ccw
    from vegetation import tree, spray
    from streetscape import outward_face
    detail=d['schoolDetail']
    rng=random.Random(413)
    for q in plan()['poolDeck']:face(b,q,.15,'ART_Concrete',False)
    for q in plan()['pool']:b.face([(x,.02,z) for x,z in reversed(q)],'HK_Water',False,pigment=(.36,.42,.25))
    boundary_mesh(b,[dict(kind='fence',points=d['schoolPool']['deck']+[d['schoolPool']['deck'][0]])])
    # Flat patches partition the gravel instead of stacking coplanar grass decals.
    lot=d['schoolLot'];a,c,_,e=lot
    patches=[]
    for i in range(65):
        u,v=rng.uniform(0,1),rng.uniform(0,1)
        x,z=a[0]+(c[0]-a[0])*u+(e[0]-a[0])*v,a[1]+(c[1]-a[1])*u+(e[1]-a[1])*v
        rx,rz=rng.uniform(1.5,4.8),rng.uniform(.5,1.5)
        patches.append(ccw([(x+math.cos(j*math.tau/7)*rx*rng.uniform(.75,1.2),
                             z+math.sin(j*math.tau/7)*rz*rng.uniform(.75,1.2)) for j in range(7)]))
    grass=cut(plan()['lot'],cut(plan()['lot'],patches))
    gravel=cut(plan()['lot'],patches)
    for material,polys in (('HK_Grass',grass),('HK_Stone',gravel)):
        for q in polys:face(b,q,.15,material,False)
    # Irregular masonry courses stay below knee height; the road remains flush.
    for line in detail['stone']:
        for a,c in zip(line,line[1:]):
            length=math.dist(a,c);ux,uz=(c[0]-a[0])/length,(c[1]-a[1])/length
            prism(b,a,c,.01,.46,.42,'HK_StoneDark')
            if not b.distant:
                for row in range(2):
                    n=max(1,math.ceil(length/.85))
                    for i in range(n):
                        lo=max(0,(i-.45*row)/n);hi=min(1,(i+1-.45*row)/n)
                        p=(a[0]+ux*length*lo,a[1]+uz*length*lo)
                        q=(a[0]+ux*length*hi,a[1]+uz*length*hi)
                        if math.dist(p,q)>.04:prism(b,p,q,.025+row*.21,.215+row*.21,.44+rng.uniform(-.035,.035),'HK_Stone')
    # Timber posts and sagging rope leave a broad opening aligned with the lot path.
    for line in detail['rope']:
        for a,c in zip(line,line[1:]):
            n=max(1,math.ceil(math.dist(a,c)/3.2))
            for i in range(n+1):
                t=i/n;x,z=a[0]+(c[0]-a[0])*t,a[1]+(c[1]-a[1])*t
                b.box((x,.22,z),(.4,.14,.4),'HK_Stone',False)
                cylinder(b,(x,.15,z),(x,.95,z),.085,'HK_WoodDark',segments=6)
                if i==n:continue
                pts=[(a[0]+(c[0]-a[0])*(i+s)/n,.8-.13*4*s*(1-s),a[1]+(c[1]-a[1])*(i+s)/n) for s in (0,.25,.5,.75,1)]
                for p,q in zip(pts,pts[1:]):cylinder(b,p,q,.022,'ART_Chain',segments=3)
    boundary_mesh(b,[dict(kind='fence',points=line) for line in detail['fence']])
    # Tall, narrow evergreen silhouettes alternate in height, with separate forked sprays.
    for i,(x,z) in enumerate(detail['conifers']):
        height=12.6+(i%3)*1.1
        cylinder(b,(x,.15,z),(x+.2,height,z-.1),.25,'HK_Bark',segments=7,end_radius=.06)
        for level in range(6):
            y=2.5+level*(height-3)/6
            reach=1.65*(1-level/7)
            for j in range(3):
                angle=j*math.tau/3+level*1.9+i
                tip=(x+math.cos(angle)*reach,y+.3,z+math.sin(angle)*reach)
                if not b.distant:cylinder(b,(x,y-.5,z),tip,.07,'HK_Bark',segments=4,end_radius=.025)
                spray(b,tip,(1.0-level*.11,1.6-level*.1,.85-level*.09),angle,'HK_LeafDark',6100+i*79+level*3+j,False)
        spray(b,(x+.15,height-.6,z),(0.55,1.0,.5),i,'HK_LeafDark',6800+i,False)
    for i,(x,z) in enumerate(detail['broadleaf']):
        tree(b,'cherry',base=(x,.15,z),height=8.3+(i%3)*.8,spread=4.8,seed=4900+i,fine=False,lean=(.4,-.2))
    # The photo's wooded backdrop starts at the opposite bank, rather than leaving
    # a bare green apron between the water and the existing hill grove.
    for i,(a,c) in enumerate(zip(d['castleBank'][1:7],d['castleBank'][2:8])):
        length=math.dist(a,c);nx,nz=(c[1]-a[1])/length,-(c[0]-a[0])/length
        for j,t in enumerate((.25,.75)):
            x,z=a[0]+(c[0]-a[0])*t+nx*4,a[1]+(c[1]-a[1])*t+nz*4
            # This strip is viewed across the moat. Retain the foliage envelopes with
            # silhouette tessellation even when the large street composite is near.
            distant=b.distant
            try:
                b.distant=True
                tree(b,'tabu',base=(x,.15,z),height=13+(i%3),spread=5.5,seed=7200+i*17+j,fine=False)
            finally:
                b.distant=distant
    # A roofed timber noticeboard beside the school lane, with no invented lettering.
    x,z=detail['board'];a,c=d['schoolLanes'][0][-2:];length=math.dist(a,c)
    ux,uz=(c[0]-a[0])/length,(c[1]-a[1])/length;nx,nz=-uz,ux
    def at(u,y,v):return (x+ux*u+nx*v,y,z+uz*u+nz*v)
    for u in (-.9,.9):cylinder(b,at(u,.15,0),at(u,2.1,0),.08,'HK_WoodDark',segments=6)
    outward_face(b,[at(-1,.7,-.03),at(1,.7,-.03),at(1,1.9,-.03),at(-1,1.9,-.03)],'HK_WoodDark',at(0,1.3,0))
    for side in (-1,1):
        b.face([at(-1.15,2.03,side*.35),at(1.15,2.03,side*.35),at(1.15,2.25,0),at(-1.15,2.25,0)],'HK_RoofTile',False)
    poles=detail['poles']
    for x,z in poles:
        cylinder(b,(x,.15,z),(x,10.8,z),.15,'HK_MetalLight',segments=8,end_radius=.10)
        for y in (7.5,9.5):
            cylinder(b,(x-nx,y,z-nz),(x+nx,y,z+nz),.045,'HK_Metal',segments=4)
            for offset in (-.8,0,.8):cylinder(b,(x+nx*offset,y,z+nz*offset),(x+nx*offset,y+.2,z+nz*offset),.06,'HK_WhitePaint',segments=5)
    for a,c in zip(poles,poles[1:]):
        for offset,y in ((-.8,9.7),(0,9.7),(.8,9.7),(0,7.7)):
            pts=[(a[0]+(c[0]-a[0])*t+nx*offset,y-.5*4*t*(1-t),a[1]+(c[1]-a[1])*t+nz*offset) for t in [i/10 for i in range(11)]]
            for p,q in zip(pts,pts[1:]):cylinder(b,p,q,.018,'HK_Metal',segments=3)
    # Narrow concrete drains flank the unmarked school lane; no invented centre stripe.
    for line in d['schoolLanes']:
        for side in (-1,1):
            for q in strip(line,side*2.5,side*2.7):face(b,q,.012,'HK_Stone',False)


def build(name, mesh_class, lod=False):
    from road_network import face, strip, difference, triangulate, ccw
    from streetscape import outward_face
    from abstract_props import cylinder
    b=mesh_class(name)
    b.abstract,b.distant=True,lod
    d,p=data(),plan()
    if name=='ART_ShigaCampus':
        buildings(b,d['buildings'])
        gx,gz=d['gate']
        ax,az=d['axis'][1]
        length=math.hypot(ax-gx,az-gz)
        inward=((ax-gx)/length,(az-gz)/length)
        tangent=(-inward[1],inward[0])
        for side in (-1,1):
            x,z=gx+tangent[0]*side*4.3,gz+tangent[1]*side*4.3
            b.box((x,1.2,z),(.8,2.1,.8),'HK_Stone')
            b.box((x,2.3,z),(.98,.16,.98),'ART_StoneLight')
            if side==-1:gate_name(b,x,z,tangent,(-inward[0],-inward[1]))
        # Low, windowed gatekeeper's room on the southwest side, as in Nov 2022 Street View.
        from castle_approach import building
        gatehouse(b,d['gatehouse']['footprint'])
        boundary_mesh(b,d['boundary'])
        campus_street_detail(b,d)
        # Broad pale apron in front of the hall is paving, rather than an isolated grass plot.
        trees(b,d['campusBank'],412,17,3.8)
        trees(b,d['axis'][1:],621,23,3.0,setback=6)
    else:
        for key,y,material in (('base',0,'HK_Grass'),('lawns',.15,'HK_Grass'),('town',.15,'HK_Sidewalk'),
                               ('roads',.01,'HK_Asphalt'),('paths',.01,'HK_Sidewalk'),('water',-1.35,'HK_Water')):
            for q in (cut(p[key],p['lotPaths']) if key=='paths' else p[key]): face(b,q,y,material,False)
        for q in p['lotPaths']:face(b,q,.01,'HK_Stone',False)
        for field in d['fields']:
            face(b,field['footprint'],.15,field['material'],False)
        buildings(b,d['schoolBuildings'])
        school_street_detail(b,d)
        # Close the FINAL water partition, including road/entrance cuts. Closing only
        # the traced banks left sky-visible sides where swept ribbons met the apron.
        for a,c,top,solid in water_edges():
            outward_face(b,[(a[0],-1.35,a[1]),(c[0],-1.35,c[1]),
                           (c[0],top,c[1]),(a[0],top,a[1])],'HK_StoneDark',solid)
        bridge_edges(b,d['link'][3:6])
        # Low kerb caps rise separately above flush footways, including the new street.
        for q in p['curbs']:
            face(b,q,.16,'HK_Curb',False)
            for a,c in zip(q,q[1:]+q[:1]):
                outward_face(b,[(a[0],.01,a[1]),(c[0],.01,c[1]),(c[0],.16,c[1]),(a[0],.16,a[1])],'HK_Curb',
                             (sum(v[0] for v in q)/len(q),.08,sum(v[1] for v in q)/len(q)))
        # Route markings are segmented and anchored to the road, not a long floating plane.
        for a,c in zip(d['road'],d['road'][1:]):
            length=math.dist(a,c)
            for start in range(3,int(length)-3,10):
                points=[(a[0]+(c[0]-a[0])*t/length,a[1]+(c[1]-a[1])*t/length) for t in (start,min(start+5,length))]
                for q in strip(points,-.075,.075):face(b,q,.022,'HK_WhitePaint',False)
        trees(b,d['schoolBank'],912,22,4.0,avoid_streets=True,silhouette=True)
        # Low detached town frontages continue Route 25's existing fabric. These are contextual
        # masses, not attributed shop identities; their type and setbacks follow the satellite view.
        from castle_approach import building
        buildings(b,d['neighbors'])
        for n,(a,c) in enumerate(zip(d['road'][:7],d['road'][1:7])):
            length=math.dist(a,c)
            ux,uz=(c[0]-a[0])/length,(c[1]-a[1])/length
            nx,nz=-uz,ux
            for i in range(1,max(1,int(length/16))):
                t=i*16
                x,z=a[0]+ux*t+nx*13,a[1]+uz*t+nz*13
                footprint=[(x+ux*u+nx*v,z+uz*u+nz*v) for u,v in ((-4,-4),(4,-4),(4,4),(-4,4))]
                building(b,dict(footprint=footprint,height=5.4+(i%3)*.6,roof='tile',rise=1.5))
    return b
