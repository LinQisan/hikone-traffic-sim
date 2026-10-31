"""Photo 0848's raised stone rampart and the opposite-street utility furniture.

world/school-moat.json separates source measurements, geographic outlines and visual
estimates. The retained water boundary owns registration; terrain and native geometry
share one triangulated profile. No roads, buildings or accident positions are moved.
"""
import json
import math
import os
import random
from functools import lru_cache

ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@lru_cache(maxsize=1)
def observations():
    with open(os.path.join(ROOT,'world/school-moat.json')) as f:return json.load(f)


def profile(x):
    p=observations()['profile'];t=max(0,min(1,(x-p['seamX']+p['transition'])/p['transition']));t=t*t*(3-2*t)
    mix=lambda a,c:a+(c-a)*t
    return mix(p['crestHeight'],p['seamCrest']),mix(p['batter'],p['seamBatter']),mix(p['batter']+.5,p['seamPlateau']),mix(p['backEdge'],p['seamBackEdge'])


@lru_cache(maxsize=1)
def sections():
    from university import data
    p=observations()['profile'];line=data()['schoolBank'][:p['coastVertices']]
    normals=[]
    for a,c in zip(line,line[1:]):
        length=math.dist(a,c);normals.append(((c[1]-a[1])/length,-(c[0]-a[0])/length))
    joins=[]
    for i in range(len(line)):
        if i==0:joins.append((0,1));continue
        a,c=normals[i-1],normals[min(i,len(normals)-1)];div=1+a[0]*c[0]+a[1]*c[1]
        joins.append(((a[0]+c[0])/div,(a[1]+c[1])/div))
    result=[]
    for i,(a,c) in enumerate(zip(line,line[1:])):
        n=max(1,math.ceil(math.dist(a,c)/4))
        for j in range(n):
            t=j/n;x,z=a[0]+(c[0]-a[0])*t,a[1]+(c[1]-a[1])*t
            nx,nz=[joins[i][k]+(joins[i+1][k]-joins[i][k])*t for k in (0,1)]
            crest,batter,plateau,end=profile(x)
            result.append([(x+nx*d,y,z+nz*d) for d,y in ((0,p['toeHeight']),(batter,crest),(plateau,crest),(end,.15))])
    x,z=line[-1];nx,nz=joins[-1];crest,batter,plateau,end=profile(x)
    result.append([(x+nx*d,y,z+nz*d) for d,y in ((0,p['toeHeight']),(batter,crest),(plateau,crest),(end,.15))])
    return result


@lru_cache(maxsize=1)
def terrain():
    from road_network import ccw,triangulate
    cuts=[];ground=[]
    for a,c in zip(sections(),sections()[1:]):
        cuts.extend(triangulate(ccw([(p[0],p[2]) for p in (a[0],c[0],c[3],a[3])])))
        for k in (1,2):
            vertices=[a[k],c[k],c[k+1],a[k+1]]
            for tri in ((0,1,2),(0,2,3)):
                ground.append(tuple(vertices[j] for j in tri))
    return cuts,ground


def surface_height(x,z,triangle):
    (ax,ay,az),(bx,by,bz),(cx,cy,cz)=triangle
    div=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz)
    if abs(div)<1e-10:return None
    u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/div;v=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/div
    if min(u,v,1-u-v)<-1e-4:return None
    return u*ay+v*by+(1-u-v)*cy


def height(x,z):
    values=[h for t in terrain()[1] if (h:=surface_height(x,z,t)) is not None]
    return max(values,default=.15)


def ground_polygons(cutters):
    from university import cut
    from road_network import ccw
    result=[]
    for triangle in terrain()[1]:
        outline=ccw([(v[0],v[2]) for v in triangle])
        for piece in cut([outline],cutters):
            result.append([(x,surface_height(x,z,triangle),z) for x,z in piece])
    return result


def follows_wall(a,c):
    from university import data
    from castle_approach import point_segment_distance
    line=data()['schoolBank'][:observations()['profile']['coastVertices']]
    # Boolean noding may split one shore edge into several exported water edges.
    return any(point_segment_distance(*a,p,q)<.01 and point_segment_distance(*c,p,q)<.01
               for p,q in zip(line,line[1:]))


def tree_position(x,z):
    from university import data
    from castle_approach import point_segment_distance
    line=data()['schoolBank'][:observations()['profile']['coastVertices']]
    for a,c in zip(line,line[1:]):
        if point_segment_distance(x,z,a,c)>.02:continue
        length=math.dist(a,c);d=profile(x)[1]+.45
        x+=(c[1]-a[1])/length*d;z-=(c[0]-a[0])/length*d
        return x,height(x,z),z
    return x,.15,z


def rampart(b,ground):
    from streetscape import outward_face
    for polygon in ground:
        # Height is authored here and exported verbatim to Ground, without renderer offsets.
        outward_face(b,polygon,'HK_Grass',(polygon[0][0],-2,polygon[0][2]))
    for i,(a,c) in enumerate(zip(sections(),sections()[1:])):
        toe0,top0=a[0],a[1];toe1,top1=c[0],c[1]
        inside=((top0[0]+top1[0])/2,0,(top0[2]+top1[2])/2)
        outward_face(b,[toe0,toe1,top1,top0],'HK_StoneDark',inside)
        dx,dz=toe1[0]-toe0[0],toe1[2]-toe0[2];length=math.hypot(dx,dz)
        if length<.05:continue
        # The same individual boulders as the school walls, not a tiled surface (0980, 0985).
        from school_road import masonry,ivy
        run=math.dist((toe0[0],toe0[2]),(top0[0],top0[2]));high=max(top0[1],top1[1]);low=min(toe0[1],toe1[1])
        masonry(b,(top0[0],top0[2]),(top1[0],top1[2]),low,high,(inside[0]+(top0[0]-toe0[0])*3,inside[2]+(top0[2]-toe0[2])*3),
                8900+i,batter=run/max(.5,high-low),scale=1.15)
        ivy(b,(top0[0],top0[2]),(top1[0],top1[2]),high,(inside[0]+(top0[0]-toe0[0])*3,inside[2]+(top0[2]-toe0[2])*3),8950+i)
    # A closed earthen end is hidden inside the already mapped school-gate stone return.
    end=sections()[-1]
    outward_face(b,[end[0],end[1],end[2],end[3],(end[3][0],.15,end[3][2]),
                    (end[0][0],.15,end[0][2])],'HK_Stone',end[1])


def beside(z,offset):
    from university import data
    line=data()['link'][:4]
    for a,c in zip(line,line[1:]):
        if not min(a[1],c[1])<=z<=max(a[1],c[1]):continue
        length=math.dist(a,c);t=(z-a[1])/(c[1]-a[1]);nx,nz=-(c[1]-a[1])/length,(c[0]-a[0])/length
        return a[0]+(c[0]-a[0])*t+nx*offset,z+nz*offset,nx,nz
    raise ValueError('Photo street furniture lies outside the authored moat road')


def street_furniture(b):
    from abstract_props import cylinder
    from university import prism,data
    from university_frontage import graphic,rect,label,line
    from university_photos import recolor
    first=len(b.faces);d=observations()['street'];pole=d['pole'];x,z,nx,nz=beside(pole['z'],pole['offset']);tx,tz=-nz,nx
    at=lambda u,y,o:(x+tx*u+nx*o,y,z+tz*u+nz*o)
    cylinder(b,(x,.01,z),(x,pole['height'],z),.17,'HK_MetalLight',segments=10,end_radius=.115)
    for y in (4.6,6.0,7.7,9.5):
        cylinder(b,(x,y,z),(x,y+.07,z),.185,'ART_DisplayMetal',segments=10)
    for y in (7.5,10.2):
        a,c=at(0,y,-1.1),at(0,y,1.1);prism(b,(a[0],a[2]),(c[0],c[2]),y,y+.12,.12,'ART_DisplayMetal')
        for o in (-.9,0,.9):cylinder(b,at(0,y+.12,o),at(0,y+.39,o),.07,'ART_DisplayInk',segments=6)
    # The ribbed transformer and its bracket face the photographed campus approach.
    cylinder(b,at(0,8.35,.62),at(0,9.35,.62),.32,'HK_MetalLight',segments=12)
    for y in (8.35,8.43,9.28,9.36):cylinder(b,at(0,y,.62),at(0,y+.045,.62),.35,'ART_DisplayMetal',segments=12)
    for u in (-.23,.23):cylinder(b,at(u,8.0,.12),at(u,8.7,.62),.04,'ART_DisplayMetal',segments=4)
    for y in (3.8,4.5,5.2,5.9,6.6,7.3):cylinder(b,at(.15,y,0),at(.38,y+.04,0),.018,'ART_DisplayMetal',segments=4)
    for y in (5.9,7.2):
        # A hanging service loop has static geometry, including its shaded inner silhouette.
        pts=[at(.32*math.cos(i*math.tau/16),y+.4*math.sin(i*math.tau/16),.22) for i in range(17)]
        for a,c in zip(pts,pts[1:]):cylinder(b,a,c,.014,'ART_Timber',segments=3)
    # Reuse actual modeled supports; attachment positions are photo-relative estimates.
    anchors=[min(data()['detail']['poles'],key=lambda p:math.hypot(p[0]-x,p[1]-z)),data()['gateDetail']['lamp']]
    for n,anchor in enumerate(anchors):
        for offset,y,end in ((-.5,10.55,9.72),(.5,10.55,9.72),(0,7.65,7.82)):
            if n==1:end=min(end,8.65)
            pts=[(x+tx*offset+(anchor[0]-x)*t,y+(end-y)*t-.65*4*t*(1-t),z+tz*offset+(anchor[1]-z)*t) for t in [i/14 for i in range(15)]]
            for a,c in zip(pts,pts[1:]):cylinder(b,a,c,.014,'ART_Timber',segments=3)
    cabinet=d['cabinet'];x,z,nx,nz=beside(cabinet['z'],cabinet['offset']);tx,tz=-nz,nx
    at=lambda u,y,o:(x+tx*u+nx*o,y,z+tz*u+nz*o)
    w,h,depth,bottom=[cabinet[k] for k in ('width','height','depth','bottom')]
    def box(u,y,width,height,thickness,offset,material):
        a,c=at(u-width/2,y,offset),at(u+width/2,y,offset)
        prism(b,(a[0],a[2]),(c[0],c[2]),y,y+height,thickness,material)
    for u in (-w*.36,w*.36):box(u,.01,.055,bottom,depth*.55,0,'ART_DisplayMetal')
    box(0,bottom,w,h,depth,0,'HK_SignRed');box(0,bottom+h,w+.055,.035,depth+.035,0,'HK_SignRed')
    rect(b,at,-w*.45,bottom+.055,w*.90,h-.09,(.58,.19,.16),depth/2+.007)
    label(b,at,cabinet['label'],-w*.43,bottom+h*.53,w*.86,.065,(.93,.91,.81),depth/2+.016)
    label(b,at,'ホース格納箱',-w*.36,bottom+h*.82,w*.72,.050,(.87,.84,.73),depth/2+.016)
    for u in (-.23,.07):
        for y in (.10,.16,.22):rect(b,at,u,bottom+y,.17,.012,(.30,.15,.13),depth/2+.016)
    cylinder(b,at(-.27,bottom+.42,depth/2+.018),at(-.19,bottom+.42,depth/2+.025),.012,'ART_DisplayMetal',segments=6)
    mirror=d['mirror'];x,z,nx,nz=beside(mirror['z'],mirror['offset']);tx,tz=-nz,nx
    at=lambda u,y,o:(x+tx*u+nx*o,y,z+tz*u+nz*o)
    cylinder(b,(x,.01,z),(x,mirror['height'],z),.042,'ART_Timber',segments=6)
    cylinder(b,at(-.72,3.30,0),at(.72,3.30,0),.027,'ART_DisplayMetal',segments=5)
    for sign in (-1,1):
        def panel(u,y,o):return at(sign*.45+u,y,o+sign*u*.32)
        outline=[(-.34,3.08),(.34,3.08),(.30,3.60),(-.29,3.60)]
        graphic(b,panel,outline,(.30,.34,.32),.012)
        graphic(b,panel,[(-.29,3.13),(.29,3.13),(.26,3.55),(-.25,3.55)],(.66,.73,.71),.018)
        graphic(b,panel,[(-.26,3.16),(.24,3.16),(.14,3.34),(-.20,3.28)],(.45,.54,.52),.020)
    rect(b,at,-.13,2.18,.26,.61,(.92,.91,.82),.052)
    for i,char in enumerate(mirror['label']):label(b,at,char,-.080,2.57-i*.11,.16,.10,(.22,.31,.48),.059)
    graphic(b,at,[(-.06,2.69),(.06,2.69),(.06,2.78),(.11,2.78),(0,2.88),(-.11,2.78),(-.06,2.78)],(.69,.21,.17),.060)
    recolor(b,first)
    # Painted equipment is ordinary metal. It must never use an emissive signal material.
    for k in range(first,len(b.faces)):
        if b.materials[b.slots[k]]=='HK_SignRed':b.pigments[k]=(.62,.20,.16)
