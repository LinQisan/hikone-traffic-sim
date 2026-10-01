"""Builds every Hikone model with the VRLearn generators and writes it as .glb for the web port.

Run with Blender (4.x):
    Blender -b --factory-startup --python tools/export_models.py
VRLEARN_ROOT points at the Unity project (default: ../VRLearn next to this folder).

The generators author in Unity coordinates and write Blender vertices as (-x, -z, y) (see
hk_lib.U); Blender's glTF export turns that into (-x, y, z). The web port therefore maps Unity
world coordinates to three.js as (-x, y, z) and negates yaw, which keeps models and placements
consistent (src/coords.js).

Besides the project's models this adds web-only ones: a Japanese sedan (the Unity car prefabs use
a third-party model that is not redistributed here). The traffic signals are not models: the
Unity exporter writes their scene meshes into scene.json (signalMeshes).
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.dirname(HERE)
ROOT = os.environ.get("VRLEARN_ROOT") or os.path.join(os.path.dirname(WEB), "VRLearn")
OUT = os.path.join(WEB, "data", "models")
sys.path.insert(0, os.path.join(ROOT, "Art", "Hikone"))

import bpy  # noqa: E402
import hk_lib  # noqa: E402

# the generators read their geometry sources from the project
hk_lib.ROOT = ROOT
hk_lib.MODEL_DIR = OUT
hk_lib.TEX_DIR = os.path.join(ROOT, "Assets", "_Project", "Hikone", "Textures")
import hk_assets  # noqa: E402
from hk_lib import MB, clear_asset  # noqa: E402

os.makedirs(OUT, exist_ok=True)
written = []


def export_glb(ob, spacing_index=0):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    loc = ob.location.copy()
    ob.location = (0, 0, 0)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, ob.name + ".glb"), use_selection=True,
                              export_format="GLB", export_yup=True, export_apply=True,
                              export_materials="EXPORT", export_texcoords=True, export_normals=True)
    ob.location = loc
    written.append(ob.name)


# ------------------------------------------------------------------ web-only models
def sedan():
    """Japanese compact sedan (Corolla / Prius class): 4.6 x 1.76 x 1.45 m, front at +z."""
    name = "WEB_Sedan"
    clear_asset(name)
    b = MB(name)
    L, W, r, wb = 4.6, 1.76, 0.31, 2.7
    hw = W / 2
    profile = [(-2.28, 0.3), (2.25, 0.3), (2.3, 0.55), (2.24, 0.78), (1.1, 0.95), (0.35, 1.42), (-0.55, 1.45),
               (-1.55, 1.28), (-2.2, 1.02), (-2.3, 0.7)]
    hk_assets._extrude_x(b, profile, -hw, hw, "HK_KeiPaint")
    ref = (0.0, 1.0, 0.0)
    for x in (-hw - 0.004, hw + 0.004):
        hk_assets._oface(b, [(x, 0.98, -1.75), (x, 0.98, 1.0), (x, 1.38, 0.38), (x, 1.4, -0.6), (x, 1.24, -1.5)], "HK_Glass", ref)
        hk_assets._oface(b, [(x * 1.001, 0.98, -0.28), (x * 1.001, 0.98, -0.2), (x * 1.001, 1.42, -0.2), (x * 1.001, 1.42, -0.28)], "HK_KeiPaint", ref)
        for z in (-0.25, 0.95):
            hk_assets._oface(b, [(x * 1.002, 0.36, z - 0.01), (x * 1.002, 0.36, z + 0.01), (x * 1.002, 0.95, z + 0.01), (x * 1.002, 0.95, z - 0.01)], "HK_Metal", ref)
    hk_assets._oface(b, [(-hw + 0.12, 0.99, 1.08), (hw - 0.12, 0.99, 1.08), (hw - 0.2, 1.39, 0.4), (-hw + 0.2, 1.39, 0.4)], "HK_Glass", ref)
    hk_assets._oface(b, [(-hw + 0.15, 1.04, -2.18), (hw - 0.15, 1.04, -2.18), (hw - 0.22, 1.25, -1.6), (-hw + 0.22, 1.25, -1.6)], "HK_Glass", ref)
    for sx in (-1, 1):
        b.box((sx * (hw - 0.3), 0.74, 2.24), (0.42, 0.12, 0.08), "HK_Lamp")
        b.box((sx * (hw - 0.22), 0.86, -2.27), (0.34, 0.14, 0.05), "HK_SignRed")
        b.box((sx * (hw + 0.08), 1.02, 0.85), (0.16, 0.11, 0.08), "HK_KeiPaint")
    b.box((0, 0.5, 2.27), (0.33, 0.165, 0.02), "HK_WhitePaint")   # white plate: an ordinary car
    b.box((0, 0.62, -2.28), (0.33, 0.165, 0.02), "HK_WhitePaint")
    b.box((0, 0.5, 2.28), (0.8, 0.12, 0.02), "HK_Metal")
    b.box((0, 0.22, 0), (W - 0.3, 0.14, L - 0.6), "HK_Metal", bottom=True)
    for sx in (-1, 1):
        for zz in (wb / 2, -wb / 2):
            hk_assets._wheel_x(b, sx * (hw - 0.1), r, zz, r, 0.2)
    return b.finish()


hk_assets.export = export_glb
hk_assets.build_all()
export_glb(sedan())
print("WEB_EXPORTED", len(written), " ".join(sorted(written)))
