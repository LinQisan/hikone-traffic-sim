"""Render registered editor images from the browser's actual static GLBs and placements.

Run with Blender: blender -b --factory-startup --python tools/build_editor_map.py
The overview covers the collision world's full extent; a sharper image covers the practice area.
"""
import hashlib
import json
import math
import os
import subprocess
import bpy
from mathutils import Matrix

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
MODELS = os.path.join(DATA, 'models', 'impressionist')


def scene_sources():
    script = """
import fs from 'node:fs';
import {webLayout} from './src/world/generators/web-layout.js';
import {signalRigs} from './src/three/scene/signal-layout.js';
import {HIKONE_BOUNDS} from './src/simulation/core/scenario.ts';
import {CASTLE_SITE} from './src/world/generators/castle-layout.js';
import {UNIVERSITY_DATA} from './src/world/generators/university-layout.js';
console.log(JSON.stringify({items:webLayout(JSON.parse(fs.readFileSync('data/layout.json'))).items,
 practice:HIKONE_BOUNDS, signals:signalRigs().map((r,i)=>({name:'信号柱 '+(i+1),x:r.pole.x,z:r.pole.z,yaw:0})),
 places:[{name:'京橋',x:32,z:26},{name:'彦根城',x:CASTLE_SITE.x,z:CASTLE_SITE.z},
 {name:'滋賀大学',x:UNIVERSITY_DATA.forecourt[0],z:UNIVERSITY_DATA.forecourt[1]}]}));
"""
    return json.loads(subprocess.check_output(['node', '--input-type=module', '-e', script], cwd=ROOT))


def load_scene(source):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    assets = {}
    for item in source['items']:
        assets.setdefault(item['a'], []).append(item)
    revision = hashlib.sha256(json.dumps(source, sort_keys=True).encode())
    with open(__file__, 'rb') as f:
        revision.update(f.read())
    practice = source['practice']
    for asset, placements in assets.items():
        # Nearby roofs and crowns keep their full geometry; distant composites use their
        # exported low mesh, retaining their real outline instead of a guessed rectangle.
        near = any(practice['xMin'] - 30 <= p['p'][0] <= practice['xMax'] + 30
                   and practice['zMin'] - 30 <= p['p'][2] <= practice['zMax'] + 30 for p in placements)
        path = os.path.join(MODELS, asset + ('.glb' if near else '.lod.glb'))
        if not os.path.exists(path):
            path = os.path.join(MODELS, asset + '.glb')
        with open(path, 'rb') as f:
            revision.update(f.read())
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=path)
        imported = set(bpy.data.objects) - before
        parts = [(ob, ob.matrix_world.copy()) for ob in imported if ob.type == 'MESH']
        for item in placements:
            x, y, z = item['p']
            sx, sy, sz = item['s']
            # glTF import maps (-Unity X, height, Unity Z) to Blender (-X, -Z, height).
            transform = (Matrix.Translation((-x, -z, y))
                         @ Matrix.Rotation(-math.radians(item['r']), 4, 'Z')
                         @ Matrix.Diagonal((sx, sz, sy, 1)))
            for original, matrix in parts:
                ob = original.copy()
                ob.data = original.data
                ob.parent = None
                bpy.context.collection.objects.link(ob)
                ob.matrix_world = transform @ matrix
        for ob in imported:
            bpy.data.objects.remove(ob, do_unlink=True)
        print('EDITOR_MAP_ASSET', asset, len(placements), flush=True)
    return revision.hexdigest()[:16]


def render_image(filename, world, ppm):
    scene = bpy.context.scene
    width = round((world['xMax'] - world['xMin']) * ppm)
    height = round((world['zMax'] - world['zMin']) * ppm)
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    camera = scene.camera
    camera.location = (-(world['xMin'] + world['xMax']) / 2, -(world['zMin'] + world['zMax']) / 2, 2000)
    camera.data.ortho_scale = world['xMax'] - world['xMin']
    # A portrait practice rectangle still needs its horizontal span preserved.
    camera.data.sensor_fit = 'HORIZONTAL'
    scene.render.filepath = os.path.join(DATA, filename)
    bpy.ops.render.render(write_still=True)
    return dict(file=filename, world=world, pixelsPerMeter=ppm, imageWidth=width, imageHeight=height)


def main():
    source = scene_sources()
    revision = load_scene(source)
    with open(os.path.join(DATA, 'collision.json')) as f:
        collision = json.load(f)
    world = dict(xMin=collision['xMin'], zMin=collision['zMin'],
                 xMax=collision['xMin'] + collision['width'] * collision['cell'],
                 zMax=collision['zMin'] + collision['height'] * collision['cell'])
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.color_type = 'VERTEX'
    scene.display.shading.light = 'FLAT'
    scene.display.shading.show_shadows = False
    scene.display.shading.show_cavity = True
    scene.display.shading.cavity_type = 'WORLD'
    scene.display.shading.background_type = 'WORLD'
    scene.world.color = (0.28, 0.30, 0.27)
    scene.view_settings.view_transform = 'Standard'
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.image_settings.color_depth = '8'
    scene.render.image_settings.compression = 100
    scene.render.resolution_percentage = 100
    camera = bpy.data.cameras.new('EditorMapCamera')
    camera.type = 'ORTHO'
    camera.clip_end = 5000
    scene.camera = bpy.data.objects.new('EditorMapCamera', camera)
    bpy.context.collection.objects.link(scene.camera)
    scene.camera.rotation_euler = (0, 0, math.pi)
    overview = render_image('map.png', world, 2)
    detail = render_image('map-detail.png', source['practice'], 6)
    # Publish registration only after both image files have finished rendering.
    path = os.path.join(DATA, 'map.json')
    with open(path) as f:
        meta = json.load(f)
    meta.update(image='map.png', world=world, pixelsPerMeter=overview['pixelsPerMeter'],
                imageWidth=overview['imageWidth'], imageHeight=overview['imageHeight'],
                detail=detail, practiceWorld=source['practice'], places=source['places'],
                signals=source['signals'], imageRevision=revision,
                exportedFrom='tools/build_editor_map.py; orthographic projection of browser GLBs and placements')
    with open(path, 'w') as f:
        json.dump(meta, f, separators=(',', ':'))
    print('EDITOR_MAP_READY', json.dumps(dict(overview=overview, detail=detail, revision=revision)), flush=True)


if __name__ == '__main__':
    main()
