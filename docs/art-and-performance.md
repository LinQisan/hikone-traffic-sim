# Art and performance

How models are built and checked, and what the scene costs. Why: [RATIONALE.md](../RATIONALE.md). Geography: [geography.md](geography.md). The dated log of every art and measurement pass (180 KB) is in git at `f4cd136`; raw samples stay in [performance/](performance/).

## Native runtime

`models/` holds construction programs: bevelled boxes, closed cylinders, lofts, panels, parametric foliage and polygon boundaries. Three.js builds `BufferGeometry` in a bounded worker pool (`src/three/geometry/`), two workers on suitable desktops and one on touch devices, and transfers it to the main thread. No GLB is loaded at runtime. GLBs in `data/models/` are offline fixtures that Vite excludes from `dist/`.

New assets use `ModelBuilder` or a program with the same operations, in map metres. Procedural authors in `tools/` compile to programs with `blender -b --factory-startup --python tools/build_native_models.py`, which uses Blender's Python only; development, builds and playback need Node.js and npm. Foliage is the `leaf_spray` operation, so colour changes go through its `season` value, not a pigment tint.

`tools/pack_models.mjs` gzips programs without baking meshes. `models/runtime.json` selects content-addressed files in ignored `models/packed/`; Vite prepares them automatically, and browsers without `DecompressionStream` fall back to JSON. For standalone recipe work, run it before opening the page.

After a recipe or layout change, run `node tools/build_collision.mjs`. Collision and event sight lines use the same native geometry. Editor images are generated from the fixtures by `tools/build_editor_map.py`.

## Order of a geometry change

Roads and ground are read by later authors, so run:

1. `tools/build_impressionist.py -- --only …`, which writes GLBs, `road_tiles.json`, `map.json`, `walls.json` and editor images.
2. `tools/build_native_models.py -- --only …`.
3. `node tools/build_collision.mjs`.
4. The checks in [AGENTS.md](../AGENTS.md).

Blender exits 0 on a Python error, so stop on a `Traceback` in its log. A native rebuild of the big models takes about ten minutes.

## Look

The town is painted, not photographic: shader dabs on vertex pigments, cached brush textures and a painted sky. Materials are double-sided, so a hollow volume shows its inside; close every mesh. Moving things use `withBlobShadow`. Printed surfaces use non-emissive `ART_DisplayInk`, and text is triangulated offline through `HIKONE_JAPANESE_FONT`; check lettering from its reading side, as X is mirrored.

## Budget

- One `InstancedMesh` per asset and LOD, about 120 draws. Large ground is cut into cells of at most 128 m; `ENVIRONMENT_CELLS` chooses per-cell LOD, with a whole-region low silhouette when far.
- LOD switches at 60/52.8 m for ordinary assets and 24/21.12 m for repeated trees, measured from the bounding-sphere surface. Instance lists rebuild only after the view moves.
- The sun's shadow map holds still things only, drawn from the light LOD. View LOD never touches it, and it redraws when the shadow box re-centres (4 m).
- Dynamic resolution on desktop (DPR ≤1.25, ≤1.6 Mpx), no MSAA on phones; `?quality=high` fixes full resolution.
- Exploration flows stop departing at `maxCars` (14); encounter cars are admitted on top.
- GitHub's limits apply to deployment: each GLB under 100 MiB (file push limit) and the set under 1 GB (Pages site limit), checked in `test/art.test.mjs`. `dist/` itself must also stay under 1 GB.

Recent reference points, desktop Chrome at 1280×800: practice junction about 110 draws and 1.6 M triangles; scene buffers about 78 MB before the school island. All samples are capped near 16.7 ms and show no phone result.

The [northern pedestrian reconstruction](north-streetscape.md#rendering-cost) records its fixed-view A/B, including the extra geometry and resident buffers.

The [Saigo and south-promenade reconstruction](south-promenade.md) records the next photo-based pass, including sloped mesh maps and views beneath closed roof soffits.

## Startup

`?benchmark=1&quality=high&view=street` exposes `window.vrlearn.startup`. Add `&modelWorkers=1&modelEncoding=plain` for the baseline. On 2026-10-26, two workers plus gzip took first frame from 8.2–9.3 s to about 5.4 s on local delivery, and 21 s to 6.9 s with model bodies capped at 100 Mbps, with model responses 76% smaller. The cap is a controlled experiment, not a mobile network, and the scene has grown since. Earlier one-off samples did not reproduce; do not quote them.

## Measuring

Open `/?view=street&benchmark=1` (or `view=replay-bicycle`) at a fixed window size. It disables dynamic resolution and writes JSON to `#fps[data-benchmark]`. `vrlearn.benchmark.reset()` repeats the two-second warmup and eight-second sample on the same page.

Compare A/B on the same page, URL and camera, with frozen baseline programs and data, and nothing heavy running. Other rendering pages skew results. `geometryBytes` and `sceneBufferBytes` are geometry counters, not total memory. The loop follows the browser's animation callbacks with no 60 FPS cap. Absolute fps on one laptop is not evidence, and no real phone or headset has been measured.
