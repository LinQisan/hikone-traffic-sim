# Pedestrian review verification

The [review](../pedestrian-survey-20261101.md) records sources, changes and uncertainty. These files contain simulator views and check results. No private photograph, video derivative or camera GPS catalogue is included.

## Checks

| Check | Result | Record |
| --- | --- | --- |
| `npm run check` | 362 passed; no failures or skips; typecheck, generated references and production build passed | [Log](check.log) |
| `npm run test:geometry` | 118 passed | [Log](geometry.log) |
| `node tools/check_routes.mjs` | 46 vehicle routes; no failures | [Log](routes.log) |
| New pedestrian regressions | All five fail on the frozen starting assets and pass on the final assets | [Starting failures](regression-baseline.log), final run in `check.log` |
| Walking and cycling | Four corridors, both directions and both modes: 16 controller traversals | [Results](browser.json), [harness](browser-check.mjs) |
| Practice flows | `builtin-01` and `builtin-07`: Q looking, W movement, impact, participant/overhead replay, replay end, results and menu | [Results](browser.json) |
| Views | 22 pedestrian poses plus three forced distant-detail views, including reverse views; no console errors | [View list and errors](views.json); selected views below |
| Editor | 390 × 844 viewport; no horizontal overflow or console errors | [Image](editor-mobile.jpg), [results](editor.json) |
| Original media | All 39 SHA-256 values unchanged | [Integrity result](photo-integrity.json) |
| Rebuild | Authors → native high/low programs → packing → collision → generated-data checks | [Log](rebuild.log) |

The castle-path checks cover both detail levels, terrain support at the bridge landing and inland slope continuity. The water check uses fixed interior water stations; independent shoreline arrays cannot be paired by vertex index.

## Matched views

The baseline is the production build frozen at the start of this task, including the existing uncommitted work. The final build comes from the successful full check. Both use the same page, URL, 1280 × 800 viewport, fixed cameras, high quality and reduced motion.

| Area | Before | After | Distant detail |
| --- | --- | --- | --- |
| Inner-moat street | [Before](ab-moatStreet-before.jpg) | [After](ab-moatStreet-after.jpg) | [Far](moatStreet-final-far.jpg) |
| Tennis-lot fork | [Before](ab-fork-before.jpg) | [After](ab-fork-after.jpg) | [Far](fork-final-far.jpg) |
| Bridge and museum view | [Before](ab-bridgeApproach-before.jpg) | [After](ab-bridgeApproach-after.jpg) | [Far](bridgeApproach-final-far.jpg) |

Other inspected views: [reverse fork](forkReverse-final.jpg), [reverse bridge](innerBridgeReverse-final.jpg), [campus](campus-final.jpg).

## Rendering workload

All 30 probes completed: five alternating samples per build at each of three cameras, with no HTTP failures or browser errors. Counters below are per-frame medians; their ranges were identical to their medians in all five samples.

| View | Calls before → after | Submitted triangles before → after |
| --- | --- | --- |
| Inner-moat street | 23 → 24 | 1,025,421 → 1,074,114 |
| Fork | 66 → 66 | 2,878,134 → 2,876,034 |
| Bridge | 23 → 23 | 2,117,317 → 2,097,041 |

These views remain within the project's draw-call guide. Correcting the street changes which geometry is visible at the fixed camera. Frame-time comparisons are inconclusive: another browser renderer and background services remained active, and CPU/GPU work was not isolated. The timing samples do not establish a performance improvement, mobile performance or high-refresh performance. CPU speed limit reported 100 before measurement.

[Raw probes](rendering.json), [summary and build fingerprints](rendering-summary.json), [machine context](measurement-context.json).

## Reproduction

Start `npm run dev`. Use an installed Playwright module; it is not added as a project dependency. `browser-check.mjs` writes its results beside the script and accepts `SIMULATOR_URL` (default `http://127.0.0.1:8770/`). For production A/B, retain the starting `dist/` before building the modified version:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node docs/pedestrian-survey-20261101/browser-check.mjs
BEFORE_DIST=/path/to/frozen/dist PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node docs/pedestrian-survey-20261101/rendering-check.mjs
```

`AFTER_DIST` defaults to this repository's `dist/`. The rendering harness serves both builds on one local origin and alternates five before/after pairs. Each camera uses two seconds of warmup and eight seconds of sampling. It records HTTP failures, browser errors, submitted triangles and draw calls.

Dimensions and camera poses remain approximate. No physical phone or headset was tested. Vite retains its existing warning for chunks exceeding 500 kB.
