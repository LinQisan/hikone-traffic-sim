# University and Nishi school street on foot

The [1 November five-view correction](five-viewpoints-20261101.md) supersedes this review's fork placement and gate/street topology assessments. The [2 November gate review](campus-gate-20261102/README.md) further corrects the recessed pillars, quarter-circle returns and round postbox.

Reviewed on 31 October 2026. Photo placements cover approximately X −625 to −506, Z 175 to 264 in the existing metre frame. The shared stone author also updates existing moat walls beyond this rectangle. Roads, entrances and mapped building/wall footprints retain their registration.

## Evidence

The owner's 33 HEIC originals in `field-photos/2026-10-31/02-shiga-university/` and `03-nishi-school-road/` were inspected locally. Capture dates and GPS were checked against the originals with `tools/read_photo_metadata.swift`. All images are 4032 × 3024 pixels. Native-resolution detail crops resolve lettering, railings, stonework and the gallery. This review's GPS extraction and image derivatives remain in local inspection storage. No original photo or image derivative was added to the project.

GPS locates the camera, not the subject. The reported horizontal errors are 4.6–8.7 m. Placements use the existing geographic frame and relative relationships between overlapping photographs. No new survey accuracy is claimed.

Google Street View loaded in the browser. All three checked panoramas show **November 2022** imagery:

| Panorama | Confirmed relationship | Limit |
| --- | --- | --- |
| [University frontage](https://www.google.com/maps/@?api=1&map_action=pano&pano=coHTEsedAMURADClgrac_A&heading=313) | Gate, auditorium, low pierced wall, separate glazed notice cases | Predates today's temporary office and construction notices |
| [Nishi gate and crossing](https://www.google.com/maps/@?api=1&map_action=pano&pano=8WoHMsMgJcvNfwFXje9tbw&heading=52) | Plain brown portal, folding grille, zebra with an adjacent blue bicycle band, planted street edge | Today's banners and vegetation take precedence |
| [Eastern fork](https://www.google.com/maps/@?api=1&map_action=pano&pano=RLtDexg3bdeS7pa8p3q-ZQ&heading=336) | Public branches, cypress boundary, low stone edging and the island between the branches | The 2022 island vegetation differs from the nearly bare tree in today's photographs |

The Nishi panorama was also inspected at headings [150](https://www.google.com/maps/@?api=1&map_action=pano&pano=8WoHMsMgJcvNfwFXje9tbw&heading=150) and [220](https://www.google.com/maps/@?api=1&map_action=pano&pano=8WoHMsMgJcvNfwFXje9tbw&heading=220) for the owner's later IMG_0994 correction. It confirms the earth foot, narrow stone stair beside the tall return, rubble stonework and large spreading tree. The supplied camera X −543.88, Z 252.45, yaw 222°, pitch −28°, eye 8.9 m is retained as a repeatable elevated comparison; the photo comparison also uses a 1.7 m eye.

Google imagery was viewed as a reference under Google's terms. No imagery was downloaded into the project or used as a texture. Existing OSM outlines and attribution remain as documented in [geography.md](geography.md). The owner supplied the photographs; they are private inspection references. Notice illustrations and sign pictograms are newly authored geometry.

## Corrections

| Area | Photographic basis | Result |
| --- | --- | --- |
| University notice row | 0972–0975 | Separate construction table, original project diagram, two glazed cases, verified headings and no-smoking notice. Removed the unrelated hall leaflet and campus-map content from the main case. The second case carries a simplified newspaper layout and faded silhouette remnants. |
| Temporary office | 0976, 0977, 0984 | Gallery and external stair face the hall. The street end remains blank. The opposite wall has condensers and pipes. Floor and canopy include undersides and edge closures. Added the observed blue drinks machine. |
| Hall-side court and wall | 0971, 0977 | Gravel replaces lawn through the same surface partition used by Ground. Pale peeling metal replaces the dark pickets. Wall staining stays below the readable signs. |
| Nishi entrance | 0988–0990 | Muted brown portal, one readable vertical banner, retained closed folding grille and gravel yard. Removed duplicate placeholder banners. |
| Crossing signs | 0985, 0986, 0993, 0995 | Five-sided blue plates include the walking figure and bicycle. Each has a rear plate, edge and mounting bracket. Added the counterpart at the stone corner. |
| Stone-corner notice | 0992 | Short roofed timber sign reads 路上喫煙 / 禁止地区です. |
| Fork island | 0997, 1002, 1003 | Rounded stone kerb, sloping earth mound and short timber terraces replace the nested flat platforms. Every fine cherry branch now starts on an existing branch. |
| Nishi rampart corner | 0994 and the Nishi panorama, headings 150/220 | Replace the abrupt terminal grass ramp with a joined earth foot, stone stair and broad evergreen. Add the dark pole, yellow/black sleeve and readable low 消火栓 plate. Preserve mapped wall outlines and distinct wall heights. Shared rubble cells replace the deep rectangular grid; distant models retain the same stones, and the long moat wall no longer restarts stone courses at every terrain sample. |
| Nishi crossing | 0991, 0993, 0995 and the Nishi panorama, headings 20, 170, 240 | The zebra had been drawn at right angles to its true stripes, with a narrow blue strip on the wrong side. Stripes now lie along the road, west of a 2.35 m bordered blue band with two bicycle pictograms; the stop bar with its green trail, the two painted returns and the northbound stop bar are added. Pictograms moved from the Nishi author to the road-marking layer. Offsets are estimates in `crossing` in `world/school-road.json`. |
| Rampart stones and crest | 0985, 0995 | Weighted, widely jittered cells replace the honeycomb, and near stones have cut corners. A utility pole and upright stone stand on the crest, placed by estimate. |

The existing warm highlights, muted greens and violet-brown shadows retain the Renoir-inspired scene treatment. Signs use clean, non-emissive mesh graphics. No post-processing or photo textures were introduced.

## Estimates and omissions

Board sizes and spacing, office panel bays, condenser spacing, stair dimensions, tree proportions and the mound profile are visual estimates. The counterpart crossing sign is positioned relative to the stone corner, not at the photo's camera coordinates. Unreadable newspaper and notice copy is represented by column linework without invented wording. The project rendering is a simplified original diagram, not proof that the proposed building exists.

The photographs do not establish hidden interiors, exact wall thicknesses or every rear elevation. The corner stair's 1.2 m width, 20 treads, relative heights, soil profile, pole placement and tree dimensions are estimates stored separately from the unchanged OSM wall outlines in `world/school-moat.json`. The evergreen species is an approximation. Cable spans join existing modeled supports; their exact attachments are not surveyed. The older street views cannot confirm temporary facilities in 2026. Unseen surfaces use closed, supported construction consistent with the visible faces. No additional buildings, traffic signals or road connections were inferred.

## Verification

Rebuild the affected models with `node tools/rebuild_models.mjs ART_ShigaCampus ART_WestMoat ART_EastHikoneBuildings ART_InnerMoatStreet`. Run `npm run test:geometry`, `node tools/check_routes.mjs`, and `npm run check`. The office regression casts rays at the exported high and low gallery doors, canopy underside and landing underside. The cherry regression checks that every emitted branch joins the existing tree. Corner regressions check an open, supported stair, visible earth against Ground in both model versions, and unchanged stone positions between LODs.

Two height defects were corrected with the corner work. Ground now exports the clipped three-dimensional faces directly: taking the highest neighboring surface at a tread edge had turned the steps into steep ramps. Collision baking checks the local ground at each sample after its centroid broad phase, so a long wall beneath a stair does not become a phantom obstacle. Wall caps and stair tops retain one visible owner instead of coplanar lawn faces.

The dev/preview static-path guard also denies `field-photos/`, including encoded and absolute-file URLs. This keeps the private originals out of the authorized LAN preview; it does not copy or publish the photographs.

Browser checks and fixed-camera rendering measurements are recorded in `docs/campus-street/`. They cover forward and reverse views at 1.7 m, real walking and bicycle controllers, keyboard movement, participant replay, results and menu return. Desktop browser checks do not establish real-phone or headset performance.

The final run passed 338 regression tests and 113 geometry tests, with zero failures or skips, plus all 46 vehicle routes. Cautious reference traversal reached the goal in all ten events. Eleven controller traversals cover the campus, public turn, eastern fork, reverse routes and the new stair on foot. The supplied elevated view and both sides of the wall were inspected without browser errors.

Forty-four layout exports retain their registration, apart from the added notice/gravel metadata. The revised corner terrain lies within X −586 to −532, Z 226 to 246. Outside that box, 38,312 height samples agree within 0.1 mm; the largest difference is 0.0172 mm from exporting the actual clipped planes. Street and path groups are unchanged. All 33 private originals retain their initial hashes. The LAN app returns HTTP 200 and a request for a private original returns HTTP 403; `dist/` contains no field photographs.

## Rendering cost

Same-page Chrome A/B at 1280 × 800, using frozen pre-change model programs and Ground/collision. Three alternating pairs cover five views, for 30 complete samples. Each sample excludes a two-second warmup and measures eight seconds. Work counts are identical across all three repetitions on each side.

| View | Draw calls, before → after | Triangles, before → after |
| --- | --- | --- |
| University office | 37 → 37 | 887,062 → 932,898 |
| Nishi gate | 59 → 59 | 2,905,362 → 2,943,205 |
| Eastern fork | 192 → 192 | 4,828,358 → 4,873,032 |
| Supplied elevated wall view | 29 → 29 | 715,625 → 764,001 |
| Wall at pedestrian height | 138 → 138 | 1,563,670 → 1,616,612 |

The additional geometry costs 0.9–6.8% more triangles in these views without more draw calls. The fork and pedestrian wall view already exceed the approximate 120-call target in the frozen baseline. Median frame times remain 16.6–16.7 ms and are vsync-limited. The pedestrian wall view's after p95 ranges from 17.5 to 30.9 ms across three runs; these samples do not isolate a latency change. Background browser activity was not controlled, and no speedup is claimed. Raw samples and timing ranges are in `campus-street/benchmark.json` and `campus-street/benchmark-summary.json`.

An initial baseline readiness attempt timed out at 45 seconds before producing measurements. The complete retry waited for actual environment readiness; startup time is excluded from the comparison.

## Simulator views

These are rendered simulator screenshots, not source photographs: [supplied view before](campus-street/wall-before.jpg), [after](campus-street/wall-after.jpg), [pedestrian view](campus-street/wall-walking.jpg), [reverse](campus-street/wall-reverse.jpg), [fire-hydrant plate](campus-street/hydrant.jpg), [university notices](campus-street/noticeRow.jpg), [office](campus-street/office.jpg), [Nishi gate](campus-street/nishi.jpg).
