# Art and performance notes

How the web-authored models are built and checked, and how fast the scene renders. Design reasons are in [../DESIGN.md](../DESIGN.md); rules in [../AGENTS.md](../AGENTS.md). Raw benchmark samples are in [performance/](performance/).

## 1. Models

The town comes from VRLearn's generators (`tools/export_models.py` → `data/models/*.glb`). `tools/build_impressionist.py` rebuilds every model with vertex pigments and raised brush strokes into `data/models/impressionist/` (what the app loads), with a distant LOD per model and a `manifest.json`. Houses and trees get new silhouettes; the props below are authored from scratch as closed solids in `tools/abstract_props.py`.

Treat each object as a few weighty planes of colour: warm lamp glass, blue-violet metal, the large curves of a car body, dark-blue windows, round wheels. Leave out dense stripes and small parts; keep the outline needed to recognise an object and read its direction and state. Pigment lives in the vertices, so models hold up with the shader finish switched off.

| Model | Shape |
| --- | --- |
| `HK_StreetLamp` | Slightly waisted octagonal lantern, cream glass on all sides and below, a closed blue-violet base, a thick octagonal cap; tapered capped tubes for pole and arm. |
| `ART_Signal_Car` | As photographed at Kyobashi: a grey three-lamp head, each lamp under a deep hood, **green, yellow, red from the left** as seen from the front (the earlier model had red on the left), hung from the mast arm by two short brackets. |
| `ART_Signal_Pedestrian` | Dark box with two square lamps under three-sided hoods: red standing figure over green walking one. |
| `WEB_Sedan`, `HK_Kei_Tall`, `HK_Kei_Hatch` | Low lofted wedge (sedan), taller or shorter domed masses (kei); closed hull and underbody, wheel arches that clear the wheels, glass fitted to the narrowing roof. Collision outlines unchanged. |
| `HK_Truck_Large`, `HK_Truck_Medium` | A Japanese aluminium-van truck (アルミバン) in which every part rests on the one below — no gaps: black chassis rails, a sub-frame of cross members, the van box on it (edge rails, corner posts, a few side stiffeners, rear doors with lock rods and hinges). Cab-over cab with front wheel arch, grille band, headlights, bumper and plate, mirrors on stays; single front and dual rear tyres under black fenders with mud flaps; side guards on brackets, fuel tank, battery box; rear underrun bar on brackets, triple combination lamps (red, red, amber) and plate. Outer extents unchanged. |
| `HK_Sign_Speed30`, `HK_Sign_Speed40` | Red ring, white face, blue seven-segment digits, sized like VRLearn's 30 sign. 40 is web-only (Route 25 along the moat); the 30 sign is rebuilt here because the converted source showed its digits mirrored ("OE"). |

**Signal posts** are built at run time in `src/signals.js` from the source rigs (`signalRigs` in `src/signal-layout.js`): each car head keeps its exact source position and facing. A 7.4 m tapered brown pole stands on the source pole spot, and a two-pipe mast arm reaches out to the head. A "彦根市 京橋 Kyobashi" plate sits on the pole top and a "歩車分離式 7:30–18:00" plate hangs under the head (canvas textures); pedestrian heads hang on brackets from a 3.75 m pole with a blue "歩車分離式" plate. Poles are solid (`obstacles.js`). Signal colours never receive decorative paint.

**Car wheels:** `vehicles.js` `frontWheels` cuts the two front wheels (tyre and hub triangles) out of each car model once and puts them on pivots at the wheel centres, so live cars and replay copies can steer them (see DESIGN.md §5).

**Layout overrides** (`src/web-layout.js`): the four crosswalk signs at the signalised corners and the guide post at the bridge corner are hidden; Route 25's two speed signs are shown as `HK_Sign_Speed40`. `data/layout.json` stays generated.

### Building and checking

- Rebuild all models and the editable library: `blender -b --factory-startup --python tools/build_impressionist.py -- --save-library` (library: `data/models/impressionist/abstract-props.blend`). Only some: `-- --only ART_Signal_Car HK_Sign_Speed40`.
- After model or layout changes: `node tools/build_collision.mjs`, then `npm test`.
- `test/art.test.mjs` checks pigment on every primitive, closed solids with outward winding (lamp, signals, vehicles, signs), LOD silhouettes within 4 cm, road heights and vehicle outlines within 8 mm, windscreens in front of the hull, the signal anchors, facings and lamp order, and the layout overrides. `test/turning.test.mjs` checks the wheel cut.
- Close-ups in the browser (the real GLBs, scene and traffic untouched): `?view=lamp`, `lamp-top`, `signals`, `signals-back`, `vehicles`, `vehicles-back`; add `&finish=off` for the raw pigment.

## 2. Performance

### How the frame budget is kept

- One `InstancedMesh` per asset and LOD level with a shared vertex-pigment material; about 120 draw calls per frame (about 3,900 before instancing). Large ground pieces are split into cells of at most 128 m with 16-bit indices per cell; all original triangles are kept.
- Pigment strength shares a texel with the warm colour (three palette reads per vertex instead of four); colour and emission keep float precision.
- CPU frustum and shadow-range culling; instance lists rebuilt only after the view moves; distant LOD at 60 m with hysteresis to 52.8 m.
- **Shadows come from the light LOD, from their own list.** Each instanced asset has a shadow-only `InstancedMesh` (light-LOD geometry, every placement inside the shadow box); the view meshes never cast. The view's LOD switches (every few metres while walking or riding) therefore never change the casters and never force a shadow redraw, and the shadow pass draws light geometry. The shadow-only meshes are shown only on frames that redraw the map (`env.casters(needsUpdate)`) and draw nothing in that frame's view pass, so ordinary frames do not pay for them. The light LOD keeps silhouettes within 4 cm, under a shadow texel (~9 cm). Large cells cast from their light level the same way (its draw range is emptied for the view while the cell is near).
- **The shadow map holds only still things** (town, parked vehicles, signal posts). It is redrawn when the view re-centres (every 4 m, texel-snapped) or the LOD changes, never because something moves. Moving cars, bicycles and the replay figure do not cast into it; each carries a soft shadow pool on the sun's side (`src/blob-shadow.js`: one shared quad, texture and material; one small transparent draw per object). Before this, passing cars forced a full shadow pass about 10 times a second while the participant stood still: those frames cost about 25 % more GPU and 45 % more CPU time, and on a weaker GPU every ~6th frame missed the vsync (judder with a high fps counter).
- Projection recomputed only when the aspect changes, before culling.
- Brush textures and the sky are cached.
- Desktop: dynamic resolution (DPR ≤ 1.25, ≤ 1.6 megapixels by default); phones: no MSAA. `?quality=high` fixes full resolution. Every resolution change resizes the canvas (a hitch), so a raise that has to be undone within 2.5 s doubles the time that level stays out of reach (15 s up to 4 min; relaxed after a long calm spell): on a borderline GPU 25 resizes in 10 minutes instead of 194.
- Hot paths write positions in place (`toThree(x, y, z, mesh.position)`): no per-frame garbage from cars, the participant or the replay.
- Moving cars add their own meshes (two of them for the steering front wheels); the signal posts and plates are merged into five meshes.

### Idle frame pacing (2026-10-11)

Built-in event 01, participant standing still while traffic passes, 30 s, headless Chrome with GPU timer queries around each frame's render.

| | Before | After |
| --- | ---: | ---: |
| Shadow-map passes per second | 10.1 | 0 |
| GPU ms per frame (mean, frames with / without a shadow pass) | 7.76 / 6.21 | 6.09 (all frames) |
| CPU ms in render (mean, with / without) | 1.89 / 1.31 | 1.48 |

### Moving through the town (2026-10-11)

Same set-up, holding W for 20 s (07: riding out of the car park; 01: walking), with nothing else rendering on the machine (an open preview pane had skewed an earlier run: the car-park view is not GPU-bound — it holds fewer triangles than 01's). Before = view LOD shared with the shadow pass.

| | 07 before | 07 after | 01 before | 01 after |
| --- | ---: | ---: | ---: | ---: |
| Shadow redraws per second | 4.8 | 0.6 | 2.5 | 0.8 |
| GPU ms, ordinary frames (mean) | 4.21 | 3.52 | 6.29 | 5.14 |
| GPU ms, shadow frames (mean) | 6.02 | 5.2 | 8.53 | 6.7 |
| CPU ms in render, ordinary frames | 1.63 | 1.61 | 1.53 | 1.72 |

The remaining redraws are the 4 m re-centring of the shadow box. One shadow frame per run carries the first shader compilation (~130 ms); the median shadow frame costs 2 ms CPU.

### Last full measurement (2026-10-02)

Built-in browser, fixed 1280 × 720 viewport and framebuffer, dynamic resolution off, compared with `b23e8a9`. 2 s warm-up, about 8 s of samples, each page opened separately; street before/after and the new replay measured twice.

| Measure | Before | After |
| --- | ---: | ---: |
| Street FPS | 12.2–12.5 | 17.1–19.7 |
| Bicycle replay FPS | 17.6 | 16.6–18.3 |
| Environment geometry buffers | 33.25 MiB | 31.55 MiB (−5.1 %) |
| Pigment texture reads per vertex | 4 | 3 |

The street improved; the replay shows no stable gain. Machine load and temperature affect the numbers — they are not a device guarantee, and real phones still need measuring. Samples: `performance/*-20261002-*.json` (older runs are kept next to them).

### Measuring again

1. `npm test`, then `node serve.mjs`.
2. Fix the window size and open `http://127.0.0.1:8770/?view=street&benchmark=1` or `?view=replay-bicycle&benchmark=1`. `benchmark=1` turns dynamic resolution off; the samples (frame rate, frame times, draw counts, framebuffer size) are JSON in the `data-benchmark` attribute of `#fps`.
3. Compare only with the same view, size and machine load; when the machine throttles, compare A/B on the same page.
