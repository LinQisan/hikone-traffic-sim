"""Mesh-native gate graphics and climbing foliage from the owner's painted reference.

Lettering remains legible inside the impressionist scene. The illustrations are original
geometry, not pasted photographs or a reconstruction of unreadable notice text. Font
outlines are resolved by the offline author only; the browser loads neither fonts nor images.
"""
import math
import os
from functools import lru_cache

INK = 'ART_DisplayInk'
PAPER = (.95,.92,.80)
DARK = (.12,.18,.17)
GOLD = (.88,.79,.55)
BLUE = (.18,.43,.65)
GREEN = (.28,.48,.38)


@lru_cache(maxsize=32)
def glyphs(text):
    import bpy
    paths=(os.environ.get('HIKONE_JAPANESE_FONT',''),
           '/System/Library/Fonts/Hiragino Sans GB.ttc',
           '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc')
    font_path=next((p for p in paths if os.path.isfile(p)),None)
    if font_path is None:raise RuntimeError('Set HIKONE_JAPANESE_FONT to a Japanese-capable font before rebuilding the campus.')
    curve=bpy.data.curves.new('Campus sign outline','FONT')
    curve.body=text;curve.font=bpy.data.fonts.load(font_path)
    curve.size=1;curve.resolution_u=2;curve.offset=.003
    ob=bpy.data.objects.new('Campus sign outline',curve)
    bpy.context.collection.objects.link(ob)
    mesh=bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    mesh.calc_loop_triangles()
    raw=[v.co for v in mesh.vertices]
    lo=[min(p[i] for p in raw) for i in (0,1)];hi=[max(p[i] for p in raw) for i in (0,1)]
    points=[((p.x-lo[0])/(hi[0]-lo[0]),(p.y-lo[1])/(hi[1]-lo[1])) for p in raw]
    triangles=[tuple(t.vertices) for t in mesh.loop_triangles]
    bpy.data.meshes.remove(mesh);bpy.data.objects.remove(ob,do_unlink=True);bpy.data.curves.remove(curve)
    return points,triangles


def graphic(b,at,outline,color,depth=.385):
    points=[at(x,y,depth) for x,y in outline]
    a,c,e=points[:3];u=[c[i]-a[i] for i in range(3)];v=[e[i]-a[i] for i in range(3)]
    normal=(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])
    front,back=at(0,0,depth),at(0,0,depth-.1)
    if sum(normal[i]*(front[i]-back[i]) for i in range(3))<0:points.reverse()
    b.face(points,INK,False,pigment=color)


def rect(b,at,x,y,w,h,color,depth=.385):
    graphic(b,at,[(x,y),(x+w,y),(x+w,y+h),(x,y+h)],color,depth)


def line(b,at,path,width,color,depth=.387):
    for a,c in zip(path,path[1:]):
        dx,dy=c[0]-a[0],c[1]-a[1];length=math.hypot(dx,dy)
        if length<1e-8:continue
        nx,ny=-dy/length*width/2,dx/length*width/2
        graphic(b,at,[(a[0]+nx,a[1]+ny),(c[0]+nx,c[1]+ny),
                      (c[0]-nx,c[1]-ny),(a[0]-nx,a[1]-ny)],color,depth)


def label(b,at,text,x,y,width,height,color=DARK,depth=.391):
    points,triangles=glyphs(text)
    for triangle in triangles:
        graphic(b,at,[(x+points[i][0]*width,y+points[i][1]*height) for i in triangle],color,depth)


def pillar(b,x,z,tangent,normal,named):
    from university import prism
    for width,depth,lo,hi,material in ((1.0,1.0,.15,.38,'HK_Stone'),
            (.9,.9,.38,2.65,'HK_Stone'),(1.06,1.06,2.65,2.81,'ART_StoneLight')):
        a=(x-tangent[0]*width/2,z-tangent[1]*width/2)
        c=(x+tangent[0]*width/2,z+tangent[1]*width/2)
        prism(b,a,c,lo,hi,depth,material)
    if not named:return
    # The column is oriented to the frontage. Its plaque is proud of the actual
    # 45 cm face, instead of putting letters inside an axis-aligned stone box.
    # Reader-right is opposite the map tangent because only coords.ts mirrors X.
    at=lambda u,y,o:(x-tangent[0]*u+normal[0]*o,y,z-tangent[1]*u+normal[1]*o)
    rect(b,at,-.29,.66,.58,1.82,(.36,.36,.29),.457)
    rect(b,at,-.255,.70,.51,1.74,DARK,.461)
    for i,char in enumerate('滋賀大学'):
        label(b,at,char,-.175,1.98-i*.39,.35,.34,GOLD,.472)
    for u in (-.224,.224):
        for y in (.75,2.39):rect(b,at,u-.012,y-.012,.024,.024,GOLD,.473)


def hall_picture(b,at,x,y,w,h,distant,detail=0):
    """An original painted elevation of the already modeled auditorium."""
    def poly(points,color,layer):
        if detail:
            from field_photos import clipped
            cx,cy,cw,ch=(.38,.6,.24,.4) if detail==1 else (.68,.20,.29,.63)
            points=[((u-cx)/cw,(v-cy)/ch) for u,v in points]
            for axis in (0,1):
                points=clipped(points,lambda p:p[axis],True)
                points=clipped(points,lambda p:1-p[axis],True)
            if len(points)<3:return
        graphic(b,at,[(x+u*w,y+v*h) for u,v in points],color,layer)
    poly([(0,0),(1,0),(1,1),(0,1)],(.54,.71,.79),.387)
    poly([(0,.75),(.28,.89),(.6,.76),(1,.86),(1,1),(0,1)],(.94,.82,.59),.388)
    poly([(0,0),(1,0),(1,.24),(.5,.19),(0,.30)],(.67,.67,.42),.388)
    poly([(.14,.22),(.78,.22),(.78,.58),(.14,.58)],(.89,.86,.67),.389)
    poly([(.72,.22),(.93,.29),(.93,.67),(.78,.58)],(.69,.79,.70),.389)
    poly([(.08,.57),(.74,.60),(.85,.81),(.23,.76)],(.27,.44,.42),.390)
    poly([(.74,.60),(.95,.66),(.85,.81)],(.38,.53,.48),.390)
    for i in range(7):
        u=.19+i*.075
        poly([(u,.28),(u+.027,.28),(u+.027,.51),(u,.51)],(.25,.38,.37),.391)
    poly([(.82,.30),(.87,.32),(.87,.52),(.82,.50)],(.18,.33,.34),.391)
    poly([(.47,.72),(.52,.72),(.52,.86),(.47,.86)],(.42,.62,.55),.392)
    poly([(.45,.85),(.54,.85),(.50,.94)],(.31,.48,.44),.393)
    # Short, deliberately placed warm/cool marks preserve a painted illustration
    # without letting a large shader dab replace the recognizable roof/window edges.
    if not distant:
        for i in range(22):
            u=(i*.173)%1;v=.80+(i%3)*.055
            poly([(u,v),(min(1,u+.08),v+.025),(min(1,u+.065),v+.055),(u,v+.032)],
                 (.85,.78,.58) if i%2 else (.62,.75,.79),.394)


def campus_map(b,at,d,x,y,w,h):
    """Schematic built from the actual local footprint author, without a false north arrow."""
    rect(b,at,x,y,w,h,(.87,.88,.73),.386)
    limits=(-840,-590,175,510)
    xmin,xmax,zmin,zmax=limits
    def point(p):return (x+(p[0]-xmin)/(xmax-xmin)*w,y+(p[1]-zmin)/(zmax-zmin)*h)
    for item in d['buildings']:
        polygon=item['footprint']
        if not all(xmin<=px<=xmax and zmin<=pz<=zmax for px,pz in polygon):continue
        graphic(b,at,[point(p) for p in polygon],(.47,.62,.55),.388)
    path=[p for p in d['axis'] if xmin<=p[0]<=xmax and zmin<=p[1]<=zmax]
    if len(path)>1:line(b,at,[point(p) for p in path],.025,(.95,.83,.55),.389)
    label(b,at,'正門',x+w*.66,y+.025,w*.27,h*.12,BLUE,.391)


def board_content(b,at,d,width,height,kind):
    # Graphic coordinates are the reader's left-to-right direction in metres.
    x,y=-width*.47,-height*.45;w,h=width*.94,height*.90
    rect(b,at,x,y,w,h,GREEN if kind=='bulletin' else PAPER,.375)
    if kind=='bulletin':
        rect(b,at,-width/2,height/2+.02,width,.22,PAPER,.385)
        label(b,at,'滋賀大学',-.68,height/2+.055,1.36,.15)
        rect(b,at,-.23,-.43,.76,.84,(.91,.86,.66),.386)
        label(b,at,'構内案内',-.17,.24,.63,.11)
        campus_map(b,at,d,-.17,-.36,.63,.50)
        rect(b,at,.68,-.43,.84,.98,BLUE,.386)
        label(b,at,'キャンパス内',.73,.37,.74,.10,PAPER)
        # The reference's blue no-smoking notice: a recognizable ring/cigarette/slash.
        ring=[(1.10+.21*math.cos(i*math.tau/28),.08+.21*math.sin(i*math.tau/28)) for i in range(29)]
        line(b,at,ring,.035,PAPER,.389)
        line(b,at,[(.95,.055),(1.23,.055)],.035,PAPER,.389)
        line(b,at,[(1.19,.095),(1.18,.14),(1.21,.18)],.016,PAPER,.389)
        line(b,at,[(.95,.23),(1.25,-.07)],.035,PAPER,.390)
        label(b,at,'全面禁煙',.73,-.31,.74,.15,PAPER)
        # An illustrated hall leaflet fills the third sheet with identifiable content.
        rect(b,at,-1.36,-.37,.83,.70,(.78,.83,.64),.386)
        label(b,at,'講堂',-1.20,.18,.52,.11)
        hall_picture(b,at,-1.30,-.28,.71,.39,b.distant)
    elif kind=='hall':
        label(b,at,'滋賀大学講堂',-w*.43,h*.34,w*.86,.13)
        hall_picture(b,at,-w*.46,-.12,w*.92,h*.43,b.distant)
        hall_picture(b,at,-w*.46,-h*.44,w*.43,h*.24,b.distant,1)
        hall_picture(b,at,w*.03,-h*.44,w*.43,h*.24,b.distant,2)
    else:
        label(b,at,'滋賀大学',-w*.40,h*.33,w*.80,min(.19,h*.14))
        label(b,at,'彦根キャンパス',-w*.40,h*.13,w*.80,min(.12,h*.10))
        campus_map(b,at,d,-w*.42,-h*.41,w*.84,h*.48)


def climber(b,d):
    from abstract_props import cylinder
    x,z=d['gateDetail']['lamp']
    cylinder(b,(x,.15,z),(x,8.8,z),.115,'HK_MetalLight',segments=8,end_radius=.075)
    for yy in (8.2,8.65):b.box((x+.15,yy,z),(.35,.12,.22),'HK_MetalLight',False)
    # Reuse a modeled utility support; the decorative span's attachment is estimated.
    # Its sag remains overhead and never creates a ground-level gate obstruction.
    anchor=min(d['detail']['poles'],key=lambda p:math.hypot(p[0]-x,p[1]-z))
    cable=[(anchor[0]+(x-anchor[0])*t,9.72+(8.65-9.72)*t-.45*4*t*(1-t),
            anchor[1]+(z-anchor[1])*t) for t in [i/12 for i in range(13)]]
    for a,c in zip(cable,cable[1:]):cylinder(b,a,c,.012,'ART_Timber',segments=3)
    # A close, campus-side guy stays behind the pole, outside the gate/body corridor.
    gx,gz=d['gate'];ax,az=d['axis'][1];length=math.hypot(ax-gx,az-gz)
    nx,nz=(ax-gx)/length,(az-gz)/length
    start=(x+nx*1.0,.15,z+nz*1.0);end=(x,8.15,z)
    cylinder(b,start,end,.012,'ART_Timber',segments=4)
    for branch in range(2):
        points=[]
        count=53 if not b.distant else 27
        for i in range(count):
            t=i/(count-1);h=.8+t*7.2;angle=t*math.tau*2.5+branch*2.4
            px=x+math.cos(angle)*.14;pz=z+math.sin(angle)*.14
            if branch==1:px+=nx*(1-t);pz+=nz*(1-t)
            points.append((px,h,pz))
        for a,c in zip(points,points[1:]):cylinder(b,a,c,.012,'HK_Bark',segments=3)
        for i,p in enumerate(points):
            if i%6==0:continue
            angle=i*2.399+branch;spread=.14+.05*math.sin(i*1.7)
            for side in (-1,1):
                ux,uz=math.cos(angle)*side,math.sin(angle)*side
                stem=(p[0]+ux*.12,p[1]+.04,p[2]+uz*.12)
                tip=(p[0]+ux*(.12+spread),p[1]+.18,p[2]+uz*(.12+spread))
                color=(.69,.65,.30) if i%4==0 else (.40,.55,.33) if i%3 else (.29,.46,.37)
                # Each folded, two-sided leaf is itself a small warm/cool paint stroke.
                if not b.distant:cylinder(b,p,stem,.006,'HK_Bark',segments=3)
                vertices=[stem,(stem[0]-uz*.09,stem[1]+.06,stem[2]+ux*.09),
                          (stem[0]-uz*.13,stem[1]+.14,stem[2]+ux*.13),tip,
                          (stem[0]+uz*.13,stem[1]+.14,stem[2]-ux*.13),
                          (stem[0]+uz*.09,stem[1]+.06,stem[2]-ux*.09)]
                for leaf in (vertices,list(reversed(vertices))):b.face(leaf,'HK_Leaf',False,pigment=color)

