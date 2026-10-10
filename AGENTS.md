# AGENTS.md — Hikone Traffic Simulator

Guide for AI coding agents and developers. Read **Hard rules** before changing anything. If this file disagrees with the code or the tests, the code wins — fix this file in the same change.

Design intent and trade-offs: [DESIGN.md](DESIGN.md) (Chinese). User-facing guide: [README.md](README.md) (Japanese). Rendering measurements: [docs/performance.md](docs/performance.md); prop modelling notes: [docs/abstract-props.md](docs/abstract-props.md).

**Language:** code, comments, commit messages and this file in English; DESIGN.md and the docs under `docs/` in Chinese; README and UI text in Japanese (UI strings bilingual Japanese / English where space allows). Talk to the project owner in Chinese.

## At a glance

- **What:** the browser port of [VRLearn](https://github.com/LinQisan/VRLearn) (pedestrian traffic-safety VR, Unity, Quest 2). The participant walks or rides a bicycle through the Hikone Kyobashi scene, meets the accident of one of 10 built-in events (or a custom scenario JSON), falls with the camera, then sees a replay (bird's-eye or driver view) and the results. Desktop and mobile browsers; **no VR** (use the Unity app for that).
- **Not an experiment.** It is a viewer and practice tool: no CSV, no data collection. Never mix its use with the Unity experiment data.
- **Stack:** three.js r186 vendored in `vendor/three/`, ES modules with an importmap, **no build step and no npm dependencies** (Node ≥ 22 for tests and tools only).
- **Live site:** GitHub Pages publishes `main` at https://linqisan.github.io/hikone-traffic-sim/ (`.nojekyll`). **Pushing to `main` deploys.**
- **Repository:** https://github.com/LinQisan/hikone-traffic-sim, default branch `main`. Expects VRLearn next to it at `../VRLearn` (`VRLEARN_ROOT` overrides) for data sync and the editor server.

## Layout

| Path | Contents |
| --- | --- |
| `index.html`, `style.css` | The app shell: loading screen, title, HUD, touch controls, replay UI, results |
| `src/` | Runtime modules (see Code map) |
| `src/shared/scenario.js` | Scenario format, defaults and validation — a **copy** of VRLearn's `ScenarioModel/scenario.js` |
| `editor/` | Scenario editor (`index.html`, `app.js`, `store.js` = browser-only backend, `editor.css`) |
| `server/editor-api.mjs` | Local editor backend (VRLearn `Scenarios/`, Unity play, Quest sync over adb) |
| `serve.mjs` | Static server + `/api/…` for the editor; port 8770, `--host 0.0.0.0` for phones on the LAN |
| `events/builtin-01…10.json` | **Hand-authored** web timing of the 10 built-in events (source of `data/scenarios/builtin-*`) |
| `data/` | **Generated** data (see Data pipeline) |
| `tools/` | `sync.mjs`, `check_events.mjs`, `build_collision.mjs`, Blender scripts `export_models.py`, `build_impressionist.py`, `abstract_props.py` |
| `test/` | `node:test` suites; `fake-adb.mjs` emulates a Quest |
| `docs/` | Performance notes and raw benchmark JSON (`docs/performance/`), prop notes |
| `vendor/three/` | three.js (MIT). Do not modify |

## Code map

- **Flow (`src/app.js`):** loading → `title` → `playing` → `impact` → `replay` → `results` (and goal → `results`). The participant can leave to the menu at any time from `playing`, `impact` and `replay` (`leaveToMenu`: HUD and replay "メニュー" buttons, M, or Esc when the mouse is not locked). One state variable; do not add a competing state machine. Loading progress goes through `window.hikoneLoading` (inline script in `index.html`). Screen-reader announcements via `announce()`; focus moves to Start, Next and the results title.
- **Coordinates (`src/coords.js`):** all logic runs in **Unity coordinates** (x right, y up, z forward; yaw in degrees clockwise from above, 0 = +z). Only drawing converts: `toThree(x, y, z) = (-x, y, z)`, `yawToThree = -yaw`. Models are exported with the same mirror.
- **World (`src/world.js`, `src/environment-instances.js`, `src/ground.js`, `src/signals.js`):** the layout from `data/layout.json` drawn as one `InstancedMesh` per asset and LOD level, CPU frustum / shadow-range culling, LOD switch at 60 m with hysteresis (52.8 m), cells ≤ 128 m with 16-bit indices. Shadows follow the view, texel-snapped, refreshed at ~12 Hz (faster while cars move). Signals are display only (never switch).
- **Look (`src/style.js`, `src/paint-texture.js`, `tools/build_impressionist.py`):** impressionist painting authored **in the geometry** (vertex pigments, raised brush meshes); `style.js` adds the shared `PigmentPalette` lookup, bristle relief and the painted sky. There is no screen-space post effect.
- **Traffic (`src/traffic.js`, pure logic, no three.js):** vehicles appear at `route[0]`, accelerate at 8 m/s² to cruise speed (trapezoid integration, sub-steps ≤ 1/30 s), keep distance to the car ahead, spawn only when clear, stop at contact. Web-only vehicle fields (Unity ignores them): `launch: "meet"`, `meetOffsetSeconds`, `entrySpeedKmh`, `hold`, `holdMaxSeconds`, `launchAfterTriggerSeconds`, `noStop` — documented at the top of the file.
- **Obstacles (`src/obstacles.js`, pure logic):** the body cannot pass the town or parked vehicles. `data/collision.json` is a 0.2 m grid over the map rectangle of everything solid between 0.3 m and 1.8 m above the ground (houses, walls, stone walls, gates, trees, hedges, fences, posts); parked vehicles of the run are oriented boxes from their models (`footprint()` in `app.js`). Walking body radius 0.25 m; a bicycle checks both wheels (0.8 m ahead/behind) and may not swing a wheel into anything. The map's invisible walls stay separate (`crossesWall`).
- **Participant (`src/player.js`, `src/touch-controls.js`, `src/bicycle.js`):** walking at `MOVE_SPEED` 2.4 m/s, eye height = height × `EYE_RATIO`; bicycle steering model (looking back never turns the bike); fall with the body on contact (`knockDown`, no roll under `prefers-reduced-motion`); Q/E look; touch stick and drag-to-look.
- **Replay (`src/replay.js`, `src/analysis.js`, `src/crash.js`, `src/cockpit.js`, `src/replay-animal.js`, `src/replay-cyclist.js`):** 20 Hz recording, 12 s buffer, window 8 s before to 1.6 s after contact. The participant is a bear sized from the menu height and weight; its reaction depends on where it was hit (`classifyCrash`: front / corner / side / bump). Views: bird's-eye or the accident car's driver seat (cockpit built to the car's size, right-hand drive). It stops on the last frame and waits for "結果へ"; restart resets everything.
- **Results (`src/analysis.js`):** the same evaluation as the Unity app (time looking toward the car, last look, sideways checks on success).
- **Performance (`src/resolution.js`, `src/performance.js`):** dynamic resolution on desktop, no MSAA on phones; `?quality=high` fixes full resolution, `?benchmark=1` records samples into `#fps[data-benchmark]`.
- **Editor (`editor/`):** one UI, two backends answering the same `/api/…` calls: `server/editor-api.mjs` when served by `serve.mjs` on the machine with VRLearn (files in `VRLearn/Scenarios/`, "▶ Unityで試す", "⇪ Questに送る"), otherwise `editor/store.js` (localStorage; GitHub Pages and other devices). "▶ ブラウザで試す" hands the scenario to the simulator through `localStorage['vrlearn.editor.play']` and `?play=editor`.
- **Debug API:** `window.vrlearn` (`select`, `start`, `knock()`, `simulate(seconds)`, `debugView(...)`, `replay`, `resolution`, …). Review URLs: `?view=street|architecture|foliage|bridge|lamp|signals|vehicles|ride|replay|replay-bicycle`, `&finish=off` (no paint).

## Data pipeline

`data/` is generated from VRLearn; never hand-edit it.

| Output | Produced by |
| --- | --- |
| `data/scene.json`, `data/signals.json` | Unity `Tools/VRLearn/Web/Export Scene For Web` (VRLearn `WebSceneExporter`) |
| `data/models/*.glb` (source meshes) | `Blender -b --factory-startup --python tools/export_models.py` (runs VRLearn's `Art/Hikone` generators) |
| `data/models/impressionist/*.glb`, `*.lod.glb`, `manifest.json` (**used at runtime**) | `Blender -b --factory-startup --python tools/build_impressionist.py` (`--only <names>`, `--save-library`) |
| `data/layout.json`, `road_tiles.json`, `map.json`, `map.png`, `textures/`, `scenarios/`, `editor/templates/`, `src/shared/scenario.js` | `node tools/sync.mjs` |
| `data/collision.json` | `node tools/build_collision.mjs` (from `layout.json`, `road_tiles.json`, `map.json` and the impressionist models) |

- `data/scenarios/builtin-*` come from `events/` (sync prefers them); custom files come from VRLearn `Scenarios/`.
- `data/editor/templates/` are Unity's own templates (what the headset runs), **not** the re-timed `events/`.
- Order after an environment change in VRLearn: Unity export → `export_models.py` → `build_impressionist.py` → `sync.mjs` → `build_collision.mjs` → `npm test`.

## Hard rules

1. **Positions come from Unity.** Placements, roads, routes, triggers, spawns, goals, signals and black walls are VRLearn's experiment geometry. The web port changes looks and event timing only, never where things are. Convert coordinates only through `src/coords.js`.
2. **Never hand-edit generated files** (everything in `data/`, and `src/shared/scenario.js`). Change the generator or the VRLearn source and regenerate. Scenario format changes are made in VRLearn's `ScenarioModel/scenario.js` together with its `CustomScenario.cs`, then synced.
3. **Events serve their purpose — and nothing else.** Every built-in event must pass `node tools/check_events.mjs`: a participant who goes on without looking is hit by that event's accident car (not by other traffic); one who stops at the kerb and watches sees the car and reaches the goal; every car appears hidden or far away. Accident cars launch by timing (`meet`), they **never chase** the participant. Edit `events/`, not `data/scenarios/`.
4. **No build step, no dependencies, relative paths.** The site runs from a sub-path on GitHub Pages; keep every URL relative (`./vendor/…`, `data/…`). Do not add npm packages or a bundler; three.js stays vendored at its version.
5. **Keep the frame budget.** About 120 draw calls per frame; one `InstancedMesh` per asset and LOD; no per-frame allocation in hot paths; no screen-space post-processing. Check `test/performance.test.mjs` and, for rendering changes, measure with `?benchmark=1` (same view, size and machine load; same-page A/B when the machine throttles) and update `docs/performance.md`.
6. **Accessibility is a feature.** Keep the live-region announcements, focus moves, `aria-pressed` tiles, the visible focus ring, Q/E keyboard look, 44 px touch targets, `prefers-reduced-motion` (no camera roll, no animation) and `forced-colors` support working.
7. **The editor server only serves this computer.** `server/editor-api.mjs` answers loopback requests only and refuses cross-site writes; `serve.mjs` refuses `tools/`, `test/`, `server/` and dotfiles. Keep both. Templates (`builtin-*`) are never overwritten.
8. **Bodies do not pass through solid things, and every scenario stays playable.** After changing models, the layout or scenarios, rebuild `data/collision.json` and keep `test/obstacles.test.mjs` passing (spawns and ways to the goal free). The user can always leave to the menu (rule 9).
9. **Replay must always reach the results, and every state can be left.** It waits on its last frame for the user, restart puts every object (bear, ring, cars, cockpit) back exactly once, and nothing in it can block "結果へ". `playing`, `impact` and `replay` can always be left to the menu, cleaning up cars, parked vehicles, the replay and the flash.

## Verification

- `npm test` — all suites (logic, traffic, events with real sight lines, bicycle, crash, replay, controls, art, performance, editor store/server/Quest). Current baseline: **64/64**. `test/obstacles.test.mjs` also checks that every scenario's spawn and straight way to the goal stay free of the collision grid — rebuild `collision.json` after model or layout changes. Editor server and Quest tests skip when VRLearn is not next to this repo.
- `node tools/check_events.mjs [--dir events] [id…]` (`--probe`, `--json`) for event work.
- In a browser (`node serve.mjs`, or the `hikone-traffic-sim` entry of VRLearn's `.claude/launch.json`): load without console errors, play at least one walking and one cycling event, contact → replay (both views, restart) → results → title, goal → results. For layout changes also check a phone-sized viewport (touch controls) and the loading screen on a throttled network.
- Headless Chrome screenshots are fine for looks; frame rates from a throttled laptop are not evidence — compare A/B on the same page.
- `git diff --check` before committing.

## Git and delivery

- Commit source, `events/`, regenerated `data/`, docs and tests. Never commit `node_modules/`, logs, `__pycache__/` or `.DS_Store`.
- Commit or push only when asked; never force-push. Remember that a push to `main` republishes the site.
- Commit messages end with the co-author line given by the session.
- Every hand-off states what changed, what was verified and what was not (e.g. "not checked on a real phone").
