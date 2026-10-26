# React and TypeScript architecture migration

## Before implementation

The audit on 2026-10-26 found 10,376 lines across browser modules, a Vite 8.3.5 multi-page build, Three.js 0.186.0, no React/TypeScript runtime, and two coordinators (`src/app.js`, 956 lines; `editor/app.js`, 1,500 lines). The simulator coordinator directly owned ordinary UI, resource initialization and the animation loop; the editor coordinator mixed state, SVG map drawing, forms and storage actions. Input listeners, resize observers and workers had no complete application-unmount lifecycle.

Before source changes, `npm run check` passed **269 tests, zero failures/skips**, reference checking and the production build. Production browser regression passed **22 groups**, including both travel modes, replay/results/menu, exploration/resume, profile settings, imports/retry, editor preview and coordinate links, mobile/reduced-motion/forced-colour layouts. A fixed 1280 × 720, high-quality, reduced-motion street benchmark and a source backup/fingerprints were captured separately. These are local browser observations, not real-phone measurements. Completion results are recorded below as implementation and verification proceed.

## Existing behavior inventory

| Boundary | Implemented before migration | Compatibility requirement |
| --- | --- | --- |
| Entry/build | Vite dev/preview, root simulator, `/editor/`, five developer pages, relative Pages distribution, guarded local editor API | Keep public entry URLs and static deployment; preserve loopback/write guards. |
| Renderer/world | One WebGLRenderer/animation loop; camera, neutral tone mapping, painted geometry/material brushwork, fog, sky/water motion, cell batching, LOD/culling, static sun/blob shadows | Keep dimensions, coordinates, placements, lighting and quality defaults. |
| Native assets | 53 authored construction programs with two detail levels; bounded workers, gzip transport and JSON fallback | Keep native rendering, source programs, Python/Blender authors and offline GLB fixtures. |
| Visual entities | Roads, buildings, castle/campus/moat, plants/trees, vehicles, bicycle/rider, birds/fish and five signal installations | Reuse generators and all visible assets. No separate pedestrian AI was found; the participant and replay bear are implemented. |
| Simulation | Ten authored events; independent seeded departures/drivers, signals, car steering, following/yielding, finite braking, physical contact, visibility and participant observations | Preserve arithmetic, clocks, seeds, parameters and authored JSON. Keep existing bounded substeps; do not introduce a new fixed-step model. |
| Exploration | Shared flows, encounter admission/recovery, parking slots, red-entry response, capped local session samples/events/incidents | Preserve observation counters, admission rules, continuation and session JSON. |
| Controls | Keyboard/pointer lock/look, touch stick/drag, height/weight, reduced motion, resize, menu from every state | Keep keys, touch behavior, focus and announcements. |
| Replay/results | Recorded motion, overview/driver views, camera obstacle planning, fall, restart, skip/end, feedback and saved incident clips | Preserve frame format, camera behavior and every exit path. |
| Editor | Map pan/zoom/layers/snapping, route creation/editing/deletion, controls/validation, presets, undo/redo, playback/timing, coordinates/share links, file import/export, browser play | Move ordinary controls/panels to React while retaining the map's drawing implementation and ids. |
| Storage/bridge | Browser localStorage and optional local Unity file API; template protection; Unity play request and fake-adb-tested Quest mirror | Keep saved formats, storage keys, paths and backend behavior. Do not modify the sibling Unity project. |
| Not implemented | Audio, rain/night, browser VR, complete Unity behavior parity, runtime GLB loading, browser GLB export | Do not claim these exist. Define a separate GLB asset/JSON semantic export boundary. |

## Asset and dependency audit

`events/` owns built-ins; event-only sync generates simulator/editor JSON. `world/hikone.json` references event routes. Imported map coordinates remain authoritative and drawing alone converts handedness. Native programs describe geometry/material construction outside the UI tree. `tools/build_native_models.py` records the existing procedural Python authors; Blender remains optional authoring tooling, not a production server. Existing GLBs serve offline envelope/art regression and remain available.

The migration keeps the native Three.js renderer and model algorithms. React Three Fiber would add an ownership boundary without reducing existing engine complexity, so it is not introduced. React will own ordinary UI and low-frequency snapshots; simulation and rendering retain mutable internal state. TypeScript's strict, erasable syntax permits the same simulation modules to run in Node tests and Vite without a separate simulation build.

Bug fixes and compatibility deviations must be recorded separately from source relocation/type annotation. Historical performance/audit documents retain their original paths and dates; current entry points are documented here and in AGENTS/README.

## Completed architecture

```text
index.html → src/app/main.tsx → App.tsx
                                 ├─ React menu / HUD / replay controls / results
                                 ├─ SimulatorStore (UI slices and commands)
                                 └─ createTrafficEngine (native Three.js lifetime)
editor/index.html → src/editor/main.tsx → EditorApp.tsx
                                 ├─ React toolbar / inspector / checks / timeline / Quest dialog
                                 └─ editor controller (commands, native SVG drawing, storage)

src/simulation/core/       Version-one scenarios, normalization and validation
src/simulation/traffic/    Traffic, persistent drivers and signal clock
src/simulation/events/     Participant observations and world encounter director
src/simulation/collision/  Ground, collision grid and contact calculations
src/simulation/metrics/    Recording, analysis and capped session records
src/three/engine/          Native renderer/session ownership and UI integration
src/three/renderer/        Startup/benchmark probes and adaptive resolution
src/three/controls/        Player, keyboard/pointer and touch controls
src/three/scene/           Environment, lighting, installations and scene assembly
src/three/geometry/        Existing native construction programs and reusable geometry
src/three/materials/      Existing painted materials, motion and shadow pools
src/three/assets/          Native transport, bounded workers and reusable model cache
src/three/camera/          Existing replay/obstacle camera systems
src/three/entities/        Existing vehicles, rider, replay figures and wildlife
src/world/                World resolution and existing placement generators
src/data/                 Optional scenario/map reader
src/types/                Scenario, entity, driver, signal, metrics, editor and export types
src/export/               Versioned semantic package and independent GLB asset exporter
```

The two HTML entry files mount React roots. There is no parallel imperative menu or inspector implementation. The editor's compact form vocabulary produces real React elements, including controlled fields; native SVG drawing remains responsible for map geometry and traffic preview. Existing ids and public entry URLs remain available.

React receives changed UI slices through `useSyncExternalStore`; primitive selectors prevent the FPS label from rerendering hidden menus and panels. Traffic, body poses, geometry and collision data remain mutable engine state, never frame-rate React state. Replay labels update when their formatted text changes; the editor timeline publishes tenths of a second while its map preview keeps its original updates. No state-management library, R3F, SSR or production backend was added.

The engine exposes `createTrafficEngine({view, touchRoot, replayRoot, fps, ui})`, returning an immediately disposable session and a `ready` promise. A single-owner guard prevents competing engines. The React effect cancels its initial deferred import under StrictMode, then owns the real engine until unmount. Cancellation covers data fetches, worker jobs and the no-worker fallback. Cleanup stops the renderer/Timer, observers, input, replay, private actors, model/material caches and shared textures in ownership order. A separate loading manager and generation checks prevent an old session from changing a later session's progress/cache. Shared geometries/materials are deduplicated at full-engine teardown. Input and editor listeners use abort signals; preview RAF, toast and bridge polling timers are cancelled.

The existing `THREE.Timer`, 0.1-second delta cap, exploration's bounded 1/60-second slices, traffic updates and replay timing remain intact. A new fixed-step clock or interpolation model would change observations, so neither was introduced.

## TypeScript boundary

`strict: true` checks the React UI, application/editor coordination, simulation, input, collision, metrics, data loading, worker pool, diagnostics and exchange interfaces. The TypeScript uses erasable syntax and `.ts` imports so Node 22.19+/24+ can run the same simulation modules directly in existing tests; no ts-node or separate test compiler is required.

Unchanged procedural geometry, material shaders, environment batching and camera/replay visuals deliberately remain JavaScript. `allowJs: true, checkJs: false` retains those stable implementations; typed call boundaries describe the optional parameters that TypeScript consumers use. This is not a claim that every visual module has full static checking. No blanket type suppressions or relaxed checking of migrated core modules were used. Existing geometry/art tests still exercise those modules.

## Compatibility and integration fixes

| Existing capability | Migrated implementation | Evidence |
| --- | --- | --- |
| Ten built-ins and custom JSON, BOM/error/retry handling | Typed scenario/data modules and React menu | Existing unit tests and 22 production browser groups |
| Walking/cycling, head look, profiles and touch | Typed native controls with abortable listeners; React controls | Walking/cycling browser flows; profile, viewport and touch checks |
| Signals, vehicle/driver rules, physical contact | Same arithmetic in typed simulation modules | Full regression and exact before/after trace comparison |
| Exploration, slots, recovery, record export | Typed world/encounter/session modules and React feedback | World tests and browser summary/continue/incident flows |
| Fall, replay, camera views, end/results/menu | Existing native replay with React controls | Replay/browser/camera tests and state-exit checks |
| Editor map, routes, forms, validation, undo/redo and timeline | Native SVG controller plus React panels | 22 additional browser groups across both storage backends |
| LocalStorage, template protection, Unity/Quest API | Same keys, saved JSON and guarded backend | Store/server/fake-adb tests; isolated browser bridge fixture |
| Native models, scene/style/coordinates | Relocated generators and visual modules | All 398 asset/data/event/world fingerprints unchanged; art/obstacle tests |
| Static Pages publication | Typed Vite multi-page build with relative base | Production subpath browser checks and build |

No traffic-rule bug or experiment parameter was changed as part of this migration. Integration defects found during validation were fixed separately:

- Editor asset URLs now resolve from the page's deployment location, rather than the relocated module's output directory.
- The clean initial editor placeholder does not trigger a discard prompt; controlled fields synchronize undo/redo before paint, and generated form elements have stable keys.
- The simulator store is owned by `useState`, preserving profile input across Fast Refresh; a `useMemo` initializer was shown to reset it during a real JSX update. Main UI HMR retained one live context/canvas over the following seconds; the editor retained an unsaved draft and working undo/redo.
- GLB export expands and normalizes normals in its independent copy. The live native geometry stays compact and unchanged.
- Native input, worker, preview and resource lifetimes now support explicit unmount, including cancellation during initialization. Private actor owners release their meshes before shared scene resources are visited.
- Editor file/problem entries also support keyboard activation. No scenario or renderer parameter depends on this UI improvement.

## Unity exchange

The existing `vrlearn-scenario` version 1, `hikone-world` data and version-one session JSON remain compatible. Authoritative events stay in `events/`; generated `data/` was not hand-edited. The Python/Blender authors remain in `tools/`, with embedded Node imports updated to the new module locations. All Python scripts passed syntax compilation and the moved authoring-data imports were executed; Blender was not rerun because no model or placement changed.

`src/types/scene-package.ts` defines `hikone-scene-package` version 1. `createScenePackage()` copies current layout placements into explicit model entities and keeps the original layout, scenarios and world semantics. It also carries the signal period/stages and five current installation definitions from their existing authorities. Entity ordinals identify a placement within this layout snapshot; they are not persistent ids across a future reorder of the layout source.

The ready engine exposes two developer exchange methods:

```ts
const semantics = await vrlearn.exportScene();
const sedanGLB = await vrlearn.exportAsset('WEB_Sedan', 'high'); // ArrayBuffer
```

`exportScene()` includes the ten built-in event definitions, current generated layout, world references and signal configuration. Custom drafts retain the editor's existing JSON export; they are not automatically merged into this built-in scene package. GLB paths in the package describe separately generated files, not assets already bundled with the JSON. `exportAsset()` lazily imports the exporter, fetches a fresh construction program and builds a separate model. It neither reparents nor disposes the live scene. The exporter is not included in initial loading.

GLB carries supported geometry, normals, vertex pigments and standard PBR material approximations. The JSON uses the project's metre/+Y/+Z/clockwise-yaw map basis and explicitly records the X-axis mirror used by the right-handed GLB. A future Unity importer must apply its coordinate conversion consistently, without mirroring twice. Browser brush/fog/water shaders, live simulation, custom signal assembly, collision queries and controller behavior are not serialized as Unity behavior. Those require Unity implementations. Existing local Unity/Quest message formats remain optional, unchanged bridges; no sibling Unity source or real headset was modified by verification.
