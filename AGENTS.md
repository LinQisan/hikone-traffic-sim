# AGENTS.md

Browser port of [VRLearn](https://github.com/LinQisan/VRLearn) (Unity pedestrian traffic-safety VR): the Hikone Kyobashi scene, 10 accident events and custom scenario JSON, plus a scenario editor (`editor/`). three.js vendored, ES modules, **no build step, no npm dependencies**. A practice tool, not an experiment: it writes no data.

Talk to the owner in Chinese. Code, comments, commits and these docs in English; README and UI in Japanese.

## Commands

```bash
node --test test/turning.test.mjs   # targeted example: choose the affected test file
npm test                          # full regression (includes the event checker); see Verification
node serve.mjs                    # http://127.0.0.1:8770/ ; --host 0.0.0.0 for phones
node tools/check_events.mjs [id]  # event purposes, with real sight lines
node tools/check_routes.mjs       # authored segments, editor cars and runtime bodies stay on roads
```

Data comes from `../VRLearn` (`VRLEARN_ROOT`), in this order — Unity `Tools/VRLearn/Web/Export Scene For Web` → `blender -b --factory-startup --python tools/export_models.py` → `… tools/build_impressionist.py [-- --only NAME…]` → `node tools/sync.mjs` → `node tools/build_collision.mjs` → the applicable checks under Verification.

## Rules

1. **Positions come from Unity.** Never move roads, placements, spawns, goals, triggers, signals or black walls. Owner-requested browser event route corrections go in `events/` and must stay within Unity's carriageway; keep Unity experiment routes and editor templates unchanged. All logic is in Unity coordinates; only `src/coords.js` converts to three.js.
2. **Heights come from Unity too** (15 cm kerbs since VRLearn D37: carriageway 0.01, pavement 0.16, town 0.15). Never map or offset heights in the browser; the only height change is pressing ground models just under the roads (`world.js`).
3. **Never hand-edit generated files:** `data/` and `src/shared/scenario.js` (a copy of VRLearn's `ScenarioModel/scenario.js` — change it there, with `CustomScenario.cs`, then sync). Web-only layout changes go in `src/web-layout.js`.
4. **Events:** edit `events/`, never `data/scenarios/`. Each must pass the checker — going on without looking gets hit by that event's car, stopping at the kerb sees it and reaches the goal, cars appear hidden or far away. Accident cars launch by timing; they never chase.
5. **Relative URLs only** — the site is served from a sub-path on GitHub Pages. **A push to `main` deploys it.**
6. **Even frames:** about 120 draw calls; nothing moving casts into the sun's shadow map (use `withBlobShadow`); no per-frame allocation in hot paths; no post-processing. Measure rendering changes with `?benchmark=1`, A/B on the same page — absolute fps on this laptop is not evidence.
7. **After model or layout changes** rebuild `data/collision.json`; every spawn and way to the goal must stay free (`test/obstacles.test.mjs`).
8. **Keep accessibility working:** announcements, focus moves, keyboard play (Q/E look), 44 px touch targets, reduced motion, forced colours.
9. **Every state can be left** to the menu, and the replay always reaches the results.
10. **The editor server answers this computer only** and refuses cross-site writes; templates (`builtin-*`) are never overwritten. `editor/index.html` ids are bound by `editor/app.js` — restyle freely, keep the ids.

## Verification

Choose the smallest checks that cover the affected behavior, not a fixed suite for every change. Existing tests remain available; do not add tests for prose, pure formatting or cosmetic constants, or tests that only repeat the implementation. Add a focused regression test for an uncovered behavior fix.

| Change | Required checks |
| --- | --- |
| Docs/comments/pure formatting | Review content/paths and `git diff --check`; no browser or test suite. |
| CSS, copy or cosmetic values | Inspect the affected page/view, keyboard/touch reachability and console; no unrelated simulation tests. |
| Isolated logic fix | `node --test test/<affected>.test.mjs`; use `--test-name-pattern` before the file path for one regression case. |
| Vehicles/steering | `test/turning.test.mjs`; add `test/logic.test.mjs`, `test/crash.test.mjs` or `test/bicycle.test.mjs` only for the behaviors affected. |
| Art/models/layout/collision | Regenerate the affected outputs and collision grid; run `test/art.test.mjs` and `test/obstacles.test.mjs`. Check the affected view. Run `test/performance.test.mjs` and benchmark only when rendering workload/LOD/shadows change. |
| Editor storage/server/Quest bridge | Corresponding `test/editor-store.test.mjs`, `test/editor-server.test.mjs` and/or `test/editor-quest.test.mjs`. |
| One event | `node tools/check_events.mjs <id>` and play that event; route changes also need `node tools/check_routes.mjs` and `test/routes.test.mjs`. Shared timing/contact changes require full regression. |
| Shared format/sync | Affected editor/logic tests and VRLearn's `ScenarioModel` tests; change the shared model in VRLearn, then sync. |
| Cross-cutting flow, replay, coordinate/height conventions, shared timing/contact, dependency changes or uncertain impact | Full `npm test`; check a walking and a cycling event for affected experience changes. |

Read the selected test counts; zero tests or a skipped required integration test do not prove the change. Expand checks after failures/new dependencies. Reuse passing results while tested inputs remain unchanged; hand-off, commit or push alone does not require repeating them. A push to `main` is still a deployment, so complete the applicable checks before pushing.

## Before handing off

- Complete the applicable checks above and run `git diff --check`. For visible changes, load the affected page without console errors (headless Chrome screenshots are fine for looks); local cosmetic changes need no unrelated event playthrough.
- Commit or push only when asked; never force-push.
- Say what changed, what was verified, and what was not (e.g. no real phone).

## Docs

[RATIONALE.md](RATIONALE.md) why things are as they are · [DESIGN.md](DESIGN.md) interface design system · [docs/art-and-performance.md](docs/art-and-performance.md) models, checks, measurements · [README.md](README.md) user guide (Japanese). Each fact lives in one of them; update it with the code.
