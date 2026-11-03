# Concave gate returns, traffic spacing and replay transitions

The gate returns now curve inward toward the entrance forecourt. The earlier version bowed into that space. Its former midpoint remains clear for a 60 cm walking body. The postbox follows the corrected south return while its street-facing orientation stays independent of the curve. Both native detail levels, Ground, body collision and editor images are rebuilt together.

The owner's correction and original-resolution IMG_1084/1085 establish the direction. The source restrictions and visually estimated dimensions remain in [campus-gate.json](../../world/campus-gate.json). No source photograph or video frame is copied into this report or used as a texture. This correction supersedes the initial curvature shown in [the earlier gate review](../campus-gate-20261102/README.md).

## Vehicle spacing

The starting controller reproduces a right-turn/oncoming overlap in `builtin-02` at 37.57 s and a curved-queue overlap in `builtin-05` at 97.07 s. It also lets an unbraked vehicle pass through a stationary vehicle. These cases fail in the [starting regression run](spacing-before.log).

[Traffic.ts](../../src/simulation/traffic/Traffic.ts) now projects a lead vehicle onto the upcoming rounded lane, instead of treating its current heading as a straight lane. Route crossings are cached when preparing a route. Turning drivers yield to visible oncoming straight traffic, with a stop envelope that includes the turning body's front corner. A yield decision persists while braking and releases when the other vehicle clears or waits safely upstream. The ordinary-driver regression requires both vehicles to leave the junction, so preventing overlap by deadlocking them does not pass.

If bounded braking still leads to vehicle contact, swept oriented-body checks stop travel at contact. This applies to the lateral movement of a departing `noStop` vehicle too. Participant reaction/braking/contact logic, independent departure clocks and persistent driver tendencies remain supported. Physical vehicle contact can stop a car abruptly; it does not move either body to a different location or force a participant collision.

Occluded crossing traffic does not trigger anticipatory yielding. Existing visibility, reaction and participant-contact regressions remain in the full check.

## Replay entry

Success shows a 0.25 s goal confirmation, holding the terminal recorded pose before replay. Contact shows 0.65 s of the live fall. The remaining post-contact simulation steps are recorded before entering replay, retaining the complete 1.6 s tail and the existing eight-second approach window. Returning to the menu during goal confirmation cancels the pending replay. Replay end, views, results and menu actions retain their controls.

These delays are simulation/UI settings. Actual first-frame time also includes replay preparation and browser rendering.

## Reproduction

The harnesses use an existing Playwright installation and add no dependency. Start `npm run dev` for the browser, controller and view checks.

```sh
node --test test/traffic-spacing.test.mjs
node docs/simulation-fixes-20261102/spacing-audit.mjs
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node docs/simulation-fixes-20261102/browser-check.mjs
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node docs/simulation-fixes-20261102/controller-check.mjs
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node docs/simulation-fixes-20261102/views-check.mjs
BEFORE_DIST=/path/to/before/dist AFTER_DIST=/path/to/after/dist PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node docs/simulation-fixes-20261102/rendering-check.mjs
```

The spacing audit runs five seeds with normal adaptive drivers and a separate ordinary-driver reference for each of the ten events, for 120 s per run. It tests body rectangles independently of the controller, with a 1 cm penetration tolerance. The browser audit runs each actual scenario for 120 s with the participant outside the traffic area, then separately exercises contact and goal replay, terminal recordings, views, results and cancellation. It does not claim that debug-triggered contact is a natural participant traversal.

## Verification

| Check | Result | Record |
| --- | --- | --- |
| Complete project check | 383 tests pass with no failures or skips; typecheck, generated reference check and production build pass | [Log](check.log) |
| Geometry | 123 tests pass; high and low gate lettering, both concave returns, vacated forecourt and postbox collision pass | [Geometry](geometry.log), [university detail](university.log), [starting curve failures](curve-before.log) |
| Vehicle regressions | Starting right-turn, curved queue and unavoidable contact assertions fail; final assertions pass and ordinary traffic clears the crossing | [Starting](spacing-before.log), [full check](check.log) |
| All-event audit | 100 runs at 120 s each, five seeds and two driver policies per event; zero samples with body penetration over 1 cm | [Results](spacing-audit.json), [harness](spacing-audit.mjs), [starting results](spacing-audit-before.json) |
| Actual browser events | All ten scenarios complete 120 s of car-body checks; contact and goal replay, complete recording tails, replay end/results/menu and cancellation pass | [Results](browser.json), [harness](browser-check.mjs) |
| Keyboard and controllers | 40 walking/cycling corridor traversals, keyboard look/movement, two practice flows and a narrow editor viewport pass | [Results](controller.json), [harness](controller-check.mjs) |
| Vehicle routes | 46 checked, no failures | [Log](routes.log) |
| Generation | Ordered high/low authors, native recipes, packing, collision and generated data checks, followed by editor images | [Rebuild](rebuild.log), [atlas](atlas.log) |
| Views | Owner view, pedestrian/reverse views, close postbox and distant detail have no console or HTTP errors | [Results](views-after.json), [corrected owner view](owner-after.jpg) |

The build retains Vite's existing warning about chunks larger than 500 kB. Phone-width layout is emulated; no physical phone or headset was tested. Source originals remain private. No commit or push was made.

## Rendering and replay entry measurements

Five alternating before/after production reload pairs use one origin, URL, page and fixed world cameras, at 1440 × 1000 with high quality and `benchmark=1`. Each of the thirty rendering samples follows two seconds of warmup and contains thirty distinct rendered frames. There are no browser or HTTP errors. Across five reloads, every range of draw/triangle counters equals its median.

| View | Draws before → after | Submitted triangles before → after |
| --- | --- | --- |
| owner | 13 → 13 | 438,990 → 438,990 |
| gateWalking | 13 → 13 | 433,914 → 433,914 |
| postbox | 13 → 13 | 422,858 → 422,858 |

Replay-entry timing uses the same reload pairs, with a fixed seed. Contact is triggered after three seconds of recording. Success uses direct placement in the goal to isolate its confirmation delay. The endpoint is replay state followed by two animation callbacks, allowing a rendered replay frame. This is not a hardware display-latency measurement or a full natural crossing; longer clips can need more camera preparation.

| Transition | Before median and range | After median and range |
| --- | --- | --- |
| impact | 1720.4 ms (1672.6–1726.7) | 761.1 ms (736.5–773.3) |
| success | 80.4 ms (78.1–86.3) | 330.5 ms (315.0–349.2) |

Contact replay enters sooner because the visible fall is shorter while the full tail remains recorded. Goal entry deliberately adds a brief confirmation before review. Draw work stays unchanged; this comparison makes no FPS, phone or high-refresh claim. Task-owned builds and checks stopped before measurement. Other browser workloads remained active. The CPU speed limit was 100%; startup load averages were 2.86, 7.86 and 8.31 on twelve logical CPUs.

[Raw frames, transition samples and method](rendering.json), [timing summary](transition-timings.json), [harness](rendering-check.mjs), [build fingerprints](build-fingerprints.json), [source comparisons](source-integrity.json). The frozen baseline matches the task's starting runtime manifest.
