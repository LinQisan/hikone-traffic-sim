# Five-view review verification

The [review](../five-viewpoints-20261101.md) records the five corrections, evidence and estimated dimensions. This directory contains simulator screenshots, harnesses and verification records. It contains no private source photograph, video frame or photo GPS catalogue.

The survey date is 1 November 2026; final verification ran on 2 November in Japan.

## Checks

| Check | Result | Record |
| --- | --- | --- |
| `npm run check` | 373 passed, zero failures or skips; typecheck, generated references and production build passed | [Log](check.log) |
| `npm run test:geometry` | 118 passed | [Log](geometry.log) |
| `node tools/check_routes.mjs` | 46 vehicle routes, zero failures | [Log](routes.log) |
| Five-area regression | All ten initial checks failed on the starting assets; final high/low geometry, street widths and body clearance pass | [Starting failures](regression-before.log), [final checks](walked-streets.log) |
| Road seams | 9 passed, including the captured Float32 failure and single cap ownership | [Log](road-seams.log) |
| Walking and cycling | Eight corridors in both directions and both modes: 32 controller traversals | [Results](browser.json), [harness](browser-check.mjs) |
| Practice flows | `builtin-01` and `builtin-07`: Q looking, W movement, impact, participant/overhead replay, replay end, results and menu | [Results](browser.json) |
| View review | Five saved cameras at high and distant detail, plus eight ground-level/reverse views; no browser or HTTP errors | [Results](views.json), [harness](views-check.mjs) |
| Editor | 390 × 844, selected fork coordinate retained, no horizontal overflow or console errors | [Results](editor.json), [view](editor-mobile.jpg) |
| Original media | All 39 SHA-256 values unchanged | [Integrity result](photo-integrity.json) |
| Shared behaviour and style | 18 protected files, including events, coordinates, engine and wall texture, unchanged from task start | [Compared hashes](source-integrity.json) |
| Generation | Full affected set, then the scoped corner/furniture and hidden-underlay refinements, each through ordered stages | [Log](rebuild.log) |

The production build retains Vite's existing warning about chunks larger than 500 kB.

## Views

The saved cameras below reproduce the owner's five positions, bearings, pitches and eye heights at 1440 × 1000. Forced distant detail checks the low recipes from the same cameras.

| Area | High detail | Distant detail |
| --- | --- | --- |
| Otemon crossing | [View](view-bridge-high.jpg) | [View](view-bridge-low.jpg) |
| Local street connection | [View](view-streetJoin-high.jpg) | [View](view-streetJoin-low.jpg) |
| Cherry fork | [View](view-fork-high.jpg) | [View](view-fork-low.jpg) |
| Tennis frontage | [View](view-tennis-high.jpg) | [View](view-tennis-low.jpg) |
| University gate | [View](view-university-high.jpg) | [View](view-university-low.jpg) |

Ground-level inspections include [inside the gate](foot-campusInside.jpg), [the noticeboards](foot-campusApproach.jpg), [the fork from the street](foot-forkEast.jpg), [the fork from behind](foot-forkNorth.jpg), [tennis frontage](foot-tennisWest.jpg), [the residential lane](foot-laneNorth.jpg) and the bridge [toward the hill](foot-bridgeEntry.jpg) and [toward town](foot-bridgeReturn.jpg). Camera and error records are in [views.json](views.json).

## Rendering workload

All 50 camera samples completed: five alternating production reload pairs for each of five fixed cameras, with zero browser or HTTP errors. Counts are per-frame medians; across the five reloads, each range equals its reported median.

| View | Calls before → after | Submitted triangles before → after | Matched images |
| --- | --- | --- | --- |
| bridge | 25 → 25 | 1,487,842 → 1,521,210 | [Before](ab-bridge-before.jpg) / [After](ab-bridge-after.jpg) |
| streetJoin | 16 → 16 | 1,099,324 → 1,112,458 | [Before](ab-streetJoin-before.jpg) / [After](ab-streetJoin-after.jpg) |
| fork | 13 → 13 | 748,731 → 731,598 | [Before](ab-fork-before.jpg) / [After](ab-fork-after.jpg) |
| tennis | 19 → 19 | 2,398,082 → 2,397,434 | [Before](ab-tennis-before.jpg) / [After](ab-tennis-after.jpg) |
| university | 15 → 15 | 730,962 → 675,253 | [Before](ab-university-before.jpg) / [After](ab-university-after.jpg) |

Draw calls remain unchanged at these views. The corrected geometry changes submitted triangle counts in both directions. This comparison makes no speed or frame-time claim: other browser and simulator workloads remained active, load averages exceeded the 12 logical CPUs and CPU speed limit reported 77%. Only task-owned builds and checks were stopped. The counts establish rendering work, not mobile or high-refresh performance.

[Raw frame counters and per-reload ranges](rendering.json), [build fingerprints](build-fingerprints.json), [machine context](measurement-context.json).

## Reproduction

Start `npm run dev`, then use an installed Playwright module. These scripts do not add a project dependency.

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node docs/five-viewpoints-20261101/views-check.mjs
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node docs/five-viewpoints-20261101/browser-check.mjs
BEFORE_DIST=/path/to/frozen/before/dist AFTER_DIST=/path/to/frozen/after/dist PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node docs/five-viewpoints-20261101/rendering-check.mjs
```

The rendering harness alternates five production reload pairs on the same origin and URL, at the same fixed world cameras. It uses `benchmark=1`, high quality, reduced motion, two seconds of warmup and thirty distinct rendered frames per camera. Within-run frames are observations, not independent trials. It records actual submitted geometry and errors; it makes no frame-time or speedup claim. Stop builds and other task-owned heavy jobs before running it.

Widths, radii, the gate passing point and fence/bed placements remain estimates supported by mapped topology and the private field photographs. No physical phone or headset was tested.
