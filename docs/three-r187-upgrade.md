# Three.js r186 to r187

Upgrade audit dated 2026-10-31. The runtime and its declarations are pinned to `0.187.0` in `package.json` and `package-lock.json`. npm also reconciles the lockfile's root Node engine metadata with the existing `package.json` requirement (`^22.19.0 || >=24.0.0`). React 19, TypeScript, Vite 8, local npm imports, the relative multi-page build and the Pages workflow retain their existing configuration.

## Baseline and scope

The r186 baseline is commit `b5699a42472c51a7981a8f79a9d881dbe6b8b196`; the upgrade is `376c824`, its direct child. The starting checkout also has uncommitted field-survey geometry, data, docs and tests. Those changes remain outside the upgrade commit. Both production snapshots used for measurement include the same starting working-tree assets, rather than comparing different map revisions.

Local evidence in `.git/three-r187-audit/` includes the original manifests, starting status, binary tracked-file patch, SHA-256 file inventory, command logs and frozen `r186-dist/` and `r187-dist/` production builds. The baseline commit alone does **not** contain the starting uncommitted changes. These local artifacts are not deployed. Field photos are excluded from the snapshots and delivery.

Only dependencies and this audit/measurement record change. No renderer, material, model generator, layout, simulation, scenario, editor, Vite or Actions implementation change is needed. Existing uncommitted files are compared with the initial hashes before handoff.

## Official migration audit

Reviewed the [official 186 to 187 guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide#186--187) and [r187 release](https://github.com/mrdoob/three.js/releases/tag/r187), then searched the runtime and export modules for the affected APIs.

| Change | Project usage and decision |
| --- | --- |
| TSL math coercion, storage structs, `pixelationPass`, custom light registration | No TSL, node materials, WebGPU renderer or post-processing in the runtime. No call site to migrate. |
| Cube-based PMREM; removal of `CubeUVReflectionMapping` | No PMREM generator, environment map or removed mapping constant. `buildLight()` bakes a painted sky into `WebGLCubeRenderTarget` with `CubeCamera`, used as `scene.background`. Lambert town materials do not use PMREM lighting. Retain the existing sky and light settings. |
| `setViewport` / `setScissor` no longer apply DPR inside a render target | No direct renderer calls to these APIs. The sky bake uses Three.js's `CubeCamera` implementation. Replay's `setViewport()` adjusts camera composition; it does not call the renderer API. Test desktop DPR 1 and emulated mobile DPR 2. |
| Internal `WeakRef` / `FinalizationRegistry` | Modern browser requirement. Existing geometry/material/texture deduplication, worker cancellation and explicit renderer disposal remain in place. GC is not a substitute for explicit disposal. Older embedded browsers still need separate device validation. |
| XR first-eye camera matrices | No XR session or XR camera in this browser application. |
| `MeshPhysicalMaterial.iridescenceThicknessRange` deprecation | No physical material or iridescence usage. |

Reviewed `TrafficEngine.ts`, `world.js`, `environment-instances.js`, `materials/`, `assets/`, `renderer/`, geometry construction and the independent GLB exporter. Retained `WebGLRenderer`, instanced meshes, existing high/low LOD and hysteresis, spatial cells, frustum culling, shadow-only caster lists, cached sun shadows, blob shadows and adaptive resolution. Benchmark mode continues to disable adaptive resolution. Vertex pigments, compact normalized attributes, palette textures and `onBeforeCompile` shader injections are unchanged. Existing lifecycle and geometry tests exercise worker transfer, shared prototypes, private-resource disposal and export copies.

## Meshlet / WebGPU assessment

Decision: keep the WebGL pipeline. Meshlet is an experimental candidate for a separate experiment after material compatibility work, with no performance claim from this upgrade.

The [tagged r187 pipeline](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/pipelines/MeshletDrawingPipeline.js) is more restrictive than the feature summary in [PR 35191](https://github.com/mrdoob/three.js/pull/35191). Its `isSupportedMaterial()` rejects `vertexColors`, `polygonOffset`, non-front sides, transparent/transmissive materials, flat shading and several custom node outputs. The town palette uses vertex colours and polygon offset; some surfaces require two sides. GLSL `onBeforeCompile` paint and `ShaderMaterial` sky cannot be carried into WebGPU unchanged. Simply assigning this pipeline would leave the relevant objects on its regular path or lose the authored appearance after an incomplete renderer migration.

| Existing system | Compatibility and experimental boundary |
| --- | --- |
| `InstancedMesh` | Supported for compatible geometry/materials. It does not remove the material restrictions. Keep sharing geometry and instance transforms; measure before replacing current batching. |
| Authored high/low LOD and spatial cells | Can remain as an outer selection rule, but meshlet screen-error LOD would add another selection layer. Freeze authored LOD first, then test one LOD authority at a time. The pipeline's special handling of Three.js `LOD` is not a drop-in replacement for this project's custom cell/instance lists. |
| Vertex pigments / palette / brush / water | Requires a separate TSL/node-material equivalent, including extra attributes, coordinate transforms and cache/disposal ownership. The `vertexColors` flag itself is currently rejected. Do not disable it in production to bypass the check. Preserve colour and silhouette seams during simplification. |
| Merged geometry and model workers | Native programs can continue producing source geometry. [MeshletGeometryUtils](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/utils/MeshletGeometryUtils.js) then welds vertices and builds 64-triangle clusters with up to six detail levels including the original. Preprocessing, worker transport/caching, storage buffers and their disposal need explicit ownership. Avoid serial processing of every high and low recipe before the first frame. |
| Shadows / sky / replay cameras | Keep cached sun shadows and moving blob shadows as acceptance criteria. Cube targets, main orthographic/array-camera views and unsupported render contexts use regular paths; compatible shadow passes have separate handling. Validate sky baking, re-centering, participant/driver cameras and depth bias separately. |

Potential effects are hypotheses: cluster/LOD indices, bounds, interleaved float storage, visibility queues and depth pyramids can raise resident/peak memory despite fewer visible triangles. First-load preprocessing and new JS/WASM can slow startup; preprocessing offline might instead increase download/cache size and require a new versioned format. Indirect batching may reduce CPU submission work, while current merged/instanced draws already amortize it. Compute culling, depth passes and extra pipeline work may outweigh triangle savings in open street views. Draw-call counters across the two renderer APIs are not directly comparable; count compute/depth work and use actual GPU timestamps where available.

An isolated experiment should compare three conditions: current WebGL r187, WebGPU with the standard pipeline and visually equivalent node materials, then WebGPU plus Meshlet. Start with one dense opaque district and a repeated asset. Keep all source positions, collision, traffic, camera, resolution and light settings fixed. Use a street, an occluded dense area, an open panorama and replay, alternating at least three runs per condition after a warmup. Record first usable frame, bytes transferred, preprocessing time, CPU update/submission p95, GPU pass timestamps, submitted/visible triangles, draw/dispatch counts, JS heap and buffer/texture memory estimates. Test close seams, lettering, reverse views, LOD boundaries and repeated teardown. Proceed only if image/behaviour parity and measured benefits justify the added complexity on representative desktop and phone hardware.

[WebGPU requires a secure context and is not universally available](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API). Browser name alone is insufficient: check `navigator.gpu`, adapter/device creation, required limits/features and device loss. HTTPS Pages and localhost qualify; a phone visiting a plain HTTP LAN address may not. Keep the current WebGL renderer/material path as the default and the explicit fallback on any failure. The WebGPURenderer's internal WebGL backend can fall back to standard drawing, but it does not execute this application's existing GLSL paint hooks, so it is not an equivalent fallback without separate validation. No WebGPU imports, feature switch or meshlet resources are added by this upgrade.

## Verification and measurements

`npm ci`, `npm run typecheck`, `npm test`, `npm run check` and `git diff --check` pass. The standalone r187 test run and the full check each pass **330 tests, zero failures and zero skips**. The isolated r186 baseline also passes the full check with 330 tests. The full check includes generated-document consistency and the unchanged production build. The existing large-chunk advisory remains in both builds; the Three.js chunk grows from 581.06 to 584.80 kB minified, and 146.36 to 146.60 kB gzip.

`node tools/check_events.mjs` checks all ten events: every cautious and ordinary-driver reference reaches the goal. Some hasty departures are blocked by stopped traffic, which the checker reports as an outcome. `node tools/check_routes.mjs` checks 46 routes with zero failures. Physical contact/steering/signal behaviour, native high/low geometry, LOD/frustum/shadow invariants, resource lifecycle, editor storage/server/Quest fixtures and scenario import are included in the regression suite. No real Unity or Quest session is claimed.

The [browser record](performance/three-r187-20261031/browser.json) uses Chrome 156, desktop 1280x800 and touch emulation 390x844 at DPR 2, under `/hikone-traffic-sim/`. It covers all ten practice starts, vehicle movement and signal labels, forced impact replay, participant/overview/available driver views, replay completion, results and return to menu. Walking and cycling exploration exercise real keyboard movement/look and summary exits. Events 01 and 07 also exercise success replay by placement at the goal. Editor checks include ten built-ins, duplicate/edit, JSON download/import, local save/reload and narrow-screen layout. Scene-package export and an independent 122,484-byte sedan GLB succeed. Emulated touch joystick and drag-look work in both modes. Browser errors, warnings and HTTP failures are all empty. Desktop, mobile town and mobile editor screenshots were visually inspected locally.

The first browser audit assumed every moving vehicle existed in the initial snapshot. Event 10's independent delayed departure violates that assumption; the audit now also checks the travelled distance of newly spawned vehicles. The original failure is retained in the local audit logs, and the complete corrected run passes. No traffic change was made. Forced impact and goal placement verify presentation flows; actual contact, signals and cautious traversal are covered by the independent logic/event checks above.

Raw measurements and the repeatable driver live in [performance/three-r187-20261031/](performance/three-r187-20261031/). No physical phone, Safari, Firefox, real Quest/Unity session, actual Pages deployment, GPU timestamps or total GPU-memory measurement is verified by this run. Mobile screenshots and interaction emulation do not establish mobile frame rate.

### Fixed-view production comparison

[Raw benchmark JSON](performance/three-r187-20261031/benchmark.json): Intel i7-9750H, 16 GiB RAM, AMD Radeon Pro 5300M through ANGLE Metal, headless Chrome 156.0.8078.74. One tab is reloaded at the same URL under `/hikone-traffic-sim/`, with identical assets, camera, 1280x800 viewport, DPR 1 and reduced motion. Benchmark mode fixes resolution. Builds, test jobs and the functional browser are finished before sampling. The serial order is r186, r187, r187, r186, r186, r187, with two seconds of warmup and eight seconds of sampling per view. The table gives the median of three samples per version and view.

| View / metric | r186 | r187 |
| --- | ---: | ---: |
| Junction FPS | 60.013 | 60.011 |
| Junction p95 frame ms | 18.70 | 18.70 |
| Junction draw calls | 116 | 116 |
| Junction triangles | 1,820,332 | 1,820,332 |
| Promenade FPS | 60.015 | 60.002 |
| Promenade p95 frame ms | 18.70 | 18.70 |
| Promenade draw calls | 28 | 28 |
| Promenade triangles | 424,179 | 424,179 |
| Scene geometry backing buffers, both views (bytes) | 96,997,747 | 96,997,747 |
| Environment geometry counter, both views (bytes) | 94,598,151 | 94,598,151 |
| Junction renderer geometries / textures / programs | 176 / 9 / 21 | 176 / 9 / 21 |
| Promenade renderer geometries / textures / programs | 192 / 9 / 23 | 192 / 9 / 23 |
| Junction JS heap snapshot (bytes) | 291,616,821 | 290,819,043 |
| Promenade JS heap snapshot (bytes) | 241,203,655 | 215,886,009 |

No material rendering-workload or frame-time regression appears in these samples. FPS is near the display callback cadence, so this does not establish spare GPU capacity or a speedup. The backing-buffer counters match exactly; they exclude textures, render targets, drivers and CPU object overhead. JS heap snapshots vary with GC and view order and are not evidence of a memory saving. `readyMs` and transfer totals remain in the raw data for diagnosis; this was not a controlled cold-start benchmark. The paired screenshots were visually inspected with no visible appearance change at the measured views. No browser or resource errors occurred during sampling.

## Integration

The upgrade was fast-forwarded into `main`, and its check was repeated on a clean checkout (324 tests). The field-survey work followed it in separate commits. A push to `main` still triggers the existing Pages workflow.

To repeat the performance comparison, produce two builds from exactly the same source/data snapshot using the saved r186 and r187 manifests, with `npm ci` completed before each build. Save the outputs as `.git/three-r187-audit/r186-dist/` and `r187-dist/`. With Playwright installed outside project dependencies, run:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
  node docs/performance/three-r187-20261031/benchmark.mjs .git/three-r187-audit
```

The driver serves only those frozen builds on loopback, uses one browser tab reloaded at the same sub-path URL for each revision, disables cache, alternates revisions and saves raw JSON/screenshots in the local audit directory. Stop builds, tests and other rendering pages during sampling.
