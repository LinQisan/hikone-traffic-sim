# Higashi High School island, 30 October 2026

Follow-up to [the Higashi frontage](higashi-frontage-0864-0866.md). That pass rebuilt the gate, classroom slabs and parking; the rest of the island was still rough boxes, a sand patch and a shoreline running through the block. `world/higashi-island.json` is the source layer: frozen OSM outlines with way IDs, explicit estimates, evidence and limits. Geographic frame, event routes and simulation are unchanged.

## Evidence

| Source | Used for | Limits |
| --- | --- | --- |
| Owner's oblique aerial image, supplied 30 October | Current roof forms, the two adjoining arenas, tennis court, green playground roof, extent of wood and rampart | Capture date unknown; not a measured view |
| Owner photographs `10.29/IMG_0883`–`0888`, `0895`–`0898` | Rampart corner, batter and wood from the promenade and east road | GPS error about 4–7 m |
| Google Street View, Route 25 (October 2024) | Stone rampart with dense wood above | Facade/boundary reference only; no imagery shipped |
| Google Street View, north road, inner road, east road (November 2022) | North gym: white walls, small square windows, low curved roof; roadside hedge on a dark stone base; hall clerestory; east rampart | As above. Google's aerial layer rendered black in the review browser, so Google satellite was not read directly |
| GSI `seamlessphoto` zoom 18, tiles 230288–230290 / 103590–103592, retrieved 30 October | Rotated into the local frame to read the shore jog, tennis court and yards | Capture date not established. It predates the second arena and still shows a pool that OSM and the owner image do not, so it was not used for those two features |
| [OpenStreetMap](https://www.openstreetmap.org/way/404612729) bbox 136.2525,35.2715,136.2575,35.2765, retrieved 30 October | Building, pitch, wood and retaining-wall outlines; SHA-256 recorded in the source file | © OpenStreetMap contributors, ODbL 1.0 |

No aerial or Street View image is shipped.

## Corrections

- **Shoreline.** The mapped retaining wall jogs north at x 102–104 and runs along z≈95–96 to the corner at x≈190. The old shore stayed near z 74–88 and ran through the island. `north_shore` and `northShore` now follow the wall; the rampart falls linearly from its crest to the school grounds east of the jog. South of the moat, the practice shore and event routes are untouched.
- **Buildings.** Two pixel estimates are replaced by fourteen OSM outlines: barrel-roofed north gym, two ribbed arenas, third block, gabled club house, service range, sheds and covered links. Heights and storeys are estimates.
- **Grounds.** The mapped pitch replaces the sand patch. The tennis court and two asphalt yards are estimates read from the aerial, good to about 2 m.
- **Wood.** The mapped wood is filled with a new dark evergreen `ART_IslandWood` (tabu/shii), including the East source's illustrative groves on the island. It uses one instanced asset, not individual surveyed trees.
- **Boundary.** A clipped hedge on a dark stone base follows the mapped school boundary, with the service opening seen in Street View. Its size is an estimate.

## Ownership

The East Hikone author owns x≥120, z≥100 and clips anything authored by others there. Island buildings reaching that area are therefore authored whole by the East author (`east_owned`, `east_replaced`), which replaces its generic boxes for those ways. `island_cut` removes the courts from its green surfaces and adds them to both mesh and Ground; the road author keeps the part west of the seam.

## Regeneration

```sh
blender -b --factory-startup --python tools/build_impressionist.py -- --only ART_IslandWood ART_KyobashiRoads ART_KyobashiLand ART_KyobashiBanks ART_KyobashiWater ART_KyobashiBridge ART_CastleApproach ART_EastHikoneBuildings ART_EastHikoneSurface ART_EastHikoneWater
blender -b --factory-startup --python tools/build_native_models.py -- --only ART_IslandWood ART_KyobashiRoads ART_KyobashiLand ART_KyobashiBanks ART_KyobashiWater ART_KyobashiBridge ART_CastleApproach ART_EastHikoneBuildings ART_EastHikoneSurface ART_EastHikoneWater
node tools/build_collision.mjs
```

## Verification

`npm run check` passed: 321 tests, zero failures or skips, with typechecking and the production build. `node tools/check_routes.mjs` passed all 46 routes; events keep their routes and clocks. Fixed development-browser views were compared with the owner image and Street View: oblique island, Route 25 rampart, north-road gym and hedge. Console errors: none.

The offline GLB fixture budget in `test/art.test.mjs` rose from 80 to 81 MiB: the set is 80.47 MiB. Runtime native recipes are not measured by that limit. No same-page rendering A/B was run, so the cost of the 180 wood instances is unmeasured. No real phone was tested.

Known gaps: the wood reads as dense clusters, not a closed canopy, and keeps some warm highlights from the shared leaf shader. The bank crest still fades toward the East seam by x=200, so the rampart is lower there than the mapped 5.5 m.
