"""Irohamatsu, Sawaguchi and Omotemon at pedestrian height (owner photos 0912–0933).

World registration stays in world/north-streetscape.json. Construction is closed on
unseen faces, with estimated dimensions; photographs are never runtime textures.
"""
import json
import math
import os
from functools import lru_cache

from higashi_school import solid, face, frame, box
from east_street import sign_at, plank, bar, paint
from university_frontage import rect, label, line, graphic

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLASTER = (.92, .87, .75)
SHADE = (.69, .66, .63)
TILE = (.36, .39, .46)
WOOD = (.38, .30, .28)
DARK = (.25, .24, .29)
STONE = (.55, .54, .49)
PAPER = (.95, .92, .80)
GREEN = (.29, .43, .36)


@lru_cache(maxsize=1)
def data():
    with open(os.path.join(ROOT, 'world', 'north-streetscape.json')) as f:
        return json.load(f)


def beam(b, at, u0, y0, u1, y1, width, pigment=WOOD, depth=.06):
    bar(b, at(u0, y0, depth), at(u1, y1, depth), width / 2, pigment, 'ART_Timber', 4)


def edges(ring):
    """A concave footprint needs an interior point local to each edge, not its centroid."""
    turn=1 if sum(a[0]*c[1]-c[0]*a[1]for a,c in zip(ring,ring[1:]+ring[:1]))>0 else -1
    for a,c in zip(ring,ring[1:]+ring[:1]):
        length=math.dist(a,c)
        ux,uz=(c[0]-a[0])/length,(c[1]-a[1])/length
        nx,nz=uz*turn,-ux*turn
        at=lambda u,y,o,a=a,ux=ux,uz=uz,nx=nx,nz=nz:(a[0]+ux*u+nx*o,y,a[1]+uz*u+nz*o)
        yield a,c,length,at


def shell(b,ring,lo,hi,material,pigment):
    from road_network import ccw,triangulate
    for a,c,length,at in edges(ring):
        face(b,[at(0,lo,0),at(length,lo,0),at(length,hi,0),at(0,hi,0)],
             material,at(length/2,(lo+hi)/2,-.1),pigment)
    for t in triangulate(ccw(ring)):
        for y,inside_y in [(lo,lo+1),(hi,hi-1)]:
            face(b,[(x,y,z)for x,z in t],material,(sum(p[0]for p in t)/3,inside_y,sum(p[1]for p in t)/3),pigment)


def roof(b, a, c, width, eave, rise, hip=False, pigment=TILE):
    """Closed curved roof with deep soffit, ridge, verge boards and spaced tile rolls."""
    length = math.dist(a, c)
    ux, uz = (c[0]-a[0])/length, (c[1]-a[1])/length
    nx, nz = -uz, ux
    at = lambda u,y,v: (a[0]+ux*u+nx*v, y, a[1]+uz*u+nz*v)
    inset = min(width*.36, length*.3) if hip else 0
    # Interior is above the soffit. A point below it turned the underside upward,
    # leaving a sky gap when the merged runtime material culls its back faces.
    inside = at(length/2, eave+.1, 0)
    def y(t):
        return eave + rise*(1-t)**1.25 + .13*t**8
    # Four strips give the tiled eave its slight upsweep, without a screen filter.
    for side in (-1, 1):
        for lo, hi in zip((0,.28,.66),(.28,.66,1)):
            p = [at(inset*(1-lo),y(lo),side*width/2*lo),
                 at(length-inset*(1-lo),y(lo),side*width/2*lo),
                 at(length-inset*(1-hi),y(hi),side*width/2*hi),
                 at(inset*(1-hi),y(hi),side*width/2*hi)]
            face(b, p, 'HK_RoofTile', inside, pigment)
        # Fascia and underside close the entire outer edge when viewed from below.
        face(b,[at(0,eave+.13,side*width/2),at(length,eave+.13,side*width/2),
                at(length,eave-.16,side*width/2),at(0,eave-.16,side*width/2)],'ART_Timber',inside,SHADE)
        if not b.distant:
            for i in range(1,math.ceil(length/.48)):
                u=length*i/math.ceil(length/.48)
                for lo,hi in zip((.08,.28,.66),(.28,.66,1)):
                    if inset*(1-lo)<=u<=length-inset*(1-lo):
                        bar(b,at(u,y(lo)+.025,side*width/2*lo),at(u,y(hi)+.025,side*width/2*hi),
                            .025,(.47,.48,.51),'HK_RoofTile',4)
    for end in (0,length):
        peak = inset if end==0 else length-inset
        face(b,[at(end,eave-.16,-width/2),at(end,eave+.13,-width/2),
                at(peak,eave+rise,0),at(end,eave+.13,width/2),at(end,eave-.16,width/2)],
             'HK_RoofTile' if hip else 'ART_Plaster',inside,pigment if hip else PLASTER)
        if not hip:
            for side in (-1,1):
                bar(b,at(end,eave+.09,side*width/2),at(end,eave+rise+.03,0),.07,PLASTER,'ART_Plaster',4)
    face(b,[at(0,eave-.16,-width/2),at(length,eave-.16,-width/2),
            at(length,eave-.16,width/2),at(0,eave-.16,width/2)],'ART_Timber',inside,WOOD)
    bar(b,at(inset,eave+rise+.035,0),at(length-inset,eave+rise+.035,0),.095,pigment,'HK_RoofTile',6)
    for u in (inset,length-inset):
        bar(b,at(u,eave+rise,0),at(u,eave+rise+.35,0),.09,pigment,'HK_RoofTile',6)


def stonework(b, a, c, lo, hi, center):
    """Shallow irregular stone cells, with no displacement of the registered footprint."""
    length, at = frame(a,c,center)
    if length<.3:
        return
    count=max(1,round(length/(1.6 if b.distant else 1.05)))
    rows=max(1,round((hi-lo)/.65))
    for row in range(rows):
        y0,y1=lo+row*(hi-lo)/rows+.025,lo+(row+1)*(hi-lo)/rows-.025
        for j in range(count+1):
            u,v=max(0,(j-.42*(row%2))*length/count),min(length,(j+1-.42*(row%2))*length/count)
            if v-u<.09:
                continue
            tone=.045*math.sin(j*7.1+row*2.9+a[0])
            face(b,[at(u+.02,y0+.05,.018),at(v-.05,y0,.018),at(v-.015,y1-.08,.018),
                    at(v-.1,y1,.018),at(u+.04,y1-.025,.018)],'HK_Stone',at(length/2,(lo+hi)/2,-1),
                 tuple(k+tone for k in STONE))


def window(b, at, u, y, width=.86, height=.9, shutters=False):
    plank(b,at,u-width/2-.055,y-.055,u+width/2+.055,y+height+.055,SHADE,.025,'ART_Plaster')
    plank(b,at,u-width/2,y,u+width/2,y+height,PLASTER if shutters else DARK,.038,
          'ART_Plaster' if shutters else 'ART_Window')
    for t in (-.5,.5):
        beam(b,at,u+t*width,y,u+t*width,y+height,.055,PLASTER,.065)
    for yy in (y,y+height):
        beam(b,at,u-width/2,yy,u+width/2,yy,.055,PLASTER,.065)
    if not shutters:
        for i in range(1,6):
            beam(b,at,u-width/2+width*i/6,y,u-width/2+width*i/6,y+height,.035,PLASTER,.073)
    else:
        beam(b,at,u,y,u,y+height,.05,SHADE,.06)


def turret(b,item,q):
    from field_photos import split_triangles
    ring=item['outlines'][0]
    center=(sum(p[0] for p in ring)/len(ring),q['height']/2,sum(p[1] for p in ring)/len(ring))
    plinth=3.2 if q['kind']=='museum' else 1.8
    # Keep the frozen concave OSM footprint, including its entry recesses.
    shell(b,ring,-1.35,plinth,'HK_Stone',(.41,.42,.42))
    shell(b,ring,plinth,q['height'],'ART_Plaster',PLASTER)
    for a,c,length,at in edges(ring):
        interior=at(length/2,0,-.1)
        stonework(b,a,c,-1.32,plinth,(interior[0],interior[2]))
        if length<2:
            continue
        n=max(1,round(length/6.2))
        for i in range(n):
            window(b,at,length*(i+.5)/n,plinth+1.3,shutters=q['kind']=='historic-turret')
            if not b.distant and q['kind']=='historic-turret':
                u=length*(i+.5)/n
                # The historic wing has small triangular loopholes under its shutters.
                face(b,[at(u-.11,plinth+.52,.035),at(u+.11,plinth+.52,.035),at(u,plinth+.76,.035)],
                     'ART_Window',at(u,plinth+.6,-1),DARK)
        # Continuous dark eave shadow and white rafter ends on every return.
        plank(b,at,0,q['height']-.14,length,q['height'],WOOD,.04)
        count=max(1,round(length/.8))
        for i in (range(count) if not b.distant else sorted({0,count-1})):
            u=length*(i+.5)/count
            box(b,at,u,.12,.11,.6,q['height']-.18,q['height']-.03,'ART_Plaster',PLASTER)
    # A roof fitted to the actual footprint is retained beneath the projecting eaves.
    def top(x,z):
        return q['height']-.17
    for t in split_triangles(item['triangles'],2.4):
        face(b,[(x,top(x,z),z)for x,z in t],'HK_RoofTile',center,TILE)
    if q['kind']=='museum':
        roof(b,(70.5,433),(70.5,548),12,q['height'],q['rise'])
        towers=[(70.1,439.0,10.1,10.9),(71.5,540.8,11.0,11.0)]
    else:
        roof(b,(69.7,398.8),(69.7,423),12,q['height'],q['rise'])
        roof(b,(48.0,419.6),(72.8,419.6),9.7,q['height'],1.45)
        roof(b,(50.8,420),(50.8,432.9),7.2,q['height'],1.3)
        towers=[(66.3,390.2,7.0,12.5)]
    for x,z,w,d in towers:
        base=q['height']+.2;upper=q['maxHeight']-2.0
        p=[(x-w/2,z-d/2),(x+w/2,z-d/2),(x+w/2,z+d/2),(x-w/2,z+d/2)]
        solid(b,p,base,upper,'ART_Plaster',PLASTER)
        roof(b,(x,z-d/2-.5),(x,z+d/2+.5),w+1.4,base,1.0,True)
        roof(b,(x,z-d/2-.65),(x,z+d/2+.65),w+1.5,upper,1.65)
        for a,c in zip(p,p[1:]+p[:1]):
            length,at=frame(a,c,(x,z))
            window(b,at,length/2,base+.45,min(1.6,length*.45),.85,q['kind']=='historic-turret')
    if q['kind']=='museum':
        stairs(b)
    else:
        # Low entrance canopy photographed from inside the masugata (0919).
        at=sign_at(62.1,404.8,(-1,0))
        box(b,at,0,-.25,2.5,.8,.15,2.55,'ART_Plaster',PLASTER)
        plank(b,at,-.8,.15,.8,2.25,DARK,.18,'ART_Window')
        for u in (-.85,.85):beam(b,at,u,.15,u,2.4,.09,SHADE,.22)
        roof(b,(60.9,403.2),(60.9,406.4),2.9,2.5,.65)


def stairs(b):
    q=data()['stair'];a,c=q['lower'],q['upper'];length=math.dist(a,c)
    ux,uz=(c[0]-a[0])/length,(c[1]-a[1])/length;nx,nz=-uz,ux
    at=lambda t,y,v:(a[0]+ux*t+nx*v,y,a[1]+uz*t+nz*v)
    n=26;w=q['width']/2;top=q['height']
    # A closed stair slab with an exposed underside, not a wedge filled to the ground.
    for i in range(n):
        lo,hi=length*i/n,length*(i+1)/n;y=.15+top*(i+1)/n
        p=[(at(lo,0,-w)[0],at(lo,0,-w)[2]),(at(hi,0,-w)[0],at(hi,0,-w)[2]),
           (at(hi,0,w)[0],at(hi,0,w)[2]),(at(lo,0,w)[0],at(lo,0,w)[2])]
        solid(b,p,y-.30,y,'ART_Concrete',(.66,.64,.59))
    for side in (-1,1):
        bar(b,at(0,1.1,side*w),at(length,top+1.1,side*w),.07,PLASTER,'ART_Plaster',4)
        for i in range(0,n+1,3):
            t=length*i/n;y=.15+top*i/n
            bar(b,at(t,y,side*w),at(t,y+.95,side*w),.055,PLASTER,'ART_Plaster',4)
    # Concrete piers support the landing without closing the service bay below.
    for i in (10,22):
        t=length*i/n;y=.15+top*i/n
        for side in (-1,1):
            bar(b,at(t,.15,side*w*.85),at(t,y-.17,side*w*.85),.12,SHADE,'ART_Concrete',4)
    solid(b,[(61.6,465.2),(65.9,465.2),(65.9,466.9),(61.6,466.9)],top-.15,top+.15,
          'ART_Concrete',(.66,.64,.59))
    at_sign=sign_at(a[0]-.15,a[1]+4.5,(-1,0))
    rect(b,at_sign,-.55,2.45,1.1,.27,PAPER,.14)
    label(b,at_sign,'入館無料',-.49,2.50,.98,.15,(.65,.25,.24),.15)


def building(b,item):
    q=next((p for p in data()['buildings']if p['osm']==item['id']),None)
    if q is None:
        return False
    if q['kind']in ('museum','historic-turret'):
        turret(b,item,q)
        return True
    ring=item['outlines'][0];cx,cz=sum(p[0]for p in ring)/len(ring),sum(p[1]for p in ring)/len(ring)
    shell(b,ring,.15,q['height'],'ART_Plaster',PLASTER)
    if q['kind']=='kiosk':
        # The long SW-facing facade: two green shutters and the brown vending machines.
        a,c=ring[1],ring[2];length,at=frame(a,c,(cx,cz))
        plank(b,at,0,.15,length,q['height'],WOOD,.02)
        for lo,hi in ((.3,3.25),(3.4,6.3)):
            plank(b,at,lo,.16,hi,2.25,GREEN,.045,'ART_Concrete')
            if not b.distant:
                for j in range(20):
                    y=.22+j*.095;beam(b,at,lo,y,hi,y,.017,(.22,.34,.32),.063)
        for u in (7.0,7.95,8.9):
            vending(b,at,u)
        # Projecting green cloth awning, with its scalloped lower edge.
        face(b,[at(.1,2.5,.05),at(length-.1,2.5,.05),at(length-.1,2.26,.8),at(.1,2.26,.8)],
             'ART_Timber',at(length/2,2,0),GREEN)
        for i in range(30):
            u=.1+(length-.2)*i/30
            plank(b,at,u,2.16+(i%2)*.035,u+(length-.2)/30,2.27,GREEN,.80)
        for u in (10,10.48):
            box(b,at,u,.4,.4,.48,.15,1.05,'HK_MetalLight',(.78,.78,.70))
            rect(b,at,u-.12,.83,.24,.1,DARK,.655)
        roof(b,((ring[0][0]+ring[1][0])/2,(ring[0][1]+ring[1][1])/2),
             ((ring[2][0]+ring[3][0])/2,(ring[2][1]+ring[3][1])/2),6.5,q['height'],q['rise'])
        # Unseen side/rear receive a modest closed service door, no invented shop interior.
        length,back=frame(ring[3],ring[0],(cx,cz))
        plank(b,back,length*.55,.15,length*.55+.85,2.05,WOOD,.02)
    elif q['kind']=='office':
        for a,c,length,at in edges(ring):
            if length>3:
                window(b,at,length/2,.85,length*.65,1.0)
        roof(b,(18.7,455.8),(18.7,460.1),7.3,q['height'],q['rise'])
    else:
        for a,c,length,at in edges(ring):
            plank(b,at,0,.15,length,1.0,WOOD,.02)
            if length<2:
                continue
            for y in ([1.15,3.65] if q['kind']=='iroha-house' else [1.1]):
                for i in range(max(1,round(length/4))):
                    window(b,at,length*(i+.5)/max(1,round(length/4)),y,1.05,1.2)
            for u in range(0,int(length)+1,3):beam(b,at,u,.15,u,q['height'],.10,WOOD,.07)
        # Main roof is fitted to the frozen concave outline, not a bounding-box building.
        from field_photos import split_triangles,distance
        outline_edges=list(zip(ring,ring[1:]+ring[:1]))
        for t in split_triangles(item['triangles']):
            face(b,[(x,q['height']+q['rise']*min(1,min(distance((x,z),a,c)for a,c in outline_edges)/3.7),z)for x,z in t],
                 'HK_RoofTile',(cx,0,cz),TILE)
        if q['kind']=='iroha-gable':roof(b,(208.1,442.6),(218.6,442.4),10,q['height'],q['rise'])
    return True


def vending(b,at,u):
    box(b,at,u,.36,.88,.65,.15,2.04,'ART_Timber',(.37,.27,.27))
    rect(b,at,u-.39,.77,.78,1.14,(.69,.69,.62),.70)
    for row in range(4):
        for col in range(6):
            xx=u-.33+col*.117;yy=.94+row*.22
            rect(b,at,xx,yy,.07,.14,((.82,.65,.30),(.38,.56,.58),(.71,.36,.32),(.81,.81,.67))[(row+col)%4],.708)
            rect(b,at,xx-.008,yy-.035,.085,.018,PAPER,.709)
    rect(b,at,u-.3,.29,.6,.18,DARK,.71)
    rect(b,at,u+.28,.56,.07,.12,DARK,.711)


def map_graphic(b,at,x,y,w,h):
    """An original schematic of registered OSM geometry, not the photographed map artwork."""
    from east_extension import data as osm
    from field_photos import clipped
    d=osm();lo,hi=(-610,0),(330,850)
    project=lambda p:(x+(p[0]-lo[0])/(hi[0]-lo[0])*w,y+(p[1]-lo[1])/(hi[1]-lo[1])*h)
    rect(b,at,x,y,w,h,(.88,.84,.69),.105)
    for kind,color in [('grass',(.52,.66,.40)),('water',(.40,.64,.76))]:
        # Skip tiny partition slivers on a two-metre physical sign.
        for t in d['surfaces'][kind]:
            if max(p[0] for p in t)<lo[0]or min(p[0]for p in t)>hi[0]or max(p[1]for p in t)<lo[1]or min(p[1]for p in t)>hi[1]:continue
            p=[project(q)for q in t]
            for axis,bound,positive in [(0,x,True),(0,x+w,False),(1,y,True),(1,y+h,False)]:
                if len(p)<3:break
                p=clipped(p,lambda q:q[axis]-bound,positive)
            if len(p)>2:
                graphic(b,at,p,color,.108 if kind=='grass' else .109)
    for road in d['roads']:
        for a,c in zip(road['points'],road['points'][1:]):
            if not all(lo[0]<p[0]<hi[0]and lo[1]<p[1]<hi[1]for p in (a,c)):continue
            line(b,at,[project(a),project(c)],.008,(.97,.96,.87),.112)
    for name,p in [('彦根城',[-240,430]),('表門',[6,372]),('佐和口',[57,440])]:
        xx,yy=project(p)
        label(b,at,name,xx,yy,len(name)*w*.036,h*.055,DARK,.116)


def board(b,q):
    from field_photos import height
    x,z=q['point'];base=height(x,z);front=sign_at(x,z,q['normal'])
    at=lambda u,y,o:front(u,y+base,o)
    w,lo,hi=q['width'],q['bottom'],q['top'];style=q['style']
    for u in (-w*.48,w*.48):box(b,at,u,0,.12,.14,base,base+hi+.13,'ART_Timber',WOOD)
    box(b,at,0,0,w+.12,.16,base+lo-.06,base+hi+.06,'ART_Timber',WOOD)
    rect(b,at,-w/2,lo,w,hi-lo,PAPER,.092)
    if style=='guide':
        rect(b,at,-w/2,lo,w,hi-lo,DARK,.100)
        label(b,at,q['title'],-w*.43,lo+.055,w*.86,.15,PAPER,.115)
    elif style=='directions':
        rect(b,at,-w/2,lo,w,hi-lo,DARK,.100)
        label(b,at,'← 夢京橋',-.94,1.68,.88,.18,PAPER,.115)
        label(b,at,'彦根城 ↑',.10,1.68,.86,.18,PAPER,.115)
        label(b,at,'Castle Road',-.94,1.42,.87,.08,PAPER,.115)
        label(b,at,'彦根城博物館',.1,1.40,.86,.13,PAPER,.115)
        label(b,at,'Hikone Castle Museum',.10,1.23,.86,.065,PAPER,.115)
    elif style=='map':
        map_graphic(b,at,-w*.46,lo+.13,w*.92,(hi-lo)*.69)
        label(b,at,q['title'],-w*.43,hi-.17,w*.86,.10,DARK,.12)
        label(b,at,'周辺案内',-w*.4,lo+.025,w*.4,.065,DARK,.12)
    elif style=='interpretation':
        label(b,at,'いろは松',-.65,1.55,1.05,.16,DARK,.11)
        label(b,at,'Irohamatsu',-.65,1.30,1.03,.095,DARK,.11)
        for i,text in enumerate(['かつて四十七本が並んだ松並木。','名は「いろは」の四十七文字にちなむ。']):
            label(b,at,text,-.66,1.08-i*.15,1.32,.065,DARK,.11)
        label(b,at,'彦根城・中濠沿い',-.66,.72,1.13,.07,DARK,.11)
    elif style=='museum':
        rect(b,at,-.92,.62,1.84,1.35,DARK,.10)
        # Original exhibition graphic: no temporary event title or invented notice.
        rect(b,at,-.81,.83,.70,.94,(.84,.77,.59),.11)
        rect(b,at,.08,.83,.72,.94,PAPER,.11)
        map_graphic(b,at,-.76,.88,.6,.62)
        label(b,at,'彦根の歴史',.13,1.56,.60,.09,DARK,.12)
        label(b,at,'開国記念館',-.73,.65,1.46,.12,PAPER,.12)
    else:
        label(b,at,q['title'],-w*.43,hi-.25,w*.86,.11,DARK,.11)
        # An original stone-monument silhouette. The poem's calligraphy is not fabricated.
        rect(b,at,-.4,.91,.8,.72,(.80,.71,.56),.11)
        graphic(b,at,[(-.24,.95),(.24,.95),(.19,1.4),(.0,1.52),(-.22,1.37)],(.48,.45,.39),.112)
        label(b,at,'井伊直弼',-.43,.57,.86,.13,DARK,.115)
    if style in ('map','museum'):
        # A shallow metal coping remains a volume when seen from behind.
        box(b,at,0,0,w+.23,.38,base+hi+.08,base+hi+.15,'HK_MetalLight',(.38,.46,.42))
    if q['id']=='iroha-directory':
        roof(b,(x-w/2-.2,z),(x+w/2+.2,z),1.25,base+hi+.15,.55)


def bridge(b):
    from field_photos import height
    q=data()['bridge'];a,c=q['points'];length=math.dist(a,c)
    ux,uz=(c[0]-a[0])/length,(c[1]-a[1])/length;nx,nz=-uz,ux
    at=lambda u,y,v:(a[0]+ux*u+nx*v,y,a[1]+uz*u+nz*v)
    for i in range(math.ceil(length/.42)):
        lo,hi=length*i/math.ceil(length/.42),length*(i+1)/math.ceil(length/.42)
        p=[at(lo,0,-1),at(hi,0,-1),at(hi,0,1),at(lo,0,1)]
        # Existing ground remains the authoritative walk surface at 0.01 m.
        solid(b,[(p[0],p[2])for p in p],-.15,.014,'ART_Timber',(.64,.57,.46))
        if not b.distant:
            bar(b,at(hi,.017,-.98),at(hi,.017,.98),.006,WOOD,'ART_Timber',3)
    for side in (-1,1):
        offset=side*q['railOffset']
        for y in (.42,.97):bar(b,at(0,y,offset),at(length,y,offset),.065,(.62,.58,.51),'ART_Timber',4)
        for i in range(8):
            u=length*i/7
            bar(b,at(u,-1.35,offset),at(u,1.20,offset),.125,(.59,.54,.44),'ART_Timber',8)
            bar(b,at(u,.98,offset),at(u,1.18,offset),.15,(.48,.53,.53),'HK_MetalLight',8)
            # Profiled bronze-like giboshi cap, supported by the wooden newel.
            for lo,hi,r0,r1 in [(1.18,1.25,.16,.13),(1.25,1.36,.13,.19),(1.36,1.47,.19,.12),(1.47,1.55,.12,.02)]:
                from abstract_props import cylinder
                first=len(b.faces);cylinder(b,at(u,lo,offset),at(u,hi,offset),r0,'HK_MetalLight',segments=10,end_radius=r1)
                paint(b,first,(.48,.55,.54))
    # Readable bridge name, on the approach side of the end post.
    x,y,z=at(length,.67,q['railOffset']+.14)
    front=sign_at(x,z,(nx,nz))
    rect(b,front,-.11,.35,.22,.59,(.36,.39,.36),.015)
    for i,ch in enumerate('表門橋'):label(b,front,ch,-.075,.76-i*.16,.15,.14,PAPER,.022)


def rail(b,q):
    points=q['points'];h=q['height'];bamboo=q['style']=='bamboo'
    from field_photos import height
    for a,c in zip(points,points[1:]):
        count=max(1,math.ceil(math.dist(a,c)/(.42 if bamboo else 2.0)))
        for i in range(count+1):
            t=i/count;x,z=a[0]+(c[0]-a[0])*t,a[1]+(c[1]-a[1])*t;y=height(x,z)
            bar(b,(x,y,z),(x,y+h,z),.035 if bamboo else .07,GREEN if bamboo else STONE,'ART_Timber' if bamboo else 'HK_Stone',5)
            if i==count:continue
            p=(x,y+h*.75,z)
            dx,dz=(c[0]-a[0])/count,(c[1]-a[1])/count
            for j in range(4):
                f,g=j/4,(j+1)/4
                sag=lambda s:0 if bamboo else -.12*4*s*(1-s)
                bar(b,(p[0]+dx*f,p[1]+sag(f),p[2]+dz*f),(p[0]+dx*g,p[1]+sag(g),p[2]+dz*g),
                    .027 if bamboo else .009,GREEN if bamboo else (.52,.53,.52),'ART_Timber' if bamboo else 'HK_MetalLight',4)


def forecourt(b):
    q=data()['courtFence'];a,c=q['points'];length,at=frame(a,c,(40,470))
    for lo,hi in [(0,length*q['gateAt']-1),(length*q['gateAt']+1,length)]:
        box(b,at,(lo+hi)/2,0,hi-lo,.16,.15,q['height'],'ART_Timber',WOOD)
        if not b.distant:
            for i in range(math.ceil((hi-lo)/.22)):
                u=lo+i*.22;beam(b,at,u,.16,u,q['height']-.05,.022,(.48,.39,.33),.10)
    u=length*q['gateAt']
    box(b,at,u,0,2.0,.18,.15,2.08,'ART_Timber',DARK)
    # Small tiled doorway cap; no unverified opening through the back of the fence.
    p,r=at(u-1.3,0,0),at(u+1.3,0,0)
    roof(b,(p[0],p[2]),(r[0],r[2]),1.5,2.12,.45)
    for v in (-2.7,2.7):
        plank(b,at,u+v-.65,.95,u+v+.65,1.75,PAPER,.11,'ART_Plaster')


def furniture(b):
    from field_photos import height
    from vegetation import tree,spray
    for q in data()['boards']:board(b,q)
    bridge(b);forecourt(b)
    q=data()['clock'];x,z=q['point'];base=height(x,z)
    at=sign_at(x,z,(0,-1))
    box(b,at,0,0,.72,.65,base,base+q['height'],'ART_Concrete',(.68,.67,.59))
    box(b,at,0,0,.83,.78,base+2.55,base+q['height'],'ART_Timber',WOOD)
    disc=[(.28*math.cos(i*math.tau/32),base+2.92+.28*math.sin(i*math.tau/32))for i in range(32)]
    graphic(b,at,disc,PAPER,.401)
    for i in range(12):
        a=i*math.tau/12
        line(b,at,[(.23*math.cos(a),base+2.92+.23*math.sin(a)),(.26*math.cos(a),base+2.92+.26*math.sin(a))],.014,DARK,.406)
    line(b,at,[(.08,base+2.87),(0,base+2.92),(-.20,base+3.04)],.022,DARK,.410)
    for q in data()['rails']:rail(b,q)
    q=data()['monument'];x,z=q['point'];y=height(x,z)
    for i in range(2):
        solid(b,[(x-.75,z-1.8+i*.45),(x+.75,z-1.8+i*.45),(x+.75,z-.7),(x-.75,z-.7)],y,y+(i+1)*.15,'HK_Stone',STONE)
    solid(b,[(x-.8,z-.7),(x+.8,z-.7),(x+.8,z+.6),(x-.8,z+.6)],y,y+.7,'HK_Stone',(.43,.44,.40))
    ring=[(x-.52,z-.17),(x+.52,z-.17),(x+.59,z+.3),(x+.18,z+.45),(x-.57,z+.25)]
    solid(b,ring,y+.7,y+q['height'],'HK_Stone',(.64,.61,.51))
    at=sign_at(x+.95,z-1.1,(0,-1))
    box(b,at,0,0,.20,.18,y,y+1.05,'HK_Stone',(.78,.76,.66))
    for i,ch in enumerate('井伊大老歌碑'):label(b,at,ch,-.07,y+.87-i*.13,.14,.12,DARK,.105)
    for i,q in enumerate(data()['planting']):
        x,z=q['point'];tree(b,q['species'],(x,height(x,z),z),q['height'],q['spread'],seed=9120+i,fine=False)
    for i,(x,z)in enumerate([(130.5,437.8),(135,437.5),(141.6,436.8),(146,435.5)]):
        spray(b,(x,height(x,z)+.7,z),(1.5,1.5,1.5),i,'HK_LeafDark',9140+i,False)

