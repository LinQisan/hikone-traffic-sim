"""Store GLB normals and vertex colours as normalized bytes (KHR_mesh_quantization).

The browser merges every asset into byte normals and byte pigments anyway
(src/environment-instances.js mergeParts, src/geometry-budget.js packPigments), so
float32 normals/colours only cost download and parse time. Positions and indices stay
exact. Idempotent: already quantized attributes are left alone.

    python3 tools/quantize_glb.py data/models/impressionist/*.glb
"""
import json
import math
import struct
import sys

FLOAT, BYTE, UNSIGNED_BYTE = 5126, 5120, 5121
SIZE = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
COMPONENTS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
EXTENSION = 'KHR_mesh_quantization'


def read_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, version, length = struct.unpack_from('<III', data, 0)
    assert magic == 0x46546C67 and version == 2 and length == len(data), path
    json_length, json_type = struct.unpack_from('<II', data, 12)
    assert json_type == 0x4E4F534A
    gltf = json.loads(data[20:20 + json_length])
    offset = 20 + json_length
    binary = b''
    if offset < len(data):
        bin_length, bin_type = struct.unpack_from('<II', data, offset)
        assert bin_type == 0x004E4942
        binary = data[offset + 8:offset + 8 + bin_length]
    return gltf, binary


def write_glb(path, gltf, binary):
    text = json.dumps(gltf, separators=(',', ':')).encode()
    text += b' ' * (-len(text) % 4)
    binary += b'\0' * (-len(binary) % 4)
    chunks = struct.pack('<II', len(text), 0x4E4F534A) + text
    if binary:
        chunks += struct.pack('<II', len(binary), 0x004E4942) + binary
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, 12 + len(chunks)) + chunks)


def floats(gltf, binary, accessor):
    view = gltf['bufferViews'][accessor['bufferView']]
    n = COMPONENTS[accessor['type']]
    stride = view.get('byteStride', 4 * n)
    start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    return [struct.unpack_from('<%df' % n, binary, start + i * stride) for i in range(accessor['count'])]


def quantize(path):
    gltf, binary = read_glb(path)
    targets = {}
    for mesh in gltf.get('meshes', []):
        for primitive in mesh['primitives']:
            for name in ('NORMAL', 'COLOR_0'):
                index = primitive['attributes'].get(name)
                if index is not None and gltf['accessors'][index]['componentType'] == FLOAT:
                    targets[index] = name
    if not targets:
        return 0
    # Each target accessor must own its buffer view (Blender's exporter does); then its
    # floats are replaced by a new, 4-byte-strided byte view and the old view is dropped.
    owners = {}
    for i, accessor in enumerate(gltf['accessors']):
        owners.setdefault(accessor.get('bufferView'), []).append(i)
    for index in targets:
        assert owners[gltf['accessors'][index]['bufferView']] == [index], path
    views, out, remap = [], bytearray(), {}

    def add_view(data, view=None, stride=None, target=None):
        out.extend(b'\0' * (-len(out) % 4))
        new = {'buffer': 0, 'byteOffset': len(out), 'byteLength': len(data)}
        if view:
            new.update({k: v for k, v in view.items() if k in ('byteStride', 'target', 'name')})
        if stride:
            new['byteStride'] = stride
        if target:
            new['target'] = target
        out.extend(data)
        views.append(new)
        return len(views) - 1

    for v, view in enumerate(gltf['bufferViews']):
        accessors = owners.get(v, [])
        if accessors and all(a in targets for a in accessors):
            continue
        start = view.get('byteOffset', 0)
        remap[v] = add_view(binary[start:start + view['byteLength']], view)
    for index, name in targets.items():
        accessor = gltf['accessors'][index]
        values = floats(gltf, binary, accessor)
        packed = bytearray()
        for value in values:
            if name == 'NORMAL':
                length = math.sqrt(sum(c * c for c in value)) or 1
                q = [max(-127, min(127, round(c / length * 127))) for c in value]
                packed += struct.pack('<4b', *q, 0)
            else:
                q = [max(0, min(255, round(c * 255))) for c in value[:3]]
                alpha = max(0, min(255, round(value[3] * 255))) if len(value) > 3 else 255
                packed += struct.pack('<4B', *q, alpha) if len(value) > 3 else struct.pack('<4B', *q, 0)
        remap[('new', index)] = add_view(bytes(packed), stride=4, target=34962)
        accessor.update(componentType=BYTE if name == 'NORMAL' else UNSIGNED_BYTE, normalized=True,
                        byteOffset=0)
        accessor.pop('min', None)
        accessor.pop('max', None)
    for i, accessor in enumerate(gltf['accessors']):
        if 'bufferView' in accessor:
            accessor['bufferView'] = remap[('new', i)] if i in targets else remap[accessor['bufferView']]
    gltf['bufferViews'] = views
    gltf['buffers'] = [{'byteLength': len(out) + (-len(out) % 4)}]
    for key in ('extensionsUsed', 'extensionsRequired'):
        if EXTENSION not in gltf.setdefault(key, []):
            gltf[key].append(EXTENSION)
    before = len(binary)
    write_glb(path, gltf, bytes(out))
    return before - len(out)


def update_manifest(paths):
    """Keep manifest.json's recorded sizes (high and .lod) in step with re-encoded files."""
    import os
    for folder in {os.path.dirname(os.path.abspath(p)) for p in paths}:
        manifest_path = os.path.join(folder, 'manifest.json')
        if not os.path.exists(manifest_path):
            continue
        with open(manifest_path) as f:
            manifest = json.load(f)
        for name, entry in manifest['models'].items():
            high, low = os.path.join(folder, name + '.glb'), os.path.join(folder, name + '.lod.glb')
            if os.path.exists(high):
                entry['bytes'] = os.path.getsize(high)
            if 'lod' in entry and os.path.exists(low):
                entry['lod']['bytes'] = os.path.getsize(low)
        with open(manifest_path, 'w') as f:
            json.dump(manifest, f, indent=2)


if __name__ == '__main__':
    saved = 0
    for path in sys.argv[1:]:
        saved += quantize(path)
    update_manifest(sys.argv[1:])
    print('quantized %d files, %.1f MB smaller' % (len(sys.argv) - 1, saved / 1e6))
