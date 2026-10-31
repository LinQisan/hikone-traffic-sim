"""Saigo, Kyobashi and the south moat walk, owner photos 0867–0894.

Registered sources and explicit estimates live in world/south-promenade.json.
Painted architecture uses warm plaster, ochre and violet-brown shadows; printed
information uses unlit-by-style (non-emissive) mesh ink with readable lettering.
"""
import json
import math
import os
from functools import lru_cache

from higashi_school import box, face, frame, solid
from east_street import bar, paint, plank, sign_at, stack
from university_frontage import graphic, label, line, rect

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WOOD=(.37,.29,.27)
LIGHT_WOOD=(.53,.42,.33)
DARK=(.24,.25,.29)
PLASTER=(.92,.88,.77)
STONE=(.69,.65,.55)
PAPER=(.96,.94,.85)
INK=(.13,.19,.21)
PATINA=(.43,.56,.52)


@lru_cache(maxsize=1)
def data():
    with open(os.path.join(ROOT,'world','south-promenade.json')) as f:return json.load(f)


def saigo(b,item):
    """Keep the existing outline; replace the blank timber box with observed construction."""
    if item.get('name')!=data()['gate']['name']:return False
    from north_streetscape import roof
    q=data()['gate'];p=item['footprint'];center=tuple(sum(v[i] for v in p)/len(p) for i in (0,1))
    solid(b,p,.15,.56,'HK_Stone',STONE)
    solid(b,p,.56,q['eave'],'ART_Plaster',PLASTER)
    for i,(a,c) in enumerate(zip(p,p[1:]+p[:1])):
        length,at=frame(a,c,center)
        plank(b,at,0,.56,length,2.12,WOOD,.012)
        plank(b,at,0,2.09,length,2.19,LIGHT_WOOD,.035)
        # Modest closed returns/rear; no speculative furnished interior.
        for u in range(math.ceil(length/.32)):
            x=min(length-.02,u*.32)
            plank(b,at,x,.58,min(length,x+.025),2.10,LIGHT_WOOD,.019)
        for u in range(math.ceil(length/3.6)):
            x=min(length-.1,u*3.6)
            box(b,at,x,.035,.13,.13,.56,q['eave'],'ART_Timber',WOOD)
    a,c=p[3],p[2];length,front=frame(a,c,center)
    door=q['doorStation'];width=q['doorWidth']
    # Stone apron and threshold stay on the private verge, clear of the approach shoulder.
    box(b,front,door,.5,width+2.7,1,.15,.28,'HK_Stone',STONE)
    for j in range(7):
        u=door-(width+2.7)/2+j*(width+2.7)/7
        bar(b,front(u,.284,.05),front(u,.284,.98),.009,(.50,.49,.47),'HK_Stone',3)
    box(b,front,door,.12,width+.55,.26,.28,3.48,'ART_Timber',DARK)
    for side in (-1,1):
        lo,hi=door+(side-1)*width/2,door+(side+1)*width/2
        box(b,front,(lo+hi)/2,.27,hi-lo-.025,.12,.34,3.17,'ART_Timber',WOOD)
        for j in range(5):
            u=lo+(hi-lo)*j/5+.025
            plank(b,front,u,.37,u+.026,3.14,LIGHT_WOOD,.336)
        for y in (.62,2.86):
            hinge=lo if side<0 else hi
            outline=[(hinge,y-.12),(hinge-side*.68,y-.04),(hinge-side*.82,y+.08),(hinge-side*.67,y+.16),(hinge,y+.12)]
            graphic(b,front,outline,DARK,.35)
        for y in (1.4,1.59):
            bar(b,front((lo+hi)/2,y,.35),front((lo+hi)/2,y,.40),.065,DARK,'HK_MetalLight',8)
    # Main posts, green metal shoes and horizontal lintel match 0868.
    for u in (door-width/2-.15,door+width/2+.15):
        box(b,front,u,.28,.28,.35,.28,3.48,'ART_Timber',WOOD)
        box(b,front,u,.30,.37,.41,.28,.64,'HK_MetalLight',PATINA)
        for y in (.84,2.83):bar(b,front(u,y,.46),front(u,y,.51),.072,DARK,'HK_MetalLight',8)
    box(b,front,door,.30,width+.60,.35,3.15,3.47,'ART_Timber',WOOD)
    # Small side wicket and two shallow projecting grilles, not large glass panes.
    wicket=door-3.0
    box(b,front,wicket,.2,.94,.2,.35,2.25,'ART_Timber',WOOD)
    for offset in (-5.1,5.1):
        u=door+offset
        box(b,front,u,.23,1.82,.42,1.19,2.53,'ART_Timber',WOOD)
        plank(b,front,u-.72,1.34,u+.72,2.32,DARK,.45)
        for j in range(7):box(b,front,u-.72+j*.24,.51,.065,.10,1.32,2.36,'ART_Timber',LIGHT_WOOD)
        box(b,front,u,.51,1.62,.13,1.29,1.39,'ART_Timber',LIGHT_WOOD)
        # Sloping hood is a closed shallow slab with a visible underside.
        top=[front(u-.98,2.77,.06),front(u+.98,2.77,.06),front(u+.98,2.48,.80),front(u-.98,2.48,.80)]
        low=[(x,y-.10,z)for x,y,z in top]
        for pts in (top,list(reversed(low)),*[[top[j],low[j],low[(j+1)%4],top[(j+1)%4]]for j in range(4)]):
            face(b,pts,'HK_RoofTile',front(u,2.58,.40),(.43,.44,.47))
    # Ridge follows the registered long axis; soffits and gable ends are closed.
    a0=[(p[0][i]+p[3][i])/2 for i in (0,1)];c0=[(p[1][i]+p[2][i])/2 for i in (0,1)]
    ll=math.dist(a0,c0);ux,uz=(c0[0]-a0[0])/ll,(c0[1]-a0[1])/ll;over=q['roofOverhang']
    roof(b,(a0[0]-ux*over,a0[1]-uz*over),(c0[0]+ux*over,c0[1]+uz*over),math.dist(p[0],p[3])+over*2,q['eave'],q['roofRise'])
    return True


def bench(b,item):
    from field_photos import height
    from road_network import moat_edge
    x,z=item['placement'];y=height(x,z);s=(moat_edge(x+.05)-moat_edge(x-.05))/.1
    n=math.hypot(s,1);at0=sign_at(x,z,(-s/n,1/n))
    at=lambda u,h,o:at0(u,h+y,o)
    # Warm timber slats, inclined back and two stone legs. Seat faces the moat.
    for u in (-.65,.65):box(b,at,u,-.03,.20,.40,y,y+.40,'HK_Stone',(.59,.57,.53))
    for j in range(4):box(b,at,0,-.18+j*.12,1.78,.102,y+.40,y+.46,'ART_Timber',LIGHT_WOOD)
    for u in (-.66,.66):bar(b,at(u,.30,-.27),at(u,.97,-.40),.035,DARK,'HK_MetalLight',5)
    for j in range(5):
        h=.52+j*.10;o=-.29-(h-.52)*.20
        box(b,at,0,o,1.78,.06,y+h,y+h+.082,'ART_Timber',(.61,.43,.30))


def bench_pads():
    """Small registered seat openings shared by the render finish and Ground exporter."""
    from field_photos import data as survey
    from road_network import ccw,moat_edge
    q=data()['benchPads']
    for item in survey()['facilities']:
        if item['kind']!='bench':continue
        x,z=item['placement'];s=(moat_edge(x+.05)-moat_edge(x-.05))/.1;n=math.hypot(1,s)
        at=sign_at(x,z,(-s/n,1/n))
        ring=[at(u,0,v)for u,v in ((-q['halfWidth'],q['front']),(q['halfWidth'],q['front']),
                                  (q['halfWidth'],q['back']),(-q['halfWidth'],q['back']))]
        yield ccw([(p[0],p[2])for p in ring]),q['height']


def board(b,item):
    style=data()['facilities'].get(item['osm'])
    if not style:return False
    from field_photos import height
    x,z=item.get('placement',item['point']);base=height(x,z);a=math.radians(item['heading']-122)
    n=(-math.cos(a),math.sin(a));front=sign_at(x,z,n)
    at=lambda u,y,o:front(u,y+base,o)
    if style=='saigo-marker':
        box(b,at,0,0,.24,.24,base,base+1.08,'ART_StoneLight',(.82,.80,.72))
        stack(b,at,'家老西郷屋敷跡',-.065,1.04,.13,INK,.125)
        return True
    if style.startswith('sloping-map'):
        sloping_map(b,at,base,item,style.endswith('boat'))
        return True
    w=1.65 if style=='gangi' else 1.5
    for u in (-w*.55,w*.55):box(b,at,u,0,.13,.16,base,base+2.12,'ART_Timber',WOOD)
    box(b,at,0,0,w+.14,.13,base+.42,base+1.92,'ART_Timber',WOOD)
    rect(b,at,-w/2,.52,w,1.25,PAPER,.075)
    title='京橋口門と雁木' if style=='gangi' else '家老 西郷屋敷跡'
    label(b,at,title,-w*.45,1.56,w*.90,.12,INK,.083)
    if style=='gangi':
        # Factual paraphrase of 0870. Original diagram replaces its historic photo/plan.
        for i,text in enumerate(['中濠に面した城門のひとつ。','門内の石段「雁木」は、','多くの城兵が櫓へ上るためのもの。']):
            label(b,at,text,-.73,1.31-i*.13,1.42,.065,INK,.084)
        label(b,at,'Gangi Stone Steps',-.72,.79,1.32,.085,INK,.084)
        for j in range(6):rect(b,at,-.65+j*.18,.60,.15,.07,(.64,.65,.58),.084)
    else:
        label(b,at,'西郷家の屋敷跡と長屋門',-.65,1.29,1.30,.09,INK,.084)
        label(b,at,'Saigo residence site',-.65,1.08,1.30,.08,INK,.084)
        rect(b,at,-.55,.67,1.1,.26,WOOD,.084)
        graphic(b,at,[(-.64,.94),(.64,.94),(.42,1.02),(-.42,1.02)],(.44,.46,.48),.085)
        line(b,at,[(0,.68),(0,.89)],.012,PAPER,.087)
    return True


def sloping_map(b,at,base,item,boat):
    from north_streetscape import map_graphic
    w=1.75
    for u in (-1,1):box(b,at,u,0,.26,.62,base,base+1.04,'ART_StoneLight',STONE)
    # The actual board slopes up away from its reader, on two thick granite piers.
    slope=lambda u,v,o:at(u,.85+v*.40+o,.35-v)
    ring=[slope(u,v,0)for u,v in ((-w/2,0),(w/2,0),(w/2,.80),(-w/2,.80))]
    lower=[(x,y-.075,z)for x,y,z in ring];inside=slope(0,.4,-.04)
    for p in (ring,list(reversed(lower)),*[[ring[j],lower[j],lower[(j+1)%4],ring[(j+1)%4]]for j in range(4)]):face(b,p,'HK_MetalLight',inside,(.60,.63,.61))
    # Increasing vertical map coordinates run toward the far edge of the sloped board.
    map_graphic(b,slope,-.81,.15,1.62,.48)
    label(b,slope,'ひこね・街歩きまっぷ',-.77,.055,1.47,.064,INK,.12)
    label(b,slope,'周辺案内図 / OSM',-.76,.68,.90,.035,INK,.12)
    # Do not claim a photograph or a copied historical map as the original diagram.
    if boat:
        box(b,at,0,.02,1.65,.10,base+.30,base+.68,'ART_Timber',WOOD)
        label(b,at,'彦根城お堀めぐり',-.72,.49,1.44,.09,PAPER,.081)
        label(b,at,'600m → 玄宮園前船着場',-.72,.34,1.44,.067,PAPER,.081)


def guide(b):
    from field_photos import height
    q=data()['guide'];x,z=q['placement'];base=height(x,z);w=q['width'];h=q['height']
    # Two readable sides and physical thickness, rather than a floating poster.
    for normal in (q['normal'],[-v for v in q['normal']]):
        front=sign_at(x,z,normal);at=lambda u,y,o:front(u,y+base,o)
        for u in (-w*.56,w*.56):box(b,at,u,0,.085,.14,base,base+h,'HK_MetalLight',DARK)
        box(b,at,0,0,w,.10,base+.53,base+h-.15,'HK_MetalLight',DARK)
        rect(b,at,-w/2,.55,w,h-.72,INK,.056)
        rect(b,at,-w/2,.55,w,.23,(.56,.27,.23),.060)
        label(b,at,'彦根市立花町',-w*.43,.67,w*.86,.065,PAPER,.066)
        label(b,at,'Tachibana-cho',-w*.43,.58,w*.80,.045,PAPER,.066)
        label(b,at,'Information',-w*.44,h-.30,w*.88,.10,PAPER,.066)
        line(b,at,[(-w/2,h-.36),(w/2,h-.36)],.012,(.87,.71,.38),.066)
        if normal==q['normal']:
            rows=[('↑ 彦根城跡・玄宮楽々園','640m'),('↑ 夢京橋キャッスルロード','230m'),('↑ 京橋口駐車場・トイレ','330m'),('埋木舎・旧池田屋敷長屋門 →','640m'),('JR彦根駅・近江鉄道彦根駅','1.1km')]
        else:
            rows=[('JR彦根駅 ↑','1.1km'),('近江鉄道彦根駅',''),('河原町芹町地区','770m →'),('重要伝統的建造物群保存地区',''),('Preservation district','')]
        for i,(text,dist) in enumerate(rows):
            yy=h-.59-i*.255
            station=normal==q['normal'] and i==4
            label(b,at,text,-w*.43,yy,w*(.71 if station else .86),.07,PAPER,.066)
            if dist:label(b,at,dist,-w*.39,yy-.11,w*.35,.055,PAPER,.066)
            line(b,at,[(-w/2,yy-.15),(w/2,yy-.15)],.005,(.65,.66,.61),.066)
            if station:
                # The Japanese font has no U-turn glyph; draw the photo's arrow as geometry.
                arrow=lambda u,y,o:at(u+.16,y-.02,o)
                line(b,arrow,[(.10,yy-.06),(.10,yy+.025),(.135,yy+.06),(.18,yy+.06),(.215,yy+.025),(.215,yy-.07)],.012,PAPER,.068)
                graphic(b,arrow,[(.178,yy-.025),(.215,yy-.085),(.252,yy-.025)],PAPER,.068)
    q=data()['extraGuide'];x,z=q['placement'];base=height(x,z);at=sign_at(x,z,q['normal'])
    box(b,at,0,0,.09,.10,base,base+1.45,'ART_Timber',WOOD)
    box(b,at,0,0,.55,.10,base+.95,base+1.48,'ART_Timber',WOOD)
    label(b,at,'路上喫煙',-.23,base+1.30,.46,.065,PAPER,.058)
    label(b,at,'禁止地区です',-.23,base+1.15,.46,.065,PAPER,.058)


def tactile(b):
    """Flush guidance on existing walk surfaces, interrupted at the road crossing."""
    from road_network import moat_bend
    from field_photos import height
    from east_extension import data as source
    q=data()['tactile'];path=[[x,31.4+moat_bend(x)]for x in range(q['coreFrom'],q['coreTo']+1)]
    runs=[path]
    mapped=next(p['points']for p in source()['walks']if p['id']==q['mappedWay'])
    runs.append([[max(q['mappedFromX'],a[0]),a[1]+(c[1]-a[1])*(max(q['mappedFromX'],a[0])-a[0])/(c[0]-a[0])]
                 for a,c in zip(mapped,mapped[1:])if c[0]>q['mappedFromX']and a[0]<q['mappedToX']]+[[240,49.86]])
    runs[0].append(runs[1][0])
    for run in runs:
        for a,c in zip(run,run[1:]):
            length=math.dist(a,c);ux,uz=(c[0]-a[0])/length,(c[1]-a[1])/length;nx,nz=-uz,ux
            for i in range(max(1,math.ceil(length/.6))):
                lo,hi=length*i/math.ceil(length/.6),length*(i+1)/math.ceil(length/.6)-.006
                for width,off,material,relief in [(.30,0,'ART_Tactile',.002),*( (.021,o,'ART_TactileRidge',.005)for o in (-.095,0,.095))]:
                    pts=[(a[0]+ux*t+nx*(off+s*width/2),a[1]+uz*t+nz*(off+s*width/2))for t,s in ((lo,-1),(hi,-1),(hi,1),(lo,1))]
                    b.face([(x,height(x,z)+relief,z)for x,z in pts],material,False)


def tower(b):
    """Photo 0889: three projecting square platforms and a slender top mast."""
    from field_photos import data as survey
    q=survey()['tower'];x,z=q['point'];base,top=q['base'],q['height'];shaft=top-8
    at=lambda u,y,v:(x+u,y,z+v)
    for i in range(6):
        y0=base+(shaft-base)*i/6;y1=base+(shaft-base)*(i+1)/6;r0=2.3-i*.14;r1=r0-.14
        for sx,sz in ((-1,-1),(-1,1),(1,1),(1,-1)):
            bar(b,at(sx*r0,y0,sz*r0),at(sx*r1,y1,sz*r1),.09,PLASTER,'HK_MetalLight',5)
        for side in (-1,1):
            for axis in (0,1):
                p=lambda u,y,r:at(u,y,side*r)if axis==0 else at(side*r,y,u)
                bar(b,p(-r0,y0,r0),p(r1,y1,r1),.045,PLASTER,'HK_MetalLight',4)
                bar(b,p(r0,y0,r0),p(-r1,y1,r1),.045,PLASTER,'HK_MetalLight',4)
    for y in (shaft-8,shaft-4,shaft):
        solid(b,[(x-3.2,z-3.2),(x+3.2,z-3.2),(x+3.2,z+3.2),(x-3.2,z+3.2)],y-.14,y,'HK_MetalLight',(.69,.70,.66))
        for sx,sz in ((-1,-1),(-1,1),(1,1),(1,-1)):
            bar(b,at(sx*1.6,y-2.1,sz*1.6),at(sx*3.2,y,sz*3.2),.075,PLASTER,'HK_MetalLight',5)
            bar(b,at(sx*3.1,y,sz*3.1),at(sx*3.1,y+.9,sz*3.1),.035,PLASTER,'HK_MetalLight',4)
        for a,c in [((-3.1,-3.1),(3.1,-3.1)),((3.1,-3.1),(3.1,3.1)),((3.1,3.1),(-3.1,3.1)),((-3.1,3.1),(-3.1,-3.1))]:
            bar(b,at(a[0],y+.9,a[1]),at(c[0],y+.9,c[1]),.035,PLASTER,'HK_MetalLight',4)
    for i in range(4):
        a,c=shaft+i*2,shaft+(i+1)*2
        for side in (-1,1):
            bar(b,at(side*.6,a,-.6),at(side*.6,c,-.6),.055,PLASTER,'HK_MetalLight',4)
            bar(b,at(side*.6,a,.6),at(side*.6,c,.6),.055,PLASTER,'HK_MetalLight',4)
            bar(b,at(-.6,a,side*.6),at(.6,c,side*.6),.03,PLASTER,'HK_MetalLight',4)
    bar(b,at(0,top,0),at(0,top+1.7,0),.04,PLASTER,'HK_MetalLight',5)


def cherry(b):
    """Old leaning boughs and sparse autumn leaves seen from underneath, not a green ball."""
    from vegetation import _leaf_spray
    b.abstract=True
    trunk=[(0,-.15,0),(.15,1,0),(.3,2.2,.35),(.65,3.5,1.1),(.8,5.2,1.7),(1,7.7,2.3)]
    for i,(a,c)in enumerate(zip(trunk,trunk[1:])):bar(b,a,c,.43-i*.065,(.39,.38,.31),'ART_TreeBark',9)
    for j in range(8):
        angle=j*2.39996;start=trunk[2+j%3];reach=3.1+(j%3)*.6
        tip=(start[0]+math.cos(angle)*reach,start[1]+1.1+(j%2)*.5,start[2]+math.sin(angle)*reach+1.1)
        mid=tuple(start[k]+(tip[k]-start[k])*.55 for k in range(3))
        bar(b,start,mid,.16,(.39,.36,.30),'ART_TreeBark',7);bar(b,mid,tip,.07,(.41,.39,.32),'ART_TreeBark',6)
        for k in range(3):
            a=angle+(k-1)*.48;end=(tip[0]+math.cos(a)*1.15,tip[1]+.45+(k%2)*.5,tip[2]+math.sin(a)*1.15)
            bar(b,mid,end,.035,(.43,.40,.32),'ART_TreeBark',5)
            _leaf_spray(b,end,(1.20,.85,1.05),a,740+j*3+k,.43+(j%3)*.11,True)


def building(b,item):
    """0892: continuous upper glazing, two shutters and a small roof service room.

    Keep the source footprint including its front split. Hidden shop rooms and
    temporary trucks/posters are absent; the display stays behind closed glazing.
    """
    q=next((q for q in data()['buildings']if q['osm']==item['id']),None)
    if not q:return False
    from north_streetscape import edges,shell,window
    ring=item['outlines'][0]
    shell(b,ring,.15,q['height'],'ART_Plaster',(.83,.78,.65))
    for a,c,length,at in edges(ring):
        if abs(a[1]-34)<.3 and abs(c[1]-34)<.3:continue
        if length>3:window(b,at,length/2,4.3,min(length*.5,2.8),1.25)
    # A unified panel follows the shallow north facade despite its split OSM edge.
    at=sign_at(266.7,34.13,(0,1))
    plank(b,at,-6.2,3.0,6.3,3.85,PLASTER,.015,'ART_Plaster')
    plank(b,at,-6.1,4.0,3.7,5.65,(.34,.39,.39),.025,'ART_Window')
    for u in [-6.1+i*.89 for i in range(12)]:bar(b,at(u,4,.05),at(u,5.65,.05),.027,PLASTER,'HK_MetalLight',4)
    for yy in (4,4.5,5.65):bar(b,at(-6.1,yy,.05),at(3.7,yy,.05),.027,PLASTER,'HK_MetalLight',4)
    window(b,at,5.15,4.3,1.5,1.2)
    for lo,hi in ((-5.95,-2.15),(.7,3.75)):
        plank(b,at,lo,.35,hi,2.95,(.57,.47,.34),.028,'ART_Timber')
        for i in range(20):
            yy=.4+i*.125
            plank(b,at,lo,yy,hi,yy+.012,(.41,.38,.33),.037,'HK_MetalLight')
    plank(b,at,-2.0,.42,.54,2.95,(.24,.29,.30),.030,'ART_Window')
    for u in (-2,.54):bar(b,at(u,.42,.05),at(u,2.95,.05),.035,PLASTER,'HK_MetalLight',4)
    for y in (1.05,1.65,2.25):
        plank(b,at,-1.9,y,.44,y+.045,LIGHT_WOOD,.045)
        for j in range(5):
            u=-1.7+j*.43
            # Original simplified ceramic silhouettes, not photo-cutouts or copied posters.
            bar(b,at(u,y+.06,.054),at(u,y+.21,.054),.055,(.75,.69,.52),'ART_StoneLight',7)
    # Short roof-room and railing remain inside the original five-sided footprint.
    core=[(260.25,30.15),(263.65,30.15),(263.65,33.85),(260.25,33.85)]
    shell(b,core,7.0,9.15,'ART_Plaster',(.69,.68,.61))
    front=sign_at(261.95,33.86,(0,1));window(b,front,0,7.6,1.35,1.0)
    for x in (264.1,266,268,270,272.9):bar(b,(x,7.0,33.9),(x,7.8,33.9),.022,DARK,'HK_MetalLight',4)
    for y in (7.25,7.8):bar(b,(264.1,y,33.9),(272.9,y,33.9),.022,DARK,'HK_MetalLight',4)
    return True


def furniture(b):
    from field_photos import data as survey, height
    from road_network import moat_edge
    for item in survey()['facilities']:
        if item['kind']=='bench':bench(b,item)
        elif item['osm'] in data()['facilities']:board(b,item)
    guide(b);tactile(b);tower(b)
    # The photographed seats stand on gravel openings, not inside continuous shrubs.
    # This is finish on the existing level verge, not a second raised walk surface.
    for ring,y in bench_pads():
        face(b,[(x,y+.001,z)for x,z in ring],'ART_Sand',(ring[0][0],y-1,ring[0][1]),(.68,.64,.51))
    # Lanterns have a cantilevered square box rather than a capped column (0881–0883).
    for q in data()['lamps']:
        x,z=q['point'];base=height(x,z);at=sign_at(x,z,(0,-1))
        bar(b,at(0,base,0),at(0,base+3.25,0),.05,DARK,'HK_MetalLight',6)
        bar(b,at(0,base+3.18,0),at(.35,base+3.18,0),.045,DARK,'HK_MetalLight',5)
        box(b,at,.35,0,.40,.32,base+2.65,base+3.16,'HK_MetalLight',DARK)
        rect(b,at,.185,base+2.71,.33,.37,(.90,.83,.61),.167)
    # Fine weathering at the landward toe, clear of the existing public corridor.
    for x in (128,139,157,172):
        z=moat_edge(x)-.42;y=height(x,z)
        for j in range(5):
            bar(b,(x+j*.07,y,z),(x+j*.07+.04,y+.25+.06*(j%3),z+.09),.009,(.57,.57,.30),'HK_Grass',3)


def bridge(b):
    """0873/0875/0878: two horizontal timber-style rails, short square intermediates.

    The existing deck, road corridor and 34.4 m span remain authoritative.
    """
    from road_network import walk_height
    from streetscape import lathe
    for x in (25.25,38.75):
        for y,width in ((.30,.17),(.64,.14),(.99,.18)):
            b.box((x,y,56.8),(.20,width,34.4),'ART_Timber',False)
            paint(b,len(b.faces)-6,(.53,.49,.43))
        for i in range(17):
            z=39.6+i*34.4/16;base=walk_height(x,z)
            b.box((x,base+.53,z),(.21,1.06,.21),'ART_Timber',False)
        for i in range(1,8):
            z=39.6+i*4.3;base=walk_height(x,z)
            b.box((x,base+.66,z),(.30,1.32,.30),'ART_Timber',False)
            first=len(b.faces)
            lathe(b,x,z,[(base+y,r)for y,r in [(1.20,.20),(1.25,.21),(1.28,.17),(1.37,.19),(1.45,.13),(1.49,.025)]],'HK_MetalLight')
            paint(b,first,PATINA)
        for z in (39.6,74):
            # Keep the original outer envelope; no enlarged post in the walking shoulder.
            b.box((x,.81,z),(.5,1.5,.5),'ART_Timber',False)
            first=len(b.faces)
            lathe(b,x,z,[(1.56,.21),(1.59,.24),(1.62,.17),(1.67,.20),(1.72,.16),(1.77,.08),(1.78,.012)],'HK_MetalLight')
            paint(b,first,PATINA)
    b.box((32,-.28,56.8),(14,.50,34.4),'HK_StoneDark',False)
