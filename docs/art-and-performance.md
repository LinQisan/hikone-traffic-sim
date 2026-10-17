# Art and performance

How the web-authored models are built and checked, and what the scene costs to render. Why: [../RATIONALE.md](../RATIONALE.md). Raw benchmark samples: [performance/](performance/).

## Models

`tools/export_models.py` turns VRLearn's generators into `data/models/*.glb`; `tools/build_impressionist.py` rebuilds each into `data/models/impressionist/` (the runtime set: vertex pigments, brush strokes, a distant LOD, `manifest.json`). Houses and trees get new silhouettes. Lamps, utility poles, signals, vehicles and speed signs are authored as closed solids in `tools/abstract_props.py`: a few weighty colour planes, only the outlines needed to read the object. Browser-only `ART_PathLamp` and `ART_UtilityPole` need no upstream raw GLB.

The lamp and five vehicle generators were also ported to VRLearn's `Art/Hikone/hk_web_props.py` (D39). Raw exports now contain those same hulls; the Unity sedan is named `HK_Sedan`. The exporter includes mesh children, while Unity centres wheel pivots during prefab generation. The browser continues to use its existing impressionist models and steering code.

VRLearn also ports the car/pedestrian head geometry through `hk_signals.py` (D41). Unity runs a synchronized signal cycle; the browser's signals remain static. `data/signals.json` retains the original reference meshes and matrices for upstream export, but the browser no longer places heads from those cube anchors. Its five installations are authored in `src/signal-layout.js`, independently of a full sync. Pole locations fit the imported map's pavement boundaries; they are not a georeferenced survey.

Non-obvious conventions:

- **Signals** follow the [junction panorama](https://www.google.com/maps/@?api=1&map_action=pano&pano=2ktrhAY4ZkkBfA6R_NUjeQ&heading=97.94&pitch=13.47) and [Castle Road panorama](https://www.google.com/maps/@?api=1&map_action=pano&pano=Ec4s74rI5EEPdh3jSxAoqw&heading=39.24&pitch=13.47), both October 2024. There are five poles: bridge-west and bridge-east each carry one pedestrian head; town-west alone carries two, for the west and south crossings; town-east carries one for the south crossing; a separate lamp/name-board pole by the east crossing carries its other pedestrian head. Four vehicle heads face the four approaches. Bridge-side brown poles have paired sloping pipes and phase boards below the heads. Town-side vehicle masts have phase boards above; only town-west has a street lamp. Car lamps read green–yellow–red from the left. Posts, brackets and plate backs are merged with vertex colours in `src/signals.js`; all five footprints are solid and stand entirely on pavement. Signal colours never get decorative paint.
- **Trucks** are Japanese aluminium vans with every part resting on the one below (no gaps); outer extents stay the source's.
- **Street furniture:** the reviewed moat road, bridge and immediate Castle Road entrance replace 45 imported grid lamps with six 3.23 m square path lights on the moat bank. The three concrete utility poles on the east-side building bank carry crossarms, insulators and transformers. Their sagging wires are authored with the same insulator endpoints in `web-layout.js`, drawn once by `overhead-wires.js`, and omitted from the sun map. The 24 lamps on unreviewed outer side streets keep their imported placement. All physical additions pass through `webLayout` for rendering, collision and event sight lines.
- **Speed signs:** 40 km/h is on Route 25 in both versions (VRLearn D38); the 30 sign is authored too because the converted source read mirrored.
- **Car front wheels** are cut out of the models at run time (`frontWheels`) so they can steer.
- **Seams:** the bridge abutment tops are sunk below the deck (`SUNK_TOPS` in `build_impressionist.py`), and ground/terrain vertices on a road are pressed just under it (`world.js`) — both had shown as lines across the road.
- **Layout overrides** (the two hidden bridge-corner signs and the reviewed street furniture) live in `src/web-layout.js`; `data/layout.json` stays generated. Signal head offsets are 2.5–3.6 m from their pole axes, with mast tips at most 4.45 m out; their placement is independent of the imported cube anchors.

Rebuild: `blender -b --factory-startup --python tools/build_impressionist.py -- --only NAME…` (`--save-library` also writes `abstract-props.blend`), then `node tools/build_collision.mjs` and `node --test test/art.test.mjs test/obstacles.test.mjs`. Signal assembly/plate changes are generated at run time and need no GLB rebuild. Other checks depend on the affected behavior; see [AGENTS.md](../AGENTS.md#verification). `test/art.test.mjs` checks pigment, closed solids, LOD silhouettes (4 cm), road heights and vehicle outlines (8 mm), windscreens, signal pavement footprints/crossing pairs and lamp order, abutment tops and the overrides. Close-ups: `?view=lamp|lamp-top|signals|signals-back|signals-bridge-west|signals-town|signals-town-back|signals-double|signals-walk|vehicles|vehicles-back`, `&finish=off` for raw pigment. Signal close-ups show the complete street assembly: either bridge bank, town-east, the double-head town-west pole, or the independent walking lamp. `?view=signals-layout` shows all five in the town.

Street-furniture close-ups: `?view=path-lamp|utility-pole`; `?view=street-east` looks along the moat road from the junction. Rebuild the two browser-only models with `blender -b --factory-startup --python tools/build_impressionist.py -- --only ART_PathLamp ART_UtilityPole`, then regenerate the collision grid as above.

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
