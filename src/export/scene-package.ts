import {signalRigs} from '../three/scene/signal-layout.js';
import {SIGNAL_STAGES, SIGNAL_PERIOD} from '../simulation/traffic/SignalCycle.ts';
import type {Scenario} from '../types/scenario.ts';
import type {WorldManifest} from '../types/world.ts';
import type {SceneLayout, ScenePackage} from '../types/scene-package.ts';
/** JSON carries semantic data unchanged; GLB files named here are produced separately on demand. */
export function createScenePackage(layout: SceneLayout, scenarios: Scenario[], world: WorldManifest): ScenePackage {
  const names = [...new Set(layout.items.map(item => item.a))].sort();
  for (const name of names) if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error('Invalid asset identifier: ' + name);
  return structuredClone({
    format: 'hikone-scene-package', version: 1,
    coordinates: {units: 'metres', handedness: 'left', up: '+Y', forward: '+Z', yaw: 'clockwise-degrees', glbMirrorAxis: 'X'},
    assets: names.map(id => ({id, native: {high: `models/${id}.json`, low: `models/${id}.lod.json`},
      glb: {high: `assets/${id}.glb`, low: `assets/${id}.lod.glb`}})),
    entities: layout.items.map((item, index) => ({id: `layout:${String(index).padStart(6, '0')}`, type: 'model', asset: item.a,
      group: item.g, position: item.p, yaw: item.r, scale: item.s})),
    signals: {periodSeconds: SIGNAL_PERIOD, stages: SIGNAL_STAGES, installations: signalRigs()},
    layout, scenarios, world,
  });
}
