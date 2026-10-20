"""Bake the photographed case lettering into portable, flat pigment triangles.

Blender -b --factory-startup --python tools/build_display_lettering.py -- \
    --latin-font PATH --japanese-font PATH

Only the observed text outlines are saved, not fonts or photographic pixels.
Ordinary model rebuilds read the resulting JSON and need no installed fonts.
"""
import argparse
import json
import os
import sys

import bpy

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--latin-font', required=True)
parser.add_argument('--japanese-font', required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
fonts = {key: bpy.data.fonts.load(path) for key, path in
         (('latin', args.latin_font), ('japanese', args.japanese_font))}
lines = [('town', 'Hikone Castle Town', 'latin'), ('year', '2024年', 'japanese'),
         ('campaign', '彦根城を世界遺産に。', 'japanese')]
result = {'description': 'Flat outlines of the lettering visible in the owner-supplied display-case photo.',
          'lines': {}}
for key, text, font in lines:
    curve = bpy.data.curves.new(key, 'FONT')
    curve.body = text
    curve.font = fonts[font]
    curve.resolution_u = 2
    curve.fill_mode = 'BOTH'
    ob = bpy.data.objects.new(key, curve)
    bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.convert(target='MESH')
    mesh = bpy.context.object.data
    mesh.calc_loop_triangles()
    points = [v.co for v in mesh.vertices]
    lo = [min(p[i] for p in points) for i in range(2)]
    hi = [max(p[i] for p in points) for i in range(2)]
    result['lines'][key] = {'text': text,
        'points': [[round((p[i] - lo[i]) / (hi[i] - lo[i]), 6) for i in range(2)] for p in points],
        'triangles': [list(t.vertices) for t in mesh.loop_triangles]}
    bpy.data.objects.remove(bpy.context.object, do_unlink=True)
path = os.path.join(os.path.dirname(__file__), 'reference', 'display-case-lettering.json')
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, 'w') as f:
    json.dump(result, f, ensure_ascii=False, separators=(',', ':'))
    f.write('\n')
print('DISPLAY_LETTERING', {key: len(line['triangles']) for key, line in result['lines'].items()})
