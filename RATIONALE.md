# RATIONALE.md

Why the browser port is built the way it is, and what it deliberately leaves out. Rules: [AGENTS.md](AGENTS.md). If this disagrees with the code, the code wins — fix this file.

## Purpose

People without a Quest try VRLearn's Hikone scene and its 10 accident events in a desktop or phone browser — for demonstrations, practice and briefing — and try the scenario editor's files. It is **not an experiment**: no data, its own timing and look; experiment data comes only from the Unity app. No VR (the Unity app does that). The audience is pedestrians and cyclists in general, not children specifically.

## Technical choices

- **No build step, no dependencies:** the site runs as-is from GitHub Pages or `node serve.mjs`, and there is nothing to keep up to date. The price is no TypeScript or tree-shaking.
- **Logic apart from drawing:** traffic, timing, obstacles and analysis run in Node without three.js, so the event checker verifies events without a browser.
- **Unity coordinates throughout:** scene, scenario files and map compare one to one; only drawing mirrors x.

## Relation to Unity

Road geometry, placements, spawns and goals come from Unity and stay fixed. Owner-requested browser event route corrections are authored in `events/` against that carriageway; Unity's experiment routes and the editor's Unity templates stay unchanged. The scenario format is shared (`src/shared/scenario.js` = Unity's `CustomScenario.cs`), so editor files run on the Quest, and results use the same measures. Deliberately different: signals never switch; no sound, rain or night; no code-only behaviours of built-ins 06–08. **Kerbs are 15 cm in both**: the browser started it (Unity's 40 cm put the eyes ~2 m above the road and made cars look low) and Unity adopted it as data (VRLearn D37), so the browser no longer maps heights. **The look is shared too**: Unity paints its low-poly models with this port's pigments, brush and sky (VRLearn D38); the raised stroke geometry stays browser-only, too heavy for a Quest. Unity keeps the crosswalk sign and the guide post at the bridge corner because they hide one of scenario 05's appear/despawn points; the browser hides them (`src/web-layout.js`).

## Look

A soft, warm Renoir-like painting in which outlines and positions stay clear enough to judge a car's distance. The painting is **in the geometry** (vertex pigments, brush meshes made in Blender), not a screen filter: it costs nothing per frame, looks the same on phones and never shimmers. Props keep only the outlines needed to read them. The Kyobashi crossing follows street photographs (signals, plates, 40 km/h on Route 25; no crosswalk signs at the signalised corners) — web-only choices. In the replay a bear stands in for the participant: posture and fall read clearly without a distressing human figure.

## Events

**Each event must achieve its purpose — nothing else matters.** Unity's timing is made for walking in VR and often misses in a browser, so `events/` re-times them:

- The accident car leaves when a participant going on at the normal pace would meet it at the crossing point. Going on without looking meets the car; slowing or stopping sees it pass. It never chases — the participant's choice decides.
- Cars appear hidden (buildings, parked trucks, the gatehouses' black walls) or far away, already moving; turning or parked cars wait in place; nobody waits forever.
- The checker simulates hasty and careful participants with real sight lines, so tuning cannot silently break an event.
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

## Performance

Smooth on an ordinary laptop and phone. Instancing keeps draws near 120. **Even frames matter more than average fps:** a heavy frame every few frames is felt as judder, so the shadow map holds only still things and is redrawn only when the view moves on (moving things carry a soft shadow pool), and dynamic resolution backs off instead of see-sawing (every change resizes the canvas). Details and measurements: [docs/art-and-performance.md](docs/art-and-performance.md).

## Loading and accessibility

Tens of MB of models take time, so loading shows real progress, a friendly bear and safety tips, and explains failures. The experience is playable by keyboard alone, announces what the eye might miss and respects reduced motion and forced colours.

## Scenario editor

One UI, two backends: on the computer with VRLearn it reads and writes `VRLearn/Scenarios/` and can play in Unity or send to a Quest; anywhere else files stay in the browser. Its templates are Unity's (what the headset runs), not the re-timed `events/`, so browser timing never leaks into experiment scenarios. The local server answers this computer only.

## Publishing

GitHub Pages serves `main`; a push is a release. Trade-offs: the first load is tens of MB, Pages caches ~10 minutes, and `tools/`/`test/` are public (so is the repository).
