# Built-in event review — 2026-10-16

All ten browser events were inspected on the map and played through contact, replay and results. The review uses `events/builtin-*.json`, which supplies both `data/scenarios/` and `data/editor/templates/` through `tools/sync.mjs --events-only`. Both editor backends now open these browser events by default.

## Process and decisions

| Event | What happens | Review outcome |
| --- | --- | --- |
| 01 | The participant starts across the crosswalk; a westbound car reaches the near lane from the right. | Correct both east-side turns and the west-side exit, including the screenshot's shortcut across the pavement. Keep the near-lane hazard. |
| 02 | A car approaches from Castle Road, turns right and crosses the participant's far lane. | Correct the Castle Road approach, both bridge bends and the east-side exit. Use 30 km/h; the event still works with no initial waiting. |
| 03 | One eastbound car passes, followed by the accident car on the same lane. | Correct their shared east-side exit. Keep the 1.6 s lead and second-car hazard. |
| 04 | The participant steps out from the parked truck's blind spot into a westbound car. | Correct the west-side exit. Keep the hidden approach and crossing position. A careful participant still has 0.83 s of geometric visibility before the car passes. |
| 05 | From the bridge side, a waiting car behind the participant turns left across the crosswalk. | Correct the background streams' Castle Road and bridge bends, plus the accident car's east-side exit. Use 22 km/h and a 10 s maximum hold. |
| 06 | A fast westbound car reaches the participant from the right and continues after impact. | Correct the east-side approach and remove the 27 cm dogleg from the authored westbound tail. Keep 65 km/h and `noStop`. |
| 07 | A car pulls out of the parking exit, crossing the bicycle's line as it turns into the near lane. | Correct the eastbound stream's distant exit. Preserve the intentional driveway crossing; use 18 km/h and a 4 s fallback. |
| 08 | The bicycle passes the driveway mouth and the emerging car strikes its side before merging. | Correct the eastbound stream's distant exit. Preserve the distinct driveway turn and meet offset; use 18 km/h and a 4 s fallback. |
| 09 | A westbound car passes first; an eastbound accident car then reaches the other lane. | Remove the westbound tail's dogleg and correct the accident car's east-side exit. Keep the 1.4 s lead and opposite-direction hazard. |
| 10 | A bicycle riding on the right meets the eastbound traffic head-on. | Correct the opposing stream's east-side exit. Preserve the head-on hazard and careful passage along the road edge. |

Following the owner's request to fix vehicles running on the pavement, browser event route points were corrected in `events/` and synced into both generated scenario collections. Participant spawns, goals, triggers, parked vehicles, roads and Unity files were not changed by these corrections. Editor templates, lane presets and snapping guides use the corrected event routes.

## Steering correction

The original westbound tails in 06 and 09 included two successive waypoints at `x = -6.08`, with `z = 24.19` and `23.92`. Rounding those 27 cm apart points independently produced a sharp pair of turns between long straights. The front wheels reached the 38° steering limit. The redundant second point is now removed from the event sources, so the editor's linear preview also avoids the abrupt turn.

`smoothRoute()` now simplifies small deviations before rounding. It preserves endpoints and explicit reversals, keeps the imported scenario arrays untouched, and does this work once when a traffic plan is built. Existing large-corner and axle-steering tests still pass.

Measurements below sample a sedan pose every 10 cm along each entire vehicle path. The regression test separately checks that the small correction stays inside the original lane corridor, needs less than 3° of steering and changes heading by less than 0.5° per 10 cm.

| Vehicle | Maximum steering, before → after | Maximum heading change per 10 cm, before → after |
| --- | --- | --- |
| 06 accident car | 38.0° → 21.4° | 2.14° → 0.82° |
| 09 first passing car | 38.0° → 12.5° | 2.15° → 0.47° |

These are trajectory measurements, not frame-rate or physical accident-reconstruction claims.

The browser playthrough also exposed a results issue in 04: a car present for less than the one-second speed window could be reported as stationary. Speed estimation now uses the available pre-contact record when it is shorter than a second, while retaining the original window for longer tracks. The new regression first failed with 0 km/h and now reports the expected 36 km/h; the browser result was also verified as 36.0 km/h.

## Timing checks

`node tools/check_events.mjs --json` uses the real city and event-specific parked vehicles for sight lines. It simulates three hasty starts (0, 3 and 7.3 s of initial waiting, including another traffic seed) and one careful participant per event. In all ten events, all three hasty starts contact that event's accident car; the careful participant sees it and reaches the goal unhurt. No tested car appears visibly within 60 m after the initial frame.

Times below are seconds from scenario start, with no initial waiting. Careful completion includes walking/riding and waiting, rather than measuring the timeout alone.

| Event | Hasty contact, before → after | Careful completion, before → after |
| --- | --- | --- |
| 01 | 3.63 → 3.63 | 11.0 → 11.0 |
| 02 | 5.47 → 5.73 | 8.8 → 8.8 |
| 03 | 3.73 → 3.73 | 10.0 → 10.0 |
| 04 | 2.83 → 2.80 | 6.6 → 6.6 |
| 05 | 2.67 → 2.57 | 22.7 → 17.7 |
| 06 | 2.93 → 2.97 | 7.4 → 7.4 |
| 07 | 11.63 → 11.63 | 31.5 → 29.6 |
| 08 | 11.50 → 11.43 | 31.4 → 29.5 |
| 09 | 3.67 → 3.67 | 10.3 → 10.4 |
| 10 | 8.37 → 8.37 | 45.8 → 45.8 |

## Carriageway corrections

- The westbound exit in 01/04 now follows an 8 m radius bend centred at `(20, 16)`. The former diagonal shortcut crossed the inside pavement. Its final point is kept far enough inside the road for the front bumper to remain on the carriageway.
- The Castle Road approach in 02/05 now follows an 8 m radius bend centred at `(22, 4)` rather than cutting the inside corner.
- The bridge's north end in 02/05 uses a lane-appropriate 8.5 m inner bend and 12 m outer bend centred at `(42, 52)`.
- The east-side bend uses an 8 m inner approach for 01/06 and a 12 m outer exit centred at `(82, 16)` for eastbound routes across all ten scenarios. Intermediate points also keep the editor's car rectangle clear when its heading changes between segments.
- The off-carriageway starts in 07/08 are intentional driveway approaches. The checker permits only the accident car's bounded crossing at that driveway (`x = -69…-63`, `z = 14…22.05`); it does not exempt the rest of either route or ordinary traffic.

`tools/check_routes.mjs` checks all 23 vehicle routes in both the simulator and editor collections by default (46 checks). It samples every authored segment and the editor's 4.4 × 1.8 m rectangle, then samples the runtime path with each applicable vehicle body's corners, edge midpoints and centre at intervals no greater than 25 cm. Ordinary traffic checks all three body sizes. Accident cars check the sedan. Degenerate map triangles are excluded so they cannot incorrectly mark every point as road. All checked samples are clear after correction. A regression case specifically rejects a car whose centreline is clear but whose body crosses the kerb.

## Reproducing the map review

Open the editor and select a built-in from the left-hand list, select **車**, then select the accident car; enable **表示 → 路面** to inspect it against the road. No JSON import is needed. For the actual browser accident process, select that built-in event in the simulator.

The editor's timeline, serialization and browser handoff use the shared Unity fields. They do not preserve/reproduce web-only `meet`, `hold` and timeout scheduling, so the imported timeline is useful for geometry inspection, not for validating these browser launch times. Keep the event source files as the timing authority.

## Verification

- The new steering regression failed before the change (38°) and passed after it.
- `node tools/check_routes.mjs --dir events`: 23/23 vehicle routes clear. Generated scenarios have the same geometry.
- `node --test test/routes.test.mjs test/turning.test.mjs`: 17/17 passed.
- `node --test test/logic.test.mjs`: 9/9 passed, including the short-record speed regression.
- Initial route review `npm test`: 94/94 passed, none skipped, including route bodies, event purposes, art and obstacle checks.
- All ten built-ins were imported into the map editor for route inspection with no console errors, and played in the browser through contact → replay → results. Event 02 also checked both replay views and restart. The runtime reported no console errors.
- `git diff --check` passed. `node tools/build_collision.mjs` regenerated the collision grid; the output was unchanged because the town and road geometry stayed fixed.
- Not checked on a real phone, Unity Editor or Quest. Careful completion and delayed-start comparisons above are automated simulations; the browser playthroughs used continuous forward movement.

## Follow-up: default editor templates

The first route review imported corrected event JSON into the editor but missed its default templates. The owner's follow-up screenshot exposed that `data/editor/templates/` and the local server still used older Unity routes. The editor's lane menu and snapping guides also retained those routes. The previous verification therefore did not cover the view users actually opened.

Both backends now read this project's generated templates and lane presets. All built-ins come from `events/`, without a Unity-template fallback. `--events-only` also works with `VRLEARN_ROOT` pointing to a nonexistent project. New regressions first failed for the old default templates, local server responses and lane guides, then passed after correction. They verify the actual storage/API responses against the event sources and check complete vehicle bodies against the carriageway. The project no longer requires its routes or templates to match VRLearn.

Follow-up verification: `npm test` passed 98/98 tests with none skipped; `node tools/check_routes.mjs` passed all 46 route checks, and the storage tests checked all 18 generated lane presets. An isolated rebuild test verified that `--events-only` works without Unity and preserves custom scenarios, the local map and scenario model. In headless Chrome, all ten defaults were opened from the left-hand list in both local-server mode and browser-only mode under a simulated GitHub Pages sub-path. The rendered polylines matched the corrected event files, the lane menu inserted the corrected points, and both modes had no console errors. The Unity bridge was checked with intercepted writes: it requests a custom browser copy rather than the old Unity template. The editor now declares an empty favicon to avoid the browser requesting a missing root icon. Physical phones, Unity playback and Quest hardware were not tested in this follow-up.


## Overhead road reconstruction — 2026-10-18

The earlier tile-grid corrections above are historical. The local Google overhead reconstruction now replaces those invented distant bends: eastbound traffic continues along the moat, westbound 01/04 traffic continues west, and the 02/05 background streams follow the longer bridge and curved northern road. Event 02 approaches from the continuing Castle Road rather than the former nearby square bend. The obsolete gatehouses and their black visibility screens are removed; car appearances must pass the geometric visibility check without them.

The parking exit used by 07/08 moves 31 m west with the reconstructed parking forecourt. Their participant, trigger, goal and accident route move together; the accident purpose and relative encounter geometry remain the same. The driveway exception in `check_routes.mjs` moves with that entrance and remains tightly bounded. All other participant crossings remain at their reviewed locations. Built-in sources, generated simulator/editor templates and editor lane presets are synchronized.

The 02/06 accident cars are present from the start, waiting on their authored approach until their configured timed launch. This keeps the encounter possible after removing the artificial nearby bends, without making a car appear in open view after the participant starts late. They accelerate along fixed routes and never chase. Western background traffic starts farther along the continuing road so repeating vehicles remain at least 60 m away when they appear, including while the rider waits at the parking exit.

Westbound route tails also continue to the distant map edge, so traffic does not disappear at the locations previously concealed by the removed gatehouses.

The road mesh, editor map and ground data now share `tools/road_network.py` as their geometry authority. See [art-and-performance.md](art-and-performance.md) for reconstruction scope, approximations and rebuild commands.

Verification of the overhead reconstruction: 106/106 full regression tests passed, with no skips, including the event purposes, route bodies, art, collisions and both editor backends. Server/Quest integration tests used an isolated temporary project and a simulated adb device. The standalone route checker passed all 46 simulator/editor vehicle routes. Chrome playthroughs covered 01 walking and 07 cycling through contact, replay and results, including keyboard looking and return to the menu; the views had no console errors. The editor map and five signal markers were inspected. No real phone, Unity Editor or Quest was exercised.

The Route 25 crossings moved outward to x 19.7 and 44.3 to match the overhead image's 24 m spacing. Events 01, 02 and 05, which use the east crossing, now start, trigger and finish on that crossing line (x 44.3); 01/02 start on the town footway in front of the corner shop instead of the former Castle Road pavement point, and 05 starts east of the relocated bridge-east pole.
