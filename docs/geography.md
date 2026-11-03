# Geography

How the scene is registered to the real map, what each area is built from, and what is not known. This is a traffic-practice scene with approximate dimensions, not a surveyed digital twin. Detailed reports up to 30 October 2026 are in git at `f4cd136`; evidence files stay in [geography/](geography/), [east-extension/](east-extension/) and [north-correction/](north-correction/).

## Frame

`world/geographic-frame.json` is the authority; `src/world/geography/coordinates.ts` converts both ways. Only `src/three/scene/coords.ts` and the model builder mirror X into three.js.

| Property | Value |
| --- | --- |
| Tie point | 35.27246 N, 136.2526297 E → local (32, 56.8) |
| Directions | +Z bears 32°, +X bears 122° |
| Scale | Metres; 111320 m per latitude degree |
| World and editor extent | X −1060–420, Z −155–870 |
| Sharp practice image | X −220–200, Z −155–165 at 6 px/m |
| Overview image | 2 px/m |

Registration is approximate: aerial and OSM features differ by several metres near the junction.

## Ownership

`world/geographic-frame.json` → `east.retained` is the hand-built core: Route 25 with its footways, the junction block, the event 07/08 car park, Castle Road, the castle hill and compound, Shiga University and its moat, the southern moat road and the castle approach. `tools/import_east_map.py` derives `east.coverage` (world minus core) and `east.pieces`; both are generated.

Everything in coverage comes from the frozen OSM plan through `tools/east_extension.py`. Generic mapped houses are split by region into `ART_EastHikoneWest` (x<−250), `ART_EastHikoneSouth` (z<20) and `ART_EastHikoneNorth` (z>480); `ART_EastHikoneBuildings` keeps the centre, reviewed photo work and street furniture. `building_region()` and `EAST_BUILDING_REGIONS` must agree. Older authors clip against the same polygon (`east_extension.Ownership`), and ground exports, water blockers and the editor use it too. A clipped box or cylinder stays as explicit clipped faces, because replaying the primitive would restore the overlap. `inEastExtension()` tests the same polygon for layout items. Model names keep `EastHikone` for compatibility.

Coverage rules:

| Element | Rule |
| --- | --- |
| Buildings | 1483 mapped footprints. A few have OSM heights or storeys; the rest use an estimate from type and area (`heightBasis`). Compact house outlines get a gable. Camera bounds stay per building. |
| Streets, footways | Mapped centre lines with class-width estimates: primary 8.2 m, secondary/tertiary 7 m, residential 4.4 m, service 3.6 m, footway 2 m. Never through a footprint. |
| Crossings | Marked crossings only; unmarked nodes get no zebra. |
| Road lines | One rule in [road-markings.ts](../src/world/generators/road-markings.ts), set by [road-markings.json](../world/road-markings.json). Line width and the 5 m dash and gap follow the [1974 MLIT standard](https://www.mlit.go.jp/road/sign/kijyun/pdf/19741226kukakusenn.pdf). Named corridors were sampled in Street View at one or two points, viewed only and dated in the file; other roads use width-class defaults. Edge lines and green margins run through driveways and car-park mouths and break only at public roads, as seen at the hotel forecourt and the car park off the inner-moat street. The loop from Kyobashi by the university, the inner moat and the north road to the east street was sampled at about 20 points (November 2022 and October 2024 panoramas), not surveyed. Stop bars, side-road gaps and diamond stations are generated estimates of common practice, not observations of each junction. Carriageway widths are unchanged: the south end of the east street is modelled at 4.4 m against a visibly wider road, so its centre line sits in narrower lanes than the real one. |
| Water | Water areas plus the complete moat relation 3548105, fetched separately because a bbox can omit members. Road and footway decks are subtracted from water and blockers. Incomplete relations are rejected, not closed by guesswork. |
| Green | Mapped parks, woods, pitches and grass. Woods get deterministic illustrative groves; mapped trees stay at their node. |
| Signals | Not modelled outside the practice town. |

Roads and footways stay at 0.01 m, plots at 0.15 m and water at −1.35 m. The bank inherited at the south-west seam fades to town datum by X=200; that is continuity, not a survey.

## Sources

| Source | Use | Limits |
| --- | --- | --- |
| [OpenStreetMap](https://www.openstreetmap.org/copyright), © OpenStreetMap contributors, ODbL | Roads, footprints, water, walls. Element IDs, versions and hashes are in `world/east-hikone.json`; the subset is `world/east-hikone-source.geojson`. | Community data; some tags conflict, such as `uncontrolled` footways at signalised junction nodes. |
| [GSI seamless aerial](https://maps.gsi.go.jp/development/ichiran.html) | Topology and outline checks | [Capture metadata](https://maps.gsi.go.jp/xyz/seamlessphoto_spec/11/1799/809.geojson) says September–October 2011 here. Predates later changes. |
| GSI pale map and elevation API | Connections; relative raised-bank profile | Elevations are not copied into the local datum. |
| [GSI optimal vector tiles](https://github.com/gsi-cyberjapan/optimal_bvmap), processed under PDL 1.0 | School-side building envelopes, a service lane and castle landmark registration | Catalog 2026-07-01; survey dates and building heights are not established. See the [registration review](map-registration.md). |
| Google satellite and Street View | Visual cross-checks where reachable, noted per area | Nothing is shipped. A displayed copyright year is not a capture date. |

No provider tile is used as a scene texture. The attributed GSI aerial comparisons in this folder are the only redistributed external rasters; `world/town-streets.json` carries its own ODbL notice.

## Corrections by area

The [1 November pedestrian review](pedestrian-survey-20261101.md) registers the inner-moat street and western water edges together, replacing a road trace that drifted into the parking frontage. Source coordinates, transition estimates and photo limits are recorded separately.

The [31 October city-map review](map-registration.md) corrects Nishi school footprints, roadside houses, five tennis courts, the school service lane and four castle landmark placements using independent OSM/GSI data. The global frame and photo-registered frontage anchors stay fixed. The museum and unreviewed shores remain approximate.

**Practice town.** Eastern alley moved about 18–20 m west to x≈114–117 and continued. Castle Road's southward drift cut from 0.065 to 0.009 m/m. The second southern cross street and its connections added near z≈−138, with zebras at z≈−69 and −145.5. New minor streets use an estimated 4.4 m width. Junction topology, bridge and five signal installations kept.

**Events 02/05.** Road changes must keep each ordinary-traffic route's smoothed length and crossing pose; `test/castle-approach.test.mjs` pins this, so route ends are trimmed rather than clocks changed. `routeKnots` simplifies the whole route, so the next knot past (30.151, −0.071) must stay on the bridge lane line.

**Kyobashi north approach.** Follows OSM way 1499485466 with the mapped first corner drawn as a 7.5 m arc, so the inner shoulder closes to the wall corner instead of folding. See [field survey](field-survey.md).

**North district (X 0–200, Z 400–600).** Sawaguchi wings, stable, footway chain, mapped Omotemon bridge and museum entry. A short collar at X −8–70, Z 348–400 joins the castle approach; the handoff to the legacy castle graph stays authored.

**Whole map.** The castle hill ended about 40 m too far north; the inner moat now wraps it. Genkyū-en, Rakuraku-en, the north-east moat, the port channel and canals are present. The invented road west of the campus and generic south-town houses were replaced by mapped ones.

**Retained shore.** The south promenade in the core is still schematic. Five benches keep OSM coordinates in `point` and an adjusted `placement` about 8–12 m away, following the curved retained bank after the [pedestrian pass](south-promenade.md). That strip is not geographically verified; exact alignment still needs a coordinated road and scenario migration.

## Regeneration

Normal builds use the frozen sources. A new OSM snapshot needs Shapely ≥2.1, offline only:

```bash
python3 tools/import_east_map.py --osm bbox.osm --water relation-3548105.osm --source-url '<bbox URL>'
```

Then rebuild the affected models in this order: `build_impressionist.py`, `build_native_models.py`, `node tools/build_collision.mjs`. The first writes ground used by later authors and refreshes the editor images. Blender exits 0 on a Python error, so check the log for `Traceback` before continuing.

## Not established

Current lane, footway and kerb widths; ramp gradients; signal cycles, pole and head inventories; traffic-order signs; facade setbacks; most building heights; castle elevations. Route 25's western curve and the western parking access differ from source outlines and need a coordinated corridor revision. Parking exits are authored teaching locations. No Unity, Quest or real-phone run is implied by any geographic work.
