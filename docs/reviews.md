# Reviews

Past review outcomes that still explain the code. Current behaviour and rules are in [RATIONALE.md](../RATIONALE.md). Full reports are in git at `f4cd136`.

## Built-in events, 2026-10-16

Route geometry findings stand. The report's timing and guaranteed-contact results described the former scripted model, which the 2026-10-23 driver model replaced.

- Route points moved in `events/` wherever cars ran over pavement. Spawns, goals, triggers and parked vehicles were not changed. The driveway crossing in 07/08 is deliberate.
- Westbound tails in 06 and 09 had two waypoints 27 cm apart, which rounded into a sharp pair of turns and hit the 38° steering limit (06 now 21.4°, 09 now 12.5°). `smoothRoute()` simplifies sub-30 cm noise before rounding and keeps endpoints and explicit reversals.
- A car tracked for under a second could be reported as stationary; speed now uses the available record.

## UX, DX and AX, 2026-10-26

| Problem | Decision |
| --- | --- |
| Importing a valid built-in failed because `walls.json` reached road-surface validation | Shared lazy `createScenarioReader()`; cache successes, clear failures |
| Malformed scenarios reached array operations and gave generic server errors | Parse through `parseScenario()` before replacing state; Japanese field paths and `INVALID_SCENARIO` with status 400 |
| Blocking alerts, and an old file could replace a newer selection | Persistent status beside the control, launch disabled while validating, request generation guard |
| Deployment skipped the reference check | `npm run check` in the project and the Pages workflow |
| Editor and Quest tests skipped without a sibling Unity project | Temporary fixture per test process, failing if unavailable; fake adb kept |

Semantic errors stay editable in the editor, while starting a practice still requires geographic validity. Results are in [review-20261026-browser.json](review-20261026-browser.json).
