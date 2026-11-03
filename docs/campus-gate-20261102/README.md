# University gate returns and round postbox

The owner corrected the initial convex bow shown in this report. The [later correction](../simulation-fixes-20261102/README.md) supersedes its curvature and placement images with concave returns facing the entrance forecourt.

The tall gate pillars now sit behind the street frontage. Both walls turn through a quarter-circle return to meet the outer sides of the pillars; the plaque stays visible. Smaller terminal posts mark the transition to the straight frontage. The orange round postbox sits outside the south return, beside its street end post. The opening has continuous, flush paving. Notice cases, folded gate leaves and tactile strips follow the physical entrance frame.

The postbox has a flared foot on a stone plinth, cast body collars, a shallow domed cap and top knob, a round badge with white `郵 〒 便` and `POST` lettering, an arched rain hood over its dark slot, a collection-door frame with hinges and keyhole, and wrapped side labels. Both high and low recipes retain these features. Pigment chips suggest wear; all paint is non-emissive. Paper labels show their layout without asserting current collection times.

## Evidence and limits

[Source and placement data](../../world/campus-gate.json) separates the mapped driveway junction from estimated physical placements. The mapped gate point, campus road centreline and camera bounds keep their earlier registration. The procedural authors are [university.py](../../tools/university.py), [university_photos.py](../../tools/university_photos.py) and [campus_postbox.py](../../tools/campus_postbox.py).

The owner's original-resolution IMG_0852/0853 (29 October 2026), IMG_0967/0968 and IMG_0971 (31 October), and IMG_1084/1085 (1 November) show the inset pillars, returns and postbox. The close postbox reference is IMG_0967. Private originals and inspection derivatives stay outside published assets and documentation; no photograph is used as a texture.

Two November 2022 Google Street View panoramas were loaded and viewed on 2 November 2026: [northern approach](https://www.google.com/maps/@?api=1&map_action=pano&pano=coHTEsedAMURADClgrac_A&heading=313) and [gate frontage](https://www.google.com/maps/@?api=1&map_action=pano&pano=oSBsIlmcNwwIajIeCcCoSA&heading=280). They confirm the entrance topology and postbox corner. Use follows Google's terms; no imagery was downloaded into the project. The older imagery does not establish the current temporary office or notices.

The 3 m pillar inset and return radius, 8.6 m pillar centre spacing, postbox dimensions and paint wear are visual estimates, not measured survey values. The inset is relative to the retained mapped junction. The photographs establish their relative arrangement more confidently than absolute dimensions.

## Reproduce the inspection

Run `npm run dev`, then point `PLAYWRIGHT_MODULE` at an installed Playwright entry. These harnesses add no project dependency.

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node docs/campus-gate-20261102/views-check.mjs
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node docs/campus-gate-20261102/browser-check.mjs
BEFORE_DIST=/path/to/before/dist AFTER_DIST=/path/to/after/dist PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node docs/campus-gate-20261102/rendering-check.mjs
```

The view harness includes the owner's exact camera, pedestrian views, the postbox at close range and from below its rain hood, and views from inside and above the gate. It also forces distant detail. The browser harness traverses the two apron sides and surrounding routes in walking and cycling modes, then checks practice replay and a narrow editor viewport. Simulator screenshots contain no source-photo pixels.

## Verification

| Check | Result | Record |
| --- | --- | --- |
| Ordered model generation | High and low GLBs, native recipes, packed runtime, collision and generated data pass | [Rebuild](rebuild.log), [editor atlas](atlas.log) |
| Complete project check | 378 tests pass, zero failures or skips; types, generated references and production build pass | [Log](check.log) |
| Generated geometry | 123 tests pass, zero failures or skips | [Log](geometry.log) |
| University detail | 13 checks pass, including both returns, visible lettering, the postbox slot and door, and a 60 cm body corridor | [Log](university-photos.log) |
| Starting assets | All five new assertions fail on the starting assets; updated placement assertions also expose the old pillar and box locations | [Starting run](regression-before.log) |
| Vehicle routes | 46 checked, zero failures | [Log](routes.log) |
| Controller traversal | Ten corridors in both directions and both modes: 40 completed traversals | [Results](traversals.json), [harness](browser-check.mjs) |
| Practice and editor | Walking and cycling practice, keyboard look/movement, replay end/results/menu, and a 390 px editor viewport pass; zero browser errors | [Results](browser.json) |
| Saved views | Owner camera, seven close/reverse/overhead cameras and forced distant detail; zero console or HTTP errors | [Results](views-after.json), [harness](views-check.mjs) |

Vite retains its existing warning about chunks larger than 500 kB. No physical phone or headset was tested. The simulator's map frame, engine, event files, dependencies and shared wall-texture source are compared with the task's starting hashes in [source-integrity.json](source-integrity.json).

Simulator views: [owner camera before](owner-before.jpg), [after](owner-after.jpg), [postbox](postbox-after.jpg), [rain hood from below](postboxUnderHood-after.jpg), [inside looking out](inside-after.jpg), [overhead](overhead-after.jpg), and [distant-detail entrance](front-after-low.jpg).

## Rendering workload

Five alternating production reload pairs at one origin and URL cover three fixed cameras, with high quality and `benchmark=1`. Each sample follows two seconds of warmup and contains thirty distinct rendered frames. The thirty view samples complete with zero browser or HTTP errors. The table gives per-reload medians. For every value, the range across all five reloads equals the median.

| Camera | Draw calls before → after | Submitted triangles before → after |
| --- | --- | --- |
| owner | 13 → 13 | 437,642 → 438,990 |
| gateWalking | 13 → 13 | 432,566 → 433,914 |
| postbox | 13 → 13 | 421,510 → 422,858 |

The added detail submits 1,348 more triangles at these cameras while draw calls remain unchanged. This is a geometry-work comparison, not a speed or frame-time result. Task-owned builds and checks had stopped, but other browser workloads remained active and load averages still reflected the completed test run. No mobile or high-refresh performance claim follows.

[Raw counters and ranges](rendering.json), [comparison harness](rendering-check.mjs), [production build hashes](build-fingerprints.json), [machine context](measurement-context.json). Matched simulator captures are [owner before](ab-owner-before.jpg) and [after](ab-owner-after.jpg), [entrance before](ab-gateWalking-before.jpg) and [after](ab-gateWalking-after.jpg), and [postbox area before](ab-postbox-before.jpg) and [after](ab-postbox-after.jpg).
