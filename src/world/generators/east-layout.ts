import source from '../../../world/east-hikone-layout.json' with {type: 'json'};
import type {SceneLayout, LayoutItem} from '../../types/scene-package.ts';
import {frame} from '../geography/coordinates.ts';
import observations from '../../../world/field-observations.json' with {type:'json'};
import nishi from '../../../world/nishi-frontage.json' with {type:'json'};
import island from '../../../world/higashi-island.json' with {type:'json'};
const photoProfiles: {height:number;rise:number;maxHeight?:number;anchor:number[]}[] = Object.values(observations.buildings);
export const EAST_GEOGRAPHY = source;
// Mapped generic houses by region; tools/east_extension.py authors the same split.
export const EAST_BUILDING_REGIONS = ['ART_EastHikoneWest', 'ART_EastHikoneSouth', 'ART_EastHikoneNorth'];
// Each extruded building keeps its own camera bounds (eave height plus any gable rise).
export const EAST_CAMERA_SOLIDS = source.buildings.flatMap(b => {
  // The compact transport omits source IDs. The reviewed frozen outline anchor ties the
  // same photo profile to its camera envelope without loading the full GIS plan at startup.
  const profile=photoProfiles.find(p=>Math.abs(p.anchor[0]-(b.outlines[0]?.[0]?.[0]??Infinity))<.006
    && Math.abs(p.anchor[1]-(b.outlines[0]?.[0]?.[1]??Infinity))<.006);
  return b.outlines.map(footprint => ({footprint: footprint as [number, number][],
    height: profile?.maxHeight ?? profile?.height ?? b.height, rise: profile?.maxHeight ? 0 : profile?.rise ?? b.rise}));
});
// The photographed gate and retaining walls are separate solids; the public turn
// between them remains open instead of becoming one large campus camera box.
const [gateX,gateZ] = nishi.gate.center;
const gateHalf = nishi.gate.width/2, gateDepth = nishi.gate.depth/2;
// Island profiles come first: their real ridge heights exceed the generic source envelopes.
EAST_CAMERA_SOLIDS.unshift(...island.buildings.filter(b => b.footprint.some(([x, z]) => x >= 120 && z >= 100))
  .map(b => ({footprint: b.footprint as [number, number][], height: b.height, rise: b.rise})));
EAST_CAMERA_SOLIDS.push({footprint:[[gateX-gateHalf,gateZ-gateDepth],[gateX+gateHalf,gateZ-gateDepth],
  [gateX+gateHalf,gateZ+gateDepth],[gateX-gateHalf,gateZ+gateDepth]],height:nishi.gate.height+.06,rise:0},
  ...nishi.walls.map(w=>({footprint:w.outline as [number,number][],height:w.height,rise:0})));
const RING = frame.east.coverage as [number, number][];
/** Inside the OSM-derived geographic coverage (everything outside the retained authored core). */
export function inEastExtension(x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = RING.length - 1; i < RING.length; j = i++) {
    const [ax, az] = RING[i]!, [bx, bz] = RING[j]!;
    if ((az > z) !== (bz > z) && x < ax + (z - az) * (bx - ax) / (bz - az)) inside = !inside;
  }
  return inside;
}
function boundaryDistance(x: number, z: number): number {
  let best = Infinity;
  for (let i = 0, j = RING.length - 1; i < RING.length; j = i++) {
    const [ax, az] = RING[j]!, [bx, bz] = RING[i]!, dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}
/** Farther than `margin` metres inside the coverage, so seam vertices on its boundary do not count. */
export function deepInEastExtension(x: number, z: number, margin: number): boolean {
  return inEastExtension(x, z) && boundaryDistance(x, z) > margin;
}
// Generic town houses stand on their street-front origin and reach about ten metres back:
// next to the coverage they would overlap the mapped footprints that replace them.
const GENERIC_HOUSE = /^HK_(Machiya|Kura)/;
/** Native meshes and body-height footprints use the same frozen source; no remote map at startup. */
export function eastLayout(layout: SceneLayout): SceneLayout {
  const assets = ['ART_EastHikoneSurface', 'ART_EastHikoneWater', 'ART_EastHikoneBuildings', ...EAST_BUILDING_REGIONS];
  const items = layout.items.filter(i => i.g !== 'WebEast' && (i.p[0] === 0 && i.p[2] === 0 || !inEastExtension(i.p[0], i.p[2]))
    && !(GENERIC_HOUSE.test(i.a) && boundaryDistance(i.p[0], i.p[2]) < 12));
  for (const a of assets) items.push({a, p:[0,0,0], r:0, s:[1,1,1], g:'WebEast'});
  // Mapped trees, plus the illustrative planting of mapped woods (groves), parks and gardens.
  for (const t of source.trees) items.push({a:'kind' in t && t.kind === 'grove' ? 'ART_CastleGrove' : 'ART_TownTree',
    p:[t.x,t.ground,t.z],r:0,s:[1,1,1],g:'WebEast'} satisfies LayoutItem);
  return {...layout, items};
}
