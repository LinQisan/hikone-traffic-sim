# Pedestrian review, 1 November 2026

The later [five-view correction](five-viewpoints-20261101.md) supersedes this pass's university turn, cherry fork, tennis boundary and Otemon crossing assessments.

Corrections along the owner's walk from Omotemon through the inner-moat street and Nishi school to Shiga University. The metre frame and event definitions stay fixed. Dimensions remain estimates.

## Evidence

The 18 HEIC originals and four standalone MOV captures are indexed locally in `field-photos/INDEX.md`, alongside 17 paired Live Photo MOV files. Still images and samples from the standalone videos were inspected locally. Originals, image derivatives and GPS catalogues remain inside local inspection storage. No photograph is used as a texture or copied into this report.

Photo GPS locates the camera. IMG_1071–1085 usually report 4–10 m horizontal error. IMG_1064/1066/1067/1068/1070 report 36–110 m and cannot establish precise camera placement. QuickTime video positions are rounded fixes, not surveyed routes. Relative landmarks and shared mapped outlines guide placement instead of snapping objects to these fixes. EXIF altitude does not set terrain height.

Google Street View was inspected in the browser on 1 November 2026. The inner-moat and Nishi panoramas display November 2022 imagery; the Omotemon panorama displays May 2015:

| Reference | Confirmed relationship | Limit |
| --- | --- | --- |
| [Inner-moat street](https://www.google.com/maps/@?api=1&map_action=pano&pano=7tycG57tNzur-V15pWvrBQ&heading=310) | Low wall and clipped hedge on the south side, narrow green margins, cherry trunks and square lamps immediately beside the moat | Vegetation and temporary objects use today's photographs |
| [Omotemon bridge](https://www.google.com/maps/@?api=1&map_action=pano&pano=Fb8p09GQ2j9Wf9peHF1Lmw&heading=290) | Low grass bank and open tree/museum view across the bridge | May 2015; does not establish current equipment or notices |
| [Nishi road and rampart](https://www.google.com/maps/@?api=1&map_action=pano&pano=bgXIisfV1B3gw4Izz-_v1Q&heading=270) | Earth foot and worn terraces below the stone wall, street meeting the crossing between the ramparts | Does not calibrate wall height or exact camera pose |

Google imagery was viewed under Google's terms. No Google image is included in the project. The owner supplied the photographs as private references; no public reuse licence is recorded.

The existing OSM way 121393441 in `world/field-observations.json` supplies the corrected street centreline. It agrees with the independent fixes of IMG_1071 and IMG_1072. The full [moat relation 3548105](https://www.openstreetmap.org/relation/3548105) was read through the OSM API on 1 November 2026. Western water edges use outer way 264072301; its version, timestamp, node IDs, WGS84 coordinates and response hash are recorded in `world/castle-moat.json`. OSM data is © OpenStreetMap contributors, ODbL. Neither the map nor the photographs establish surveyed accuracy.

## Corrections

| Area | Basis | Change |
| --- | --- | --- |
| Inner-moat road and banks | IMG_1071/1072, OSM road and water boundaries, inner-moat panorama | Replace the independent pixel trace with the shared registered road. Move both banks to the mapped water edge through this stretch. Keep a short transition to the existing western hill endpoint. Narrow the flush roadside margin before the moat. Keep the established elevation-shaping boundary separate from the measured water outline; detailed water vertices must not deform the inland hill or bridge landing. |
| Hedge, parking access and lamps | IMG_1071/1072, overlapping 31 October photos | Follow the corrected street with the low stone walls, clipped hedge, parking entrance, signs and poles. Keep lamps and cherry trunks on dry ground beside the water. Set the western street footway to 0.01 m, with separate kerb caps at 0.16 m. Remove the earlier frontage offset. Building source outlines remain unchanged. |
| Tennis-lot lane and fork | IMG_1074–1081 | Continue flush asphalt to the boundary and island kerb. Remove the invented continuous white and green edge bands through the unmarked narrow lane. Keep the crossing approach paint. |
| Open lot | IMG_1074/1075/1079 and video IMG_1080 | Grass with worn vehicle tracks replaces the gravel-dominated patchwork. The surface partition has one visible owner at 0.15 m. Rope boundaries and the entrance remain. |
| Fork island | IMG_1075–1081 | Lower the kerb to the town's 0.16 m cap datum and retain a low earth mound supporting the nearly bare cherry. Preserve the existing registered footprint and the public branch. |
| Omotemon view | IMG_1064–1067 and video IMG_1065 | Correct the shared clipping author: foliage, timber and roofs cannot receive ground-to-water stone closures. Their cut edges had produced tall stone curtains across the bridge view. Ground still closes at its actual height. |
| University and rampart | IMG_1078/1082–1085 | Check reverse views and pedestrian sight lines against the existing reconstruction. Keep the registered gate, hall, office and rampart geometry. |

Castle and moat masonry retains its flat faces and the shared Kyobashi-style procedural stone texture. Stones do not gain individual relief meshes. Track widths, hedge height, the flowerbed profile, road margins and the western shoreline transition are estimates. Unreadable text, temporary people, vehicles and event equipment are not reconstructed.

## Generation and verification

`tools/east_extension.py` owns clipped ground closures for all callers. `castle-approach.js` supplies the shared road and shoreline. `university-layout.js` clips the school shore at X −220 geometrically, so adding real shoreline vertices cannot change the join through an array index. Ground, collision, editor maps and native high/low programs are regenerated through `tools/rebuild_models.mjs`; road paint is rebuilt with `tools/build_road_markings.mjs`.

`test/pedestrian-survey.test.mjs` checks the generated walking corridor with a 0.6 m body, agreement between visible high/low pavement and Ground, and bridge rays that previously hit false stone curtains. All five checks failed on the starting generated assets. The campus water regression uses fixed water stations instead of pairing independent shoreline vertices by array index; its first former sample lay exactly on the closing seam. Completed geometry, route and browser verification is recorded with the [final simulator views and check results](pedestrian-survey-20261101/README.md).
