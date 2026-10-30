# React and TypeScript architecture migration

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

## Compatibility

Saved version-one scenarios, `hikone-world` data and session JSON stay compatible. The before/after inventory and validation record are in git at `f4cd136`.

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
