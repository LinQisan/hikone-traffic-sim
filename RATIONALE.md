# RATIONALE.md — Hikone Traffic Simulator

Why the browser port is built the way it is, and what it deliberately does not do. Rules and procedures are in [AGENTS.md](AGENTS.md), the user guide in [README.md](README.md) (Japanese), models and measurements in [docs/art-and-performance.md](docs/art-and-performance.md). If this file disagrees with the code, the code wins — update this file.

## 1. Purpose

- **What for:** people without a Quest can try VRLearn's Hikone Kyobashi scene and its 10 accident events in a desktop or phone browser — for demonstrations, practice and briefing before the VR session. It is also where the scenario editor's files are tried out.
- **Not an experiment:** no CSV, no data collection; timing and look differ from the Unity app. Experiment data comes only from the Unity app.
- **No VR:** the Unity app covers VR. The browser port targets keyboard/mouse and touch.
- **Audience:** pedestrians (and cyclists) in general, not specifically children.

## 2. Technical choices

- **three.js and plain ES modules, no build step, no dependencies.** The site runs as-is from GitHub Pages or `node serve.mjs`; there is no bundler to maintain. three.js is vendored at a fixed version (no CDN). The price: no TypeScript or tree-shaking, so module boundaries rely on discipline.
- **Logic apart from drawing.** Traffic, event timing, obstacles and analysis are pure modules without three.js, tested directly in Node; `tools/check_events.mjs` reuses the same traffic model to verify events without a browser.
- **Unity coordinates throughout.** Positions, headings and routes are computed in Unity's values; only drawing mirrors x (`src/coords.js`). The scene, scenario files and the map can be compared one to one, and there is no second coordinate system to get wrong.

## 3. Relation to the Unity app

- **Geometry comes from Unity:** roads, building placements, routes, triggers, spawns, goals, signals and black walls are VRLearn exports (`data/` is generated). The browser port changes looks and event timing, never horizontal positions; the one vertical exception is the lower kerb (§6).
- **Shared scenario format:** `src/shared/scenario.js` is a copy of VRLearn's `ScenarioModel/scenario.js`, with the same fields, defaults and validation messages as Unity's `CustomScenario.cs`; files written by the editor run on the Quest.
- **Shared evaluation:** the results page uses the Unity app's measures (time looking towards the car, last look, sideways checks).
- **Deliberate differences:** signals are display only (they never switch); no sound, rain or night; no code-only behaviours of built-ins 06–08 (the editor templates lack them too).

## 4. Look: an impressionist painting

- **Aim:** a soft, warm, brush-stroked picture in the manner of Renoir, while outlines and positions stay clear enough to judge a car's distance and direction.
- **Painted into the geometry, not on the screen.** Strokes, pigments and masses are generated onto the models in Blender (`tools/build_impressionist.py`, `tools/abstract_props.py`); shaders only look up pigments, add bristle relief and draw the sky. Desktop and phone look the same, there is no full-screen filter to pay for, and nothing shimmers when the camera moves.
- **Abstract props:** lamps, signals, vehicles and signs keep the outlines needed to recognise them and read their direction and state; dense detail is left out.
- **True to the real crossing:** the Kyobashi signals follow street photographs (long two-pipe mast arm, tall brown pole, "京橋" name plate, "歩車分離式" plate; car lamps green–yellow–red from the left). Props the photographs do not show (the crosswalk signs at the signalised corners, the "彦根城 →" post at the bridge) are left out, and Route 25 along the moat shows 40 km/h. These are web-only choices in `src/web-layout.js`; `data/layout.json` and the Unity app are unchanged.
- **A bear as the participant's stand-in** in the replay, sized from the menu's height and weight: posture, head direction and the fall read clearly without a realistic, distressing human figure.

## 5. Events (`events/`)

**The only requirement: each event achieves its purpose.** The Unity templates are timed for walking in VR; in a browser they often miss or hit unnaturally, so the browser port has its own timing in `events/`.

- **Launch by meeting time** (`launch: "meet"`): the accident car leaves when a participant going on to the goal at the normal pace (2.4 m/s) would reach the crossing point together with it. Whoever goes on without looking meets the car; whoever slows down or stops sees it pass. The car **never chases**: once launched it drives its route, so the participant's choice decides the outcome.
- **No popping in:** cars appear behind buildings, parked trucks or the gatehouses' black walls, or far away, and already moving (`entrySpeedKmh`). Cars turning at the junction or leaving the car park wait in place (`hold`). Cars keep their distance and never appear on top of each other.
- **Waiting has an outcome:** someone waiting at the kerb eventually sees the car pass (`launchAfterTriggerSeconds`, `holdMaxSeconds`).
- **Checked automatically:** `tools/check_events.mjs` computes sight lines through the real city geometry and simulates, for every event, a participant who goes straight on (after 0, 3 and 7 s) and must be hit by that event's car; a careful one who stops at the kerb and must see the car and reach the goal; and every car's appearance, which must be hidden or distant. Tuning cannot silently break an event.
- **Turning like a car:** routes are polylines with ~45° kinks every 9–15 m. Each corner is rounded into an arc (radius ≤ 12 m, at most about half the neighbouring segments). Cars, the meeting time and the checker all use this path, so events keep their purpose. Both axles run on the path: the nose enters the bend first and the body follows. The front wheels steer by the bicycle model, atan(wheelbase / radius) in a bend, averaged over one wheelbase. So the wheels turn in before the body swings round and straighten as it leaves. They are cut out of the car model at run time and steer about their own centres, in the replay too.

## 6. The participant's body

- **Eye height** = height × 0.936, as Unity's `ReplayMannequin`.
- **The view falls with the body** on contact (0.55 s down and rolling) instead of just turning red: it should feel like being hit. With reduced motion there is no roll and the red flash is weaker.
- **Real sizes:** the participant's eye height follows anthropometry (height × 0.936: 1.59 m at 170 cm). Vehicles are their real Japanese sizes: a sedan like a Corolla (4.60 × 1.76 × 1.45 m); kei cars at the legal 3.40 × 1.48 m, tall 1.79 m, hatch 1.52 m; a large truck 11.8 × 2.49 × 3.62 m and a 4-tonne van 8.6 × 2.30 × 3.62 m (legal limits 12 × 2.5 × 3.8 m). The bicycle is a real city bicycle (ママチャリ) for adults (26-inch wheels, saddle 0.75 m, grips 1.06 m, 1.88 m long), proportionally smaller for children (20-inch at 1.2 m); it does not grow with a tall rider. Seated eye height at 170 cm: about 1.5 m.
- **Lower kerbs than Unity:** Unity's pavements stand 40 cm above the carriageway (its experiment geometry); Japanese kerbs are about 15 cm, and from a 40 cm pavement the eyes were ~2 m above the road, so cars looked low. The browser maps heights (`src/kerb.js`): the carriageway and everything below stays, everything at pavement level and above moves down 0.25 m (pavement 0.16 m), kerb faces and ramps in between are compressed. Horizontal positions, signal heads above the road and the cars are unchanged; ground, city, collision grid and the event checker all use the same mapping (the checker's eyes now stand on the ground underfoot, as in the app).
- **Bicycle:** pedal, brake and steering are separate; looking back never turns the bike (the rider twists); standing still, the bike can be pushed backwards. Looking and moving stay independent, as on a real bicycle.
- **Solid surroundings:** the body cannot pass buildings, walls, stone walls, trees, hedges, fences, posts, signal poles or parked vehicles.
  - The city is cut at body height (0.3–1.8 m above the ground) into a 0.2 m grid, built offline by `tools/build_collision.mjs`, so a run time check is a table lookup. Kerbs and steps below 0.3 m are stepped over; eaves and tree crowns above 1.8 m pass overhead. Parked vehicles are oriented boxes from their models.
  - Walking, the body (radius 0.25 m) slides along what it touches; a bicycle checks both wheels and cannot swing one into anything.
  - A move is allowed when it ends clear or no closer to anything, so a custom spawn touching a façade or a lamp post (validation only asks for pavement) never freezes the participant.
  - Tests keep every scenario's spawn and straight way to the goal free.
- **Leave at any time:** during the run, the fall and the replay the menu is one button, M, or Esc (with the mouse free) away. It is a practice tool; there is no reason to force a complete trial.
- **Phones:** a stick bottom left to move, dragging to look, buttons at least 44 px.

## 7. Replay and results

- **Window:** as in Unity, 8 s before to 1.6 s after contact, recorded at 20 Hz; slowed down around contact.
- **Two views:** bird's-eye for the whole situation; the accident car's driver seat (a cockpit built to the car's size, right-hand drive) to ask "could the driver see me?" — without the gaze fan.
- **Reactions:** the fall depends on where the car hit (front, corner, side, glancing) and its speed, so the replay shows what happened rather than one canned animation. Educational presentation, not accident reconstruction.
- **Same cars as on the street:** replay copies keep the paint the participant saw and steer their front wheels from the recorded angle.
- **Always reaches the results:** the replay stops on its last frame and waits; a restart resets every object (bear, ground ring, cars, cockpit) completely.

## 8. Performance

- **Target:** smooth on an ordinary laptop and phone.
- **Means:** one `InstancedMesh` per asset and LOD level (about 120 draw calls per frame instead of about 3,900); CPU frustum and shadow-range culling; distant LOD at 60 m with hysteresis; dynamic resolution on desktop, no MSAA on phones; cached brush textures and sky.
- **Even frames over high averages:** a judder every few frames is felt even when the fps counter is high. So the sun's shadow map holds only still things, is drawn from the light LOD with its own list of casters (the view's detail switches never touch it), and is redrawn only when the view re-centres; moving things (cars, bicycles, the replay figure) carry a soft shadow pool on the sun's side instead of forcing a full shadow pass 10 times a second. Dynamic resolution backs off for longer each time a raise fails, because every change resizes the canvas.
- **Measuring:** `?benchmark=1`. When the machine throttles, absolute frame rates mean little; compare A/B on the same page and use GPU timers. Results: [docs/art-and-performance.md](docs/art-and-performance.md).

## 9. Accessibility and loading

- **Loading:** tens of MB of models take time. A bear crossing the road, a progress bar that follows the real files and models, rotating safety tips; on failure the reason and a Reload button.
- **Accessibility:** keyboard only works (Tab, Enter, Q/E to look); screen readers hear start, contact, goal, replay and results; focus moves to the next control; reduced motion and forced colours are respected.

## 10. Scenario editor

- **One UI, two backends** answering the same `/api/…` calls: on the computer with VRLearn, `serve.mjs` reads and writes `VRLearn/Scenarios/` and offers "try in Unity" and "send to Quest"; on GitHub Pages or other devices, files stay in the browser's localStorage and leave as "⇩ JSON".
- **Safety:** the local server answers only this computer, refuses cross-site writes and never serves `tools/`, `test/`, `server/` or dotfiles. Templates (`builtin-*`) are never overwritten.
- **Easy to operate:** the top bar groups file, history, try and export actions (the danger action, delete, sits under the scene list); the map carries its tools (select / draw with their keys), zoom and fit, a layers menu and a legend of what the colours mean; the left panel lists scenes with two-line names and a four-step how-to; the inspector keeps the checks pinned below it; the timeline separates playback from the trigger settings. Controls are at least 36 px (44 px on touch screens); below 960 px the panels stack under the map.
- **Templates are Unity's** (what the headset runs), not the re-timed `events/`: the editor serves the experiment's scenario work, and the browser's timing must not leak into it.

## 11. Publishing

- GitHub Pages publishes the root of `main`; a push to `main` is a release.
- Every path is relative, because the site lives under `/hikone-traffic-sim/`.
- **Trade-offs:** the first load downloads tens of MB; Pages caches for about 10 minutes, so an update can take a while to show; `tools/` and `test/` are reachable on Pages (the repository is public anyway).
