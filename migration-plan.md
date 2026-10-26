# Open-world traffic-safety simulator: audit and migration plan

Analysis date: 2026-10-23. Repository: `hikone-traffic-sim`; HEAD at inspection: `3b75439`.

> **Implementation status (2026-10-23).** A first open-world release now exists and is described in [RATIONALE.md](RATIONALE.md#open-world); that file, not this plan, is the source of truth. Done: explicit walking/cycling exploration from the title, one session with shared corridor flows and a car cap, `world/hikone.json` + `src/shared/world.js` (route references into `events/`), `src/scenario-manager.js` (all ten templates as encounters with conflict groups, cooldowns, hidden admission, outcomes), contact → replay → continue with a recorded recovery point, bounded-step contact checks, and an in-tab session record (`src/session-log.js`) with JSON export and in-session incident replays. Not done: a separate `RoadContext` (rule lanes come from the shared flows), fixed-step determinism and swept/bicycle-envelope contact, giving way at the truck narrowing, IndexedDB persistence and reload of clips, wider network coverage, phone measurements.

This document audits the **current working tree**, including existing uncommitted driver, risk-observation, editor, and environment changes. HEAD alone does not describe that tree. This stage creates only this document: no runtime, event, generated asset, editor, or sibling Unity files are changed. Existing local work must be preserved during implementation.

Repository convention requires English technical documents and Japanese UI/README text. All new modules and data paths below are **proposals**, explicitly distinguished from existing files. This is a migration design, not a claim that open-world behavior has been implemented or performance-tested.

## Findings and target boundaries

The ten experiences already use **one geographic world**, `hikone-kyobashi`. They are ten configurations of a shared simulator, not ten separately loaded maps. The principal migration is from a selected, finite practice run to a persistent world session with shared traffic and dynamically eligible practice events.

Several requested capabilities already exist: height/weight entry, walking and cycling controls, per-car driver parameters, signals, finite braking and yielding, geometric participant/car contact, a short recording buffer, and two replay viewpoints. Preserve and extend these systems. Missing capabilities are independent mode selection, continuous session flow, global road semantics and traffic ownership, dynamic event lifecycle, and durable session-level behavior records.

The first open-world release should support the **existing ten events across their shared locations along the Kyobashi/Route 25 corridor**. Keep the existing castle, moat, and university environment. Their presence does not establish that they have authored road traffic or additional accident events. Wider traffic coverage requires separately validated routes; do not invent an eleventh event or duplicate the map to fill it.

## A. Existing entrances, resources, vehicle behavior, and contact

### A1. Application and authoring entry points

| Existing file / symbol | Current responsibility | Migration implication |
| --- | --- | --- |
| `index.html:105` title; `:115` height; `:116` weight; `:163` module entry | Scenario tiles, profile inputs, custom JSON, editor link; imports `src/app.js` | Reuse profile inputs; add an independent walking/cycling choice and an exploration start action. Keep legacy/custom practice accessible. |
| `src/app.js:82` resource loading; `renderTitle()` at `:137` | Loads the shared environment once and lists `data/scenarios/index.json` | There is no per-event map loader to combine. Change selection/session flow, not world coordinates. |
| `src/app.js:201` `start()`; `:262` `cleanup()` | Loads one selected scenario; replaces traffic, recorder, parked props, player placement, clock, and signals | These are session boundaries today. Entering an event region must stop calling this sequence. |
| `src/app.js` `tick()`, `onImpact()`, `beginReplay()`, `showResults()` | `title → playing → impact → replay → results`; goal also ends play | Exploration needs optional checkpoints, manual session end, and a safe continuation path after feedback. |
| `src/shared/scenario.js` | Version-1 JSON, normalization, validation, areas, routes, timing hints | Retain version-1 import and standalone practice semantics behind an adapter. |
| `events/builtin-01.json` through `builtin-10.json` | Canonical built-in practice definitions | Preserve all ten IDs, learning goals, routes, and source lineage. |
| `tools/sync.mjs` | Generates simulator built-ins, editor templates/index, and lane presets | Continue generating from `events/`; never edit the corresponding `data/` JSON manually. |
| `editor/index.html`, `editor/app.js`, `editor/store.js` | SVG route editor, shared `Traffic` preview, static/localStorage backend | Preserve existing element IDs, editing, JSON import/export, and browser play via `?play=editor`. |
| `serve.mjs`, `server/editor-api.mjs` | Local editor API, project scenario files, optional Unity/Quest bridge | Both backends use this project's built-in templates. Server custom files still use the configured Unity project's `Scenarios/`; browser exploration logs must not silently write there. |

Dependency flow today:

```text
events/builtin-*.json --tools/sync.mjs--> data/scenarios/ + data/editor/templates/ + lane presets
                                                       |                 |
index.html -> src/app.js -> shared/scenario.js <---------+             editor/app.js
                  | -> Player + TouchControls                            | -> Traffic preview
                  | -> Traffic -> driver.js + ParticipantRules + SignalCycle
                  | -> Recorder -> Replay + analysis + crash presentation
                  + -> world/vehicles/signals/Ground/Obstacles -> renderer
```

### A2. The actual ten configurations

Coordinates below are existing Unity/map `(x,z)` metres. The source path for each row is `events/<id>.json`; its generated simulator path is `data/scenarios/<id>.json`. Names are copied from the current `nameEn` fields. “Candidate” refers to the authored `accident` label, not a guaranteed collision or a guaranteed rule-breaking driver.

| ID and existing name | Mode; spawn → goal centre | Existing traffic and distinguishing content | Open-world interpretation using the same content |
| --- | --- | --- | --- |
| `builtin-01` Car from the right | Walk; `(40,14) → (44.3,32)` | Two repeating east/west flows and one candidate arriving from `(78,23.33)` | Observe an actual crossing conflict with the near lane; reuse the shared through traffic. |
| `builtin-02` Turning car | Walk; `(40,14) → (44.3,32)` | Two repeating north/south flows and a turning candidate from `(30.52,-8)`; two parked sedans | Turning encounter at the same crossing; preserve turn geometry and review shared sedan placement. |
| `builtin-03` Another car from the left | Walk; `(69.53,20.05) → (70.54,31.77)` | Two same-route cars initially scheduled from `(45,28.4)`; a large and medium parked truck | Observe a real same-lane following/platoon encounter, with safe physical spawn spacing. |
| `builtin-04` Car hidden by a truck | Walk; `(62.62,20.05) → (63.63,31.77)` | Candidate from `(76,26.3)`; trucks at approximately `(55.35,24)` and `(68.31,24)` | Occlusion encounter; truck bodies and driver/participant sight lines must remain consistent. |
| `builtin-05` Car turning from behind | Walk; `(45.3,35.4) → (44.3,18.3)` | Same north/south background routes as 02; candidate from `(34.68,36.6)` turns east; same two sedans | Direction-sensitive crossing encounter; distinguish approach from 01/02 without copying their traffic system. |
| `builtin-06` Speeding car | Walk; same spawn/goal as 04 | Candidate from `(94,24)`, route `speedKmh:65`, `noStop:true`; same trucks as 04 | High-speed encounter on its existing route. Add a road speed limit distinct from desired speed; `noStop` currently affects post-contact motion, not pre-contact yielding. |
| `builtin-07` Car pulling out | Bicycle; `(-68.54,22.77) → (-114.62,23.57)` | Two repeating flows; candidate exits from `(-96.85,17)` | Parking-exit encounter based on actual occupancy, visibility, approach, and gap. |
| `builtin-08` Passing a driveway | Bicycle; same spawn/goal as 07 | Same background routes as 07; candidate exits from `(-96.85,16.6)` on a slightly different five-point route | Retain its separate learning content; arbitrate the shared exit with 07 rather than launching overlapping cars. |
| `builtin-09` Cars from both sides | Walk; same spawn/goal as 04 | Westbound car from `(76,26.3)` and eastbound candidate from `(40,28.4)`; same trucks as 04 | Observe opposing flows with an independent time gap. Do not force a particular car order by player progress. |
| `builtin-10` Riding on the wrong side | Bicycle; `(-37.54,28.59) → (-83.62,28.13)` | Two repeating flows; candidate-labelled eastbound stream starts at `(-210,28.1)`; no trigger area | Use actual bicycle velocity relative to a directed lane, not the old spawn or head direction, to identify wrong-way exposure. |

Inventory from the current JSON: **10 definitions, 7 walking and 3 cycling, 23 vehicle definitions, 18 exactly distinct full-route arrays, one map ID**. Those 18 arrays are route presets, not 18 graph edges or 18 independent traffic streams. Every built-in vehicle currently has `start:"begin"` and `stopOnTrigger:false`. Candidate single departures generally begin at zero; background flows repeat at 4–6 s; event 10's candidate-labelled stream repeats too. Current source and both generated template copies are byte-identical for all ten files.

Parked props are outside these event JSON files: `src/app.js` maps `builtin-01…10` to zero-based `data/scene.json.scenarios[].id` and reads `parked`. There are four unique parking configurations: none; the two sedans shared by 02/05; the truck pair in 03; and the different truck pair shared by 04/06/09. This implicit numeric association must become an explicit binding before dynamic activation.

### A3. Map and model sources

| Existing resources / source files | Audited role |
| --- | --- |
| `data/scene.json` | Materials/light, imported metadata, and the ten indexed parked-prop configurations. It is not ten complete environments. |
| `data/layout.json` → `src/web-layout.js` → `src/road-layout.js` | Imported placements plus browser-owned replacements/relocations. Current raw layout has 1,257 items; effective `webLayout()` returns 440 placements using 42 asset types. Counts are static inventory, not draw calls. |
| `data/models/impressionist/*.glb`; `src/world.js` | Actual rendered high/low models; asset merge/instancing, camera-obstacle data, and lighting. The directory contains 186 GLBs, 98,689,112 bytes total, including unused alternatives. This is disk inventory, not network transfer or GPU residency. |
| `data/road_tiles.json`; `src/ground.js` | Ground triangles for Kyobashi, university streets/paths, and named castle paths. Ground heights and road contact already share the local geometry. |
| `data/walls.json`; `data/collision.json`; `src/obstacles.js` | Water-wall polygons; generated body-height occupancy grid; fixed poles, per-run parked boxes, stopped traffic, and conservative driver sight checks. |
| `data/map.json`, `data/map.png`, `data/editor/lanes.json` | Editor overview, surfaces, places, and route presets. `map.json.lanes` itself is empty; editor backends inject the 18 generated presets. The simulator does not load them as a network. |
| `src/coords.js` | Sole Unity/map-to-Three conversion: mirror X and negate yaw. Keep all simulation/event/recording coordinates in map metres. |
| `src/university-layout.js`, `src/castle-approach.js`, `src/castle-layout.js`, `src/castle-paths.js`, `src/moat-layout.js` | Existing western extension, campus, castle, approach, paths, and moat layout definitions. Reuse them without adding fictional practice events. |
| `tools/road_network.py`, `tools/build_impressionist.py`, `tools/university.py`, `tools/castle_paths.py`, `tools/build_editor_map.py`, `tools/build_collision.mjs` | Local authoritative generators for relevant geometry, ground, editor coverage, and collision. Rebuild generated outputs only when an implementation stage needs them. |

The editor overview spans `x=[-1060,200], z=[-155,870]`. The collision grid covers the same extent: 6,300 × 5,125 cells at 0.2 m, approximately 4.04 MB of decoded occupancy bits. The legacy `HIKONE_BOUNDS`, `map.practiceWorld`, and `walls.json.world` remain `x=[-220,200], z=[-155,165]`. This is a real distinction between overview/collision coverage and scenario validation bounds. `crossesWall()` tests polygons rather than clamping to `world`; off-grid collision queries return free space and `Ground` has a fallback height. A larger rectangle alone cannot establish a supported exploration boundary.

### A4. Traffic, driver, and accident chain

1. `Traffic` in `src/traffic.js:145` receives **one scenario**, prepares smoothed paths and junction stop lines, owns car IDs and a seeded clock, and schedules departures/repeats. Spawn occupancy delays blocked departures. Cars accelerate along a route and are removed when its finite length is exceeded.
2. `smoothRoute()`, `pathAt()`, and `carPose()` preserve curved turns, wheelbase motion, and steering. Vehicles are no longer just constant-speed waypoint interpolation. `src/vehicles.js` supplies shared sedan/kei models, steering, paint, and blob shadows.
3. `src/driver.js` samples persistent reaction, desired speed, maximum braking, acceleration, and headway per car. Default reaction is 0.6–1.4 s and braking 4.5–7.5 m/s²; configurable validation ranges are broader. Driver states already include cruising, following, yielding, reacting, braking, emergency-braking, and waiting.
4. `Traffic.decide()` observes signals, nearby cars, upcoming curvature, and actual participant position/velocity. It uses finite reaction/braking, grip, and conservative visibility (`Obstacles.clearSight()` plus intervening cars). It does not alter a route to aim at the player. Full lane priority rules, overtaking, vehicle/static-body collision resolution, and vehicle/vehicle crash response are not implemented.
5. `src/participant-rules.js` computes a decaying practice risk score from red/flashing entry, missing two-direction observation, and wrong-way cycling. It currently infers lanes from **the selected scenario's routes**, with four hard-coded crossing observation corridors near Kyobashi.
6. Adaptive drivers save one random draw, resolving at their first nearby participant/junction decision or after eight seconds. Default hazardous-driver selection probability interpolates from **0.03 to 0.60** with the observation score. Once resolved, it is persistent. Hazard types are red-light, speeding, and failure-to-yield. These are simulation settings, **not accident probabilities** or measured real-world frequencies. `accident:true` alone grants no rule-breaking behavior. Observed violations are recorded separately from tendencies.
7. During normal `src/app.js` play, entering the legacy trigger calls `Traffic.trigger()`; only custom `start:"trigger"`/`stopOnTrigger` schedules depend on it. The current ten built-ins do not. `meetPoint()` still computes spawn-to-goal crossing metadata, but it does not schedule a collision. Do not mistake its name for active forced-contact logic.
8. After movement, `Traffic.hit()` tests a moving car's oriented body rectangle expanded by participant radius (default 0.3 m). `app.js` invokes `onImpact()` only for this returned contact in normal play. Stopped cars block movement through `Obstacles` without a zero-speed accident. A debug-only `window.vrlearn.knock()` can manually invoke impact for inspection; it is not gameplay evidence of a real collision.
9. This is geometric contact, not a rigid-body physics engine. Traffic integrates in substeps up to 1/30 s, but `app.js` checks contact once after its whole update; the outer frame delta can reach 0.1 s. There is no swept participant/car contact query, and cycling contact still uses the participant centre/radius rather than the whole bicycle. Larger speeds or frame stalls need explicit regression coverage before “real collision” can be promised across the open world.
10. Contact currently freezes ordinary traffic, runs the fall/post-contact capture for 1.6 s (`noStop` cars can continue/swerve), then starts replay. Reaching a goal ends the whole run. Replay ends at an accessible Next action; there is no exploration resume path today.

`src/analysis.js` records at a nominal 0.05 s interval into a 12 s in-memory buffer. Contact extracts up to 8 s before and 1.6 s after. Samples include head X/Z/yaw, cycling ride yaw, car pose/body/steering, driver tendency and observed violation. They do not form a full-session dataset or persistent export. `src/replay.js`, `src/replay-camera.js`, `src/replay-cyclist.js`, `src/replay-animal.js`, `src/cockpit.js`, and `src/crash.js` already provide overview/driver views, recorded-time signals, occlusion-aware camera planning, and educational fall presentation.

## B. Reuse, duplication, and conflicts

| Area | Reuse | Required boundary change / conflict |
| --- | --- | --- |
| Map/rendering | One scene, ground, collision, meshes, materials, instancing/LOD, wildlife | Do not create ten scenes or ten environment copies. Scenic coverage is broader than authored traffic coverage. |
| Participant | Existing `Player` and `TouchControls`; height and weight inputs | `scenario.playerMode` currently owns mode; move it into a session profile. Height affects eye/body scale; weight affects bear proportions, not inertia or injury. Driver sight is 2D, not height-aware. |
| Traffic | Persistent driver state, lane following, finite braking, sight checks, seeded randomness | One selected vehicle array and finite route lifecycle; no central admission API, network successors, stable cross-session object identity, or region ownership. |
| Repeated routes | Shared 02/05 and 07/08 background routes; 03 has the same full route twice | Exact-array deduplication exists only for editor presets. Do not merge intentional platoon cars or semantically different flows just because geometry matches. Do not multiply shared background demand when enabling multiple events. |
| Event overlap | Existing learning goals, approach areas, turning/exit routes, feedback | 01/02/05 share the crossing; 03/04/06/09 share the midblock area; 07/08 share one exit. Use conflict groups and actor ownership. A trigger rectangle alone is not a suitable activation or visibility boundary. |
| Props | Existing trucks/sedans and collision footprints | `setParked()` replaces a whole list. Blindly unioning all scenarios can duplicate sedans, combine incompatible truck positions, or block routes. A region-owned prop set must be validated with movement and visibility. |
| Signals | Existing deterministic `SignalCycle`, lamp models, stop lines | Five installations currently represent one coordinated Kyobashi controller, not five independent junction simulations. Controller stages/stop lines and risk observation corridors are separate authored geometry; share explicit IDs to avoid drift. |
| Speed/legal semantics | Existing route speed and driver desired speed | `speedKmh` is both a route cap and a practice setting; 06 uses 65. The technical `lawful` tendency is not a complete road-limit/legal assessment. Add directed lane limits before global speeding feedback. |
| Timing | Shared traffic logic already used by simulator and editor preview | `shared/scenario.js` still contains free-road timing estimates (`carsAt`, `timeToDistance`, `conflictPoint`), and editor hints use some of them. They exclude yielding. Preserve labelled estimates; do not use them as the new world scheduler. |
| Feedback | Gaze/speed/closest-car analysis and observed violation reporting | Current results use one `run.scenario.situation`, some phrased as an accident having happened. Multiple active events require outcome-specific feedback; no contact must never be presented as an accident. Short straight-crossing summaries are not whole-session scores. |
| Replay/recording | Existing pose clips and replay renderers | IDs/time reset in `start()`, recorder stops at impact, props belong to one run, no durable catalog. Pin the exact clip environment and separate replay time from live session time. |
| JSON/editor | Version-1 files, custom saves, validation, both editor backends | A free-world configuration must not be normalized into a fake version-1 spawn/goal scenario and lose fields on serialization. Use a separate versioned schema plus an explicit adapter. |
| Data purpose | Existing local practice and no data collection | Session recording is a deliberate product-scope extension. Define local storage/export behavior and update the “no data” wording when implemented; do not silently introduce remote collection or Unity experiment output. |

## C. Connecting the configurations into one continuous world

1. **Keep the existing map origin, scene, and resources.** The west cycling corridor, crossing, and east midblock area already share the Route 25 geometry. Their player positions lie approximately between X=-115 and 71, Z=14 and 35; vehicle paths extend much farther. No portals, ten-map tiling, geometry translation, or load-screen transitions are needed.
2. Start one `WorldSession` at a verified safe existing pavement/access point with the selected profile/mode. Validate the full body/bicycle footprint and nearby traffic before entry. Do not inherit event 10's wrong-way spawn as the default bicycle start. Choose the final spawn after mode-specific clearance checks, not from a guessed coordinate in this document.
3. Preserve all ten definitions as event templates and as standalone practice presets. Their old spawn/goal describe authoring/reference traversals; they do not relocate the free-world participant. Replace mandatory goal termination with optional local completion observations; exploring past an old goal continues the same session.
4. Define event observation zones, larger preparation zones, approach direction, and exit hysteresis from the **actual existing routes and conflict locations**. Use old triggers as authoring hints, not ready-made universal zones. Event 10 proves that no positive-size old trigger is required.
5. Choose one compatible static parking plan per shared area. Before making it permanent, sample body clearance, wheel clearance, all affected traffic bodies, and both participant/driver sight lines. If configurations are incompatible, prepare their existing alternatives only while unobserved and unoccupied, defer the event when unsafe, and retain standalone presets. Do not pop trucks into view to create occlusion.
6. Reuse existing through routes immediately as global source-to-sink traffic crossing multiple event zones. Deduplicate **flow demand**, maintain car ID/driver/velocity continuously, and leave road-end spawns/sinks outside the observable simulation envelope. Only later connect reviewed endpoints into longer network routes. A region crossing itself never destroys a car.
7. Retain the larger castle/university models and paths. `test/university.test.mjs` already specifies Kyobashi-to-campus physical-continuity checks, and castle tests inspect authored walking surfaces. Their existence is useful coverage, not a new test result or proof of car connectivity. Extend the supported exploration area only after validating its ground, body clearance, stairs/levels, water boundaries, and both control modes where permitted.

Adopt a single explicit exploration coverage description distinct from the legacy practice bounds and editor overview. It should describe supported surfaces/access and boundary behavior, not merely enlarge `HIKONE_BOUNDS`. Preserve old JSON validation as needed; introduce world-aware validation for new definitions. Align the generators, editor view, runtime boundary checks, and collision extent without hand-editing `data/`.

## D. Does current traffic support cross-region operation?

**Partially at the geometry/controller level; not as a complete world traffic system.**

| Capability | Present state | Needed for continuity |
| --- | --- | --- |
| A car follows a route through more than one location | Yes; several routes span most of the practice corridor and turns | Reuse the same car/controller; event zones must not reset it. |
| Traffic continues while the player waits | Yes, until run termination/contact freeze | Keep a session clock and independent departures beyond local event completion. |
| Background traffic from several event areas can coexist | Same controller can reason about its own cars; only one scenario is loaded | Register shared flows in one `Traffic` instance, with bounded demand and ownership. Ten instances would not see one another's traffic. |
| Network routing / junction successors | No graph or dynamic endpoint continuation; route-end removal | Reviewed directed lane connections, turn/speed/priority metadata, valid source/sink gates. Geometry proximity alone must not create a connection. |
| Region admission/retirement | No observer-aware source/sink or regional lifecycle | Spatial preparation, no visible near spawns/despawns, shared active buffers, and drain-to-exit retirement. |
| Cross-region signals | One Kyobashi cycle and four stop bars | Keep that real authored controller; only add controllers for explicitly modelled junctions, with stable IDs and a common clock. |
| Cross-region rule observations | Nearest lane among selected scenario routes; four fixed crossing corridors | Session-wide `RoadContext` for lane direction, crossing/controller ID, access, and speed limits. Rule context cannot disappear when an event deactivates. |
| Vehicle contact handling | Participant vs moving car; stopped cars are obstacles | Improve swept/mode-specific contact; specify vehicle/vehicle/static crash behavior separately if required. Existing avoidance is not a crash solver. |
| Campus/castle road traffic | No authored built-in traffic routes there | Keep scenery/path access; author and validate additional network coverage separately without inventing accident events. |

## E. Unified ScenarioManager and event mechanism

### E1. Responsibilities and proposed files

Use one runtime traffic controller rather than ten controllers or a replacement physics engine. Extract orchestration incrementally from `app.js`:

```text
App / menu / HUD
  -> WorldSession (new: session ID, profile, seed, simulation clock, lifecycle)
       -> RoadContext (new: directed lanes, crossings, regions, access, coverage)
       -> Traffic (existing, extended: shared actors, drivers, route following)
       -> SignalCycle / signals (existing: controller state and rendering)
       -> ScenarioManager (new: eligibility, preparation, ownership, outcomes, cooldown)
       -> Recorder + SessionRecorder (existing clip capture + new session log/storage)
       -> Replay (existing: consumes a detached recorded clip)
```

| Proposed path, absent today | Minimal purpose |
| --- | --- |
| `src/world-session.js` | Own one exploration session, a common timebase, actor identity, pause/resume/end, and service lifetimes. |
| `src/scenario-manager.js` | Implement template registration and event lifecycle. Expose observations/results; never call `onImpact()` or place the player. |
| `src/road-context.js` | Query spatially indexed global lane/crossing/region semantics independently of active events. Keep geometric helpers reusable. |
| `src/shared/world.js` | Validate/serialize a separate versioned world configuration and event bindings; adapt existing version-1 templates without mutating them. |
| `world/hikone.json`, `world/event-bindings.json` | Hand-authored source manifests: coverage, source/sink gates, reviewed lane connections/flow references, and bindings for precisely the existing ten templates/prop sets. No copied GLBs. |
| `src/session-recorder.js` | Bounded append/flush, local session metadata, behavior event records, accident clip catalog, export/delete, and storage failure handling. |

Do not add these modules in this analysis stage. Only split additional helpers when implementation exposes a concrete need. Extend `tools/sync.mjs` later to validate/copy or compile these source manifests into clearly named generated world outputs. The existing version-1 files and their generated paths remain valid.

### E2. Data contract

A world configuration should contain a schema version, map ID, supported coverage, verified mode-specific starts, region IDs, directed lane IDs/connections, speed limits and access, controller references, shared traffic-flow IDs, compatible prop-set references, global environment/risk policy, event bindings, and recording settings. Start with references into the current event routes; do not make another independently edited route copy. Source bindings must retain `builtin-*` provenance and an unambiguous vehicle reference; add stable vehicle IDs compatibly if array indices become unsuitable.

Each event binding should define:

- Stable template ID and supported modes; retain the current 7/3 walking/cycling grouping initially.
- Observation, preparation, and exit zones plus approach direction and hysteresis. Exact new polygons require authoring/checking; this document does not claim they exist.
- Required lane/controller/visibility/occupancy conditions; compatible props; shared flows and optional candidate actor requests.
- Exclusivity group, bounded concurrency, cooldown, drain/retire policy, and interruption handling.
- Observable outcomes: passed without conflict, yielded, near miss, contact, left area, deferred, or interrupted. A near miss needs a defined distance/time criterion before use in feedback.
- Original learning goal and outcome-appropriate Japanese feedback. Multiple events may observe one incident, but one contact is recorded once.

`ScenarioManager` can expose `register(definitions)`, `observe(context)`, `update(step)`, `onContact(record)`, `snapshot()`, and `restore(snapshot)`. The contact callback is an **input reporting a collision**, not a command to create one. `Traffic` needs additive flow/actor admission and retirement commands with owner IDs. Keep the existing `new Traffic(scenario, options)` contract as a legacy adapter to the same controller, preserving the editor and tests.

### E3. Lifecycle and scheduling

```text
dormant -> eligible -> prepared -> active -> draining -> cooldown -> dormant
                         |           |
                         +-- defer --+   (occupancy, visibility, capacity, or prop conflict)
active -> observed outcome / interrupted (recorded without ending the world)
```

Eligibility is a conjunction of mode, approach/position, relevant behavior, traffic state, capacity, and cooldown. Evaluate it at a bounded low frequency and use swept zone entry/hysteresis so fast cycling or boundary jitter does not repeatedly activate an event. Driver perception, braking, movement, and contact stay at the simulation step rate.

Preparation acquires compatible props/actors early enough that they can arrive naturally. A candidate must already be in traffic or be admitted through a verified hidden/distant source gate with a clear footprint. Being off-screen is insufficient: include visibility distance, occlusion, likely approach, and replay retention. If a safe admission cannot be made, defer or skip that encounter. Never retime a departure to make a car meet the player, spawn it on the conflict point, stop shared traffic on zone entry, or direct it toward the player.

After activation, actor motion follows its route, driver, signals, and actual perceived traffic. Player behavior can affect unresolved/new driver selection under the existing policy and can affect actual braking/yielding through perception. It must not reroll a resolved driver or mutate its route. Leaving a zone releases event ownership only after actors/props can retire safely; shared flows and visible actors continue. Cooldown is per template/conflict group, not per render frame. Mode-independent background traffic continues even when all event templates are ineligible.

Special handling of overlapping content:

- 01/02/05: one shared crossing/controller; reuse background demand and arbitrate candidate turns. Allow concurrent observations, without creating incompatible actor requests.
- 03/04/06/09: one reviewed midblock parking configuration at a time; shared passing streams, distinct observations. An event cannot remove a truck currently hiding an actor or blocking a replay camera.
- 07/08: one exit occupancy reservation; preserve both templates/learning goals, select an eligible encounter with a seeded rule and cooldown, and drain before admitting the other.
- 10: exposure follows bicycle travel direction on the global lane. No old trigger is needed; wrong-way behavior affects risk and feedback while oncoming traffic remains independent.

Keep two probabilities separate: **whether a contextual encounter can be prepared** and **whether an adaptive driver adopts a rule-breaking tendency**. Initially retain one session-level hazard policy with current 0.03/0.60 defaults; events should not repeatedly compound it. A hazardous driver may never meet the participant or may avoid contact. A compliant participant still has nonzero exposure. Do not describe either probability as a crash probability.

### E4. Time, deterministic identity, and contact

Introduce a fixed simulation step with an accumulator and bounded catch-up; 1/60 s is an initial candidate to measure, not a measured optimum. Keep rendering interpolated and separate. Hidden-tab pause, replay pause, and excessive backlog need explicit recorded policy; never silently advance a large uncontrolled simulation jump. Use one simulation time for traffic, signals, rule observation, event cooldown, and recording.

Maintain session-unique car and event-instance IDs across zones, monotonic time, and independent deterministic random streams. Persist resolved driver parameters/behavior and scheduling state. A seed alone cannot restore a partially completed session: include actor route progress, reaction timers, signal time, pending departures, event lifecycle/cooldowns, observer state, and random-stream state.

Move participant/traffic contact checks into the simulation/contact service. Use relative swept motion or another verified continuous contact method, with walking circle and an explicitly chosen bicycle envelope, to cover low frame rate, high speed, reversing, rotation, and region boundaries. Separate contact from road-rule scoring; report the involved car even if it was ordinary background traffic. Preserve finite braking; do not clamp a car away from a physical conflict. A rule violation or zone entry cannot generate an impact notification without contact evidence.

Preserve the existing post-impact presentation as a legacy mode. For exploration, specify a short recorded incident/post-contact policy, then pause the session atomically for review. Do not reuse a permanent `Traffic.freeze()` as a world-session pause/resume mechanism. Save the resumable state separately from replay objects; on continuation, restore one consistent world state and place the participant at a nearby verified safe recovery point, recording that recovery/placement boundary. Require sufficient new pre-impact history after recovery rather than joining discontinuous tracks. Results, replay, pause, and play must all retain menu exit paths.

## F. Walking and cycling controls

| Concern | Walking | Cycling | Planned files |
| --- | --- | --- | --- |
| Mode entry | Explicit menu choice before starting exploration | Same; no scenario selection needed | `index.html`, `style.css`, `src/app.js`, proposed `WorldSession` |
| Movement | Reuse WASD/arrows and touch stick; movement follows view yaw, with wall sliding | Reuse W pedal, S brake/slow push-back, A/D steering, momentum/coasting, and wheel clearance | `src/player.js`, `src/touch-controls.js`, `src/bicycle.js` |
| Look | Mouse/drag and Q/E | Keep look yaw separate from `rideYaw`; shoulder checks must not steer the bicycle | Same controls; `src/replay-cyclist.js` |
| Current speed | Existing target is 2.4 m/s | Existing maximum is also 2.4 m/s, with pedal/brake/coast dynamics | Preserve initially. `shared/scenario.js` timing hints use 1.2/4.0 m/s and are not controller truth. Tune separately only after behavioral/contact checks. |
| Collision | Existing body radius/clearance and water walls | Existing rider plus two wheel probes for static/stopped obstacles; improve moving-car envelope | `src/player.js`, `src/obstacles.js`, `src/traffic.js` or an extracted contact helper |
| Profile | Height scales eye level (`0.936 × height`) and replay body | Existing seated rider eye/pose fitting and replay proportions | Keep current height 90–210 cm, weight 15–150 kg validation and input fallback; do not invent a weight-to-speed/injury model. |
| Observation | Head direction, actual displacement, crossing entry | Head direction plus actual travel vector, lane direction, braking/steering | `src/participant-rules.js`, proposed `RoadContext`, recording |

Choose the mode for the entire initial session. Mid-session dismount/remount is a separate enhancement; if added, require safe stationary transitions, explicit controls, cleared inputs, recorded mode segments, and replay support. Do not infer that castle steps are valid cycling surfaces merely because the ground sampler returns a height. Define permitted access/navigation for each mode and validate existing connections; risky road use may be observed without forcibly steering the participant back to compliance.

Retain keyboard-only operation, focus/announcement changes, 44 px touch targets, reduced motion, forced colours, pointer-lock exit, and menu access during all states. Profile changes take effect at a session boundary, not halfway through a saved replay. Maintain Japanese UI and context-specific walking/cycling help.

## Behavior recording and accident replay

Keep the existing short high-detail `Recorder` for replay and add a separate session log. Removing its buffer limit would turn a small rolling cost into unbounded memory use.

| Record | Proposed content and retention |
| --- | --- |
| Session header | Schema/app/world/event versions or hashes, session ID, seed, mode, height/weight, simulation settings, start/end policy. Keep it local by default and explain what is saved. |
| Periodic behavior samples | Simulation time, map X/Z/ground level, head yaw (pitch if added), bicycle heading, actual velocity, mode, controls, relevant lane/region and signal state. Preserve the existing nominal 20 Hz clip sampling; choose a lower full-session sampling rate after storage/analysis needs are measured. |
| Discrete observations | Zone/event lifecycle, look checks, red entry, wrong-way segments, yielding/braking, candidate admission/defer decisions, driver selection probability/result, actual violations, defined near misses, contact, recovery, pause/resume, and session end. Use stable IDs and reason codes. |
| Actor/configuration changes | Car identity/body/driver parameters/route, source/event ownership, spawn/despawn time, relevant environment/prop state. Store numerical inputs and outcomes needed to explain a decision; avoid inferring fault from a label. |
| Accident clip | Atomic contact time/IDs/pose/relative velocity and detached recorded poses through the existing 8 s before + 1.6 s after window where available; profile, controller times, and props needed to replay that incident. Mark truncated early-session clips honestly. |
| Durable storage and export | Proposed IndexedDB chunked writes and local clip catalog; JSON session manifest plus bounded pose chunks/clip exports. Provide export/delete and visible storage/quota failure status. Do not put long high-rate logs in synchronous localStorage. |

Copy/pin a completed accident clip before the ring overwrites it. Preserve actor/prop models needed for playback even after region deactivation; use ownership/reference counting for shared resources. Replay must use recorded poses/time and the recorded environment snapshot rather than rerunning stochastic traffic. Reuse overview and driver views, slow motion, restart/resize camera handling, and reduced-motion behavior. A stored clip should reload in a fresh browser session without the old live `run` object, including cars that have since left their routes.

Initially support local records and explicit file export, without introducing a server, automatic uploads, participant identity, or Unity experiment integration. State retention limits and local deletion in the UI when implemented. The existing “no data” statements in `AGENTS.md`, `RATIONALE.md`, and `README.md` will need accurate wording about local practice records; remote/research collection would be a separate product requirement.

## G. Performance assessment and measurement gates

These are **source-confirmed mechanisms and projected scaling risks**, not new timing measurements. Combining configurations does not multiply static geometry if the shared environment remains single-instance.

| Mechanism / existing location | Scaling risk | Proposed response and evidence |
| --- | --- | --- |
| `Traffic.decide()` scans cars; `sees()` can scan all intervening cars | Pairwise interaction cost grows at least quadratically; nested visibility scans can cost more in busy junctions | Spatially index active traffic and cache bounded local queries. Compare identical seeded actor states and braking outcomes, not only throughput. |
| `ParticipantRules.nearestLane()` scans all selected paths | Global route duplication increases observation cost and can switch lane direction ambiguously | Build an indexed directed-lane `RoadContext` once; test parallel/opposing lanes, boundaries, and looking backwards while cycling. |
| `Obstacles.clearSight()` samples at grid resolution and scans prop boxes | Longer vision and more parked/event props multiply driver work | Shortlist occluders spatially and reuse query buffers. Retain conservative visibility independent of render culling. |
| `app.js syncCars()` creates/removes model instances | More simultaneous flows and repeated admissions can cause allocation/GC bursts and extra draw calls | Bound active actors and pool reusable visual instances after measuring lifecycle cost. Reset steering, paint, driver/body association, and blob state on reuse. |
| `Recorder.capture()` copies every active car and shifts old frames | Allocation scales with actor count; unlimited session logs would grow indefinitely | Bounded ring/chunks, incident relevance filtering with enough pre-contact coverage, asynchronous batched persistence. Log/export outside the simulation hot loop. |
| `Replay.start()` and camera planning | A dense clip can retain many car tracks and incur preparation spikes; region cleanup can remove occluders | Bound capture relevance, pin exact props, measure preparation time/peak memory, and release clip-owned resources without disposing shared geometry. |
| `world.js buildEnvironment()` loads high/low definitions up front | Existing LOD/cells reduce drawing, not initial resource loading; added maps would worsen startup/residency | Reuse current assets/caches and culling first. Add resource streaming only after residency/startup measurements justify it; keep collision available before access. |
| Whole-world live traffic | Simulating every remote car at full detail wastes CPU; freezing far traffic can create boundary jumps | Begin with bounded corridor demand. Later use a deterministic coarse remote model and overlap buffers; handoff preserves identity/progress and upgrades before perception/contact range. Do not cull physics merely because a car is outside the camera. |
| Large-world ground and boundaries | Highest-triangle ground selection and 2D occupancy are not a multi-level navigation model | Verify existing steps/bridges and overlapping levels explicitly; do not infer safe roads from fallback ground. Keep height conventions and generated collision consistent. |

Preserve current render safeguards: batched/instanced environment, spatial cells/LOD, static-only sun shadow casters, blob shadows for moving objects, no post-processing, and bounded hot-path allocation. Current `ENVIRONMENT_CELLS` values are terrain 128 m, campus 96 m, west moat 128 m, compound 128 m; retain them unless fixed-view evidence supports a change.

Use `?benchmark=1` with matched viewport, quality/resolution, camera, seed, demand, and warm-up. `src/performance.js` currently reports frame median/p95, average update time, draw calls/triangles, geometry/resource counters, and available heap figures. It does **not** currently provide a separated GPU timer, long-frame count, or p95 simulation cost; add instrumentation only as needed for the migration. Desktop frame rate near 60 is not evidence of a cap, an improvement, or phone readiness.

Before increasing traffic, capture baseline walk/cycle/replay views and a repeated corridor traversal. Proposed release gates to agree against that baseline: no more than 10% p95 frame-time regression in matched nominal views; no sustained retained-memory growth after a 30-minute session and ten replay cycles; measured actor-count plateau at the configured cap; no visible actor popping; preserved contact/yield outcomes. The 10% threshold and soak duration are proposed acceptance criteria, not measured results. Test 0, nominal, and stress demand. Keep the repository's approximately 120-draw-call guidance visible, and report any justified view-specific deviation rather than claiming that 440 placements or 186 files imply a draw count. Real phone checks remain separate from desktop checks.

## H. Phased migration, concrete files, and acceptance

Each phase is independently reviewable and reversible. Keep standalone practice/custom files/editor available until their replacements pass the relevant checks. A feature flag or separate exploration start action permits comparison against the current flow. No commit, push, deployment, or implementation is part of this analysis request.

| Phase | Scope and concrete files | Acceptance gate |
| --- | --- | --- |
| **0. Audit and baseline contract — this document** | New `migration-plan.md` only; read current source/data/tests and preserve pre-existing changes | Ten real templates/resources/control/contact paths identified; current vs proposed behavior explicit; no business or generated files changed. Review paths and `git diff --check`. Runtime tests/benchmarks are not required for this document-only phase. |
| **1. Session/menu seam** | `index.html`, `style.css`, `src/app.js`, proposed `src/world-session.js`; update `DESIGN.md`/`README.md` with implemented UI | Profile validated; explicit walking/cycling selection; exploration starts without an accident choice; one shared world and one session clock; passing an old goal does not stop exploration. Legacy/custom practice and editor play remain functional. Keyboard/touch/menu exits and console clean. No dynamic-event completion claim yet. |
| **2. Road context and persistent shared traffic** | Proposed `world/hikone.json`, `src/shared/world.js`, `src/road-context.js`; extend `src/traffic.js`, `src/participant-rules.js`, `src/signal-cycle.js`, `src/signals.js`, `src/obstacles.js`, `src/app.js`, `tools/sync.mjs` | Shared background demand registered once. A car traverses multiple event areas with the same ID, driver, and continuous pose; zone crossing never resets signals. Correct lane/rule queries even when no event is active. Source/sink visibility and participant escape paths checked. Legacy Traffic/editor APIs still work. No newly invented distant road network. |
| **3. Dynamic conversion of all ten templates** | Proposed `world/event-bindings.json`, `src/scenario-manager.js`; `events/builtin-*.json` only for necessary compatible source metadata; `src/shared/world.js`, `src/app.js`, `src/obstacles.js`, `tools/sync.mjs`, `tools/check_events.mjs` | Exactly ten existing IDs/learning goals represented. Eligible mode/approach/context works; 07/08 exit exclusion, crossing overlap, and truck compatibility validated. Ineligible/deferred events admit no new props/cars. Waiting or passing a zone never creates an impact solely from eligibility or trigger entry. Shared traffic persists through cooldown; actors drain without visible disappearance. Legacy presets still load and complete. |
| **4. Shared step, physical contact, and incident continuation** | `src/app.js`, `src/traffic.js`, `src/player.js`, `src/obstacles.js`, `src/analysis.js`, `src/replay.js`, proposed `src/world-session.js`; extract a contact helper only if needed | Early detection can avoid contact; late detection/insufficient braking can cause contact with unchanged routes. Include ordinary and hazardous traffic, bicycle envelope, fast crossings, long frames, low frame rate, and region boundaries. Same seed/input at different render rates gives equivalent simulation outcomes. Replay/results/menu reachable; recovery resumes coherent traffic and records a placement boundary, without permanent global freeze or duplicate contact records. |
| **5. Durable behavior records and reloadable replays** | Proposed `src/session-recorder.js`; `src/analysis.js`, `src/replay.js`, `src/app.js`, `index.html`, `style.css`; `RATIONALE.md`, `README.md`, relevant `AGENTS.md` purpose wording | Full-session behavior survives reload according to retention policy; multiple accident clips selectable/exportable/deletable; exact recorded signal/prop/actor state replays after region cleanup; storage denial/quota/interrupted write handled. No automatic upload. Reset/recovery clips never interpolate across a placement jump. |
| **6. Coverage, compatibility, and performance hardening** | `src/world.js`, `src/environment-instances.js`, `src/vehicles.js`, `src/performance.js`, manifests; `src/web-layout.js`, `src/road-layout.js`, `src/university-layout.js`, castle/ground generators only when route/access changes are needed; editor files as format work requires | Existing corridor traversable in both supported modes, wider existing paths validated before enabling new traffic there, stable bounded demand/memory, matched A/B gates met, no console errors, and sub-path hosting works. Editor local and server backends retain templates/custom storage and play; optional Unity bridge cannot erase web-only fields. Verify a real phone separately before a phone-performance claim. |

### Verification to use during implementation

The following names refer to existing checks unless explicitly marked proposed. Select the smallest checks for a local phase; changes to shared timing/contact/session flow require full `npm test` under `AGENTS.md`. Read actual test counts and integration skips. Do not treat a mock, debug `knock()`, or an HTTP 200 as a physical playthrough.

| Behavior under change | Existing checks and focused additions |
| --- | --- |
| Drivers, motion, signals, risk | `test/turning.test.mjs`, `test/driver.test.mjs`, `test/driver-risk.test.mjs`, `test/signals.test.mjs`; add uncovered global-context/continuity cases. `test/logic.test.mjs`, `test/crash.test.mjs`, `test/bicycle.test.mjs` where affected. |
| Route/event conversion | `node tools/check_events.mjs <id>` for an affected template, all-event checker when shared behavior changes, `node tools/check_routes.mjs`, `test/events.test.mjs`, `test/routes.test.mjs`; proposed `test/scenario-manager.test.mjs` for lifecycle, overlap, cooldown, no forced contact, and independent departures. |
| Continuous session | Proposed `test/world-session.test.mjs` for goal non-termination, car identity/clock continuity, pause/recovery/replay state, and end/menu paths. Real browser walking **and** cycling exploration across several regions; vary wait/route behavior. |
| Controls and replay | `test/controls.test.mjs`, `test/replay.test.mjs`, `test/replay-camera.test.mjs`, relevant bicycle/crash checks; actual contact/replay in both modes. Test height extremes, touch help, reduced motion, keyboard focus, replay end, and menu exits. |
| Data/schema/editor | `test/sync.test.mjs`, `test/editor-store.test.mjs`, `test/editor-server.test.mjs`, `test/editor-map.test.mjs`; `test/editor-quest.test.mjs` only when that bridge is affected. Proposed world-schema and session-storage tests for invalid references, round trips, version mismatch, quota denial, truncated writes, export/reload/delete. Test both backend paths rather than assuming shared validation proves storage behavior. |
| Models/layout/physical coverage | Regenerate only affected outputs and `data/collision.json`; `test/art.test.mjs`, `test/obstacles.test.mjs`, relevant `test/road-seams.test.mjs`, `test/university.test.mjs`, `test/castle-paths.test.mjs`, `test/castle-approach.test.mjs`; inspect affected views and route clearance. Props added at runtime also need direct footprint/sight-line checks. |
| Rendering workload/performance | `test/performance.test.mjs` plus matched browser `?benchmark=1` A/B when workload/LOD/shadows change; measure traffic CPU, replay prep, storage flush, and retained memory separately. |

Current event tests allow different physical outcomes with departure timing/seed changes. They require cautious traversal in an **ordinary-driver reference** with hazard probability zero, while normal compliant runs retain nonzero exposure. Preserve that distinction; do not restore an invariant that an unsafe traversal must always crash or a compliant traversal can never crash.

Run `git diff --check` before every handoff. A push to `main` deploys the site and is outside this request. Keep relative application URLs for GitHub Pages; do not copy existing root-relative editor API conventions into new static world/log resource loading.

## Decisions to carry into implementation

- Initial session mode is fixed; default hazardous-driver settings remain the current practice settings. Optional mode switching, new speed tuning, weather rendering, injury physics, and remote research collection are outside the first migration.
- First prove the existing-event corridor with bounded traffic; preserve wider geometry. Select supported starts/access after physical checks, and author lane connections only where existing geometry supports them.
- Resolve truck/sedan coexistence from measured footprints/sight lines before enabling overlapping events. Keep incompatible standalone presets intact.
- Choose concrete session sampling rate, local retention quota, active-car cap, preparation distances, and cooldowns from the baseline and encounter tests. Their final values are not established by this static audit.
- Update canonical design/purpose/performance docs alongside implemented behavior, rather than letting this plan become a second source of runtime truth.

## Analysis-stage validation and limits

Inspected application, traffic/driver/rule/control/contact/recording/replay logic; the ten source definitions and generated copies; environment/layout/ground/collision/map metadata; sync and relevant generators; editor backends; existing tests and repository constraints. Read-only inventory confirmed one map, the ten actual modes/locations, route duplication, implicit prop ownership, and differing coverage bounds.

Document path references were checked, `git diff --check` passed, and before/after content fingerprints matched for all 475 pre-existing files. The only added repository file in this stage is `migration-plan.md`.

This stage does not change business code or generated data, run the simulation test suite, rebuild geometry, launch a browser playthrough, measure frame time, or test a physical phone. The proposed lifecycle, network connections, storage behavior, contact improvements, and performance gates remain future implementation/verification work. Existing test source and static connectivity checks are evidence of available coverage, not newly passing results.
