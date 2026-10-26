// Browser-owned corrections to the parked vehicles imported in data/scene.json (generated; never
// edited by hand). The midblock trucks of 03/04/06/09 stand 0.35 m further toward the kerb (still
// about 0.1 m inside the carriageway): at the imported pose the westbound pass beside them was
// flush with their sides, and no lawful line to the x 47.6 stop bar cleared the large truck's corner.
export const KERBWARD_TRUCK_SHIFT = 0.35;

/** Parked vehicles of a built-in scenario (zero-based scene index), with the corrections applied. */
export function parkedFor(scene, builtIn) {
  return (scene.scenarios.find(s => s.id === builtIn)?.parked ?? []).map(p =>
    p.kind === 'truck' && Math.abs(p.z - 24) < 0.05 && p.x > 45 && p.x < 85 ? { ...p, z: p.z - KERBWARD_TRUCK_SHIFT } : p);
}
