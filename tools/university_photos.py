"""Local architectural details observed in the owner's IMG_0847–0854.HEIC.

All dimensions are visual estimates in the retained map frame, not a photogrammetric survey.
No source photograph, face or posted-document pixels are shipped. Existing footprint and
road authors remain authoritative. The later painted reference informs the native frontage
graphics in university_frontage.py; its readable labels remain distinct from invented notices.
"""
import math


# Consistent, restrained vertex pigments make the small architectural profiles legible.
PALETTE = {'ART_Plaster':(.88,.90,.85), 'ART_Patina':(.45,.63,.55),
           'ART_Window':(.42,.48,.49), 'ART_Joint':(.92,.93,.89), 'ART_StoneLight':(.81,.82,.77),
           'ART_Timber':(.25,.26,.24), 'HK_RoofTile':(.28,.29,.27),
           'HK_StoneDark':(.56,.56,.52), 'HK_MetalLight':(.65,.68,.66)}


def recolor(b, start):
    for k in range(start,len(b.faces)):
        tone=PALETTE.get(b.materials[b.slots[k]])
        if tone is not None:b.pigments[k]=tone


def framed_window(b, at, u0, u1, y0, y1, width=.055, columns=2, rows=3, frame='ART_StoneLight'):
    """A real frame proud of a dark pane, using an oriented facade coordinate function."""
    from streetscape import outward_face
    center=at((u0+u1)/2,(y0+y1)/2,-.1)
    outward_face(b,[at(u0,y0,.012),at(u1,y0,.012),at(u1,y1,.012),at(u0,y1,.012)],'ART_Window',center)
    def bar(u,y,v,yy,r):
        from abstract_props import cylinder
        cylinder(b,at(u,y,.04),at(v,yy,.04),r,frame,segments=4)
    for u in (u0,u1):bar(u,y0,u,y1,width)
    for y in (y0,y1):bar(u0,y,u1,y,width)
    if not b.distant:
        for i in range(1,columns):
            u=u0+(u1-u0)*i/columns;bar(u,y0,u,y1,width*.48)
        for j in range(1,rows):
            y=y0+(y1-y0)*j/rows;bar(u0,y,u1,y,width*.4)


def auditorium(b,item):
    from university import frame_point
    from streetscape import outward_face
    from abstract_props import cylinder
    first=len(b.faces)
    f=lambda u,y,v:frame_point(item,u,y,v)
    length=math.dist(item['footprint'][0],item['footprint'][1])
    depth=math.dist(item['footprint'][0],item['footprint'][3])
    top,rise=8.55,item['rise'];center=f(.5,4,.5)
    def face(points,material):outward_face(b,points,material,center)
    for side in (0,1):
        sign=side*2-1
        at=lambda u,y,o: f(u/length,y,side+sign*o/depth)
        face([f(0,.15,side),f(1,.15,side),f(1,top,side),f(0,top,side)],'ART_Joint')
        # Horizontal white clapboard and the mint corner/bay pilasters visible in 0853/0854.
        if not b.distant:
            for k in range(1,38):
                y=.3+k*.215
                face([at(0,y,.017),at(length,y,.017),at(length,y+.016,.017),at(0,y+.016,.017)],'ART_StoneLight')
        for i in range(1,9):
            u=length*i/9
            framed_window(b,at,u-.73,u+.73,3.45,7.65,columns=2,rows=5)
            framed_window(b,at,u-.73,u+.73,.85,2.1,columns=2,rows=2)
        for u in [0,length]+[length*i/9+1.26 for i in range(8)]:
            face([at(u-.095,.2,.055),at(u+.095,.2,.055),at(u+.095,top,.055),at(u-.095,top,.055)],'ART_Patina')
        for y in (2.65,top-.12):
            face([at(0,y,.06),at(length,y,.06),at(length,y+.11,.06),at(0,y+.11,.06)],'ART_Patina')
    for end in (0,1):
        face([f(end,.15,0),f(end,.15,1),f(end,top,1),f(end,top,0)],'ART_Joint')
        face([f(end,top,0),f(end,top,1),f(end,top+rise,.5)],'ART_Joint')
    # The observed front has two tall edge windows and a central row of three upper windows.
    # Its long glazed strips are divided by the horizontal sill band, not four full-height bays.
    at=lambda u,y,o:f(1+o/length,y,u/depth)
    for u in (depth*.13,depth*.87):
        framed_window(b,at,u-.58,u+.58,.85,2.12,columns=2,rows=2)
        framed_window(b,at,u-.58,u+.58,3.45,7.65,columns=2,rows=6)
    for u in (depth*.42,depth*.5,depth*.58):
        framed_window(b,at,u-.48,u+.48,5.55,7.65,columns=2,rows=3)
    for u in (.025,.24,.76,.975):
        face([at(u*depth-.11,.15,.06),at(u*depth+.11,.15,.06),at(u*depth+.11,top,.06),at(u*depth-.11,top,.06)],'ART_Patina')
    face([at(depth*.42,.15,.025),at(depth*.58,.15,.025),at(depth*.58,3.9,.025),at(depth*.42,3.9,.025)],'ART_Timber')
    for v in (.34,.66):
        a,c=f(1.025,.15,v),f(1.025,4.55,v)
        cylinder(b,a,c,.19,'ART_StoneLight',segments=8)
    face([f(1.05,4.25,.31),f(1.05,4.25,.69),f(1.05,4.67,.69),f(1.05,4.67,.31)],'ART_StoneLight')
    face([f(1.05,4.67,.31),f(.995,4.67,.31),f(.995,4.67,.69),f(1.05,4.67,.69)],'HK_RoofTile')
    # Circular gable window and stepped mint ring.
    cy=top+2.2
    disk=[at(depth*.5+.65*math.cos(i*math.tau/24),cy+.65*math.sin(i*math.tau/24),.04) for i in range(24)]
    face(disk,'ART_Window')
    for i in range(24):
        a,c=i*math.tau/24,(i+1)*math.tau/24
        face([at(depth*.5+r*math.cos(t),cy+r*math.sin(t),.065) for r,t in ((.65,a),(.65,c),(.82,c),(.82,a))],'ART_Patina')
    for side in (0,1):
        face([f(-.012,top,side),f(1.012,top,side),f(1.012,top+rise,.5),f(-.012,top+rise,.5)],'HK_RoofTile')
        cylinder(b,f(-.014,top-.05,side),f(1.014,top-.05,side),.09,'ART_Patina',segments=6)
        # Raised sheet seams follow the slope; they are omitted in the distant mesh.
        if not b.distant:
            for i in range(1,42):
                u=i/42
                cylinder(b,f(u,top+.035,side),f(u,top+rise+.035,.5),.018,'HK_RoofTile',segments=3)
    for end in (0,1):
        for side in (0,1):
            cylinder(b,f(end,top+.04,side),f(end,top+rise+.04,.5),.085,'ART_Patina',segments=5)
    # Three arched dormers on each long slope, seated into the actual roof plane.
    for side in (0,1):
        v=.16 if side==0 else .84
        back=.24 if side==0 else .76
        base=top+rise*.32
        for u in (.24,.47,.72):
            n=8 if not b.distant else 4
            front=[f(u+.023*math.cos(i*math.pi/n),base+1.05*math.sin(i*math.pi/n),v) for i in range(n+1)]
            rear=[f(u+.023*math.cos(i*math.pi/n),base+1.05*math.sin(i*math.pi/n),back) for i in range(n+1)]
            face(front,'ART_Patina')
            for a,c,e,g in zip(front,front[1:],rear,rear[1:]):face([a,c,g,e],'ART_Patina')
    # Glazed octagonal lantern: dark narrow panes, pale mint posts and a stepped cap.
    x,y,z=f(.8,top+rise,.5)
    n=12
    cylinder(b,(x,y,z),(x,y+.55,z),.76,'ART_Patina',segments=n)
    cylinder(b,(x,y+.55,z),(x,y+1.9,z),.68,'ART_Window',segments=n)
    for i in range(n):
        a=i*math.tau/n
        cylinder(b,(x+.69*math.cos(a),y+.55,z+.69*math.sin(a)),
                 (x+.69*math.cos(a),y+1.9,z+.69*math.sin(a)),.06,'ART_Patina',segments=4)
    for h,hh,r,rr in ((1.9,2.08,.8,.8),(2.08,2.38,.8,.65),(2.38,2.65,.65,.28),(2.65,2.72,.28,.06)):
        cylinder(b,(x,y+h,z),(x,y+hh,z),r,'ART_Patina',segments=n,end_radius=rr)
    recolor(b,first)


def gatehouse(b,footprint):
    from university import frame_point
    from streetscape import outward_face
    from abstract_props import cylinder
    first=len(b.faces);f=lambda u,y,v:frame_point({'footprint':footprint},u,y,v)
    center=f(.5,1.6,.5);length=math.dist(footprint[0],footprint[1]);depth=math.dist(footprint[0],footprint[3])
    for side in (0,1):
        outward_face(b,[f(0,.15,side),f(1,.15,side),f(1,2.95,side),f(0,2.95,side)],'ART_Plaster',center)
    for end in (0,1):
        outward_face(b,[f(end,.15,0),f(end,.15,1),f(end,2.95,1),f(end,2.95,0)],'ART_Plaster',center)
    # North service window faces the incoming gate traffic (0854), beneath deep hipped eaves.
    at=lambda u,y,o:f(-o/length,y,u/depth)
    for i in range(4):
        framed_window(b,at,.55+i*(depth-1.1)/4,.55+(i+1)*(depth-1.1)/4,.95,2.45,columns=1,rows=2,frame='ART_Timber')
    cylinder(b,at(.35,.88,.12),at(depth-.35,.88,.12),.09,'ART_Timber',segments=4)
    # White horizontal siding, dark sill, door, and a small notice pane; no copied notice text.
    if not b.distant:
        for k in range(1,13):
            y=.2+k*.2
            outward_face(b,[at(0,y,.015),at(depth,y,.015),at(depth,y+.015,.015),at(0,y+.015,.015)],'ART_StoneLight',center)
    left,right=f(.16,4,.5),f(.84,4,.5)
    a,c,d,e=[f(u,2.9,v) for u,v in ((-.08,-.14),(1.08,-.14),(1.08,1.14),(-.08,1.14))]
    for q in ([a,c,right,left],[d,e,left,right],[e,a,left],[c,d,right]):outward_face(b,q,'HK_RoofTile',center)
    if not b.distant:
        for v in [i/16 for i in range(17)]:
            cylinder(b,f(-.08,2.92,v),f(.16,4.02,.5),.012,'ART_Patina',segments=3)
    recolor(b,first)


def site_office(b,item):
    from university import frame_point,prism
    from streetscape import outward_face
    from abstract_props import cylinder
    first=len(b.faces);f=lambda u,y,v:frame_point(item,u,y,v);center=f(.5,3,.5)
    length=math.dist(item['footprint'][0],item['footprint'][1]);depth=math.dist(item['footprint'][0],item['footprint'][3])
    for side in (0,1):
        outward_face(b,[f(0,.15,side),f(1,.15,side),f(1,6.15,side),f(0,6.15,side)],'ART_Joint',center)
    for end in (0,1):
        outward_face(b,[f(end,.15,0),f(end,.15,1),f(end,6.15,1),f(end,6.15,0)],'ART_Joint',center)
        at=lambda u,y,o:f(end+(end*2-1)*o/length,y,u/depth)
        # 0976/0977: gallery toward the hall (south), blank street ends.
        # 0984: condensers on the opposite wall, rather than a second gallery.
        if end==1:
            for i in range(5):
                u=depth*(i+.5)/5
                for y in (.4,3.4):
                    framed_window(b,at,u-.78,u+.78,y,y+2.25,columns=2,rows=2,frame='HK_MetalLight')
        else:
            for u in (depth*.18,depth*.43,depth*.68,depth*.88):
                a=at(u,3.7,.22)
                b.box(a,(.78,.62,.38),'HK_MetalLight',False)
                for j in range(5):
                    yy=3.48+j*.09
                    outward_face(b,[at(u-.31,yy,.42),at(u+.31,yy,.42),
                                    at(u+.31,yy+.025,.42),at(u-.31,yy+.025,.42)],'ART_Window',center)
                cylinder(b,at(u+.32,3.6,.1),at(u+.32,5.7,.1),.025,'HK_MetalLight',segments=4)
        for y in (3.15,6.15):
            cylinder(b,at(0,y,.025),at(depth,y,.025),.06,'HK_MetalLight',segments=4)
        for i in range(9):
            u=depth*i/8
            cylinder(b,at(u,.2,.025),at(u,6.1,.025),.018,'HK_MetalLight',segments=3)
    outward_face(b,[f(-.035,6.2,-.02),f(1.035,6.2,-.02),f(1.035,6.2,1.02),f(-.035,6.2,1.02)],'HK_MetalLight',center)
    at=lambda u,y,o:f(1+o/length,y,u/depth)
    # Slabs include soffits and ends, so the gallery is solid from below.
    for lo,hi,outer in ((3.12,3.2,1.05),(6.18,6.24,1.2)):
        a,c=at(0,lo,outer/2),at(depth,lo,outer/2)
        prism(b,(a[0],a[2]),(c[0],c[2]),lo,hi,outer,'HK_MetalLight')
        outward_face(b,[at(0,lo,0),at(depth,lo,0),at(depth,lo,outer),at(0,lo,outer)],
                     'HK_MetalLight',at(depth/2,hi+.1,outer/2))
    for y in (4.2,3.7):
        cylinder(b,at(0,y,1.05),at(depth,y,1.05),.03,'HK_MetalLight',segments=4)
        for u in (0,depth):cylinder(b,at(u,y,0),at(u,y,1.05),.03,'HK_MetalLight',segments=4)
    for i in range(6):
        u=depth*i/5
        cylinder(b,at(u,.15,1.05),at(u,6.2,1.05),.04,'HK_MetalLight',segments=4)
    # Stair occupies the west bay on the hall side, clear of the building core.
    for i in range(15):
        u=depth-3.8+i*3.4/15;y=.18+i*.2
        a,c=at(u,y,.12),at(u,y,1.02)
        prism(b,(a[0],a[2]),(c[0],c[2]),y,y+.1,.25,'HK_MetalLight')
    for o in (.12,1.02):
        cylinder(b,at(depth-3.8,1.15,o),at(depth-.4,4.0,o),.035,'HK_MetalLight',segments=4)
    # Blue drinks machine at the blank street end (0976/0984).
    x,y,z=f(.48,.15,-.12)
    start=len(b.faces)
    b.box((x,y+.9,z),(.72,1.8,.7),'ART_DisplayInk',False)
    for k in range(start,len(b.faces)):b.pigments[k]=(.13,.23,.63)
    from university_frontage import rect,label
    front=lambda u,y,o:(x+u,y,z-o)
    rect(b,front,-.28,.7,.41,.8,(.75,.83,.83),.36)
    for row in range(3):
        for col in range(4):rect(b,front,-.25+col*.09,.82+row*.22,.05,.12,(.86,.77-row*.12,.57),.37)
    label(b,front,'Asahi',-.26,1.64,.53,.17,(.94,.94,.89),.375)
    recolor(b,first)


def gate_boards(b,d):
    """Observed entry furniture, checked against 0971–0977 and November 2022 Street View."""
    from university import prism
    from abstract_props import cylinder
    from streetscape import outward_face
    first=len(b.faces);entry=d['gateDetail']['entry'];gx,gz=entry['centre']
    nx,nz=entry['normal'];tx,tz=-nz,nx
    def at(t,y,o):return (gx+tx*t+nx*o,y,gz+tz*t+nz*o)
    from university_frontage import board_content, climber
    enclosures = {1:next(run['points'] for run in d['boundary'] if run['kind']=='palisadeWall'),
                  -1:next(run['points'][::-1] for run in d['boundary'] if run['kind']=='balustrade')}
    for q in d['gateDetail']['boards']:
        t,w,h,y,kind=[q[k] for k in ('along','width','height','center','kind')]
        board_at = lambda u,yy,o:at(t+u,yy,o)
        if abs(t) >= entry['halfSpacing']:
            side=1 if t>0 else -1;enclosure=enclosures[side]
            remaining = abs(t)-entry['halfSpacing']
            for a,c in zip(enclosure,enclosure[1:]):
                span = math.dist(a,c)
                if remaining <= span:
                    dx,dz=(c[0]-a[0])/span,(c[1]-a[1])/span
                    px,pz=a[0]+dx*remaining,a[1]+dz*remaining
                    dx,dz=dx*side,dz*side
                    board_at = lambda u,yy,o:(px+dx*u+dz*o,yy,pz+dz*u-dx*o)
                    break
                remaining -= span
        for u in (-w*.42,w*.42):
            cylinder(b,board_at(u,.01,.32),board_at(u,y+h*.5+.05,.32),.035,'HK_MetalLight',segments=4)
        left,right=board_at(-w*.5,y-h*.5,.32),board_at(w*.5,y-h*.5,.32)
        prism(b,(left[0],left[2]),(right[0],right[2]),y-h*.5,y+h*.5,.09,'HK_MetalLight')
        board_content(b,lambda u,yy,o:board_at(u,y+yy,o),d,w,h,kind)
    # The north gate leaf is folded against the enclosure; its centre stays fully open.
    for t in (-4.0,4.0):
        for i in range(6):
            o=-.2-i*.25
            cylinder(b,at(t,.01,o),at(t,1.9,o),.035,'ART_Timber',segments=4)
        for y in (.3,1.65):cylinder(b,at(t,y,-.2),at(t,y,-1.5),.045,'ART_Timber',segments=4)
    # Flush paving marks the tactile entry strips; no collider or step crosses the opening.
    for t in (-3.55,3.55):
        p=[at(t+u,.023,o) for u,o in ((-.15,.35),(.15,.35),(.15,-2.2),(-.15,-2.2))]
        outward_face(b,p,'ART_Tactile',(gx,0,gz))
    # Reference foliage climbs the retained pole and a close campus-side guy.
    climber(b,d)
    recolor(b,first)


def gate_trees(b,d):
    """Keep the photographed open view toward the hall; the tall trees are south of it."""
    from vegetation import tree,spray
    from abstract_props import cylinder
    for i,item in enumerate(d['gateDetail']['trees']):
        x,z=item['point'];height,spread=item['height'],item['spread']
        if item['form']=='spreading':
            tree(b,'cedar',base=(x,.15,z),height=height,spread=spread,seed=7310+i,fine=not b.distant)
        else:
            cylinder(b,(x,.15,z),(x,height,z),.24,'HK_Bark',segments=7,end_radius=.055)
            # Overlapping narrow sprays give a continuous cypress outline, rather than
            # separate large blobs on exposed branches. Branch sizes taper toward the tip.
            for level in range(10):
                h=1.5+(height-2)*level/10;r=spread*(1-level/11)**.65
                for j in range(4):
                    angle=j*math.tau/4+level*1.9+i
                    spray(b,(x+math.cos(angle)*r*.38,h,z+math.sin(angle)*r*.38),
                          (r*.64,1.1,r*.58),angle,'HK_LeafDark',7400+i*97+level*4+j,not b.distant)


# The closest north-side facades in 0847, matched by their order along the mapped lane.
# The exact address/height cannot be recovered from one oblique photo. Only the visible
# facade treatment is estimated; OSM footprint/height metadata remain untouched.
ALLEY_PROFILES={'way/1409173491':'tile', 'way/1409173492':'siding', 'way/1409173493':'timber'}


def alley_wall(b,item,a,c,eave,inside):
    """Replace the generic south-facing window band on three existing mapped buildings."""
    profile=ALLEY_PROFILES.get(item['id'])
    if not profile or abs(c[0]-a[0])<abs(c[1]-a[1])*2 or (a[1]+c[1])/2>150:return False
    # This is the street-facing edge only, never a wall on the back of a neighbour.
    ring=item['outlines'][0]
    if (a[1]+c[1])/2>sum(q[1] for q in ring)/len(ring):return False
    from streetscape import outward_face
    from abstract_props import cylinder
    length=math.dist(a,c);ux,uz=(c[0]-a[0])/length,(c[1]-a[1])/length
    sign=-1 if (c[0]-a[0])>0 else 1;nx,nz=-uz*sign,ux*sign
    at=lambda u,y,o:(a[0]+ux*u+nx*o,y,a[1]+uz*u+nz*o)
    first=len(b.faces)
    color=(.82,.81,.75) if profile=='tile' else (.70,.68,.56) if profile=='siding' else (.40,.37,.30)
    outward_face(b,[at(0,.15,0),at(length,.15,0),at(length,eave,0),at(0,eave,0)],'ART_Plaster',inside)
    b.pigments[-1]=color
    if not b.distant:
        # Shallow geometric joints and siding share the facade plane; no image texture.
        for i in range(1,int((eave-.2)/.24)):
            y=.2+i*.24
            outward_face(b,[at(0,y,.012),at(length,y,.012),at(length,y+.012,.012),at(0,y+.012,.012)],'ART_Joint',inside)
    for u in (length*.25,length*.72):
        framed_window(b,at,u-.6,u+.6,4.1,5.45,columns=2,rows=2,frame='ART_Timber')
    # Ground entry and compact upper balcony.
    outward_face(b,[at(length*.38,.15,.02),at(length*.59,.15,.02),at(length*.59,2.35,.02),at(length*.38,2.35,.02)],'ART_Timber',inside)
    if profile!='tile':
        for y in (.2,2.45):cylinder(b,at(.25,y,.35),at(length-.25,y,.35),.065,'HK_RoofTile',segments=4)
        for y in (3.5,4.25):cylinder(b,at(length*.1,y,.45),at(length*.45,y,.45),.04,'ART_Timber',segments=4)
        if not b.distant:
            for i in range(7):
                u=length*(.1+.35*i/6);cylinder(b,at(u,3.5,.45),at(u,4.25,.45),.025,'ART_Timber',segments=4)
    # These profiles do not create new walk-surface authority.
    recolor(b,first+1)
    return True


def alley_street(b,source):
    """Photo 0847's narrow drains and concrete utility pole beside the mapped lane.

    Drain widths/pole placement are visual estimates. Lines are decorative spans, not a
    claim about the utility network. Nothing changes the road surface or traffic rules.
    """
    from road_network import strip,face
    from abstract_props import cylinder
    road=next(r for r in source['roads'] if r['id']=='way/122757607')
    a,c=road['points'][-2:]
    def point(x):return (x,a[1]+(c[1]-a[1])*(x-a[0])/(c[0]-a[0]))
    line=[point(-672),point(-599)]
    for side in (-1,1):
        for q in strip(line,side*1.79,side*1.95):face(b,q,.023,'ART_Concrete',False)
    # A compact grate at the lane mouth, flush with the retained street datum.
    x,z=point(-602)
    for j in range(7):
        b.box((x-.35+j*.1,.028,z+1.85),(.035,.018,.16),'ART_Drain',False)
    # This observed pole is outside the existing house envelope and body corridor.
    x,z=-651.55,147.1
    cylinder(b,(x,.15,z),(x,9.4,z),.14,'HK_MetalLight',segments=8,end_radius=.10)
    for j in range(8):
        cylinder(b,(x,.2+j*.12,z),(x,.2+(j+1)*.12,z),.145,
                 'HK_SignYellow' if j%2 else 'ART_Timber',segments=8)
    for y in (7.2,8.4):
        cylinder(b,(x-.9,y,z),(x+.9,y,z),.045,'HK_Metal',segments=4)
        for u in (-.7,0,.7):cylinder(b,(x+u,y,z),(x+u,y+.16,z),.065,'ART_StoneLight',segments=6)
    cylinder(b,(x+.26,6.8,z),(x+.26,7.7,z),.26,'HK_MetalLight',segments=8)
    from university import data as campus_data
    west,east=campus_data()['detail']['poles'][-2:]
    for offset in (-.6,0,.6):
        # Reuse the existing authored utility supports at both ends, rather than
        # terminating new spans in mid-air above the street junction.
        for left,right,lo,hi in ((west,(x,z),9.72,8.6),((x,z),east,8.6,9.72)):
            pts=[(left[0]+(right[0]-left[0])*t,lo+(hi-lo)*t-.55*4*t*(1-t),
                  left[1]+(right[1]-left[1])*t+offset) for t in [i/10 for i in range(11)]]
            for p,q in zip(pts,pts[1:]):cylinder(b,p,q,.014,'ART_Timber',segments=3)
