"""IMG_0994: the earth foot, corner stair and spreading tree beside the mapped rampart.

Photo-relative dimensions in school-moat.json are estimates, not camera GPS placements.
The same triangles drive the visible earth and Ground; source wall outlines stay fixed.
"""
import math
import random
from functools import lru_cache


def data():
    from school_moat import observations
    return observations()['corner']


def stair():
    from road_network import strip
    q=data()['stair'];a,c=q['line'];n=q['steps']
    for i in range(n):
        line=[tuple(a[j]+(c[j]-a[j])*t/n for j in (0,1)) for t in (i,i+1)]
        yield strip(line,-q['width']/2,q['width']/2)[0],.01+(data()['crest']-.01)*(i+1)/n


@lru_cache(maxsize=1)
def surfaces():
    from road_network import ccw,triangulate
    from university import cut
    q=data();a,c=q['wall'];dx,dz=c[0]-a[0],c[1]-a[1]
    at=lambda x,o,y:(x,y,a[1]+dz*(x-a[0])/dx+o)
    result=[]
    def add(vertices):
        # Triangulate in the registered plan and retain the supplied heights.
        by_point={(p[0],p[2]):p for p in vertices}
        result.extend(tuple(by_point[tuple(p)] for p in t) for t in triangulate(ccw(list(by_point))))
    # The photographed mound covers the road face's lower stones. It stops beside the stair.
    rows=q['soilProfile']
    for (o,y),(v,h) in zip(rows,rows[1:]):
        add([at(a[0],o,y),at(q['soilEndX'],o,y),at(q['soilEndX'],v,h),at(a[0],v,h)])
        # Taper the end into the adjoining moat profile instead of exposing a vertical grass cut.
        add([at(a[0],o,y),at(a[0],v,h),at(a[0]+6,v,.15),at(a[0]+6,o,.15)])
    # The mapped wall crest supports the photographed trees and the stair landing.
    for ring in q['crestPlots']:
        add([(x,q['crest'],z) for x,z in ring])
    # Join the earlier moat profile before its former arbitrary terminal cut.
    from school_moat import sections
    end=sections()[-1]
    add([end[1],(a[0],q['crest'],a[1]),at(a[0],rows[-1][0],rows[-1][1]),end[3]])
    # A narrow tread strip is removed from soil before actual horizontal steps are inserted.
    steps=list(stair());cutters=[ccw(p) for p,y in steps]
    from school_moat import plane_height
    ground=[];previous=[]
    for t in result:
        outline=ccw([(v[0],v[2]) for v in t])
        for p in cut([outline],cutters+previous):
            for s in triangulate(ccw(p)):
                ground.append(tuple((x,plane_height(x,z,t),z) for x,z in s))
        previous.append(outline)
    for p,y in steps:
        ground.extend(tuple((x,y,z) for x,z in t) for t in triangulate(ccw(p)))
    return ground


def contains(x,z,ring):
    from road_network import ccw
    p=ccw(ring)
    return all((c[0]-a[0])*(z-a[1])-(c[1]-a[1])*(x-a[0])>=-.0001 for a,c in zip(p,p[1:]+p[:1]))


def stair_contains(x,z):
    return any(contains(x,z,p) for p,y in stair())


def crest_contains(x,z):
    # The wall cap alone is solid stone; the return's crest is earth and needs its lawn.
    return contains(x,z,data()['crestPlots'][0])


def details(b):
    from higashi_school import solid,frame
    from vegetation import tree,spray
    from school_moat import height
    q=data()
    # Closed step volumes support both the reading side and reverse view.
    for i,(p,y) in enumerate(stair()):
        solid(b,p,.01,y,'ART_Boulder',(.45+.015*(i%3),.46,.41))
    a,c=q['wall'];inside=(a[0],a[1]-10)
    length,at=frame(a,c,inside)
    # Two worn stone ledges are embedded into the slope, rather than hovering decals.
    if not b.distant:
        rng=random.Random(994)
        for o in (3.6,7.5):
            for u in range(2,int(length)-8,2):
                if rng.random()<.3:continue
                x,_,z=at(u+rng.uniform(-.6,.6),0,o+rng.uniform(-.4,.4));y=height(x,z);w=rng.uniform(.28,.65)
                solid(b,[(x-w,z-.15),(x+w,z-.15),(x+w*.9,z+.12),(x-w*.9,z+.12)],y-.10,y+.06,
                      'ART_Boulder',rng.choice(((.44,.45,.37),(.48,.47,.39),(.38,.41,.34))))
        # Leaf litter and exposed earth remain small painted shapes on the actual surface.
        from higashi_school import face
        for i in range(220):
            x=rng.uniform(q['soilEndX']+1,a[0]-1);z=a[1]+(c[1]-a[1])*(x-a[0])/(c[0]-a[0])+rng.uniform(.5,9.5)
            if stair_contains(x,z):continue
            y=height(x,z);r=rng.uniform(.035,.11)
            face(b,[(x-r,y+.003,z),(x,y+.003,z+r*.7),(x+r,y+.003,z),(x,y+.003,z-r*.7)],
                 'ART_Gravel',(x,y-1,z),rng.choice(((.50,.43,.28),(.39,.41,.28),(.62,.53,.32))))
    t=q['tree'];x,z=t['point']
    evergreen=getattr(b,'dense_evergreen',False);b.dense_evergreen=True
    tree(b,'tabu',(x,q['crest'],z),t['height'],t['spread'],seed=994,fine=True,lean=(.7,.1),root_depth=.3)
    b.dense_evergreen=evergreen
    # Opaque overlapping foliage joins the spreading limbs seen in 0994. Small gaps
    # remain between boughs, while the crown is a full volume from the reverse side.
    for i,(dx,dy,dz) in enumerate(((-3,.58,1),(3,.62,-1),(0,.67,2.5),(-2,.77,-2),(2,.81,1),(0,.9,0))):
        spray(b,(x+dx,q['crest']+t['height']*dy,z+dz),(3.4,2.0,3.2),i*1.3,'HK_LeafDeep',9940+i,False)
    pole(b)
    crest_details(b)


def crest_details(b):
    """0995: the utility pole and upright stone on the rampart top, behind the stone face."""
    from east_street import bar
    from nishi_school import data as nishi
    q=data()['crestPole'];x,z=q['point'];base,h=q['base'],q['height']
    bar(b,(x,base,z),(x,h,z),.14,(.62,.62,.57),'ART_Concrete',8)
    bar(b,(x-.8,h-.6,z),(x+.8,h-.6,z),.05,(.35,.36,.33),'ART_Joint',5)
    end=nishi()['utilities']['pole']
    for level in (h-.5,h-1.3):
        points=[(x+(end[0]-x)*i/8,level-.5*4*(i/8)*(1-i/8),z+(end[1]-z)*i/8) for i in range(9)]
        for a,c in zip(points,points[1:]):bar(b,a,c,.014,(.24,.25,.24),'ART_Joint',3)
    q=data()['stele'];x,z=q['point'];base,h,w=q['base'],q['height'],q['width']
    bar(b,(x,base,z),(x,base+h*.72,z),w/2,(.47,.46,.40),'ART_Boulder',6)
    bar(b,(x,base+h*.72,z),(x+.06,base+h,z),w/4,(.5,.49,.43),'ART_Boulder',6)


def pole(b):
    """Photo 0994's dark pole and low fire-hydrant plate, clear of the public road."""
    from east_street import bar
    from university_frontage import label
    from university import data as campus
    from nishi_school import data as nishi
    q=data()['pole'];x,z=q['point'];h=q['height']
    bar(b,(x,.01,z),(x,h,z),.13,(.27,.26,.24),'ART_Joint',8)
    bar(b,(x,.01,z),(x,.68,z),.143,(.72,.72,.66),'ART_Concrete',8)
    bar(b,(x,.72,z),(x,1.43,z),.143,(.92,.74,.22),'ART_Joint',12)
    for i in range(6):
        a=i*math.tau/6
        bar(b,(x+math.cos(a)*.142,.74,z+math.sin(a)*.142),(x+math.cos(a)*.142,1.41,z+math.sin(a)*.142),
            .022,(.22,.22,.21),'ART_Joint',4)
    bar(b,(x,h-.5,z),(x+1.3,h-.5,z),.045,(.35,.36,.33),'ART_Joint',5)
    for u in (.35,1.1):bar(b,(x+u,h-.5,z),(x+u,h-.2,z),.055,(.72,.72,.66),'ART_Concrete',6)
    bar(b,(x,1.75,z+.09),(x,1.75,z+.13),.25,(.89,.87,.79),'ART_DisplayInk',20)
    bar(b,(x,1.75,z+.13),(x,1.75,z+.15),.228,(.77,.16,.14),'ART_DisplayInk',20)
    label(b,lambda u,y,o:(x-u,y,z+o),'消火栓',-.205,1.69,.41,.125,(.97,.95,.87),.155)
    anchors=[nishi()['utilities']['pole'],campus()['schoolDetail']['poles'][0]]
    for end in anchors:
        for level in (h-.4,h-1.4):
            points=[(x+(end[0]-x)*i/8,level-.55*4*(i/8)*(1-i/8),z+(end[1]-z)*i/8) for i in range(9)]
            for a,c in zip(points,points[1:]):bar(b,a,c,.014,(.24,.25,.24),'ART_Joint',3)
