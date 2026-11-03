"""Round gate postbox, authored from private IMG_0967/0968 without image textures.

Dimensions and paint wear are estimates. Paper labels show layout only, not collection
times or contact details. Both mesh recipes retain the slot, lettering and collection door.
"""
import math


def postbox(b, point, normal):
    from abstract_props import cylinder, loft, beveled_box
    from streetscape import outward_face
    from university_frontage import graphic, rect, label, line
    x,z=point;nx,nz=normal;tx,tz=-nz,nx
    at=lambda u,y,o:(x+tx*u+nx*o,y,z+tz*u+nz*o)
    first=len(b.faces);segments=16 if b.distant else 32
    red='HK_SignRed';paint=(.98,.42,.12);white=(.96,.94,.86);dark=(.12,.10,.075)

    def lathe(profile,material):
        loft(b,[[(x+r*math.cos(i*math.tau/segments),y,z+r*math.sin(i*math.tau/segments))
                 for i in range(segments)] for y,r in profile],material)

    lathe([(.01,.28),(.12,.28),(.15,.245)],'HK_StoneDark')
    # Flared foot, body collars, overhanging shallow dome and the small casting knob.
    lathe([(.15,.23),(.18,.245),(.21,.235),(.24,.21),
           (.85,.21),(.88,.225),(.91,.225),(.94,.21),
           (1.31,.21),(1.34,.23),(1.37,.25),(1.40,.25),
           (1.415,.265),(1.44,.265),(1.49,.21),(1.535,.13),(1.56,.025)],red)
    cylinder(b,(x,1.555,z),(x,1.59,z),.018,red,segments=8)
    # Proud circular badge and cast rim. Its face stays in front of the cylinder.
    cylinder(b,at(0,1.11,.185),at(0,1.11,.25),.195,red,segments=segments)
    cylinder(b,at(0,1.11,.25),at(0,1.11,.258),.18,red,segments=segments)
    # Arched rain hood: a closed shell, with a visible underside above the dark slot.
    steps=8 if b.distant else 12
    arch=[(-.19+i*.38/steps,1.235+.09*math.sin(i*math.pi/steps)) for i in range(steps+1)]
    for a,c in zip(arch,arch[1:]):
        section=[a,c,(c[0],c[1]-.018),(a[0],a[1]-.018)]
        back=[at(*p,.245) for p in section]
        front=[at(u,y-.075*math.sin((u+.19)*math.pi/.38),.335) for u,y in section]
        inside=tuple(sum(p[i] for p in back+front)/8 for i in range(3))
        for points in (back,front):outward_face(b,points,red,inside)
        for i in range(4):
            j=(i+1)%4
            outward_face(b,[back[i],back[j],front[j],front[i]],red,inside)
    rect(b,at,-.126,1.205,.252,.032,dark,.263)
    # Postal mark, Japanese characters and POST are geometry, readable from the street.
    label(b,at,'郵',-.146,1.085,.084,.095,white,.269)
    label(b,at,'便',.065,1.085,.084,.095,white,.269)
    for u,y,w,h in ((-.052,1.161,.104,.015),(-.052,1.132,.104,.015),(-.008,1.087,.016,.055)):
        rect(b,at,u,y,w,h,white,.269)
    label(b,at,'POST',-.112,.994,.224,.057,white,.269)

    # Collection door: projecting frame, inset panel, rain lip, hinges, keyhole and label holder.
    # The symmetric solid uses a right-handed frame; graphic() orients its own fronts.
    solid=lambda p:at(-p[0],p[1],p[2])
    beveled_box(b,(0,.53,.218),(.28,.43,.065),red,.014,solid)
    rect(b,at,-.119,.343,.238,.373,(.18,.07,.03),.252)
    rect(b,at,-.114,.348,.228,.363,paint,.254)
    beveled_box(b,(0,.75,.245),(.31,.035,.14),red,.012,solid)
    for y in (.39,.65):cylinder(b,at(-.135,y,.252),at(-.135,y+.055,.252),.014,red,segments=6)
    graphic(b,at,[(-.060+.009*math.cos(i*math.tau/12),.438+.009*math.sin(i*math.tau/12)) for i in range(12)],dark,.257)
    rect(b,at,-.064,.421,.008,.016,dark,.258)
    rect(b,at,-.045,.374,.09,.033,dark,.257)
    for path in ([(-.05,.37),(-.05,.412),(.05,.412),(.05,.37)],[(-.05,.37),(.05,.37)]):
        line(b,at,path,.008,paint,.262)
    rect(b,at,-.035,.766,.07,.018,white,.317)

    # Paper labels wrap around the reader's left side of the round body.
    angle=-math.pi/3
    def paper(u,y,o):
        a=angle+u/.213
        return at(math.sin(a)*o,y,math.cos(a)*o)
    for y,h,w in ((.965,.31,.135),(.56,.16,.14)):
        for i in range(8):rect(b,paper,-w/2+w*i/8,y,w/8,h,white,.214)
        for row in range(1,5):
            for i in range(8):
                line(b,paper,[(-w*.44+w*.88*i/8,y+h*row/5),(-w*.44+w*.88*(i+1)/8,y+h*row/5)],.002,(.36,.36,.32),.215)
        line(b,paper,[(0,y+.01),(0,y+h-.01)],.002,(.36,.36,.32),.215)

    for k in range(first,len(b.faces)):
        if b.materials[b.slots[k]]==red:b.pigments[k]=paint
        elif b.materials[b.slots[k]]=='HK_StoneDark':b.pigments[k]=(.32,.31,.28)
    # Small cast-edge chips and dark collar seams; no per-stone relief or photo pixels.
    for y,r in ((.19,.246),(.89,.226),(1.39,.251)):
        for i in range(6 if b.distant else 12):
            a=i*math.tau/(6 if b.distant else 12)+y
            def chip(u,yy,o):
                angle=a+u/r
                return (x+math.cos(angle)*o,yy,z+math.sin(angle)*o)
            rect(b,chip,-.009,y,.018,.007,(.28,.15,.09),r+.001)
