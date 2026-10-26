# RATIONALE.md

Why the browser port is built the way it is, and what it deliberately leaves out. Rules: [AGENTS.md](AGENTS.md). If this disagrees with the code, the code wins — fix this file.

## UI ownership and native engine

React now owns menus, HUD, feedback and editor controls. The engine remains native Three.js because the existing instancing, painted geometry, replay cameras and bounded simulation loop already have explicit responsibilities. R3F would duplicate scene ownership without simplifying those systems. UI snapshots carry changed labels and commands; frame-rate cars, signals and geometry stay inside the engine. Strict TypeScript covers data, simulation, input, lifecycle and application coordination. Unchanged procedural visuals remain JavaScript to preserve the authored output and keep the migration reviewable.

Every engine mount owns one renderer/loop and a cancellation scope, including in-flight fetches, workers, observers and listeners. Shared model/material prototypes are released only at full teardown. The simulation's existing substeps and experiment parameters stay unchanged. The editor uses React for ordinary controls while its SVG map owns high-frequency drawing. Versioned JSON carries simulation semantics separately from optional GLB assets. The complete feature matrix, verification and remaining boundaries live in [the migration record](docs/react-typescript-migration.md).

## Purpose

People without a Quest try VRLearn's Hikone scene and its 10 accident events in a desktop or phone browser — for demonstrations, practice and briefing — and try the scenario editor's files. It is **not an experiment**: its own timing and look; experiment data comes only from the Unity app. Open exploration keeps a bounded behaviour record in the tab, which the participant may save as a JSON file; nothing is sent or stored automatically. No VR (the Unity app does that). The audience is pedestrians and cyclists in general, not children specifically.

## Technical choices

- **Vite and native three.js:** Vite serves all HTML entries and the local editor API, then builds a relative-path static distribution for GitHub Pages. Browser rendering and Node checks use the same pinned npm three.js version. Native construction recipes preserve dimensions, profiles, materials and authored surface boundaries; `src/three/assets/models.js` constructs the geometries without a GLB loader. The legacy GLBs remain offline reference fixtures and are excluded from the distribution.
- **Logic apart from drawing:** traffic, timing, obstacles and analysis run in Node without three.js, so the event checker verifies events without a browser.
- **Unity coordinates throughout:** scene, scenario files and map compare one to one; only drawing mirrors x.

## Relation to Unity

This is an independent practice tool that originally imported Unity's geometry and scenario format; it need not match VRLearn. Built-in routes, timing, editor templates and lane presets belong to this project and come from `events/`. `node tools/sync.mjs --events-only` rebuilds them without a Unity checkout. The browser's roads now follow an approximate Google overhead reconstruction authored in `tools/road_network.py`; `src/world/generators/road-layout.js` replaces the obsolete imported tile grid and moves its surroundings. Meshes, ground triangles and editor imagery come from the same road polygons. A full sync still imports upstream assets while retaining the browser scenario model: rebuild the local road plan afterwards, and review the changes separately from browser event edits. The existing format supports the optional Unity/Quest bridge; web-only scheduling is not reproduced by Unity. Signals use a shared pedestrian-exclusive practice cycle; there is no sound, rain or night, and built-ins 06–08 use browser behaviours. **Town footways are flush with the carriageway** (both 0.01), behind separate 15 cm kerb caps (0.16); town plots remain 0.15 and the castle approach follows terrain; keep geometry and rendering consistent. Unity has adopted some of this port's pigments and models, while the browser's raised stroke geometry stays local.

## Look

A soft, warm Renoir-like painting in which outlines and positions stay clear enough to judge a car's distance. The painting uses **authored geometry and material brushwork**: baked corner pigments and brush meshes from Blender, plus a shared cached brush mask. Foliage groups folded leaves and continuous painted colour into overlapping sprays; poles and signal shells use ochre/violet-grey strokes along their structure. Signal lamps remain unambiguous. There is no screen filter or extra render pass; paint coordinates stay attached to the world, with mipmapped detail at distance. Geometry and shader costs are measured rather than assumed free. Street View guides approximate shapes and construction details; colour keeps the impressionist warm/cool palette instead of matching the photograph. Detail is concentrated around the crossing and its nearby facades. The Kyobashi crossing follows street photographs (signals, plates, 40 km/h on Route 25; no crosswalk signs at the signalised corners) — web-only choices. In the replay a bear stands in for the participant: posture and fall read clearly without a distressing human figure.

## Open world

Open exploration is one continuous session in the existing corridor (Kyobashi crossing to the Route 25 parking frontage), not a new map. `world/hikone.json` is the hand-authored source: shared background flows and the bindings that turn the ten built-ins into encounters. Its routes are references into `events/`, resolved by `src/world/scenes/world.ts`, so the events remain the only route geometry; a few join points are explicit and checked on the carriageway (`test/world.test.mjs`). One `Traffic` carries all flows with a car cap; encounter cars join it through `Traffic.admit()` and drive on as ordinary traffic afterwards.

Background departure intervals are 3–5 s east/west, 6–9 s north/south, and 9–14 s for the north-to-west turn. Repeating departures wait when 24 cars are already on the road or their source is occupied; encounter admissions remain separate. These are demand intervals, not guaranteed passing intervals: signals, queues, following distance, and yielding still determine the actual flow.

`src/simulation/events/ScenarioManager.ts` decides encounters: on entering a binding's zone, in its mode and direction of approach (event 10: actually riding against a lane), one template per conflict group (01/02/05 crossing, 03/04/06/09 midblock, 07/08 parking exit) is rolled with a chance that rises with the participant's risk score. That probability (whether an encounter is prepared) is separate from the driver hazard probability, which is unchanged. Cars join at the nearest upstream point of their route that is out of sight (far, outside the view, or behind buildings and trucks), clear of other cars and not just before a stop line, already moving; the parking-exit car is the parked car in the slot, which returns only when unseen. Nothing retimes a car to meet the participant. Outcomes (contact, near miss under 1 m, driver braked, passed, deferred) come from what happened; contact is reported by the physical check and recorded once.

The midblock trucks are one permanent prop set, builtin-04's pair as practice places it, and eastbound traffic holds z 28.55 beside them so opposing bodies stay about 0.4 m apart. Traffic does not model giving way at that narrowing. The signal-queue sedans of 02/05 and 03's other trucks are not used: live traffic replaces the first, the second conflicts with 04's set. Exploration steps the simulation in slices of at most 1/60 s and checks contact after each; it is bounded-step, not a fixed-step deterministic replay. Contact keeps traffic running through the fall, pauses for replay and results, and resumes with the participant on the nearest clear pavement point (a recorded placement boundary). Practice mode keeps its finite scenario flow.

A new red/flashing crossing entry also requests a one-shot blind-side traffic response, independently of any earlier skipped encounter lottery. `world.redEntryResponse` selects existing transverse flows and admits at most two hazardous drivers at 55 km/h, with 2.5 s reaction and 3 m/s² maximum braking. It keeps the hidden/clear upstream points and junction exclusion; these drivers may approach a stop bar without the normal admission buffer. They fail to yield on a green approach or can run their own red signal. Admission does not move existing cars or aim/revise a route after the entry. It expires after 0.75 s, cancels when the participant leaves that crossing, and has an 8 s cooldown and a total-traffic admission ceiling of the normal cap plus two. Fully visible or occupied approaches can therefore defer it. Waiting, a high risk score alone, and a phase change during a crossing that began on green do not request cars. Response decisions and driver parameters are included in the local session record; contact still comes only from the physical check, so retreat can avoid it. These are deliberate training hazards, not measured crash probabilities.

## Parked trucks

`data/scene.json` is generated, so browser corrections to its parked vehicles live in `src/world/generators/parked-layout.js` (used by the app, the event checker and the route tests). The midblock trucks of 03/04/06/09 stand 0.35 m toward the kerb (about 0.1 m inside the carriageway): at the imported pose the westbound pass of 04/06/09 ran flush with their sides and its turn back toward the x 47.6 stop bar clipped the large truck's corner, and no line through that stop-bar gate could clear it. That pass now bends at x 49.2 instead of 51.95; the event checker's outcomes for 04/06/09 are unchanged.

## Events

Built-ins describe independent traffic streams and practice situations. Contact is an outcome,
not a required event: waiting, crossing time, driver reaction and visibility can change the result.

- Routes supply lane geometry, not a collision script. Ordinary drivers follow signals, safe following,
  corner speeds and junction gap acceptance. Hazardous drivers can violate selected rules;
  `accident` remains an authored inspection label, separate from actual driving behavior.
- Departures use scenario time and seeded intervals. Built-ins neither read participant progress
  nor stop traffic when the participant enters a trigger. Legacy custom `start: "trigger"` and
  `stopOnTrigger` schedules remain supported; obsolete `launch: "meet"` fields have no effect.
- Each car saves one independent hazard draw at birth. It resolves that draw at its first nearby
  participant or junction decision (within max(15 m, three seconds of current travel)), or after
  eight seconds of driving. Until then it drives normally. Once resolved, the behavior stays fixed;
  changes in player behavior affect unresolved/new drivers, never retarget an existing driver.
- Optional `hazardPolicy.safeProbability` and `hazardPolicy.unsafeProbability` default to 0.03
  and 0.60. Probability interpolates between them using a 0–1 observation score. Each driver has
  one chance, not one chance per frame. These are practice settings, not real-world crash rates.
- `ParticipantRules` observes actual movement and head yaw against the authored lane corridors
  and crossing observation corridors around the painted stripes (with lateral approach tolerance
  for diagonal walks). Entering a signal crossing on red/flashing sets the score to
  1. Entering a lane without at least 0.25 s looking in each lane-axis direction during the last
  6 s adds 0.65. Wrong-way bicycle travel adds 0.75 per second. The score decays by 1/30 per
  observed second and is clamped to 0–1. Standing still is not a violation; a signal change while
  already crossing is not a new entry. Missing yaw disables the direction-check observation.
  Lane corridors are a geometric approximation, not a complete road or legal classification.
- `driver.behavior` can be `adaptive` (default), `lawful`, `red-light`, `speeding` or
  `failure-to-yield`. Adaptive hazards split equally across the three violation tendencies. A
  red-light driver ignores signal braking; a speeder targets 135% of its desired speed, capped
  at 80 km/h; a non-yielding driver ignores junction gap priority and adds 1.5 s to pedestrian
  reaction. All retain lane geometry, following/corner constraints and finite braking. Selection
  never guarantees contact. Explicit types support authored custom scenarios.
- The recorder distinguishes driver tendency from an observed violation: crossing a red stop
  line, actually exceeding the route speed cap, or failing an active yield decision. Feedback
  reports observed violations and participant observation counters, without inferring fault.
- Each spawned car samples a persistent driver. Optional `vehicle.driver` fields override the
  sample: `reactionTimeSeconds` (0.2–2.5 s), `desiredSpeedKmh` (5–80 km/h, normally capped by route
  `speedKmh`), `maxBrakingMps2` (2–9 m/s²), `accelerationMps2` (0.5–4 m/s²) and
  `timeHeadwaySeconds` (0.8–3 s). Defaults sample 0.6–1.4 s reaction, 90–105% of route speed,
  4.5–7.5 m/s² braking, 1.8–3 m/s² acceleration and 1.2–2 s headway. These are practice
  settings, not measured driver populations. Repeated cars sample independently; seeds reproduce them.
- Driver states are `cruising`, `following`, `yielding`, `reacting`, `braking`,
  `emergency-braking` and `waiting`, with a reason and target speed. The controller predicts
  conflicts along the actual upcoming lane from the participant's current position and velocity.
  Detection starts a reaction interval; bounded braking follows. It never snaps a car to a safe
  position when stopping distance is insufficient. A cleared hazard releases after 0.6 s.
- Stopped traffic blocks participant movement like parked cars, without a zero-speed impact.
  A participant who insists on walking straight into a stopped vehicle must choose another path;
  the checker reports that separately from an unfinished or unsafe cautious traversal.
- Optional `environment.visibilityMeters` (5–150, default 80) limits detection;
  `environment.roadGrip` (0.2–1, default 1) scales braking and corner grip. The browser and event
  checker share conservative 2D body-height visibility from the collision grid, parked boxes and
  traffic bodies. This is an approximation, not eye-height ray tracing or weather rendering.
- Junctions use stop lines and deterministic gap acceptance (arrival order, then vehicle id for
  ties). This is not a complete model of statutory priorities, lane changes or overtaking.
- The event checker reports different departure times and cautious traversal, using city meshes
  for participant sight lines. Regression tests separately require early detection to avoid contact
  and late detection/insufficient braking to allow contact. No seed is required to produce a crash. A separate ordinary-driver reference verifies
  cautious traversability with hazard probabilities explicitly set to zero; normal cautious
  runs retain their nonzero hazard chance and may still experience contact.
- Editor playback uses the same traffic controller with a fixed seed, without a moving participant
  or scene occlusion. Its free-road timing hints are approximate; Unity ignores browser driver settings.
- Route checks sample the authored line, the editor's car rectangle and all runtime body sizes along the full route. Only the bounded parking exits in 07/08 may cross the pavement; vehicles on bends must keep their complete bodies on the carriageway.
- Cars turn like cars: corners become arcs, both axles follow the path, the front wheels steer before the body turns. Before rounding, the browser removes polyline deviations of at most 30 cm from its computed path, keeping the source control points and endpoints unchanged; tiny lane corrections must not become full-lock turns. The [event review](docs/event-review.md) records the route and timing checks.

## The body

- Eye height from the menu height; real-size vehicles and a real city bicycle (it does not grow with a tall rider).
- The view **falls with the body** on contact — it should feel like being hit (no roll with reduced motion).
- On a bicycle, looking back never turns the bike.
- Buildings, walls, trees, posts and parked vehicles are solid, but a body that starts touching something can always step away (custom spawns may sit by a wall).
- The menu is always one key away: it is practice, not a trial to complete.

## Replay and results

Unity's window (8 s before to 1.6 s after contact). Bird's-eye for the situation; the accident car's driver seat to ask "could the driver see me?". The fall depends on where and how fast the car hit — educational, not reconstruction. The replay waits on its last frame and restarts cleanly.

The overview plans against the recorded approach, car and posed landing before playback. CPU-only
copies of the town's low-detail silhouettes retain roofs, trees and signal poles independently of
render culling; parked vehicles and recorded traffic also obstruct the view. The planner prefers
one clear three-quarter angle for the complete clip, raises or moves it when necessary, and checks
the translation between camera positions as well as the subject sight lines. Turn costs are per
second, so an angle change happens on the slower approach rather than in the dense samples around
contact. The planned key poses then become one continuous orbit: focus, heading, pitch and boom
length are resampled on a uniform 1/30 s clock and Gaussian-smoothed there (a positional blend
would cut chords across a turn). The boom is dilated by the full kernel radius before easing, so
the camera pulls back ahead of a widening shot (the arriving car) and never closer than any shot
needs. The smoothed path is re-validated at every key pose; where it fails, smoothing softens only
around that moment. A move still faster than a whip pan becomes a clean cut instead. If no
continuous clear connection exists, an angle change is preferred away from contact. Buildings stay
visible. Portrait resizing replans the framing and reserves the area covered by replay controls;
reduced motion prefers a stationary wide shot. Normal playback evaluates a Catmull-Rom spline
through the precomputed samples (continuous velocity), without scene raycasts or new camera vectors
each frame. On the built-in walking events, peak camera acceleration fell from up to ~3,700 m/s²
(velocity jumps at every 0.2 s key) to under ~60 m/s².

## Performance

Smooth on an ordinary laptop and phone. Instancing keeps draws near 120. **Even frames matter more than average fps:** a heavy frame every few frames is felt as judder, so the shadow map holds only still things and is redrawn only when the view moves on (moving things carry a soft shadow pool), and dynamic resolution backs off instead of see-sawing (every change resizes the canvas). Details and measurements: [docs/art-and-performance.md](docs/art-and-performance.md).

## Loading and accessibility

Tens of MB of models take time, so loading shows real progress, a friendly bear and safety tips, and explains failures. The experience is playable by keyboard alone, announces what the eye might miss and respects reduced motion and forced colours.

## Scenario editor

One UI, two backends: on the computer with VRLearn it reads and writes custom files in `VRLearn/Scenarios/` and can play in Unity or send to a Quest; anywhere else files stay in the browser. Both backends use this project's map, built-in templates and lane presets. The templates are generated from the same `events/` as the simulator, and snapping guides and the lane menu use those corrected routes too. Trying a template in Unity first saves a custom copy, so the bridge cannot silently play an older Unity built-in. The local server answers this computer only.

External scenario text enters through `parseScenario()` in the shared model: malformed field types produce Japanese messages with field paths before replacing work or writing storage. The editor still accepts semantically invalid drafts for repair. Simulator file imports and editor handoffs use `createScenarioReader()` to additionally validate geography against `data/map.json`; the smaller wall-only runtime map cannot answer road-surface queries. The full validation map is loaded lazily and cached on success, so ordinary startup avoids this request and failed downloads can be retried. Import status stays beside the file control, and a newer selection wins over an older pending import.

## Publishing

GitHub Actions runs `npm run check` (generated reference tables, the full test suite and the Vite build) before deploying `dist/` to GitHub Pages. A push to `main` is a release. The distribution contains the browser assets; tools, tests and legacy GLBs stay outside it, although the repository itself is public. The first scene still transfers tens of MB; see the measured startup limits in [art and performance](docs/art-and-performance.md).
