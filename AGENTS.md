# AGENTS.md

Browser port of [VRLearn](https://github.com/LinQisan/VRLearn) (Unity pedestrian traffic-safety VR): the Hikone Kyobashi scene, 10 accident events and custom scenario JSON, plus a scenario editor (`editor/`). three.js vendored, ES modules, **no build step, no npm dependencies**. A practice tool, not an experiment: it writes no data.

Talk to the owner in Chinese. Code, comments, commits and these docs in English; README and UI in Japanese.

## Commands

```bash
npm test                          # all suites (includes the event checker); must pass
node serve.mjs                    # http://127.0.0.1:8770/ ; --host 0.0.0.0 for phones
node tools/check_events.mjs [id]  # event purposes, with real sight lines
```

Data comes from `../VRLearn` (`VRLEARN_ROOT`), in this order — Unity `Tools/VRLearn/Web/Export Scene For Web` → `blender -b --factory-startup --python tools/export_models.py` → `… tools/build_impressionist.py [-- --only NAME…]` → `node tools/sync.mjs` → `node tools/build_collision.mjs` → `npm test`.

## Rules

1. **Positions come from Unity.** Never move roads, placements, routes, spawns, goals, triggers, signals or black walls. All logic is in Unity coordinates; only `src/coords.js` converts to three.js.
2. **Heights come from Unity too** (15 cm kerbs since VRLearn D37: carriageway 0.01, pavement 0.16, town 0.15). Never map or offset heights in the browser; the only height change is pressing ground models just under the roads (`world.js`).
3. **Never hand-edit generated files:** `data/` and `src/shared/scenario.js` (a copy of VRLearn's `ScenarioModel/scenario.js` — change it there, with `CustomScenario.cs`, then sync). Web-only layout changes go in `src/web-layout.js`.
4. **Events:** edit `events/`, never `data/scenarios/`. Each must pass the checker — going on without looking gets hit by that event's car, stopping at the kerb sees it and reaches the goal, cars appear hidden or far away. Accident cars launch by timing; they never chase.
5. **Relative URLs only** — the site is served from a sub-path on GitHub Pages. **A push to `main` deploys it.**
6. **Even frames:** about 120 draw calls; nothing moving casts into the sun's shadow map (use `withBlobShadow`); no per-frame allocation in hot paths; no post-processing. Measure rendering changes with `?benchmark=1`, A/B on the same page — absolute fps on this laptop is not evidence.
7. **After model or layout changes** rebuild `data/collision.json`; every spawn and way to the goal must stay free (`test/obstacles.test.mjs`).
8. **Keep accessibility working:** announcements, focus moves, keyboard play (Q/E look), 44 px touch targets, reduced motion, forced colours.
9. **Every state can be left** to the menu, and the replay always reaches the results.
10. **The editor server answers this computer only** and refuses cross-site writes; templates (`builtin-*`) are never overwritten. `editor/index.html` ids are bound by `editor/app.js` — restyle freely, keep the ids.

## Before handing off

- `npm test` and `git diff --check` pass; for visible changes, load the page without console errors and play a walking and a cycling event (headless Chrome screenshots are fine for looks).
- Commit or push only when asked; never force-push.
- Say what changed, what was verified, and what was not (e.g. no real phone).

## Docs

[RATIONALE.md](RATIONALE.md) why things are as they are · [DESIGN.md](DESIGN.md) interface design system · [docs/art-and-performance.md](docs/art-and-performance.md) models, checks, measurements · [README.md](README.md) user guide (Japanese). Each fact lives in one of them; update it with the code.
