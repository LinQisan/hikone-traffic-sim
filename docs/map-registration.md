# City-map registration review, 31 October 2026

The owner's WAGmap screenshot prompted an independent registration of the Nishi school, tennis peninsula, small roadside buildings and four castle landmarks. The existing metre frame stays fixed: +Z bears 32°, +X bears 122°. Applied placements span approximately X −635 to −159, Z 171 to 464. This is a local correction, not a survey or a complete replacement of the screenshot area.

[Source/model overlay](map-registration/overlay.svg), north up: source outlines are gray, previous school/building envelopes red, current envelopes blue. Castle dots identify model origins, not footprints. Regenerate the current overlay and check footprint-centroid residuals with:

```bash
node tools/check_geographic_registration.mjs /tmp/registration.svg
```

`world/geographic-registration.json` separates original WGS84 geometry, source metadata and estimated local placements. `src/world/generators/geographic-registration.js` supplies both procedural authors and runtime layout. Do not replace these registrations with viewport pixels.

## Sources and permissions

| Source, accessed 2026-10-31 | Use and permission |
| --- | --- |
| [Hikone city guide](https://www2.wagmap.jp/hikone-sp/) | The live mobile guide and the owner's screenshot were visually checked. PASCO/GeoTechnologies cartography is copyrighted. No tiles, screenshots or geometry traced from that guide are included. Its positions are not survey boundaries. |
| [GSI optimal vector tiles](https://github.com/gsi-cyberjapan/optimal_bvmap) | The current PMTiles catalog dated 2026-07-01, not the legacy tile service frozen in 2023. BldA building outlines and RdCL road centre lines, six z16 tiles, accessed by bounded HTTP range reads. Source ETag and decompressed tile hashes are recorded in the registration JSON. Geometry is modified under the [GSI terms / Public Data License 1.0](https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html), with attribution in both simulator and editor. Catalog date is not a field-survey date. |
| [OpenStreetMap API snapshot](https://api.openstreetmap.org/api/0.6/map?bbox=136.2450,35.2738,136.2555,35.2792) | School footprints, five tennis playing rectangles and road cross-checks. © OpenStreetMap contributors, [ODbL 1.0](https://www.openstreetmap.org/copyright). Element IDs, versions, timestamps and response SHA-256 are recorded. The retained outlines here remain available under ODbL. |
| Owner's IMG_0858 and earlier reviewed frontage photos | Facade identities and street relationships only. Private originals remain in ignored `field-photos/`; neither images nor photo GPS are copied into this report or shipped assets. Small-house identity remains an interpretation. |

## Applied corrections

| Element | Finding and change |
| --- | --- |
| Nishi north classroom, north return, main classroom and south wing | Replaced independently registered screenshot quadrilaterals with OSM footprints. Original centroid errors were approximately 9.3, 6.4, 1.1 and 5.0 m. Current coordinate conversion residuals are below 2 cm; this is arithmetic agreement with OSM, not real-world accuracy. Heights and painted materials remain estimates. |
| Nishi gym | Corrected position, size and long roof axis using the mapped footprint's rectangular envelope. Its small entrance projection is not reconstructed. Envelope/source centroid residual is 0.65 m. |
| Roadside shed, timber house, low store and gray lodge | Registered to GSI roof envelopes instead of apparent photographic distance. The old timber-house envelope was much too large. Preserved the procedural facade style; dimensions now follow the source. Remaining envelope/source centroid residuals are 0.01–0.59 m. Repeated wings and lean-tos remain simplified. |
| School service lane | Retained the photographed/OSM public fork. Replaced the north segment, previously around X −529, with the independently mapped line around X −523. The old apron is cut around building footprints. Road, visible asphalt, drains, Ground, collision and editor output share the revised geometry. Width remains an estimate of 5 m. |
| Tennis peninsula | Added the five individually mapped playing rectangles, clay surfaces, court lines and nets, using the source locations rather than spacing copies inside the former single sand plot. Service-line positions, net height and runoffs are illustrative, not surveyed. |
| Keep | Shifted the complete existing model 2.26 m; yaw 193° → 191°. |
| Nishinomaru turret and wings | Shifted the complete existing model 14.39 m; yaw −77° → −61°. Fitting the main-turret rectangle alone would misplace the connecting wings. |
| Tenbin | Shifted 1.23 m; yaw remains −32°. The bridge, portal and terrain terrace follow the shared placement. |
| Taikomon | Shifted 5.08 m; yaw 13° → 67°, correcting the gate-and-wing axis. The opening and its route rotate together. |

The castle placements use rigid alignment of the complete authored roof silhouettes to GSI, cross-checked against independent OSM outlines. They are estimates and do not rescale the buildings. Approximate footprint overlap improved from 0.69 to 0.77 for the keep, 0.11 to 0.63 for Nishinomaru, 0.65 to 0.70 for Tenbin, and 0.38 to 0.61 for Taikomon. Remaining discrepancies are shape differences. These overlap values are fitting diagnostics, not positional accuracy.

The university auditorium already agreed with OSM and was retained. The photo-registered public road, university gate, Nishi gate and IMG_0994 rampart/stair details retain their existing anchors. No event source or traffic-control timing is changed. Renoir-style pigments and brush rendering are retained; source maps are not textures.

## Limits

- The museum's eight approximate halls do not reproduce its actual outline. An unconstrained overlap fit produced a misleading diagonal orientation, so that result was rejected and its previous placement retained. The museum still needs a footprint-based remodel.
- Shorelines traced in earlier work can differ from GSI by several metres. No blanket nearest-shore snapping was applied: it can select the opposite bank or close a bridge. Unreviewed moat/road sections and the service lane's northern continuation retain their earlier extent.
- No new survey establishes heights, castle levels, present-day access restrictions, precise lane widths, tree species or hidden facades. The school and private buildings are visual scenery; this work does not assert public access.
- The city guide and open sources may describe different dates. A displayed catalog date does not prove that a temporary building exists today.

## Verification

Pending generated-model, route and browser checks. Results will replace this paragraph after the ordered rebuild finishes.
