"""Static details matched to the 78 owner photographs in field-photos/.

world/field-observations.json owns the reviewed OSM registration and explicit photo
estimates. Original source footprints remain frozen. No photograph, transient person,
parked car, business poster or hidden interior is copied into the scene.
"""
import json
import math
import os
from functools import lru_cache

ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COLORS={'ART_Plaster':(.87,.87,.81),'ART_StoneLight':(.77,.77,.71),
        'ART_Concrete':(.65,.61,.52),'ART_Window':(.25,.32,.33),'ART_Timber':(.25,.24,.21),
        'HK_RoofTile':(.32,.34,.34),'HK_Stone':(.48,.49,.43),'HK_MetalLight':(.69,.70,.65),
        'HK_WhitePaint':(.91,.91,.84),'HK_SignRed':(.52,.24,.20),'ART_Patina':(.34,.47,.39),
        'HK_Gold':(.67,.60,.37)}

@lru_cache(maxsize=1)
def data():
    with open(os.path.join(ROOT,'world','field-observations.json')) as f:return json.load(f)


def face(b,points,material,inside):
    from east_extension import outward
    outward(b,points,material,inside,COLORS.get(material,(.5,.5,.45)))


def recolor(b,start):
    for i in range(start,len(b.faces)):
        c=COLORS.get(b.materials[b.slots[i]])
        if c is not None:b.pigments[i]=c


def solid(b,ring,bottom,top,material):
    center=(sum(p[0] for p in ring)/len(ring),(bottom+top)/2,sum(p[1] for p in ring)/len(ring))
    for a,c in zip(ring,ring[1:]+ring[:1]):face(b,[(a[0],bottom,a[1]),(c[0],bottom,c[1]),(c[0],top,c[1]),(a[0],top,a[1])],material,center)
    face(b,[(x,top,z) for x,z in ring],material,center)


def split_triangles(triangles,limit=2.4):
    for t in triangles:
        lengths=[math.dist(t[i],t[(i+1)%3]) for i in range(3)]
        if max(lengths)<=limit:yield t;continue
        i=lengths.index(max(lengths));a,c,e=t[i],t[(i+1)%3],t[(i+2)%3];m=[(a[j]+c[j])/2 for j in (0,1)]
        yield from split_triangles([[a,m,e],[m,c,e]],limit)


def distance(p,a,c):
    dx,dz=c[0]-a[0],c[1]-a[1];t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz)))
    return math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz)


def clipped(poly,value,positive):
    out=[]
    for a,c in zip(poly,poly[1:]+poly[:1]):
        av,cv=value(a),value(c);ia=av>=0 if positive else av<=0;ic=cv>=0 if positive else cv<=0
        if ia:out.append(a)
        if ia!=ic:
            t=av/(av-cv);out.append([a[j]+(c[j]-a[j])*t for j in (0,1)])
    return out


def round_window(b,center,normal,radius):
    from abstract_props import cylinder
    x,y,z=center;nx,nz=normal;tx,tz=-nz,nx
    inside=(x-nx*.2,y,z-nz*.2)
    disk=[(x+tx*radius*math.cos(i*math.tau/32),y+radius*math.sin(i*math.tau/32),z+tz*radius*math.cos(i*math.tau/32)) for i in range(32)]
    face(b,disk,'ART_Window',inside)
    for i in range(32):
        a,c=i*math.tau/32,(i+1)*math.tau/32
        face(b,[(x+nx*.02+tx*r*math.cos(t),y+r*math.sin(t),z+nz*.02+tz*r*math.cos(t)) for r,t in ((radius,a),(radius,c),(radius+.11,c),(radius+.11,a))],'ART_StoneLight',inside)
    for angle in [i*math.pi/4 for i in range(4)]:
        u,v=math.cos(angle)*radius,math.sin(angle)*radius
        cylinder(b,(x+nx*.04-tx*u,y-v,z+nz*.04-tz*u),(x+nx*.04+tx*u,y+v,z+nz*.04+tz*u),.025,'ART_StoneLight',segments=4)


def photographed_building(b,item):
    from south_promenade import building as south_building
    if south_building(b,item):return True
    from north_streetscape import building as north_building
    if north_building(b,item):return True
    spec=data()['buildings'].get(item['id'])
    if not spec:return False
    from university_photos import framed_window
    from abstract_props import cylinder
    kind=spec['kind'];first=len(b.faces);h=.15+spec['height'];rings=item.get('wallOutlines',item['outlines'])
    if kind=='church':
        from east_street import church
        church(b)
        return True
    edges=[(a,c) for p in item['outlines'] for a,c in zip(p,p[1:]+p[:1])]
    if kind=='cafe':
        # A gable across the observed narrow axis, clipped to the actual footprint, even
        # where the original source has a small recessed corner. No bounding-box filler.
        roof_rect=item.get('roof',{}).get('rect')
        # The cafe's big white gable faces the parking, not the street (0896).
        if kind=='cafe':roof_rect=roof_rect[1:]+roof_rect[:1]
        a,c,_,e=roof_rect;length=math.dist(a,c);ux,uz=(c[0]-a[0])/length,(c[1]-a[1])/length;nx,nz=-uz,ux
        width=(e[0]-a[0])*nx+(e[1]-a[1])*nz
        origin,rx,rz=tuple(a),nx,nz
        ridge_side=lambda p:((p[0]-origin[0])*rx+(p[1]-origin[1])*rz)/width-.5
        def roof_y(x,z):
            v=((x-origin[0])*rx+(z-origin[1])*rz)/width
            return h+spec['rise']*max(0,1-abs(v*2-1))
    elif kind=='hotel':
        roof_y=lambda x,z:13.15 if x>=290 else 5.1+1.5*max(0,1-abs((x-285.5)/4.5))
    else:
        roof_y=lambda x,z:h+spec['rise']*min(1,min(distance((x,z),a,c) for a,c in edges)/4.5)
    for ring in rings:
        turn=1 if sum(a[0]*c[1]-c[0]*a[1] for a,c in zip(ring,ring[1:]+ring[:1]))>0 else -1
        for a,c in zip(ring,ring[1:]+ring[:1]):
            length=math.dist(a,c)
            if length<.05:continue
            ux,uz=(c[0]-a[0])/length,(c[1]-a[1])/length;nx,nz=uz*turn,-ux*turn
            at=lambda u,y,o:(a[0]+ux*u+nx*o,y,a[1]+uz*u+nz*o)
            inside=at(length/2,2,-.15);wall_h=h if kind!='hotel' else (5.1 if (a[0]+c[0])/2<290 else 13.15)
            # Segment gable ends/stepped hotel walls so the attic follows its real roof.
            cuts=[i/max(1,math.ceil(length/1.5)) for i in range(max(1,math.ceil(length/1.5))+1)]
            if kind=='hotel' and (a[0]-290)*(c[0]-290)<0:cuts=sorted(set(cuts+[(290-a[0])/(c[0]-a[0])]))
            if kind=='cafe' and ridge_side(a)*ridge_side(c)<0:
                cuts=sorted(set(cuts+[ridge_side(a)/(ridge_side(a)-ridge_side(c))]))
            for lo,hi in zip(cuts,cuts[1:]):
                p,q=[(a[0]+(c[0]-a[0])*t,a[1]+(c[1]-a[1])*t) for t in (lo,hi)]
                yy=5.1 if kind=='hotel' and (p[0]+q[0])/2<290 else 13.15 if kind=='hotel' else h
                py,qy=(roof_y(*p),roof_y(*q)) if kind=='cafe' else (yy,yy)
                if kind=='hotel' and yy<7:
                    py,qy=[5.1+1.5*max(0,1-abs((v[0]-285.5)/4.5)) for v in (p,q)]
                if kind=='turret':
                    plinth=spec['plinth'];solid(b,[p,q,(q[0]-nx*.05,q[1]-nz*.05),(p[0]-nx*.05,p[1]-nz*.05)],.15,plinth,'HK_Stone')
                    bottom=plinth
                else:bottom=.15
                material='ART_Concrete' if kind=='hotel' and yy<7 else 'ART_Timber' if kind=='crest-shops' else 'ART_Plaster'
                face(b,[(p[0],bottom,p[1]),(q[0],bottom,q[1]),(q[0],qy,q[1]),(p[0],py,p[1])],material,inside)
            if length<2:continue
            if kind=='turret':
                for i in range(max(1,int(length/6))):
                    u=length*(i+.5)/max(1,int(length/6))
                    framed_window(b,at,u-.29,u+.29,spec['plinth']+1.4,spec['plinth']+2.25,columns=3,rows=1)
            elif kind=='hotel':
                ys=(.8,3.2) if wall_h<7 else (1.25,4.05,6.85,9.65)
                for y in ys:
                    for i in range(max(1,int(length/3.1))):
                        u=length*(i+.5)/max(1,int(length/3.1))
                        if y+1.3<wall_h:framed_window(b,at,u-.65,u+.65,y,y+1.3,columns=2,rows=1)
            elif kind=='crest-shops':
                continue  # east_street.shops draws the photographed bays
            elif nx<-.8:
                # Only the photographed street frontage receives the identifying glazing.
                framed_window(b,at,length*.15,length*.85,.5,2.8,columns=4,rows=2)
    # Fit a gable/hipped roof to every existing source triangle; holes and clipped wings remain holes.
    if kind=='hotel':
        def clip(t,positive):
            out=[]
            for a,c in zip(t,t[1:]+t[:1]):
                ia=a[0]>=290 if positive else a[0]<=290;ic=c[0]>=290 if positive else c[0]<=290
                if ia:out.append(a)
                if ia!=ic:
                    u=(290-a[0])/(c[0]-a[0]);out.append([290,a[1]+(c[1]-a[1])*u])
            return out
        for t in item['triangles']:
            for side in (False,True):
                p=clip(t,side)
                if len(p)<3:continue
                for a,c in zip(p,p[1:]+p[:1]):
                    if side and abs(a[0]-290)<1e-5 and abs(c[0]-290)<1e-5:
                        face(b,[(290,5.1,a[1]),(290,13.15,a[1]),(290,13.15,c[1]),(290,5.1,c[1])],'ART_Plaster',(291,9,(a[1]+c[1])/2))
                for i in range(1,len(p)-1):
                    for q in split_triangles([[p[0],p[i],p[i+1]]]):
                        face(b,[(x,13.15 if side else 5.1+1.5*max(0,1-abs((x-285.5)/4.5)),z) for x,z in q],'HK_RoofTile' if not side else 'HK_MetalLight',(sum(v[0] for v in q)/3,0,sum(v[1] for v in q)/3))
    else:
        triangles=item['triangles']
        if kind=='cafe':
            triangles=[]
            for t in item['triangles']:
                for side in (False,True):
                    p=clipped(t,ridge_side,side)
                    triangles.extend([[p[0],p[i],p[i+1]] for i in range(1,len(p)-1)])
        for t in split_triangles(triangles):face(b,[(x,roof_y(x,z),z) for x,z in t],'HK_RoofTile',(sum(v[0] for v in t)/3,0,sum(v[1] for v in t)/3))
    if kind=='cafe':
        canopy(b,(263.9,170.8),(0,-1),2.6,arched=True)
    elif kind=='crest-shops':
        # The taller red end gable and round crest panel are visible in 0903–0905.
        center=(278.7,5.8,303.0);inside=(280,4,303)
        face(b,[(278.7,3.3,300.4),(278.7,3.3,305.6),(278.7,6.4,305.6),(278.7,8.2,303),(278.7,6.4,300.4)],'HK_SignRed',inside)
        # This is a circular gold crest, not a clock or a glazed window (0903).
        x,y,z=center
        face(b,[(x-.025,y+.49*math.sin(i*math.tau/32),z+.49*math.cos(i*math.tau/32)) for i in range(32)],'ART_Timber',inside)
        for j in range(3):
            a=j*math.tau/3;cy,cz=y+.19*math.sin(a),z+.19*math.cos(a)
            face(b,[(x-.04,cy+.18*math.sin(i*math.tau/16),cz+.18*math.cos(i*math.tau/16)) for i in range(16)],'HK_Gold',inside)
    elif kind=='hotel':portal(b,(275.2,376),(-1,0),8.6,3.6,4.9)
    elif kind=='turret' and item['id']=='way/363244220':
        # Museum's visible exterior stair is a closed exhibit access, not a new public route.
        stair(b,(62.4,466.5),(62.5,453.8),4.4)
    recolor(b,first)
    from east_street import tint_building
    tint_building(b,first,kind)
    return True


def portal(b,point,normal,width,eave,peak):
    from abstract_props import cylinder
    x,z=point;nx,nz=normal;tx,tz=-nz,nx;inside=(x-nx,1,z-nz)
    at=lambda u,y,o:(x+tx*u+nx*o,y,z+tz*u+nz*o)
    for u in (-width/2,width/2):cylinder(b,at(u,.15,0),at(u,eave,0),.14,'ART_Timber',segments=6)
    for side in (-1,1):face(b,[at(-width*.57,eave,side*1.4),at(width*.57,eave,side*1.4),at(width*.57,peak,0),at(-width*.57,peak,0)],'HK_RoofTile',inside)


def canopy(b,point,normal,width,arched=False):
    from abstract_props import cylinder
    x,z=point;nx,nz=normal;tx,tz=-nz,nx;at=lambda u,y,o:(x+tx*u+nx*o,y,z+tz*u+nz*o)
    inside=(x-nx,1.5,z-nz)
    for u in (-width/2,width/2):cylinder(b,at(u,.15,.9),at(u,2.7,.9),.035,'HK_MetalLight',segments=5)
    if arched:
        curve=[(width/2*math.cos(i*math.pi/12),2.3+.55*math.sin(i*math.pi/12)) for i in range(13)]
        for (u,y),(v,yy) in zip(curve,curve[1:]):face(b,[at(u,y,0),at(v,yy,0),at(v,yy,.95),at(u,y,.95)],'HK_SignRed',inside)
        face(b,[at(u,y,.95) for u,y in curve],'HK_SignRed',inside)
    else:
        face(b,[at(-width/2,2.95,0),at(width/2,2.95,0),at(width/2,2.8,1.6),at(-width/2,2.8,1.6)],'HK_MetalLight',inside)
        face(b,[at(-width/2,2.92,0),at(-width/2,2.77,1.6),at(width/2,2.77,1.6),at(width/2,2.92,0)],'HK_MetalLight',(x,3.2,z))


def stair(b,a,c,height):
    from university import prism
    from abstract_props import cylinder
    length=math.dist(a,c);ux,uz=(c[0]-a[0])/length,(c[1]-a[1])/length;nx,nz=-uz,ux;n=22
    for i in range(n):
        p=[a[j]+(c[j]-a[j])*i/n for j in (0,1)];q=[a[j]+(c[j]-a[j])*(i+1)/n for j in (0,1)]
        prism(b,p,q,.15,.15+(i+1)*height/n,1.8,'ART_Concrete')
    for side in (-1,1):
        cylinder(b,(a[0]+nx*side,.9,a[1]+nz*side),(c[0]+nx*side,height+.9,c[1]+nz*side),.065,'HK_WhitePaint',segments=4)
        for i in range(0,n+1,2):
            t=i/n;x,z=a[0]+(c[0]-a[0])*t+nx*side,a[1]+(c[1]-a[1])*t+nz*side
            cylinder(b,(x,.15+t*height,z),(x,1.05+t*height,z),.06,'HK_WhitePaint',segments=4)


def retained_building(b,item):
    from south_promenade import saigo
    if saigo(b,item):return True
    spec=data()['retainedBuildings'].get(item.get('name'))
    if not spec:return False
    from university_photos import framed_window
    from abstract_props import cylinder
    p=item['footprint'];first=len(b.faces);cx,cz=sum(q[0] for q in p)/4,sum(q[1] for q in p)/4
    top=item['height']+.15;inside=(cx,top/2,cz)
    for a,c in zip(p,p[1:]+p[:1]):
        length=math.dist(a,c);ux,uz=(c[0]-a[0])/length,(c[1]-a[1])/length;nx,nz=-uz,ux
        if nx*((a[0]+c[0])/2-cx)+nz*((a[1]+c[1])/2-cz)<0:nx,nz=-nx,-nz
        at=lambda u,y,o:(a[0]+ux*u+nx*o,y,a[1]+uz*u+nz*o)
        face(b,[at(0,.15,0),at(length,.15,0),at(length,top,0),at(0,top,0)],'ART_Concrete' if spec['kind']=='school' else 'ART_Plaster',inside)
        if spec['kind']=='school':
            for floor in range(4):
                for i in range(max(1,int(length/3.2))):
                    u=length*(i+.5)/max(1,int(length/3.2));framed_window(b,at,u-.9,u+.9,1.2+3*floor,2.6+3*floor,columns=3,rows=1)
            for y in (3.15,6.15,9.15,12.15):
                face(b,[at(0,y,.04),at(length,y,.04),at(length,y+.1,.04),at(0,y+.1,.04)],'ART_StoneLight',inside)
        else:
            face(b,[at(0,.15,.012),at(length,.15,.012),at(length,2.1,.012),at(0,2.1,.012)],'ART_Timber',inside)
            for i in range(1,max(2,int(length/1.4))):
                u=i*1.4
                if u<length:cylinder(b,at(u,.15,.04),at(u,top,.04),.06,'ART_Timber',segments=4)
    if spec['kind']=='school':face(b,[(x,top,z) for x,z in p],'HK_MetalLight',inside)
    else:
        from university import frame_point
        f=lambda u,y,v:frame_point(item,u,y,v)
        left,right=f(0,top+item['rise'],.5),f(1,top+item['rise'],.5)
        a,c,d,e=[f(u,top,v) for u,v in ((0,0),(1,0),(1,1),(0,1))]
        for q in ([a,c,right,left],[d,e,left,right],[e,a,left],[c,d,right]):face(b,q,'HK_RoofTile',inside)
        # Paired timber doors and the small barred window on the photographed street side.
        u=.5;face(b,[f(u-.07,.15,1.007),f(u+.07,.15,1.007),f(u+.07,2.8,1.007),f(u-.07,2.8,1.007)],'ART_Timber',inside)
        for v in (-.055,.055):
            for y in (.8,1.6,2.3):cylinder(b,f(u+v,y,1.012),f(u+v,y+.08,1.012),.05,'HK_MetalLight',segments=6)
    recolor(b,first);return True


@lru_cache(maxsize=1)
def ground():
    with open(os.path.join(ROOT,'data','road_tiles.json')) as f:d=json.load(f)
    cells={}
    for ts in d.values():
        for t in ts:
            for i in range(math.floor(min(t[0::3])/4),math.floor(max(t[0::3])/4)+1):
                for j in range(math.floor(min(t[2::3])/4),math.floor(max(t[2::3])/4)+1):cells.setdefault((i,j),[]).append(t)
    return cells


def height(x,z):
    best=None
    for ax,ay,az,bx,by,bz,cx,cy,cz in ground().get((math.floor(x/4),math.floor(z/4)),[]):
        d=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz)
        if abs(d)<1e-12:continue
        u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/d;v=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/d
        if min(u,v,1-u-v)>=-1e-6:
            y=u*ay+v*by+(1-u-v)*cy;best=y if best is None else max(best,y)
    return best if best is not None else .15


def board(b,item):
    from abstract_props import cylinder
    from university import prism
    x,z=item.get('placement',item['point']);y=height(x,z);a=math.radians(item['heading']-122)
    # Front faces the photographed approach; axes stay in the existing map frame.
    nx,nz=-math.cos(a),math.sin(a);tx,tz=-nz,nx
    at=lambda u,h,o:(x+tx*u+nx*o,y+h,z+tz*u+nz*o)
    kind=item['kind']
    if kind=='marker':
        # A small inscribed stone post with a shallow cap, not a board.
        b.box((x,y+.55,z),(.24,1.1,.24),'ART_StoneLight',False)
        b.box((x,y+1.12,z),(.27,.05,.27),'HK_Stone',False)
        return
    width=1.6 if kind=='map' else .65 if kind=='guidepost' else 1.5
    top=1.3 if kind=='map' else 2.2;low=.75 if kind=='map' else .5
    for u in (-width*.43,width*.43):cylinder(b,at(u,0,0),at(u,top,0),.055,'ART_Timber' if kind!='map' else 'HK_Stone',segments=4)
    p,q=at(-width/2,low,0),at(width/2,low,0)
    prism(b,(p[0],p[2]),(q[0],q[2]),y+low,y+top,.08,'ART_Timber')
    face(b,[at(-width*.46,low+.04,.045),at(width*.46,low+.04,.045),at(width*.46,top-.04,.045),at(-width*.46,top-.04,.045)],'ART_StoneLight' if kind!='guidepost' else 'ART_Timber',(x-nx,y+1,z-nz))
    # Own simplified map/linework, rather than a copied photograph of the copyrighted board.
    if kind=='map':
        for i in range(4):
            u=width*(-.32+i*.21)
            cylinder(b,at(u,low+.1,.055),at(u+.12,top-.1,.055),.018,'ART_Patina',segments=3)
    elif not b.distant:
        for i in range(5):
            yy=low+.15+i*(top-low-.3)/5
            cylinder(b,at(-width*.35,yy,.055),at(width*.35,yy,.055),.013,'HK_MetalLight',segments=3)


def chain(b,line):
    from abstract_props import cylinder
    for a,c in zip(line,line[1:]):
        n=max(1,math.ceil(math.dist(a,c)/2.4))
        for i in range(n+1):
            t=i/n;x,z=a[0]+(c[0]-a[0])*t,a[1]+(c[1]-a[1])*t;y=height(x,z)
            b.box((x,y+.45,z),(.17,.9,.17),'HK_Stone',False)
            if i==n:continue
            pts=[(a[0]+(c[0]-a[0])*(i+s)/n,y+.72-.14*4*s*(1-s),a[1]+(c[1]-a[1])*(i+s)/n) for s in (0,.25,.5,.75,1)]
            for p,q in zip(pts,pts[1:]):cylinder(b,p,q,.012,'ART_Timber',segments=3)


def palm(b,x,z,h):
    from abstract_props import cylinder
    y=height(x,z);cylinder(b,(x,y,z),(x+.1,y+h,z),.11,'HK_Bark',segments=7,end_radius=.08)
    for j in range(10):
        a=j*math.tau/10;ux,uz=math.cos(a),math.sin(a);cx,cz=x+ux*1.2,z+uz*1.2;inside=(x,y+h-.3,z)
        for k in range(7):
            angle=a+(k-3)*.22;tip=(cx+math.cos(angle)*1.1,y+h+.2-abs(k-3)*.08,cz+math.sin(angle)*1.1)
            face(b,[(x,y+h,z),(tip[0]-.08*uz,tip[1],tip[2]+.08*ux),(tip[0]+.08*uz,tip[1],tip[2]-.08*ux)],'ART_Patina',inside)


def furniture(b):
    from abstract_props import cylinder
    from university import prism
    from road_network import face as ground_face,strip
    first=len(b.faces);d=data()
    from north_streetscape import data as north_data
    from south_promenade import data as south_data
    for item in d['facilities']:
        if item['osm'] in north_data()['replacedFacilities']:continue
        if item['osm'] in south_data()['facilities'] or item['kind']=='bench':continue
        (bench if item['kind']=='bench' else board)(b,item)
    # The retained practice shore already owns its original fence. Extend the mapped
    # chain only into the photographed eastern promenade, preserving event corridors.
    mapped=d['promenadeBarrier']['points'];line=[]
    # West of X=200 the retained shore has its own fence, and the mapped line falls in its water.
    for a,c in zip(mapped,mapped[1:]):
        if c[0]<200:continue
        p=a if a[0]>=200 else [200,a[1]+(c[1]-a[1])*(200-a[0])/(c[0]-a[0])]
        if not line:line.append(p)
        line.append(c)
    from east_extension import ownership
    for a,c in zip(line,line[1:]):
        if ownership().contains((a[0]+c[0])/2,(a[1]+c[1])/2):chain(b,[a,c])
    for item in d['schoolWalls']:
        if item['osm'] != 'way/1449647547':
            continue  # The gate-corner walls are now authored by nishi_school.
        from nishi_school import wall as boulder_wall
        boulder_wall(b,item)
    # The photo's diagonal zebra and blue cycle crossing share the corrected road axis.
    line=d['schoolRoad']['points'];a,c=line[-2],line[-3];length=math.dist(a,c);ux,uz=(c[0]-a[0])/length,(c[1]-a[1])/length;nx,nz=-uz,ux
    x,z=-574.7,a[1]+(c[1]-a[1])*(-574.7-a[0])/(c[0]-a[0])
    at=lambda u,y,v:(x+ux*u+nx*v,y,z+uz*u+nz*v)
    for i in range(6):
        u=-2.2+i*.82;face(b,[at(u,.023,-2.9),at(u+.4,.023,-2.9),at(u+.4,.023,2.9),at(u,.023,2.9)],'HK_WhitePaint',(x,0,z))
    face(b,[at(-3.5,.022,-2.9),at(-2.8,.022,-2.9),at(-2.8,.022,2.9),at(-3.5,.022,2.9)],'HK_SignBlue',(x,0,z))
    # Small, photo-confirmed fan palms within the church garden, clear of the public street.
    for x,z,h in [(274,259,2.8),(275,267,3.5),(277,273,2.6)]:palm(b,x,z,h)
    # The low roadside shrine in 0895, behind the narrow shoulder (estimated dimensions).
    shrine=(255.7,116.8);y=height(*shrine);b.box((shrine[0],y+.7,shrine[1]),(.65,1.4,.6),'HK_Stone',False)
    portal(b,shrine,(-1,0),1.4,1.6,2.05)
    road_details(b)
    recolor(b,first)
    from nishi_school import build as nishi_frontage
    nishi_frontage(b)
    from north_streetscape import furniture as north_furniture
    north_furniture(b)
    from south_promenade import furniture as south_furniture
    south_furniture(b)
    from school_road import furniture as school_road_furniture
    school_road_furniture(b)


def road_details(b):
    from abstract_props import cylinder
    from road_network import strip,face as ground_face
    from castle_approach import data as approach
    # Green shoulders along the photo-confirmed inner-moat corridor, inside the existing
    # seven-metre carriageway. The route's shoulders and datum are unchanged.
    runs=[];route=[]
    for a,c in zip(approach()['innerRoad'],approach()['innerRoad'][1:]):
        dz=c[1]-a[1];lo,hi=0,1
        if abs(dz)<1e-8:
            if not 90<=a[1]<=348:continue
        else:
            s,t=sorted(((90-a[1])/dz,(348-a[1])/dz));lo,hi=max(lo,s),min(hi,t)
            if lo>=hi:continue
        p,q=[[a[j]+(c[j]-a[j])*t for j in (0,1)] for t in (lo,hi)]
        if route and math.dist(route[-1],p)>.001:runs.append(route);route=[]
        if not route:route=[p]
        route.append(q)
    if route:runs.append(route)
    for side in (-1,1):
        for lo,hi,mat in [(2.85,3.3,'ART_PathGreen'),(2.72,2.82,'HK_WhitePaint')]:
            for route in runs:
                for p in strip(route,side*lo,side*hi):ground_face(b,p,.023 if mat=='HK_WhitePaint' else .022,mat,False)
    # Segmented numerals observed at the high-school bend; no runtime speed-rule changes.
    target=(-89.3,174.4);best=None
    for a,c in zip(approach()['innerRoad'],approach()['innerRoad'][1:]):
        dx,dz=c[0]-a[0],c[1]-a[1];l=math.hypot(dx,dz);t=max(0,min(1,((target[0]-a[0])*dx+(target[1]-a[1])*dz)/(l*l)))
        p=(a[0]+dx*t,a[1]+dz*t);d=math.dist(p,target)
        if best is None or d<best[0]:best=(d,p,(dx/l,dz/l))
    _,p,(ux,uz)=best;nx,nz=-uz,ux
    segments=[(-.38,.8,.38,.8),(.38,.8,.38,0),(.38,0,.38,-.8),(-.38,-.8,.38,-.8),(-.38,-.8,-.38,0),(-.38,0,-.38,.8),(-.38,0,.38,0)]
    for side in (-1,1):
        for digit,active in enumerate([(0,1,2,3,6),(0,1,2,3,4,5)]):
            for k in active:
                a,c,e,f=segments[k]
                aa=(p[0]+nx*(side*1.5+(digit-.5)*.95+a)+ux*c,p[1]+nz*(side*1.5+(digit-.5)*.95+a)+uz*c)
                cc=(p[0]+nx*(side*1.5+(digit-.5)*.95+e)+ux*f,p[1]+nz*(side*1.5+(digit-.5)*.95+e)+uz*f)
                for q in strip([aa,cc],-.08,.08):ground_face(b,q,.024,'HK_SignYellow',False)
    for lamp in data()['lamps']:
        x,z=lamp['point'];y=height(x,z);ax,az=lamp.get('arm',(1,0));hx,hz=x+ax*.5,z+az*.5
        cylinder(b,(x,y,z),(x,y+4.8,z),.08,'ART_Timber',segments=6)
        cylinder(b,(x,y+4.6,z),(hx,y+4.6,hz),.05,'ART_Timber',segments=4)
        b.box((hx,y+4.25,hz),(.38,.55,.38),'ART_Timber',False)
        b.box((hx,y+4.25,hz),(.33,.44,.4),'ART_LampGlow',False)
        b.box((hx,y+4.57,hz),(.48,.1,.48),'ART_Timber',False)
