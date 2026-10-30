# Northern district correction — 29 October 2026

> The coverage and building-height rules here are superseded by [whole-map coverage](whole-map.md).

The requested X=0–200, Z=400–600 m square is now part of the source-derived geographic mesh.
Most of the former square was blank; the remainder used approximate castle-side geometry.
Roads, footways, the middle moat, building footprints and mapped green cover now share the
existing metre-scale coordinate frame, native models, editor image and collision data.
The existing ten accident events, traffic clocks and participant/replay controls are retained.

## References and registration

The owner's [Google satellite view](https://www.google.com/maps/@35.2703644,136.2612564,831a,35y,300h,44.71t/data=!3m1!1e3)
opened successfully in Chrome during this review. The view was changed to overhead satellite
and centred at [the requested square's centre](https://www.google.com/maps/@?api=1&map_action=map&center=35.2755126447,136.2558484139&zoom=19&basemap=satellite).
Visible references include the moat, Sawaguchi wings, stable, streets and wooded plots. Google
imagery is a visual cross-check; no Google imagery, photogrammetry mesh or tile cache is shipped.
The displayed 2026 copyright is not an imagery capture date. Street View was not inspected.

The source geometry is [© OpenStreetMap contributors / ODbL](https://www.openstreetmap.org/copyright),
from [this bbox snapshot](https://api.openstreetmap.org/api/0.6/map?bbox=136.2530,35.2700,136.2600,35.2776)
and the [complete moat relation 3548105](https://api.openstreetmap.org/api/0.6/relation/3548105/full).
Element IDs, versions, timestamps and SHA-256 download hashes are retained in
[world/east-hikone.json](../world/east-hikone.json); the
[geographic subset](../world/east-hikone-source.geojson) remains available under ODbL.
The existing eastern generator is reused, rather than introducing a second map renderer.

A [registered GSI photograph](north-correction/gsi-aerial-20261029.jpg) independently checks the
footprints and moat against [GSI seamless aerial tiles](https://maps.gsi.go.jp/development/ichiran.html).
Their [capture metadata](https://maps.gsi.go.jp/xyz/seamlessphoto_spec/11/1799/809.geojson) identifies
September–October 2011 imagery here. It predates later changes and is not a present-day survey.
The photograph is reprojected for the report, not used as a stretched scene texture.

`world/geographic-frame.json` retains the original tie point, bearing and scale:
35.27246 N, 136.2526297 E maps to (32,56.8); +Z bears 32 degrees and +X bears 122 degrees.
The target centre (100,500) is approximately 35.2755126447 N, 136.2558484139 E.
The coordinate in the original tilted URL describes the camera, not a replacement map origin.

## Applied corrections

- Filled the complete 200×200 m square with a disjoint source-derived surface partition.
- Replaced the missing middle-moat extent and the inaccurate overlapping old bank/roof portions.
  The inner moat has its own source outline, rather than a guessed extension of the middle moat.
- Added the real outlines of the Sawaguchi wings, Hikone stable and neighbouring structures.
  Missing heights remain ground-following footprint markers; the old generic Sawaguchi mass is
  removed where it conflicts with these footprints. New storeys and facades are not invented.
- Continued the actual road around Sawaguchi and its eastern connections. A small X=-8–70,
  Z=348–400 m collar joins the corrected centre line to the retained castle approach. This
  local collar is needed because the old northern road tail had drifted from the source.
  The existing castle-path author also follows the mapped museum entry just beyond the
  collar, to approximately X=-51, Z=343, before joining the retained museum approach.
- Reconnected the existing castle walking graph using a shortest path over mapped footway
  nodes. The mapped Omotemon bridge and museum entry replace the former misplaced connection.
  The public building passage remains open in both surfaces and building collisions, including
  half-width endpoint landings for the standing body at its doorways.
  Roof-only structures do not become solid ground-level rooms. Access metadata is retained.
- Clipped the locally placed hill/compound after their final transforms, using the castle's
  actual origin. Untouched native primitive operations retain their compact representation.
  Ground exports, water blockers and the editor use the same ownership mask. Retained road/plot
  height steps at its boundary receive vertical mesh closure from the exported ground profiles.
  No closure is placed across a mapped road, footway or water.
- Derived shoreline faces from the exposed water mesh after subtracting mapped decks.
  Coverage cuts remain open, and bridge margins meet the deck datum rather than forming
  artificial dams or raised walls across the crossing.

The [before plan](north-correction/plan-before-20261029.jpg),
[after plan](north-correction/plan-after-20261029.jpg) and
[GSI image](north-correction/gsi-aerial-20261029.jpg) cover the same X=0–200, Z=400–600 window,
with positive Z upwards. Low blue-grey building markers indicate unknown elevations.

The selected square contains 9 mapped road ways, 22 footway ways, 33 building footprints
(including clipped edge footprints), 3 mapped green areas, 4 individually mapped trees and
2 marked crossings. Only one footprint in this square has a storey tag; its height is an
explicit 3 m/storey estimate. The other building elevations remain unknown.

## Reproduction

Shapely >=2.1 is needed only for the optional offline source import. It is not a runtime,
npm or Blender dependency. All normal builds use the frozen source files.

```bash
npm ci
python3 tools/import_east_map.py --osm /path/to/bbox.osm --water /path/to/relation-3548105.osm --source-url 'https://api.openstreetmap.org/api/0.6/map?bbox=136.2530,35.2700,136.2600,35.2776'
blender -b --factory-startup --python tools/build_impressionist.py -- --only ART_EastHikoneSurface ART_EastHikoneWater ART_EastHikoneBuildings ART_CastleApproach HK_Terrain_Hikone ART_HikoneCompound ART_KyobashiRoads ART_KyobashiLand ART_KyobashiBanks ART_KyobashiWater
blender -b --factory-startup --python tools/build_native_models.py -- --only ART_EastHikoneSurface ART_EastHikoneWater ART_EastHikoneBuildings ART_CastleApproach HK_Terrain_Hikone ART_HikoneCompound ART_KyobashiRoads ART_KyobashiLand ART_KyobashiBanks ART_KyobashiWater
node tools/build_collision.mjs
blender -b --factory-startup --python tools/build_editor_map.py
npm run check
```

Generated `data/` files are not hand-edited. No Unity project is changed. The model names retain
`EastHikone` for compatibility; their geographic ownership now includes the reviewed northern
square and the road collar. The full world/editor bounds remain X=-1060–420, Z=-155–870.

## Verification and remaining limits

The [verification record](north-correction/verification-20261029.json) records final tests,
actual controller traversals, browser checks, provenance and rendering comparisons.
The [reference record](north-correction/references-20261029.json) retains the reviewed URLs
and capture-date checks; [polygon checks](north-correction/geometry-20261029.json) record
quantization residue, mapped passages and road/building overlap checks.

`npm run check` passes **296 tests, zero failures or skips**, strict types, generated references
and the production build. The starting checkout passed 292 tests. All **46 vehicle routes**
pass `node tools/check_routes.mjs`. The collision rebuild contains 435 objects and 1,318,535
blocked cells in the unchanged 7400×5125 grid at 0.2 m.

The [browser record](north-correction/browser-20261029.json) verifies actual walking over the
Sawaguchi footway chain and building passage, and cycling from the eastern street through
the gate-road bend to the retained castle road at Z≈323. Waypoints use steering/movement,
with a separate initial placement for each traversal. Walking event 01 and cycling event 07
retain keyboard movement/look, replay viewpoints, replay completion, results and menu exit.
The editor opens (100,500), jumps to (10,400), and picks coordinates without dirtying a scenario.
Reduced motion, forced colours, 390 px width and the
[production preview](north-correction/production-20261029.json) pass without console errors.

The owner's pre-existing participant/replay edits and event definitions remain byte-identical
to the start of this correction. No new npm dependency was added. The existing large Three.js
bundle warning remains; the model changes use the same rendering/material pipeline.

The [fixed-view comparison](north-correction/rendering-20261029.json) uses the same Chrome tab,
URL and camera, reloading frozen starting models/data/layout/frame before the final resources.
Each view has a two-second warmup and eight-second sample at 1280×800 with reduced motion.
No model generation or test suite runs during sampling.

| View | Draws before → after | Submitted triangles before → after |
| --- | --- | --- |
| Existing junction | 131 → 131 | 878,037 → 876,284 |
| Northern overview | 26 → 20 | 138,380 → 150,047 |
| Sawaguchi approach | 29 → 39 | 163,961 → 160,335 |

Scene geometry-buffer accounting changes 61,773,985 → 61,165,966 bytes (-608,019).
Sample median frame intervals are 16.6–16.7 ms and p95 17.2–17.7 ms. These refresh-capped
desktop measurements describe drawing cost; they do not establish a speed improvement,
total VRAM/heap use or phone performance.

Rendered checks: [overview](north-correction/north-overview-20261029.jpg),
[Sawaguchi](north-correction/sawaguchi-20261029.jpg),
[moat edge](north-correction/moat-20261029.jpg) and [editor](north-correction/editor-20261029.jpg).

Street widths remain explicit class-based estimates constrained by mapped buildings. Most new
building heights, exact kerbs, ramps, signal-head inventories, signal timing and surveyed terrain
are unavailable in these sources. The short legacy castle-graph handoff outside the reviewed
footways remains an authored approximation. Roads leaving the correction boundary continue in
OSM; neighbouring districts outside the ownership polygon are not newly reconstructed.
No new accident event, ambient traffic rule, working signal controller, real-phone/Quest test,
commit, push or deployment is implied by this map correction.
