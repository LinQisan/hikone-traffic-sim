# Field survey and photo modelling

Local refinements from the owner's 86 photographs of 29 October 2026, with what each one is based on. Geography rules are in [geography.md](geography.md). Detailed reports are in git at `f4cd136`; comparison images and verification records stay in [field-survey/](field-survey/), [higashi-frontage/](higashi-frontage/), [nishi-frontage/](nishi-frontage/), [school-moat-0848/](school-moat-0848/) and [university-gate/](university-gate/).

## Photographs

Originals are in `field-photos/2026-10-29/<area>/`, sorted by GPS and content, with `field-photos/INDEX.md` giving position, heading and scene. The folder is git-ignored and must never be uploaded or copied into docs: the files carry GPS. No photograph is used as a scene texture. `IMG_0911` and `IMG_0932` never existed.

Headings are evidence, not calibrated poses; EXIF altitude is never used as terrain height. Fixes are usually 3–7 m. Weak ones: `IMG_0929` (53.7 m), `IMG_0934` (21.4 m), and `IMG_0930/0931/0933`, which repeat one held fix.

Reference `IMG_xxxx` by name. `swift tools/read_photo_metadata.swift <folder> <out>` re-reads EXIF.

## Authoring

Keep sources separate from estimates. Reviewed data lives in `world/`; authors read it, so nothing is patched in `data/` or the renderer.

| Source | Author | Area |
| --- | --- | --- |
| `world/field-observations.json` | `tools/field_photos.py` | Route-wide facades, boards, benches, lamps, school road |
| `world/higashi-frontage.json`, `world/higashi-island.json` | `tools/higashi_school.py` | Higashi school and island |
| `world/nishi-frontage.json` | `tools/nishi_school.py` | Nishi school frontage |
| `world/school-moat.json` | `tools/school_moat.py` | University-facing rampart |
| `src/world/generators/university-layout.js` | `tools/university_photos.py`, `tools/university_frontage.py` | Campus and gate |
| `world/east-street.json` | `tools/east_street.py` | East street on foot |

Facilities keep the OSM position in `point` and any move in `placement`, with `placementBasis`. All untagged dimensions are visual estimates.

## Areas

**Shiga University (0847–0854, 0934).** Gate moved 15 m east to the roadside per OSM. Granite posts, 滋賀大学 plaque with mesh lettering, folded gate, gatekeeper's room, red post box, frontage balustrade and hedge, auditorium footprint, lantern and dormers, temporary office, moat-side bollards and benches. Notice boards are original illustrations, with the cigarette panel following the owner's painted reference; unreadable text is not transcribed. Scene graphics do not verify current rules.

**University-facing rampart (0848–0849).** Inclined masonry and earthen bank over about 419 m (X −557.5 to −220), backed by twelve OSM retaining walls of 5.5 m and GSI elevation samples. Pole, transformer, red 城町2丁目自治会 cabinet and mirrors are photo-relative estimates.

**Nishi school (0855–0861).** Closed brown portal at (−587, 263.2) with mesh lettering, accordion grille, irregular stone walls, tree screen, lamp, pole and bicycle crossing. One wall tip that crossed the doorway is trimmed, with the source outline kept as `sourceOutline`. The timed-restriction plate is a static photo-date graphic, not a rule.

**Higashi frontage (0864–0866).** Otemae parking in place of grass, closed kiosk, road on the school's west edge, open gate with wing walls, four- and three-storey slabs, entrance wing, covered links and Ginkgo hall on OSM outlines. Kerbs drop across the parking access and gate. The official campus plan was used for labels only; the school's 360 page returned HTTP 403.

**Higashi island (image, 0883–0888, 0895–0898).** The mapped retaining wall jogs north at x 102–104 and runs along z≈95–96 to the corner at x≈190; `north_shore` and `northShore` follow it. Fourteen OSM outlines replace two boxes: barrel-roofed north gym, two ribbed arenas, third block, club house, sheds and links. Mapped pitch, estimated tennis court and yards (about 2 m), `ART_IslandWood` in the mapped wood, and a hedge on a dark stone base. Street View supplied facades (north, inner and east roads November 2022, Route 25 October 2024). The GSI aerial is older: it lacks the second arena and shows a pool absent from OSM and the owner's image, so it was not used for either. Google's aerial layer rendered black and was not read.

The East author owns x≥120, z≥100 and clips others there. Island buildings reaching it are authored whole by that author (`east_owned`, `east_replaced`); `island_cut` swaps its green for the courts in mesh and Ground.

**Saigo and Kyobashiguchi (0867–0879).** Road follows OSM, leaving a grass verge before the longhouse. Bank corners at x 25.5/38.5 are closed: materials are double-sided, so an open wedge showed the bank's inside. Eight estimated gangi treads sit behind the 京橋口門と雁木 board. The Saigo board stands on the verge, and 彦根市指定文化財 is a small stone post. The east lamp carries the 30 km/h and no-parking sign for southbound traffic. The west lamp's sign is seen only from behind and is not modelled, and the timed restriction in 0879 has no confirmed pole.

**East promenade (0880–0894).** Directories, backed benches and tower silhouette; mapped chain posts east of the retained core. Bench placement is covered in [geography.md](geography.md).

**East street on foot (0895–0910).** Rebuilt from the pedestrian's eye height. The moat edge lies 3.5–5 m west of the mapped centreline and photo GPS puts the footway 4–6 m east of it, so the street section is offset: 5 m road, 2 m footway, edge lines, stone kerb and a grass verge with moat-side trees. Lots, the cafe garden and hotel forecourt replace the plain yards in mesh and Ground. Facades follow the photos: cafe gable to the parking with brick plinth, half-round canopy, street dormer and leaded arched window; shop bays, lattices, striped doors, banners and red storehouse tower; hotel brick podium, tiled skirt, porch piers, board screens and lantern. The church is one authored nave with deep bracketed eaves, grey panelled centre, rose window and white cross, flat canopy on slim posts, and the spire just behind the front gable. Poles, wires, rail, cones and parking sign are added. Foliage is built from leaves, not blobs: `ART_StreetWillow` hangs as falling leaf chains, `ART_GardenPine` has needle fans over a dark core, and `ART_StreetHedge` is an instanced 3 m run of small leaves. Signs carry the real names read from the photographs (サンチョ, SANCHO, Pomme d'Amour, カトリック教会, 彦根キャッスル リゾート&スパ, 近江ダイニング 橘, 消火栓, 栗, どら焼き, 彦根城を世界遺産に), as triangulated mesh lettering; the SANCHO and OC marks are simplified redrawings. Pigments stay warm with violet-brown darks, so the painted shaders keep the Renoir palette on realistic forms.

The footway narrows to about 1 m beside mapped buildings near z≈110, z≈147 and z≈406, where a walker steps to the road edge. All sizes are estimates. The stained-glass pattern is a simplification of the panel in 0897.

**Real-world audit, 30 October.** Layout items were checked against carriageways, water and Ground, and walked against the photographs. Fixed: a utility pole and three mapped trees on carriageways, the mapped chain line in the moat west of X=200 (the retained shore has its own fence), and East source groves sunk into the mapped rampart, whose long ground triangles are now refined. The South promenade's retained shore and the Sawaguchi facades remain simplified.

**North (0912–0928).** Iroha-matsu and Sawaguchi boards, turret wings fitted to clipped footprints, a visual exterior stair with no upper-floor route, guideposts and vending furniture.

## Verification habits

Checks that repeatedly caught real faults: generated high and low surfaces rather than metadata; real controller traversals in walking and cycling; body clearance past new furniture; the same frozen-baseline A/B for rendering. Added detail costs geometry: the school island and east street raised offline fixtures to about 82 MiB. Their runtime cost is unmeasured.

Known gaps: the island wood reads as clusters with warm highlights from the shared leaf shader, and the bank crest fades toward X=200, lower than the mapped 5.5 m. No real phone or headset has been tested.
