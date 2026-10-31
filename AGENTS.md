# AGENTS.md

Independent browser traffic-safety practice tool, originally based on [VRLearn](https://github.com/LinQisan/VRLearn): the Hikone Kyobashi scene as an open exploration session where the 10 accident events occur as encounters (`world/hikone.json`), the same events and custom scenario JSON as standalone practice, plus a scenario editor (`editor/`). React UI, strict TypeScript simulation/control, native three.js geometry and Vite. It collects no experiment data; the exploration record stays in the tab unless the participant saves it.

Talk to the owner in Chinese. Code, comments, commits and these docs in English; README and UI in Japanese.

## Commands

```bash
npm ci                             # first
npm run dev                        # http://127.0.0.1:8770/ ; add -- --host 0.0.0.0 for phones
npm run build                      # dist/ for GitHub Pages; npm run preview to inspect
node --test test/<file>.test.mjs   # targeted check
npm run check                      # typecheck + generated docs + full regression + build (also CI)
npm run check:docs                 # generated reference tables against source
npm run test:geometry              # generated data, art, collision, routes, photographed streets
node tools/rebuild_models.mjs <model>…  # every stage for named models; stops on the first failure
node tools/check_events.mjs [id]   # event purposes, with real sight lines
node tools/check_routes.mjs        # cars and bodies stay on roads
node tools/check_red_crossings.mjs [n] [walking|bicycle] [gaze°]  # open-world red-crossing contact rate
node tools/sync.mjs --events-only  # build simulator/editor built-ins from events/; no Unity needed
```

Native programs in `models/` are generated: edit the procedural author in `tools/` or use `ModelBuilder`. The order for any geometry change is in [art and performance](docs/art-and-performance.md). A full historical import from `../VRLearn` (`VRLEARN_ROOT`) is Unity export → `tools/export_models.py` → `tools/build_impressionist.py` → `node tools/sync.mjs` → `node tools/build_collision.mjs`.

## Rules

Improve participant, developer and agent experience together: reproduce the friction, trace its dependencies, preserve supported behaviour and verify the flow. Prefer one shared rule over duplicated fixes. Input errors identify the field, keep the work and allow retry.

1. **Ownership.** This project need not match VRLearn; do not change the sibling Unity project unless asked. `events/` is the built-in source. Map coordinates are converted to three.js only in `src/three/scene/coords.ts`. Layout goes in `src/world/generators/`.
2. **Heights.** Carriageway and town footways 0.01, separate 15 cm kerb caps 0.16, town plots 0.15; castle approach follows terrain. No renderer offsets; change the authoritative geometry.
3. **Generated data.** Never hand-edit `data/`. A full sync imports upstream data, so review it and keep local format extensions from `src/simulation/core/scenario.ts`.
4. **Events.** Edit `events/`, never `data/scenarios/`. Each must pass the checker: cautious traversal reaches the goal in the ordinary-driver reference, and cars appear hidden or far away. Departures use independent clocks. Participant behaviour changes the chance of a persistent rule-breaking driver, with a nonzero baseline. Contact is a physical outcome, never a requirement. Open-world cars enter only at hidden, clear upstream points.
5. **Deployment.** Relative URLs only: the site is served from a sub-path. A push to `main` deploys through GitHub Actions.
6. **Even frames.** About 120 draw calls; nothing moving casts into the sun's shadow map (`withBlobShadow`); no per-frame allocation in hot paths; no post-processing. Measure with `?benchmark=1`, A/B on the same page, with heavy jobs stopped.
7. **Coherent geometry.** Before editing an author, identify affected recipes (high and low), GLBs, Ground, collision, editor atlas and camera bounds. Finish source edits first, run stages in order and never edit inputs mid-run. Every spawn and way to the goal stays free.
8. **Accessibility.** Announcements, focus moves, keyboard play (Q/E look), 44 px targets, reduced motion, forced colours.
9. **Exits.** Every state can return to the menu, and replay always reaches results.
10. **Editor.** The server answers this computer only and refuses cross-site writes; user saves cannot overwrite `builtin-*`. `src/editor/controller.ts` uses the ids in `EditorApp.tsx`: restyle freely, keep them.
11. **Starting checkout.** Record dirty paths before work; do not reset unrelated changes. Claim a file unchanged only after comparing it.
12. **Geographic evidence.** Inspect original-resolution references. Record source, licence, dates and uncertainty; keep source coordinates separate from placements and verified details separate from estimates; never claim an inaccessible reference was checked.
13. **Field photos.** `field-photos/` is git-ignored and carries GPS: never upload it, copy it into docs or use it as a texture. It is indexed in `field-photos/INDEX.md`.

## Architecture

- React owns ordinary UI and mount lifetimes; native Three.js owns one renderer and loop (`src/three/engine/TrafficEngine.ts`). Keep frame-rate objects out of React state.
- `src/simulation/` and data types stay independent of React, DOM and Three.js. Keep saved version-one scenarios and session logs compatible.
- New runtime logic is strict, erasable TypeScript with no `any` or blanket suppressions. Unchanged procedural visuals stay JavaScript with typed boundaries.
- A mounted engine owns cancellation, workers, input and disposal. Release shared prototypes only at whole-engine teardown; StrictMode stays on. Editor SVG drawing stays native.
- `src/export/` defines versioned GLB/JSON exchange, independent of React. See [the migration record](docs/react-typescript-migration.md).

## Verification

Use the smallest checks that cover the change. Do not add tests for prose, formatting or cosmetic constants, or tests that repeat the implementation. Add a focused regression test for an uncovered behaviour fix. Read the test counts: zero tests or a skipped required test prove nothing.

| Change | Required checks |
| --- | --- |
| Docs, comments, formatting | Review content and paths; `git diff --check` |
| CSS, copy, cosmetic values | Inspect the view, keyboard/touch reach and console |
| Isolated logic | The affected test file |
| Vehicles, steering | `test/turning.test.mjs`, plus logic, crash or bicycle tests if affected |
| Art, models, layout, collision | `tools/rebuild_models.mjs`; `npm run test:geometry`; inspect the view. Roads also need `check_routes.mjs`. Rendering workload needs `test/performance.test.mjs` and a benchmark |
| Editor storage, server, Quest | `test/editor-store`, `editor-server`, `editor-quest` |
| Open world | `test/world.test.mjs`, `test/scenario-manager.test.mjs`; explore the area. Flows also need `test/routes.test.mjs` |
| One event | `check_events.mjs <id>` and play it; route changes also need `check_routes.mjs` and `test/routes.test.mjs` |
| Scenario format, sync | Affected tests and `test/scenario-import.test.mjs`; both editor backends. Imports use `parseScenario()` |
| Cross-cutting flow, replay, coordinates, shared timing, dependencies or uncertain impact | `npm run check`; a walking and a cycling event |

Geometry checks must exercise generated high and low surfaces, sweep joins with the intended body width, and inspect models from reverse views and lettering from its reading side. Editor and Quest tests use fixtures and a fake adb, so they do not prove a real Unity or Quest session.

## Before handing off

- Run the applicable checks and `git diff --check`. Load visible changes without console errors.
- Commit or push only when asked; never force-push.
- Say what changed, what was verified and what was not.

## Docs

[RATIONALE.md](RATIONALE.md) why · [DESIGN.md](DESIGN.md) interface · [docs/art-and-performance.md](docs/art-and-performance.md) models and measurement · [docs/geography.md](docs/geography.md) map sources · [docs/field-survey.md](docs/field-survey.md) photo modelling · [docs/reviews.md](docs/reviews.md) past reviews · [README.md](README.md) user guide. Each fact lives in one place; update it with the code.
