# Art and performance

How models are built and checked, and what the scene costs. Why: [RATIONALE.md](../RATIONALE.md). Geography: [geography.md](geography.md). Older logs and samples are in git only: the art log at `f4cd136`, raw samples before 2026-10-31 at `c8c6526` under `docs/performance/`. The current baseline is [performance/three-r187-20261031/](performance/three-r187-20261031/).

## Native runtime

`models/` holds construction programs: bevelled boxes, closed cylinders, lofts, panels, parametric foliage and polygon boundaries. The published site loads them baked: a bounded worker pool, two workers on suitable desktops and one on touch devices, decodes meshes and transfers them to the main thread. Three.js builds `BufferGeometry` from the program in the worker (`src/three/geometry/`) only when a browser cannot decode the baked file. No GLB is loaded at runtime. GLBs in `data/models/` are offline fixtures that Vite excludes from `dist/`.

New assets use `ModelBuilder` or a program with the same operations, in map metres. Procedural authors in `tools/` compile to programs with `blender -b --factory-startup --python tools/build_native_models.py`, which uses Blender's Python only; development, builds and playback need Node.js and npm. Foliage is the `leaf_spray` operation, so colour changes go through its `season` value, not a pigment tint.

`tools/pack_models.mjs` gzips programs and calls `tools/bake_models.mjs`, which runs each program once and stores the result as `<hash>.hkb`: positions quantised to 1/1024 m, meshopt-encoded and gzipped (`src/three/assets/baked-model.js`). The bake also adds the closure below and a `far` level simplified from low within 0.22 m (foliage to 45%), written as `<hash>-far.hkb` when it saves at least 30%. A part that would lose more than 10% of its surface, or 20% for foliage, stays as it is. `models/runtime.json` selects content-addressed files in ignored `models/packed/`, and `models/packed/bake-cache.json` keeps unchanged models from baking again; a change to the baking itself needs a new `BAKE_VERSION`. Vite prepares all this automatically, and browsers without `DecompressionStream` or `Worker` fall back to programs. For standalone recipe work, run it before opening the page.

Ground sheets are open surfaces, so a low sight line runs under a raised edge to the sky even though a top-down view shows no gap. `src/three/geometry/model-closure.js` hangs a riser under every open edge of a ground sheet, skipping brush strokes under 1 m²: 0.6 m, or 3 m for banks of grass, soil, sand or gravel beside water. This is baked geometry in every level; collision does not read it. A real hole between two sheets still needs fixing in its author. Offline ownership clipping also closes ground sheets at water seams. It excludes foliage, timber and roof materials; closing a clipped canopy to the moat datum would create a false stone wall.

After a recipe or layout change, run `node tools/build_collision.mjs`. Collision and event sight lines use the same native geometry. Editor images are generated from the fixtures by `tools/build_editor_map.py`.

## Order of a geometry change

Roads and ground are read by later authors, so `node tools/rebuild_models.mjs <model>…` runs, in order and stopping on the first failure:

1. `tools/build_impressionist.py -- --only …`, which writes GLBs, `road_tiles.json`, `map.json`, `walls.json` and editor images.
2. `tools/build_native_models.py -- --only …`.
3. `tools/pack_models.mjs`.
4. `tools/build_collision.mjs`, unless `--no-collision`.
5. `test/generated-data.test.mjs`, which rejects a truncated or NUL-damaged file.

Then run `npm run test:geometry` and the checks in [AGENTS.md](../AGENTS.md). Blender exits 0 on a Python error, so the tool reads its log for a `Traceback`. A native rebuild of the big models takes about ten minutes.

Road paint is its own model, `ART_RoadMarkings`, written by `node tools/build_road_markings.mjs` from [road-markings.ts](../src/world/generators/road-markings.ts) in under a second, with no Blender and no other model touched; it also writes the layer's reference GLBs. It holds lines, zebras, stop bars, arrows, diamonds, hatches, green margins and the main-road parking bays. Run the tool after any change to that file or `world/road-markings.json`, then the marking tests; a layout or centreline change it reads needs the tool too. Stencilled lettering and numerals, the campus and east forecourt parking marks and the court lines stay with their authors. Editor images pick up the layer at their next render.

One author can feed several models. Rebuild every model that holds the changed output:

| Edited author | Rebuild |
| --- | --- |
| `school_road.building` | `ART_WestMoat`, `ART_ShigaCampus` |
| `school_road.furniture`, `nishi_school` (through `field_photos`) | `ART_EastHikoneBuildings` |
| `school_road.masonry` (shared flat wall faces) | `ART_EastHikoneBuildings`, `ART_WestMoat`, `ART_InnerMoatStreet` |
| `university-layout`, `university_photos`, `university_frontage`, `campus_postbox` | `ART_ShigaCampus`, `ART_WestMoat`, Ground, collision and the editor atlas; retain the mapped source junction separately from the physical gate frame |
| `school_moat`, `nishi_rampart` | `ART_WestMoat`, Ground, collision and the editor atlas |
| `moat_street.build` | `ART_InnerMoatStreet` |
| `hill_wood` | `ART_HillWood` |
| Inner-moat road/bank layout or `castle_approach.hill_surface` | `ART_KyobashiRoads`, `ART_KyobashiLand`, `ART_KyobashiBanks`, `ART_KyobashiWater`, `ART_KyobashiBridge`, `ART_PavingDetails`, `ART_CastleApproach`, `HK_Terrain_Hikone`, `ART_HikoneCompound`, `ART_WestMoat`, `ART_ShigaCampus`, `ART_InnerMoatStreet`, `ART_EastHikoneSurface`, `ART_HillWood`; include overlapping East buildings after shared clipping changes, plus Ground, collision, atlas and road paint |
| Shared school/castle registrations in `geographic-registration.js` | `ART_ShigaCampus`, `ART_WestMoat`, `ART_EastHikoneBuildings`, `ART_HikoneCompound`, `HK_Terrain_Hikone`, `ART_HillWood`, `ART_CastleApproach` |

## Look

The town is painted, not photographic: shader dabs on vertex pigments, cached brush textures and a painted sky. Materials are double-sided, so a hollow volume shows its inside; close every mesh. Moving things use `withBlobShadow`. Printed surfaces use non-emissive `ART_DisplayInk`, and text is triangulated offline through `HIKONE_JAPANESE_FONT`; check lettering from its reading side, as X is mirrored.

Castle and moat walls use `ART_CastleStone`: flat faces retaining their authored batter, with one cached, repeating stone texture from `src/three/materials/stone-texture.ts`. Its pale warm/cool courses follow the Kyobashi wall style. World-space mapping keeps stone scale fixed across high, low and far models; mipmaps filter the joints at a distance. Stones and joints add no relief geometry. The texture is generated locally, uses no photograph and is disposed with the shared brush texture at engine teardown. The GLB fixtures keep neutral wall faces; their runtime stone texture is not embedded.

## Budget

- One `InstancedMesh` per asset and LOD, about 120 draws. Large ground is cut into cells of at most 128 m (192 m for the east assets); `ENVIRONMENT_CELLS` chooses per-cell LOD, with a whole-region low silhouette when far.
- Cells of one material share a `BatchedMesh` when the browser has multi-draw (`src/three/scene/cell-batches.js`). Logical cells keep their bounds and `.visible`; the batch reads them after LOD, and swaps them again for the shadow pass.
- LOD switches at 60/52.8 m for ordinary assets and 24/21.12 m for repeated trees, measured from the bounding-sphere surface; the far level starts at 200 m, or 110 m for trees. Small items cull by size at 400 m per metre, at least 160 m. `setDetail()` scales these distances: 0.75 on touch devices, and again by 0.75 when dynamic resolution falls below 0.7. Instance lists rebuild only after the view moves.
- `withAllLevels()` compiles and draws every level once before the menu, so a first sight of a level does not stall on a program or a buffer upload.
- The sun's shadow map holds still things only, drawn from the light LOD; trees cast from their far level. View LOD never touches it, and it redraws when the shadow box re-centres (4 m).
- Dynamic resolution on desktop (DPR ≤1.25, ≤1.6 Mpx), no MSAA on phones; `?quality=high` fixes full resolution.
- Exploration flows stop departing at `maxCars` (14); encounter cars are admitted on top.
- GitHub's limits apply to deployment: each GLB under 100 MiB (file push limit) and the set under 1 GB (Pages site limit), checked in `test/art.test.mjs`. `dist/` itself must also stay under 1 GB.

### Reference points

Desktop Chrome on one Intel i7-9750H laptop with a Radeon Pro 5300M. Vsync caps fps at 60, so compare draws, triangles and p95 rather than fps. No phone or headset has been measured.

| Date | View | fps / p95 | Draws | Triangles | Record |
| --- | --- | --- | --- | --- | --- |
| 2026-10-31 | `view=street`, 1280×960 | 60 / 18.7 ms | 108 | 1.79 M | This table |
| 2026-10-31 | Inner moat street (−336, 216), east | 60 / 17.5 ms | 155 | 2.49 M | This table; over budget, about 8 draws from the street itself |
| 2026-10-31 | Same position, west | 60 / 17.5 ms | 49 | 0.72 M | This table |
| 2026-10-31 | r186 against r187 | | | | [three-r187-upgrade.md](three-r187-upgrade.md) |
| 2026-11-01 | Loop flight, vsync off, 1280×800 | 445 / 4.2 ms | 27 (max 106) | 1.16 M (max 3.40 M) | [world refactor](performance/world-refactor-20261101/README.md) |

Fixed-view A/B of the photographed areas: [north](north-streetscape.md#rendering-cost), [south](south-promenade.md). Enlarging one asset's cell size from 96 to 256 m saved a single draw on the moat street: the excess comes from many assets in view, not from one model's cells.

## Startup

`?benchmark=1&quality=high&view=street` exposes `window.vrlearn.startup`. Add `&modelWorkers=1&modelEncoding=plain` for the baseline. On 2026-10-26, two workers plus gzip took first frame from 8.2–9.3 s to about 5.4 s on local delivery, and 21 s to 6.9 s with model bodies capped at 100 Mbps, with model responses 76% smaller. The cap is a controlled experiment, not a mobile network, and the scene has grown since. Earlier one-off samples did not reproduce; do not quote them. Current startup is in the [world refactor](performance/world-refactor-20261101/README.md).

## Measuring

Open `/?view=street&benchmark=1` (or `view=replay-bicycle`) at a fixed window size. It disables dynamic resolution and writes JSON to `#fps[data-benchmark]`. `vrlearn.benchmark.reset()` repeats the two-second warmup and eight-second sample on the same page.

Compare A/B on the same page, URL and camera, with frozen baseline programs and data, and nothing heavy running. Read `pmset -g therm` on this laptop: `CPU_Speed_Limit` fell to 24 under repeated runs and inflated frame times several-fold, so alternate builds and cool down. Other rendering pages skew results: one sample fell from 60 to 31 fps while tests ran, and another from 60 to 8 while Vite reloaded a module. A hidden browser pane is throttled too. Discard a sample taken in any of these states. `geometryBytes` and `sceneBufferBytes` are geometry counters, not total memory. The loop follows the browser's animation callbacks with no 60 FPS cap. Absolute fps on one laptop is not evidence, and no real phone or headset has been measured.
