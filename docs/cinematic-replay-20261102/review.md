# Fixed analytical replay shots — 2026-11-02

The analysis view now explains the participant–vehicle relationship with held compositions and
deliberate cuts. The former director continuously fitted a changing subject envelope and smoothed
its boom, producing large scale changes as the reference vehicle approached and departed. Fixed
shots remove that cause: position, focus and field of view stay constant inside each shot.

Long recordings can establish the road and travel path, show the approach, then hold the interaction
through contact and landing. Short recordings omit unnecessary beats; compatible neighboring shots
merge. The preferred angle is an oblique three-quarter view from the participant's approach side.
Visibility can require a higher angle or an additional cut. The contact window remains uninterrupted
where a clear composition exists. Safe arrivals use the same director without contact effects.

`ReplayCamera.ts` owns planning, viewport changes and deterministic playback. `replay.js` supplies
actual posed participant/bicycle bounds, separate reference-vehicle targets and identified traffic
blockers. Static town silhouettes, parked vehicles and swept moving blockers remain part of the
visibility checks. Playback selects precomputed poses without camera raycasts or new vectors.
The public UI calls the view **分析 / Analysis**; its existing view id and shortcuts remain compatible.

The design comparison selected fixed shots over a continuously tracking boom with distance bands.
Both could reduce pumping, but fixed compositions make shot size an invariant and give each change
an editorial purpose. Typed subject groups and explicit reference-vehicle exclusions were retained
from the alternative design.

Preview the [establishing shot](walking-landscape-establish.jpg),
[interaction](walking-landscape-interaction.jpg), [landing](ab-landing-after.jpg),
[portrait cycling view](bicycle-portrait-interaction.jpg) and
[320 px forced-colour controls](narrow-forced-colors.jpg).

The [production comparison](benchmark.json) uses five alternating before/after reload pairs on
the same browser page, origin, viewport, quality and deterministic recording. Direct 60 Hz camera
sampling confirms a constant lens and distance inside each new shot:

| Recording interval | Previous boom range | New boom range |
| --- | --- | --- |
| 0–2.5 s | 31.98–35.23 m | 32.06 m, constant |
| 2.5–5.6 s | 16.46–31.90 m | 14.79 m, constant |

The scale change at 2.5 s is a cut from road context to the interaction, rather than a camera flight.
The field of view stays at 50° throughout both versions. Replaying or seeking the same time produces
the same composition.

Actual rendered work was sampled at three recording times after 500 ms warmup, using 30 distinct
rendered frames per view and medians across five reloads. Draw calls were 76 → 75 at establishment,
68 → 68 at interaction and 66 → 67 at landing. Closer compositions intentionally select different
geometry and LOD: triangle medians were 443,681 → 510,521; 425,085 → 566,201; and
411,316 → 566,209 respectively. Each metric's reload range equalled its median. These are workload
counts, not a frame-time improvement or proof of mobile GPU headroom. The host had 12 CPU cores
and load averages around 9/11/8 after checks stopped; existing user applications remained running.
No camera or network errors occurred in the production comparison.

Verification:

- `npm run check`: 384 tests passed, zero failures/skips; typecheck, generated reference check and
  production build passed. Camera/replay checks alone passed 23 tests, including actual town
  geometry, walking/cycling, portrait inset, fixed shots, dense playback, a transient moving truck,
  short blind corners, restart, disposal and enclosed-recording fallback.
- [Browser checks](browser.json): four deterministic render fixtures (walking contact, bicycle
  contact, safe arrival and no-car arrival) in landscape, portrait and reduced motion. All 12 plans
  were clear; camera and focus drift inside shots were zero. Reduced motion found one stationary
  composition for each fixture.
- All ten built-ins reached contact replay and safe-arrival replay, then results and menu. Actual
  keyboard movement/look, view cycling and replay restart were exercised. Contact was triggered
  through the debug command and safe arrival through controlled placement; these checks verify
  flow, not natural participant behavior or accident probability.
- The 320 px forced-colour check found 43 px playback action heights. A scoped replay-bar rule
  raises them to 44 px. The final browser check confirmed visible focus, 44 px or larger controls,
  reduced motion and no horizontal overflow. The final stylesheet was rebuilt and included in the
  production comparison. Browser console/page errors and non-success production responses: zero.
- [Starting-file integrity](source-integrity.json): 1,051 existing files retained their starting
  hashes. Changes are limited to replay camera/caller, labels, scoped button sizing, tests and
  documentation. Prior model, generated-data, traffic and replay-wait changes remain intact;
  `TrafficEngine.ts` differs from the starting copy only in the replay announcement. No commit or
  push was made. `git diff --check` passed.

This is desktop Chrome verification with responsive emulation. Real phones, Safari, Firefox and
Quest were not exercised. Fully enclosed custom recordings can still have unavoidable occlusion;
the planner marks that finite fallback explicitly. Street geometry and source field photos were
not changed by this task.

Rerun with `npm run dev`, set `PLAYWRIGHT_MODULE` to an installed Playwright entry if needed, then
run `node docs/cinematic-replay-20261102/browser-check.mjs`. For the production comparison, set
`BEFORE_DIST` and `AFTER_DIST` to frozen build directories and run the neighboring `benchmark.mjs`.
