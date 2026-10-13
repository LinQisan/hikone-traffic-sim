# Art and performance

How the web-authored models are built and checked, and what the scene costs to render. Why: [../RATIONALE.md](../RATIONALE.md). Raw benchmark samples: [performance/](performance/).

## Models

`tools/export_models.py` turns VRLearn's generators into `data/models/*.glb`; `tools/build_impressionist.py` rebuilds each into `data/models/impressionist/` (the runtime set: vertex pigments, brush strokes, a distant LOD, `manifest.json`). Houses and trees get new silhouettes. Lamps, signals, vehicles and speed signs are authored as closed solids in `tools/abstract_props.py`: a few weighty colour planes, only the outlines needed to read the object.

The lamp and five vehicle generators were also ported to VRLearn's `Art/Hikone/hk_web_props.py` (D39). Raw exports now contain those same hulls; the Unity sedan is named `HK_Sedan`. The exporter includes mesh children, while Unity centres wheel pivots during prefab generation. The browser continues to use its existing impressionist models and steering code.

VRLearn also ports the car/pedestrian heads through `hk_signals.py` and generates the brown poles, mast arms and baked plates at the same source anchors (D41). Unity runs a synchronized signal cycle; the browser's signals remain static. `data/signals.json` continues to hold the preserved original reference meshes and matrices, so exporting Unity's replacement never moves or duplicates the browser heads.

Non-obvious conventions:

- **Signals** follow street photographs of Kyobashi: car lamps read green–yellow–red from the left, seen from the front. Posts, mast arms and plates are built at run time (`src/signals.js`) on the source pole and head positions; the posts are solid. Signal colours never get decorative paint.
- **Trucks** are Japanese aluminium vans with every part resting on the one below (no gaps); outer extents stay the source's.
- **Speed signs:** 40 km/h is on Route 25 in both versions (VRLearn D38); the 30 sign is authored too because the converted source read mirrored.
- **Car front wheels** are cut out of the models at run time (`frontWheels`) so they can steer.
- **Seams:** the bridge abutment tops are sunk below the deck (`SUNK_TOPS` in `build_impressionist.py`), and ground/terrain vertices on a road are pressed just under it (`world.js`) — both had shown as lines across the road.
- **Layout overrides** (the two props hidden at the bridge corner) live in `src/web-layout.js`; `data/layout.json` stays generated.

Rebuild: `blender -b --factory-startup --python tools/build_impressionist.py -- --only NAME…` (`--save-library` also writes `abstract-props.blend`), then `node tools/build_collision.mjs` and `node --test test/art.test.mjs test/obstacles.test.mjs`. Other checks depend on the affected behavior; see [AGENTS.md](../AGENTS.md#verification). `test/art.test.mjs` checks pigment, closed solids, LOD silhouettes (4 cm), road heights and vehicle outlines (8 mm), windscreens, signal anchors and lamp order, abutment tops and the overrides. Close-ups: `?view=lamp|lamp-top|signals|signals-back|vehicles|vehicles-back`, `&finish=off` for raw pigment.

## Performance

What keeps the budget:

- One `InstancedMesh` per asset and LOD (~120 draws, ~3,900 before); large ground cut into ≤ 128 m cells; LOD at 60 m with hysteresis; instance lists rebuilt only after the view moves.
- **Shadows:** the sun's map holds only still things, drawn from the light LOD by shadow-only instanced meshes with their own caster list (shown only on frames that redraw it). View LOD switches never touch it; it is redrawn when the shadow box re-centres (4 m). Moving things carry a shadow pool (`src/blob-shadow.js`) instead.
- Dynamic resolution on desktop (DPR ≤ 1.25, ≤ 1.6 Mpx), backing off when a raise fails (each change resizes the canvas); no MSAA on phones; `?quality=high` fixes full resolution.
- Three palette reads per vertex; cached brush textures and sky; positions written in place in hot paths.

### Measurements (headless Chrome, GPU timer queries)

Standing still in event 01 while traffic passes (2026-10-11):

| | Before | After |
| --- | ---: | ---: |
| Shadow passes per second | 10.1 | 0 |
| GPU ms per frame | 6.21 (7.76 on shadow frames) | 6.09 |

Moving for 20 s (07 riding out of the car park, 01 walking; 2026-10-11, before = view LOD shared with the shadow pass):

| | 07 before | 07 after | 01 before | 01 after |
| --- | ---: | ---: | ---: | ---: |
| Shadow redraws per second | 4.8 | 0.6 | 2.5 | 0.8 |
| GPU ms, ordinary / shadow frames | 4.21 / 6.02 | 3.52 / 5.2 | 6.29 / 8.53 | 5.14 / 6.7 |

Street view, fixed 1280 × 720, dynamic resolution off (2026-10-02, vs `b23e8a9`): 12.2–12.5 → 17.1–19.7 fps; environment buffers 33.25 → 31.55 MiB. Real phones are not measured yet.

### Measuring

Open `http://127.0.0.1:8770/?view=street&benchmark=1` (or `view=replay-bicycle`) at a fixed window size; `benchmark=1` turns dynamic resolution off and writes samples as JSON into `#fps[data-benchmark]`. Close other rendering pages first (an open preview pane skewed one run). Compare only like with like; when the machine throttles, compare A/B on the same page.
