"""Compile the project's procedural authors into editable native three.js construction recipes.

blender -b --factory-startup --python tools/build_native_models.py

No GLB is read or written. Boxes, bevels, cylinders, lofts and panels remain construction
operations; custom roofs, leaves and surveyed ground partitions remain polygon operations.
The Blender Python executable supplies mathutils for the existing authors, without running
their mesh/export step. The browser needs neither Blender nor these Python modules.
"""
import functools
import inspect
import json
import os
import subprocess
import sys
import random
import argparse

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import build_impressionist as art
import abstract_props
import streetscape
import moat_art
import road_network
import hikone_castle
import castle_approach
import university
import vegetation

OUT = os.path.join(ROOT, 'models')
os.makedirs(OUT, exist_ok=True)
# Building recipes must not rewrite the ground/map/editor data.
road_network.export_plan = lambda *args, **kwargs: None
random_tape = None
OriginalRandom = random.Random


class RecordedRandom(OriginalRandom):
    def random(self):
        value = super().random()
        if random_tape is not None:
            random_tape['values'].append(value)
        return value

    def _randbelow(self, n):
        value = super()._randbelow(n)
        if random_tape is not None:
            random_tape['choices'].append(value)
        return value


random.Random = RecordedRandom


def unity(p):
    return [-p[0], p[2], -p[1]]


class RecipeMesh(art.BrushMesh):
    def __init__(self, name):
        super().__init__(name)
        self.operations = []
        self.recording = False


def transform_matrix(transform):
    origin = np.array(transform((0, 0, 0)))
    matrix = np.eye(4)
    matrix[:3, :3] = np.array([np.array(transform(p)) - origin
                             for p in ((1, 0, 0), (0, 1, 0), (0, 0, 1))]).T
    matrix[:3, 3] = origin
    return matrix


def instrument(original, opcode):
    signature = inspect.signature(original)

    @functools.wraps(original)
    def record(b, *args, **kwargs):
        global random_tape
        if b.recording:
            return original(b, *args, **kwargs)
        bound = signature.bind(b, *args, **kwargs)
        bound.apply_defaults()
        params = dict(bound.arguments)
        del params['b']
        tape = dict(values=[], choices=[])
        previous_tape = random_tape
        if opcode in ('leaf_spray', 'tuft'):
            random_tape = tape
            params['distant'] = getattr(b, 'distant', False)
        transform = transform_matrix(params.pop('transform', abstract_props.identity))
        first_face, first_vertex = len(b.faces), len(b.vertices)
        b.recording = True
        try:
            result = original(b, *args, **kwargs)
        finally:
            b.recording = False
            random_tape = previous_tape
        if opcode in ('leaf_spray', 'tuft'):
            params['random'] = tape
        b.operations.append((opcode, params, transform, first_face, len(b.faces), first_vertex,
                             [unity(p) for p in b.vertices[first_vertex:]]))
        return result

    return record


# Update aliases imported by the authors too, so their construction intent is retained.
for module, name, opcode in [(abstract_props, name, name) for name in ('beveled_box', 'cylinder', 'loft', 'panel')] + [
        (vegetation, '_leaf_spray', 'leaf_spray'), (vegetation, '_tuft', 'tuft')]:
    original = getattr(module, name)
    replacement = instrument(original, opcode)
    for module in list(sys.modules.values()):
        if getattr(module, '__name__', '') == '__main__':
            continue
        if not (getattr(module, '__file__', '') or '').startswith(HERE):
            continue
        for key, value in list(vars(module).items()):
            if value is original:
                setattr(module, key, replacement)

art.BrushMesh = RecipeMesh
HOUSES = {'HK_Machiya_A': (7.2, 9, 5.5, 'A'), 'HK_Machiya_A_Narrow': (5.4, 9, 5.5, 'A'),
          'HK_Machiya_B': (6, 9, 6.1, 'B'), 'HK_Machiya_C': (8.4, 10, 6.5, 'C'),
          'HK_Kura': (6, 8, 6.2, 'K')}


def build(name, low):
    for module in (university, hikone_castle, castle_approach, streetscape):
        if name in module.MODELS:
            return module.build(name, RecipeMesh, lod=low)
    if name in road_network.MODELS:
        return road_network.build(name, RecipeMesh)
    if name in moat_art.MODELS:
        return moat_art.build(name, RecipeMesh, lod=low)
    if name in HOUSES:
        return art.house(name, *HOUSES[name])
    if name.startswith('HK_Tree_'):
        return art.tree(name, lod=low)
    if name in abstract_props.MODEL_NAMES:
        return abstract_props.build(name, RecipeMesh)
    raise ValueError('No procedural author for ' + name)


def clean(value):
    if isinstance(value, dict):
        return {key: clean(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, np.ndarray)):
        return [clean(item) for item in value]
    if isinstance(value, (float, np.floating)):
        return round(float(value), 7)
    if hasattr(value, 'to_tuple'):
        return clean(value.to_tuple())
    return value


def recipe(b, low):
    extrema = set()
    if low:
        for axis in range(3):
            extrema.add(min(range(len(b.vertices)), key=lambda i: b.vertices[i][axis]))
            extrema.add(max(range(len(b.vertices)), key=lambda i: b.vertices[i][axis]))
    selected = {i for i, detail in enumerate(b.details)
                if not low or not detail or detail % 16 == 0 or extrema.intersection(b.faces[i])}
    operations = {}
    for opcode, params, transform, start, end, vertex, before in b.operations:
        if not before or not all(i in selected for i in range(start, end)):
            continue
        # Authors can place/rotate whole sections after construction. Retain that placement
        # as an affine matrix, rather than flattening the primitive into copied vertices.
        source = np.array([p + [1] for p in before])
        after = np.array([unity(p) for p in b.vertices[vertex:vertex + len(before)]])
        post, _, _, _ = np.linalg.lstsq(source, after, rcond=None)
        if np.max(np.abs(source @ post - after)) > 0.0001:
            continue
        placement = np.eye(4)
        placement[:3, :] = post.T
        placement = placement @ transform
        material = b.materials[b.slots[start]]
        tones = [list(reversed(b.pigments[i])) if isinstance(b.pigments[i][0], (tuple, list))
                 else b.pigments[i] for i in range(start, end)]
        smooth = [b.smooth[i] for i in range(start, end)]
        if opcode in ('leaf_spray', 'tuft'):
            tones, smooth = None, None
        operations[start] = (end, [opcode, material, params, tones, smooth, placement.tolist()])
    commands = []
    i = 0
    while i < len(b.faces):
        if i in operations:
            end, command = operations[i]
            commands.append(command)
            i = end
            continue
        if i in selected:
            pigment = b.pigments[i]
            if isinstance(pigment[0], (tuple, list)):
                pigment = list(reversed(pigment))
            commands.append(['face', b.materials[b.slots[i]], [unity(b.vertices[v]) for v in reversed(b.faces[i])],
                             pigment, b.smooth[i]])
        i += 1
    return clean(dict(format='hikone-native-model', version=1, name=b.name, commands=commands))


names = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', """
import fs from 'node:fs'; import {webLayout} from './src/world/generators/web-layout.js';
const layout=webLayout(JSON.parse(fs.readFileSync('data/layout.json')));
console.log(JSON.stringify([...new Set(layout.items.map(item=>item.a))]));
"""], cwd=ROOT, text=True))
names = sorted(set(names) | set(abstract_props.MODEL_NAMES) | {'ART_KeiBox'})
manifest = dict(format='hikone-native-models', version=1, materials=art.COLORS, models=names)
parser = argparse.ArgumentParser()
parser.add_argument('--only', nargs='+')
options = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
for name in names:
    if options.only and name not in options.only:
        continue
    for low in (False, True):
        b = build(name, low)
        program = recipe(b, low)
        file = name + ('.lod' if low else '') + '.json'
        with open(os.path.join(OUT, file), 'w') as stream:
            json.dump(program, stream, separators=(',', ':'))
            stream.write('\n')
    print('Native recipe:', name, flush=True)
with open(os.path.join(OUT, 'index.json'), 'w') as stream:
    json.dump(clean(manifest), stream, separators=(',', ':'))
    stream.write('\n')
subprocess.run(['node', os.path.join(HERE, 'pack_models.mjs')], cwd=ROOT, check=True)
