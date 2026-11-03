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


def paper_lines(b,at,x,y,w,h,rows):
    """Column rhythm only. Unreadable source copy is never invented as text."""
    for i in range(rows):
        rect(b,at,x,y+h*i/rows,w*(.94 if i%4 else .72),.006,(.43,.48,.45),.390)


def board_content(b,at,d,width,height,kind):
    # 0972–0975: verified headings with original diagrams in place of photo pixels.
    x,y=-width*.47,-height*.45;w,h=width*.94,height*.90
    glazed=kind in ('bulletin','newspaper')
    rect(b,at,x,y,w,h,(.37,.58,.55) if glazed else (.94,.95,.91),.375)
    if glazed:
        rect(b,at,x,height*.34,w,height*.13,(.85,.89,.87),.385)
        label(b,at,'滋 賀 大 学',-width*.28,height*.365,width*.56,height*.075,DARK,.391)
        # Sliding glazing, a bottom runner, and restrained traces of faded paper.
        line(b,at,[(0,y),(0,height*.34)],.009,(.63,.72,.68),.392)
        line(b,at,[(x,y+.03),(x+w,y+.03)],.014,(.65,.72,.68),.392)
        if kind=='bulletin':
            rect(b,at,x+.05,height*.16,.58,.11,(.82,.85,.77),.386)
            label(b,at,'入札公告関係',x+.08,height*.18,.52,.065,DARK,.391)
            rect(b,at,.12,-.38,.34,.72,(.89,.90,.81),.386)
            label(b,at,'一般来学者の入構について',.14,.27,.30,.035,DARK,.391)
            paper_lines(b,at,.15,-.34,.27,.55,25)
            rect(b,at,.51,-.38,.40,.78,(.17,.50,.70),.386)
            label(b,at,'2019.5.31',.535,.31,.32,.065,(.94,.95,.88),.391)
            line(b,at,[(.87,.34),(.90,.34)],.008,(.94,.95,.88),.391)
            label(b,at,'キャンパス内',.53,.20,.36,.06,(.94,.95,.88),.391)
            ring=[(.71+.13*math.cos(i*math.tau/32),-.02+.13*math.sin(i*math.tau/32)) for i in range(33)]
            line(b,at,ring,.025,(.94,.95,.88),.391)
            line(b,at,[(.61,-.01),(.81,-.01)],.025,(.94,.95,.88),.391)
            line(b,at,[(.62,.08),(.80,-.11)],.03,(.94,.95,.88),.393)
            label(b,at,'全面禁煙',.53,-.29,.36,.08,(.94,.95,.88),.391)
        else:
            rect(b,at,.23,-.22,.45,.62,(.86,.89,.81),.386)
            label(b,at,'滋賀大学陵水新聞',.25,.34,.40,.04,DARK,.391)
            label(b,at,'滋賀大学七夕祭り',.25,.21,.4,.04,DARK,.391)
            for col in range(3):paper_lines(b,at,.25+col*.135,-.18,.12,.34,17)
            for xx,yy in ((.26,.26),(.40,.06),(.26,-.10)):
                rect(b,at,xx,yy,.11,.07,(.36,.57,.62),.391)
            # Three pale silhouette remnants at the bottom. Identities are not inferred.
            for u in (-.2,.22,.66):
                graphic(b,at,[(u-.07,-.39),(u+.07,-.39),(u+.08,-.25),(u+.04,-.18),
                              (u-.04,-.18),(u-.09,-.27)],(.79,.87,.79),.389)
    elif kind=='construction':
        label(b,at,'計画建築物の概要',x+.06,y+h-.14,w-.12,.085,DARK,.391)
        label(b,at,'彦根市中高層建築物指導要項',x+.06,y+h-.27,w-.12,.05,DARK,.391)
        rows=[('敷地面積','57,786.29 m2'),('建築面積','889.68 m2'),('延べ面積','2,196.45 m2'),
              ('用途','大学用建築物'),('構造','鉄筋コンクリート造'),('規模','地上3階 高さ11.75m'),
              ('工事予定','2025/6 - 2026/7')]
        row=(h-.4)/len(rows)
        for i,(key,value) in enumerate(rows):
            yy=y+h-.36-i*row
            line(b,at,[(x+.025,yy+.04),(x+w-.025,yy+.04)],.007,DARK,.389)
            label(b,at,key,x+.05,yy-row*.58,w*.27,.045,DARK,.391)
            label(b,at,value,x+w*.36,yy-row*.58,w*.59,.045,DARK,.391)
        line(b,at,[(x+w*.33,y+.03),(x+w*.33,y+h-.32)],.007,DARK,.389)
    elif kind=='project':
        # An original three-storey massing diagram, not a model of the unseen project.
        def picture(px,py,pw,ph):
            rect(b,at,px,py,pw,ph,(.63,.77,.82),.386)
            for i in range(3):
                yy=py+ph*(.12+i*.23)
                graphic(b,at,[(px+pw*.08,yy),(px+pw*.70,yy),(px+pw*.88,yy+ph*.10),
                              (px+pw*.26,yy+ph*.10)],(.36,.40,.39),.389)
                rect(b,at,px+pw*.09,yy-ph*.12,pw*.61,ph*.12,(.42,.48,.48),.390)
                for col in range(6):rect(b,at,px+pw*(.13+col*.09),yy-ph*.10,pw*.06,ph*.075,(.67,.79,.79),.392)
        picture(x+.03,y+h*.32,w*.65,h*.64)
        picture(x+.03,y+.03,w*.31,h*.25)
        picture(x+w*.37,y+.03,w*.31,h*.25)
        label(b,at,'データサイエンス',x+w*.71,y+h*.72,w*.27,.055,DARK,.391)
        label(b,at,'みらい創造館',x+w*.71,y+h*.60,w*.27,.055,DARK,.391)
        label(b,at,'2026年秋完成予定',x+w*.71,y+h*.30,w*.27,.04,DARK,.391)
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

