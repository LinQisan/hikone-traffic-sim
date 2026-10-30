# Eastern Hikone map extension — 29 October 2026

> Superseded in part by [whole-map coverage](whole-map.md): the coverage is now the whole world
> outside the retained authored core, every building is extruded with a labelled height estimate,
> and the rectangular `cutouts` no longer exist. Sources and limits below remain the history.

The requested X=200–400, Z=0–600 rectangle now has source-derived native geometry, road/footway
surfaces, water blockers and body collisions. The coverage continues to X=420 and Z=620 to retain
nearby street connections. A western stitching strip includes the moat rather than leaving a
false straight water edge at X=200. This is a geographic reference area, not a new accident event.

The later [north-district correction](north-correction.md) reuses this pipeline for X=0–200,
Z=400–600 and a small road-connection collar. The counts and screenshots below record the
initial eastern extension; the north report records the current combined source and validation.
Google satellite viewing succeeded during that later review, through the browser.

## Coordinates and extent

`world/geographic-frame.json` is the shared authority for the original geographic registration,
the practice frame, the editor/collision extent and the eastern ownership polygon.
`src/world/geography/coordinates.ts` provides the forward and inverse conversion; the former
`geographicPoint()` export from `castle-layout.js` remains compatible.

| Property | Value |
| --- | --- |
| Geographic tie point | 35.27246 N, 136.2526297 E → local (32, 56.8) |
| Local origin (0, 0) | Approximately 35.2721796217 N, 136.2519999152 E |
| Units | Metres; no image scaling or texture stretching |
| Direction | +Z bears 32° east of geographic north; +X bears 122° |
| Geographic approximation | Existing 111320 m/latitude-degree local approximation, retained exactly |
| Requested new rectangle | X=200–400, Z=0–600 |
| Main geometry coverage | X=184–420, Z=0–620 |
| Additional moat stitching strip | X=120–184, Z=100–460 |
| Full editor and collision extent | X=-1060–420, Z=-155–870 |
| Retained sharp practice image | X=-220–200, Z=-155–165, 6 pixels/m |
| Full overview | 2960×2050 pixels, 2 pixels/m |

Only `src/three/scene/coords.ts` and the existing model builder mirror X into Three.js. The new
meshes use local world coordinates and are placed at (0,0,0), so the registration is not applied
again at rendering. The inherited geographic registration remains approximate, not a survey.

## Sources and generated elements

The frozen [OSM-derived plan](../world/east-hikone.json),
[original geographic feature subset](../world/east-hikone-source.geojson) and
[small runtime placement subset](../world/east-hikone-layout.json) are distributed with
[© OpenStreetMap contributors / ODbL](https://www.openstreetmap.org/copyright) attribution.
The plan records source element IDs, versions, timestamps and download hashes. The complete
[moat relation 3548105](https://api.openstreetmap.org/api/0.6/relation/3548105/full) is fetched
separately because a bounding-box response can omit remote members; incomplete water relations
are never turned into guessed polygons.

The [GSI aerial comparison](east-extension/aerial-20261029.jpg) uses the
[GSI seamless photograph tiles](https://maps.gsi.go.jp/development/ichiran.html). The
[capture metadata](https://maps.gsi.go.jp/xyz/seamlessphoto_spec/11/1799/809.geojson) says
**September–October 2011** at the reviewed tie point and eastern sample locations. The [capture/registration record](east-extension/aerial-source-20261029.json) preserves these checks. GSI imagery
was reprojected into the existing map frame and visually compared with the imported layout.
It is an independent reference, not a shipped background texture. Google Maps satellite imagery
could not be opened through the available reader; no new Street View inspection was completed.

| Element | Generated result and evidence limit |
| --- | --- |
| Roads | 89 OSM way segments, including Route 25 / 中濠東西通り, 彦根城線 / 朝鮮人街道, 駅前お城通り and mapped access/parking aisles. Segment counts are not counts of separate named streets. One-way and lane tags remain in the source. |
| Footways | 82 mapped footway/path segments, including the eastern moat-side route and source crossing connections. Sidewalks are not invented around every street. |
| Crossings | 17 mapped marked crossing locations produce zebra/stripe geometry, clipped to actual road polygons. Nodes tagged unmarked receive no fabricated zebra. |
| Water | The source moat relation supplies the eastern 中堀 outline. Road/footway decks are subtracted from the water and blockers so the mapped crossings remain open. |
| Buildings | 240 actual footprint polygons, including clipped edge footprints. No random house placements or sizes are used. |
| Building height | No measured metric heights were present in the retrieved OSM snapshot; no usable PLATEAU height source was obtained during this run. Three footprints have OSM storey counts (1, 3 and 5), rendered using an explicitly estimated 3 m/storey. The other 237 remain low blue-grey footprint pads, not invented full-height buildings. All mapped building interiors remain solid at body height. |
| Vegetation | 9 mapped green/wooded/park polygons and 14 individually mapped trees. No random tree inventory is added inside the polygons. Tree silhouettes use existing project art, not measured crown heights. |
| Traffic signals | Source signal/crossing locations and named signal junctions are retained in the reference metadata and editor places. Exact pole positions, head inventory and phase schedules could not be established; new working heads or signal timing are not fabricated. |
| Heights and materials | Roads/footways 0.01 m, town plots 0.15 m and water -1.35 m retain the project datum and palette. The southwest bank stitching strip inherits the existing castle-bank profile and fades to town datum by X=200; this is continuity with the authored terrain, not a new elevation survey. Water depth, bank heights and terrain undulations are not newly surveyed elevations. New kerb caps/ramps are not invented from road-centre lines. |

The source has no exact width for most streets. The authored estimates are 8.2 m for primary,
7 m for secondary/tertiary, 4.4 m for residential/unclassified, 3.6 m for service roads and 2 m
for mapped footways. These are road-class estimates checked against the reviewed aerial scale, with a 0.2 m seam allowance
on Route 25 to preserve existing vehicle-body clearance; they are not cadastral measurements.
Estimated road/footway margins are clipped against mapped building footprints; no source road
centre line intersects a building in this snapshot. Lane-level restrictions and new signal controls are therefore not presented as validated training.
Existing ten-event practice and exploration traffic retain their original routes and timing.

## Issues resolved

| Previous issue | Applied correction |
| --- | --- |
| The world stopped at X=200, leaving the requested streets absent. | Extended the source-driven mesh, ground data, collisions and registered editor image together. |
| Approximate distant approach geometry occupied the newly mapped moat/bank area. | Clipped the older authors at shared ownership boundaries, including the old south-hall volume replaced by the source area. Nine retained approach buildings keep their camera bounds. |
| Old water polygons could obstruct the new street connections. | Rebuilt water blockers from the complete moat relation, subtracting mapped road/path decks. |
| Estimated road buffers overlapped 11 building margins. | Preserved the mapped footprints and trimmed uncertain road/footway margins. No road centre line intersects a building. |
| A merged building asset could make an entire district obstruct replay cameras. | Kept camera silhouettes and bounds per building, including concave footprints. |
| Flat new ground created a 4.2 m step at the inherited southwest castle bank. | Retained the existing bank profile in a locally refined mesh, tapering to the town datum before X=200. Footprint markers follow that ground; roads remain level. |
| Crop fragments could create false walkable area or restore old primitives. | Discarded zero-area fragments and retained clipped native faces instead of replaying uncropped box/cylinder commands. |

## Geometry, ownership and reproduction

`tools/import_east_map.py` converts a saved OSM XML snapshot through the shared TypeScript
coordinate transform and prepares a disjoint constrained-triangle surface partition.
Shapely >=2.1 is an **optional offline importer dependency**; it is not a new npm/runtime or
Blender dependency. Existing generated snapshots are enough for normal authoring and builds.
The importer rejects missing water relation members rather than closing a guessed boundary.

`tools/east_extension.py` constructs three native assets: surface/shoreline/paint, water and
building footprints/verified-storey masses. The existing procedural authors clip their eastern
faces against the same ownership rectangles. A cropped box/cylinder is retained as explicit
clipped faces in the native recipe; replaying its original primitive would restore the overlap.
Ground exports and water walls use the same crop, discarding zero-area crop fragments so
scenario validation cannot mistake a degenerate triangle for walkable land. Old castle/university ground groups are
retained outside the ownership area. Only mapped trees are added, at their authoritative ground. Camera bounds remain separate
for each known-height building (including concave outlines); ground-following unknown-height
markers are floor references rather than invented roof obstacles. Batching never turns the full
new street rectangle into a camera obstacle.

Rebuild the frozen plan's models and derived outputs without Unity:

```bash
npm ci
blender -b --factory-startup --python tools/build_impressionist.py -- --only ART_CastleApproach ART_EastHikoneSurface ART_EastHikoneWater ART_EastHikoneBuildings ART_KyobashiRoads ART_KyobashiLand ART_KyobashiBanks ART_KyobashiWater
blender -b --factory-startup --python tools/build_native_models.py -- --only ART_CastleApproach ART_EastHikoneSurface ART_EastHikoneWater ART_EastHikoneBuildings ART_KyobashiRoads ART_KyobashiLand ART_KyobashiBanks ART_KyobashiWater
node tools/build_collision.mjs
blender -b --factory-startup --python tools/build_editor_map.py
npm run check
```

For a new source snapshot, first download the documented bbox and full moat relation, then run:

```bash
python3 -m pip install 'shapely>=2.1'
python3 tools/import_east_map.py --osm /path/to/map.osm --water /path/to/relation-3548105.osm
```

This writes only `world/` source snapshots. The model and map tools regenerate `models/` and
`data/`; no generated data file is hand-edited. Saved version-one scenarios may now use the
expanded world bounds while the old practice image/coordinates and event settings remain intact.

## Verification and remaining limits

The [verification record](east-extension/verification-20261029.json) records final tests,
new-region controller traversals, browser checks and fixed-view rendering comparisons.

`npm run check` passes **292 tests, zero failures or skips**, strict types, generated references
and the production build. `node tools/check_routes.mjs` passes **46 vehicle routes**. The baseline
had 283 passing tests. Existing event definitions and the owner's in-progress replay/controller
changes remain byte-identical to the turn's starting files. Collision regenerates 431 objects
into a 7400×5125 grid at 0.2 m, with 1,221,445 blocked cells.

The [browser checks](east-extension/browser-20261029.json) use the real `Player` controller:
walking follows the west footway of 彦根城線 from Z≈55 to 420, and cycling enters from the old
Route 25 seam at X=180 before turning north to Z≈401. No route is traversed by teleporting
between waypoints. Walking event 01 and cycling event 07 retain keyboard movement/look,
participant/driver/overview replay switching, replay completion and results/menu exit. The editor
opens (300,300), jumps numerically to (396,500), picks coordinates without dirtying the scenario,
and has no horizontal overflow at 390 px. Forced colours, reduced motion, 44 px attribution links
and the [production preview](east-extension/production-20261029.json) pass without console errors.

[Independent polygon checks](east-extension/geometry-20261029.json) find no road-centre-line /
building intersections and approximately 0.00115 m² of gaps plus 0.00148 m² of pairwise overlaps from 5-decimal
coordinate quantization over 169,360 m². Ordinary street endpoints are connected within the
coverage; real access/parking-aisle ends and exits at the coverage boundary remain.

The [same-tab fixed-view comparison](east-extension/rendering-20261029.json) freezes the turn's
starting models/data, then reloads the same URL and camera for the final scene (1280×800,
reduced motion, two-second warmup and eight-second sample):

| View | Draws before → after | Submitted triangles before → after |
| --- | --- | --- |
| Existing junction | 117 → 131 | 895,446 → 878,037 |
| Eastern overview | 128 → 139 | 1,295,277 → 1,319,069 |
| Eastern street | 15 → 70 | 148,026 → 191,493 |

Scene geometry-buffer accounting increases 61,208,932 → 61,773,985 bytes (+565,053). Median
frame intervals are 16.7 ms in each sample, with p95 at 18.0–18.6 ms. These refresh-capped
desktop samples describe drawing cost, not a speed gain, total VRAM, heap or phone performance.

Compare the same registered window in the [before plan](east-extension/plan-before-20261029.jpg),
[after plan](east-extension/plan-after-20261029.jpg) and [GSI aerial](east-extension/aerial-20261029.jpg).
Rendered views: [overview](east-extension/east-overview-20261029.jpg),
[junction](east-extension/tachibana-20261029.jpg), [street](east-extension/east-street-20261029.jpg),
[moat seam](east-extension/moat-seam-20261029.jpg) and [editor](east-extension/final-editor-20261029.jpg).
The [southwest bank transition](east-extension/bank-seam-20261029.jpg) shows the inherited
profile meeting the new terrain; its survey accuracy remains unverified.

The scene is not a surveyed digital twin. Missing building elevations, exact kerb/ramp geometry,
pole positions, signal schedules, present-day facade details and terrain elevations remain missing.
The 2011 photograph predates later building changes; OSM is community-maintained. Places outside
the ownership polygon are not newly mapped simply because they appear inside the larger editor
rectangle. The new region has reference geometry and supports authored routes; no new accident
scenario or unverified ambient traffic/signal controller has been added. No real phone, Unity,
Quest or deployment is implied by desktop browser verification.
