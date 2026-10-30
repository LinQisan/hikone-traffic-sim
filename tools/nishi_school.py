"""Nishi school gate/stone corner from owner photos 0855–0861, in the retained map frame."""
import json
import math
import os
import random
from functools import lru_cache

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BROWN = (.46, .34, .28)
METAL = (.56, .58, .54)
STONE = (.49, .52, .47)
INK = (.88, .85, .71)


@lru_cache(maxsize=1)
def data():
    with open(os.path.join(ROOT, 'world', 'nishi-frontage.json')) as f:
        return json.load(f)


def wall(b, item):
    from higashi_school import solid
    from east_extension import outward
    p = item['outline']
    top = item['height']
    center = (sum(x for x, z in p) / len(p), top / 2, sum(z for x, z in p) / len(p))
    solid(b, p, .01, top, 'HK_Stone', (.36, .39, .37))
    seed = int(item['osm'].split('/')[-1])
    rng = random.Random(seed)
    # The registered outline and height remain unchanged. Shallow irregular stone
    # faces express the photographed masonry without an invented wider wall batter.
    for a, c in zip(p, p[1:] + p[:1]):
        length = math.dist(a, c)
        if length < .2:
            continue
        ux, uz = (c[0] - a[0]) / length, (c[1] - a[1]) / length
        nx, nz = -uz, ux
        if nx * ((a[0]+c[0])/2-center[0]) + nz * ((a[1]+c[1])/2-center[2]) < 0:
            nx, nz = -nx, -nz
        rows = 4 if b.distant else 5
        for row in range(rows):
            y0, y1 = .03 + row * top / rows, (row + 1) * top / rows - .025
            count = max(1, round(length / (1.55 if b.distant else 1.15)))
            for i in range(count + 1):
                lo, hi = max(0, (i - .45*(row%2))/count), min(1, (i+1-.45*(row%2))/count)
                if hi-lo < .008:
                    continue
                l, r = lo*length+.016, hi*length-.016
                depth = .018 + rng.random() * .025
                at = lambda u,y,o: (a[0]+ux*u+nx*o,y,a[1]+uz*u+nz*o)
                points = [at(l,y0+.04,depth),at(r-.06,y0,depth),at(r,y0+.12,depth),
                          at(r-.04,y1-.07,depth),at(r-.15,y1,depth),at(l+.06,y1-.015,depth)]
                shade = rng.uniform(-.055,.055)
                outward(b, points, 'HK_Stone', center, tuple(v+shade for v in STONE))


def gate(b):
    from higashi_school import solid
    from abstract_props import cylinder
    from university_frontage import rect, label
    q = data()['gate']
    x,z = q['center'];w,h,p,d = q['width'],q['height'],q['pier'],q['depth']
    at = lambda u,y,o: (x+u,y,z-o)
    def block(u,width,lo,hi):
        solid(b,[(x-u-width/2,z-d/2),(x-u+width/2,z-d/2),
                 (x-u+width/2,z+d/2),(x-u-width/2,z+d/2)],lo,hi,'ART_Timber',BROWN)
    for side in (-1,1):
        block(side*(w-p)/2,p,.01,h)
    block(0,w,h-q['lintel'],h)
    # Closed return surfaces and a thin coping make the portal credible from behind.
    solid(b,[(x-w/2-.025,z-d/2-.025),(x+w/2+.025,z-d/2-.025),
             (x+w/2+.025,z+d/2+.025),(x-w/2-.025,z+d/2+.025)],h,h+.055,'ART_Timber',(.36,.30,.26))
    label(b,at,q['name'],-1.8,h-.37,3.6,.24,INK,d/2+.012)
    opening = w-2*p-.12
    for y in (.18,q['grilleHeight']):
        cylinder(b,at(-opening/2,y,.03),at(opening/2,y,.03),.035,'HK_MetalLight',segments=5)
    count = 17
    for i in range(count+1):
        u = -opening/2 + opening*i/count
        cylinder(b,at(u,.12,.03),at(u,q['grilleHeight'],.03),.018,'HK_MetalLight',segments=4)
        if i<count:
            v=u+opening/count
            cylinder(b,at(u,.25,.045),at(v,1.55,.045),.019,'HK_MetalLight',segments=4)
            cylinder(b,at(v,.25,.045),at(u,1.55,.045),.019,'HK_MetalLight',segments=4)
    for u in (-opening/2,0,opening/2):
        cylinder(b,at(u,.045,.015),at(u,.13,.015),.06,'ART_Timber',segments=6)
    # Side notice case: original diagram and linework, not unreadable real notices.
    bx,bz=data()['notice']['point']
    board=lambda u,y,o:(bx+u,y,bz-o)
    solid(b,[(bx-.72,bz-.08),(bx+.72,bz-.08),(bx+.72,bz+.08),(bx-.72,bz+.08)],.9,2.0,'ART_Timber',(.25,.29,.24))
    rect(b,board,-.67,.95,1.34,1.0,(.83,.85,.74),.09)
    rect(b,board,-.67,.95,1.34,.24,(.21,.42,.32),.10)
    label(b,board,'西中学校',-.53,1.72,1.05,.16,(.2,.28,.23),.11)
    for i in range(5):rect(b,board,-.52,1.52-i*.06,.85-(i%2)*.13,.018,(.4,.45,.4),.11)
    for u in (-.55,.55):cylinder(b,board(u,.01,0),board(u,.95,0),.045,'HK_MetalLight',segments=4)
    # The photographed right-hand planting bed has a low stone footing, not turf
    # extending into the street. Its estimated run stays behind the utility pole.
    edge=data()['gardenEdge']
    for a,c in zip(edge,edge[1:]):
        length=math.dist(a,c);nx,nz=-(c[1]-a[1])/length*.19,(c[0]-a[0])/length*.19
        solid(b,[(a[0]+nx,a[1]+nz),(c[0]+nx,c[1]+nz),(c[0]-nx,c[1]-nz),(a[0]-nx,a[1]-nz)],.01,.35,'HK_Stone',STONE)


def vegetation(b):
    from vegetation import tree, spray
    from field_photos import palm
    for i,q in enumerate(data()['trees']):
        x,z=q['point']
        tree(b,q['species'],(x,.15,z),q['height'],q['spread'],seed=8550+i,fine=False)
    q=data()['palm'];palm(b,*q['point'],q['height'])
    for i,(x,z) in enumerate([(-581,264.7),(-578,265.2),(-574,266.8),(-592,265.7)]):
        spray(b,(x,1.2,z),(2.2,2.2,2.1),i,'HK_LeafDark',8570+i,fine=False)


def fixtures(b):
    from abstract_props import cylinder
    from higashi_school import solid
    from university_frontage import graphic, rect, line
    q=data()['utilities'];x,z=q['pole'];h=q['height']
    cylinder(b,(x,.01,z),(x,h,z),.145,'ART_Concrete',segments=9,end_radius=.1)
    # Visible yellow/black collision sleeve, insulators and one compact transformer.
    cylinder(b,(x,.05,z),(x,1.15,z),.153,'HK_SignYellow',segments=10)
    for i in range(6):
        a=i*math.tau/6
        cylinder(b,(x+math.cos(a)*.151,.08,z+math.sin(a)*.151),
                 (x+math.cos(a)*.151,1.11,z+math.sin(a)*.151),.023,'ART_Timber',segments=4)
    for y in (7.9,9.3):
        cylinder(b,(x-1,y,z),(x+1,y,z),.055,'HK_MetalLight',segments=5)
        for u in (-.8,0,.8):cylinder(b,(x+u,y,z),(x+u,y+.29,z),.07,'ART_StoneLight',segments=6)
    cylinder(b,(x+.38,7.5,z),(x+.38,8.4,z),.25,'HK_MetalLight',segments=9)
    # Static cables remain above the public head/body corridor and have a shallow sag.
    from university import data as campus
    for end in [campus()['schoolDetail']['poles'][0]]:
        for offset in (-.24,0,.24):
            points=[(x+(end[0]-x)*i/8,9.59+.11*i/8-.45*4*(i/8)*(1-i/8),z+(end[1]-z)*i/8+offset) for i in range(9)]
            for a,c in zip(points,points[1:]):cylinder(b,a,c,.016,'ART_Chain',segments=3)
    x,z=q['lamp']
    points=[(x,.01,z),(x,4.5,z),(x+.12,5.1,z),(x+.45,5.6,z),(x+.95,5.85,z)]
    for a,c in zip(points,points[1:]):cylinder(b,a,c,.045,'HK_MetalLight',segments=6)
    solid(b,[(x+.8,z-.18),(x+1.25,z-.18),(x+1.25,z+.18),(x+.8,z+.18)],5.75,5.9,'HK_MetalLight',METAL)
    # Blue pedestrian/bicycle crossing sign observed on the western approach.
    x,z=q['pedestrianSign'];at=lambda u,y,o:(x-u,y,z-o)
    cylinder(b,(x,.01,z),(x,2.8,z),.045,'ART_StoneLight',segments=5)
    graphic(b,at,[(-.43,2.0),(.43,2.0),(0,2.78)],(.87,.88,.80),.04)
    graphic(b,at,[(-.36,2.04),(.36,2.04),(0,2.69)],(.18,.40,.61),.045)
    line(b,at,[(0,2.56),(-.05,2.34),(-.18,2.18)],.043,INK,.051)
    line(b,at,[(-.05,2.34),(.13,2.18)],.043,INK,.051)
    line(b,at,[(-.14,2.4),(.12,2.37)],.035,INK,.051)
    x,z=q['restrictionSign'];at=lambda u,y,o:(x+u,y,z-o)
    cylinder(b,(x,.01,z),(x,2.7,z),.04,'ART_StoneLight',segments=5)
    for r,color,o in ((.31,(.76,.22,.18),.04),(.26,(.89,.88,.78),.045)):
        graphic(b,at,[(r*math.cos(i*math.tau/24),2.4+r*math.sin(i*math.tau/24)) for i in range(24)],color,o)
    blue=(.18,.39,.57)
    # The full-resolution 0855 crop resolves truck + bus and the supplemental
    # timetable. These are photographed graphics, not a new driver restriction.
    graphic(b,at,[(-.18,2.46),(.18,2.46),(.17,2.54),(.09,2.54),(.09,2.59),(-.18,2.59)],blue,.05)
    rect(b,at,-.19,2.28,.38,.12,blue,.05)
    for u in (-.11,.11):
        rect(b,at,u-.025,2.24,.05,.045,blue,.052)
    for i in range(5):rect(b,at,-.15+i*.063,2.35,.045,.037,(.83,.85,.77),.055)
    line(b,at,[(-.24,2.63),(-.19,2.58)],.055,(.76,.22,.18),.06)
    line(b,at,[(-.04,2.44),(.02,2.39)],.055,(.76,.22,.18),.06)
    from university_frontage import label
    for y,height in ((1.87,.23),(1.49,.43),(.96,.58)):
        rect(b,at,-.28,y-height/2,.56,height,(.89,.89,.79),.04)
    for text,y,width in [('路線バスを除く',1.84,.49),('3月15日–5月15日',1.58,.50),('8–18',1.36,.32),
                         ('5月16日–10月31日',1.14,.51),('日曜・休日',.95,.45),('8–18',.74,.32)]:
        label(b,at,text,-width/2,y,width,.085,(.24,.29,.25),.055)


def cycle_symbols(b):
    from field_photos import data as observations
    from university_frontage import line
    road=observations()['schoolRoad']['points'];a,c=road[-2],road[-3]
    length=math.dist(a,c);ux,uz=(c[0]-a[0])/length,(c[1]-a[1])/length;nx,nz=-uz,ux
    x=-574.7;z=a[1]+(c[1]-a[1])*(x-a[0])/(c[0]-a[0])
    for side in (-1,1):
        # Two opposing bicycle symbols on the existing blue crossing band.
        at=lambda u,v,o:(x+ux*(-3.15+u)+nx*(side*2.15+v),.028+o,z+uz*(-3.15+u)+nz*(side*2.15+v))
        for cy in (-.24,.24):
            p=[(.14*math.cos(i*math.tau/14),cy+.14*math.sin(i*math.tau/14)) for i in range(15)]
            line(b,at,p,.025,INK,0)
        line(b,at,[(0,-.24),(.16,0),(0,.24),(0,-.24),(-.12,0),(.16,0)],.025,INK,0)
        line(b,at,[(0,.24),(-.10,.28),(-.12,.18)],.025,INK,0)


def build(b):
    for item in data()['walls']:
        wall(b,item)
    gate(b)
    vegetation(b)
    fixtures(b)
    cycle_symbols(b)
