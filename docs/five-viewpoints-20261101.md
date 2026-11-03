# Five-view street review, 1 November 2026

The [2 November gate review](campus-gate-20261102/README.md) supersedes this report's physical gate frontage and postbox placement.

The owner identified defects at five saved cameras after the earlier pedestrian pass. This review corrects street topology and surface ownership as well as object placement. The [first pass](pedestrian-survey-20261101.md) is a historical record; its gate, fork, fence and bridge assessment is superseded here.

## Evidence

Original photographs from 29 and 31 October and 1 November 2026 were inspected locally, including the full-resolution November panorama IMG_1081. Still frames from IMG_1073 and IMG_1080 show the tennis edge and both sides of the planted junction. Private originals and inspection derivatives remain outside the project documentation and runtime assets. No photograph supplies a texture.

The official [OpenStreetMap API](https://api.openstreetmap.org/api/0.6/map?bbox=136.2450,35.2738,136.2528,35.2780) returned XML on 1 November 2026. The response hash, way versions, timestamps, node IDs and raw WGS84 coordinates are recorded in `world/walked-streets.json`. Data is © OpenStreetMap contributors under ODbL-1.0. These mapped outlines support topology and registration, not surveyed precision. The XML itself was downloaded and read locally.

## Corrections

| Saved camera | Defect | Correction and evidence |
| --- | --- | --- |
| X −127.6, Z 187.91 | Wide stone beam and an unrelated-looking approach across the moat | OSM ways 1376711308 and 122757598 locate the approach and wooden Otemon bridge. A narrow timber deck, open timber rails and support piles replace the stone parapets. The wearing surface shares its height with Ground; the landward approach rises gently from the street. Bridge width and rail dimensions remain estimates. IMG_1070 and video IMG_1069 show this bridge and the adjoining banks. IMG_1066–1067 show the separate Omotemon bridge and are not used to place this crossing. |
| X −384.92, Z 217.32 | Raised decorative lane, abrupt street join and a road ending at the moat | The residential lanes move into the same asphalt/Ground author as the public street. OSM way 59265929 closes the route behind the houses. Kerbs and paint stop at access mouths. Round the back-lane corner locally so its full width continues along the straight. Move the two garden pines back into their plot. Remove the hidden zero-height grass under paved corridors so distant detail cannot expose it through the road. Lane widths remain estimates. IMG_1024–1026 show the street relationship. |
| X −520.99, Z 270.92 | The old cherry was in the grass lot instead of separating three public arms | Restore the western arm of OSM way 59265929, alongside shortcut 1376675005 and the through street. Place the independent triangular bed between them, clear of the lane widths. Remove the duplicate generic cherry and speculative rear fence, move the utility pole to the verge, shorten the adjacent garden footing and cypress row, and stop drains at branch mouths. The narrow local arms use an estimated 3.6 m carriageway. Its visible mound and Ground share the same profile, and the trunk rests on that profile. IMG_0997–1004, IMG_1075–1081 and video IMG_1080 establish the junction. |
| X −457.75, Z 222.78 | Tennis fence and an extra stone run crossed the carriageway | Derive the fence and gate pillars from the registered street edge with a shared setback. Split the fence at the gate, remove the duplicate low stone runs and align the cypress screen. Rope boundaries and the last pole clear the restored back lane. The lot entrance is a worn gravel track at plot height. IMG_1005–1022, IMG_1074 and video IMG_1073 supply the frontage evidence. |
| X −593.19, Z 180.06 | Missing turn inside the university gate and straight enclosure | OSM ways 122757608 and 1377415375 place the street junction and internal drive. Add the northward turn with an estimated radius, keeping it clear of the hall and temporary office. Curve the gate enclosure and place rigid noticeboards along it. IMG_0852–0854, IMG_0971–0977 and IMG_1084–1085 support the visible arrangement. |

Source lines remain separate from the estimated widths, curve radii, passing point, fence offsets and bed placement. Photo GPS describes the camera; it does not place an object. EXIF altitude supplies no terrain height. The gate, hall, school and castle registrations keep their existing metre frame. Castle masonry retains the shared flat Kyobashi-style texture.

## Generation

`src/world/generators/walked-street-layout.ts` converts the dated source lines and supplies shared topology, turn construction and fence placements. `university-layout.js` owns the connected campus and school layout. `university.py` owns the street partition, Ground and editor surfaces; `moat_street.py` no longer paints separate raised lanes. `road_network.py` owns the bridge deck surface, ramp, timber structure and access openings. Road paint uses the same access lines.

A curved frontage exposed a precision defect in clipped pavement. Float32 rounding moved an interior edge node across a sub-millimetre ribbon, making it self-cross. When triangulation stalls on such a ribbon, it removes only shallow reflex nodes within two Float32 ULPs. Valid polygon boundaries, actual corners and exactly collinear shared nodes retain their existing ownership. The regression exercises the captured failure and preserves an ordinary noded edge.

Rebuild high/low GLBs and native programs, pack, regenerate collision and editor maps, and then verify the generated results. The affected model set is:

```sh
node tools/rebuild_models.mjs ART_KyobashiRoads ART_KyobashiLand ART_KyobashiBanks ART_KyobashiWater ART_KyobashiBridge ART_PavingDetails ART_CastleApproach HK_Terrain_Hikone ART_HikoneCompound ART_WestMoat ART_ShigaCampus ART_InnerMoatStreet ART_EastHikoneSurface ART_EastHikoneBuildings ART_HillWood
node tools/build_road_markings.mjs
```

`test/walked-streets.test.mjs` checks all five areas in both generated detail levels, including full carriageway clearance, the missing fork arm, supported mound and timber deck. All ten checks fail on the starting assets. [Views and verification records](five-viewpoints-20261101/README.md) document the completed checks and remaining limits.
