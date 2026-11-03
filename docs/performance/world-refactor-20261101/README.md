# World rendering refactor, 2026-11-01

Performance-led refactor of the open world, informed by reading [Slop New York](https://github.com/mrdoob/slop-newyork): its size-based distance culling, per-tree levels with hysteresis, shadow proxies, offline preprocessing and warm-up frame. Its code was not copied.

## Measurement

Intel i7-9750H and Radeon Pro 5300M, Chrome with vsync off, production builds, 1280×800. "Mobile" is 844×390 at DPR 2 with CPU ×4 throttling; the GPU is not throttled, so it is an emulation, not a phone. Baseline is commit `02dd15e` plus the working tree before this refactor. Builds alternated with cool-down, and `pmset -g therm` read `CPU_Speed_Limit = 100` throughout. Raw results and `bench.mjs` are here. The flight is the 2620 m loop in 25 s, three alternating runs each on desktop.

| Metric | Before | After | Change |
| --- | --- | --- | --- |
| Load to first frame, desktop | 18.3 s | 5.0 s | −73% |
| Load to first frame, mobile | 29.2 s | 14.8 s | −49% |
| Model transfer | 38.1 MB | 28.9 MB | −24% |
| Flight fps, desktop | 325–350 | 443–446 | about +30% |
| Flight frame p95 / p99, desktop | 6.3 / 11.5–12.3 ms | 4.2 / 6.2–6.4 ms | −33% / −46% |
| Worst flight frame, desktop | 488–830 ms | 11.5–12.9 ms | stalls gone |
| Flight fps, mobile | 240 | 317 | +32% |
| Flight frame p95 / max, mobile | 7.3 / 137 ms | 5.3 / 13 ms | −27% / −90% |
| Flight draw calls, mean / max | 72 / 260 | 27 / 106 | −63% / −59% |
| Flight triangles, mean / max | 1.71 M / 6.10 M | 1.16 M / 3.40 M | −32% / −44% |
| Scene geometry buffers | 153.5 MB | 192.2 MB | +25% (cost) |
| JS heap, desktop | 324 MB | 394 MB | +22% (cost) |

Fixed views, draw calls / triangles / frame p95 (ms):

| View | Before | After |
| --- | --- | --- |
| Kyobashi junction | 147 / 2.28 M / 4.6 | 72 / 1.47 M / 4.0 |
| Moat street east | 192 / 3.35 M / 5.8 | 68 / 2.07 M / 4.5 |
| Nishi corner | 186 / 1.91 M / 4.5 | 62 / 1.45 M / 4.2 |
| Campus | 72 / 2.62 M / 3.6 | 14 / 1.42 M / 3.7 |
| Castle road | 38 / 0.62 M / 3.3 | 19 / 0.34 M / 3.4 |
| North road | 173 / 2.15 M / 6.6 | 71 / 1.69 M / 5.2 |
| East street | 45 / 2.76 M / 4.3 | 24 / 1.47 M / 4.1 |
| Panorama | 113 / 4.62 M / 9.6 | 54 / 2.60 M / 4.9 |
| Overview | 65 / 5.29 M / 7.3 | 30 / 2.95 M / 4.7 |

## Findings

- **Load.** Twelve seconds went on rebuilding geometry from programs in the browser. Meshes are now baked offline and only decoded.
- **Draw calls.** Hundreds of ground cells cost a call each. Cells of one material now share a multi-draw.
- **Triangles.** Distant trees and terrain drew at full low detail.
- **Stalls.** First sight of a level uploaded buffers and compiled programs mid-walk.
- **Gaps.** Ground sheets have no risers, so a low sight line ran under raised edges to the sky. This cannot be seen from above.

## Changes

- `tools/bake_models.mjs`, `src/three/assets/baked-model.js`: quantised, meshopt-coded meshes with content-addressed caching; programs remain the source and the fallback.
- `src/three/geometry/model-closure.js`: risers on ground sheets, deeper at banks. Two map holes were fixed in their authors (`tools/nishi_rampart.py`, `tools/east_extension.py`).
- A far level for assets and cells, with an area guard, plus size-based culling and a `setDetail()` scale for touch devices and low resolution.
- `src/three/scene/cell-batches.js`: per-material multi-draw, culled when the view moves.
- A warm-up before the menu draws every level unculled, shadow pass included. Printed sign faces stopped casting, because they lie on backing plates and otherwise add a program that depends on draw order.

Two faults appeared during validation and were fixed before the numbers above. Risers on sub-1 m² brush strokes drew dark scratches on roads, and an over-aggressive far level (`simplifySloppy` at 14%) lost up to 75% of canopy area and tore the distant view. That earlier far level looked 20–35% cheaper in triangles; the figures above are the corrected one.

## Verified

`npm run check` 356/356, `npm run test:geometry` 117/117, `check_routes.mjs` 46 routes, `check_events.mjs`, `git diff --check`. Exploration on foot, cycling (`view=ride`) and both replays reach their controls with no console errors. Fixed-view screenshots match the baseline except for the closed gaps.

## Not verified or left open

- No real phone or headset. GPU cost on a phone is unmeasured.
- Main-thread merging still takes 7 s under CPU ×4 (1.7 s on desktop) and blocks the loading screen. It was 7.5 s before.
- One 890 ms flight stall appeared once on the build before last and did not reproduce in eight later runs.
- A sliver of about 1.4 m² remains between moat water and wall at (−75, 85). A few pixels of sky remain at the horizon at the map edge.
- Geometry memory rose by 25%, because all three levels stay in memory.
