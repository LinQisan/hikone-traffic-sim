import type {Point} from './scenario.ts';
import type {Scenario} from './scenario.ts';
import type {SignalStage} from './simulation.ts';
import type {WorldManifest} from './world.ts';
export type Vec3 = [number, number, number];
export interface LayoutItem {a: string; p: Vec3; r: number; s: Vec3; g: string}
export interface SceneLayout {version: number; items: LayoutItem[]; [extension: string]: unknown}
export interface SignalInstallation {id: string; kind: string; pole: Point; head: {x: number; y: number; z: number} | null; [extension: string]: unknown}
export interface ScenePackage {
  format: 'hikone-scene-package'; version: 1;
  coordinates: {units: 'metres'; handedness: 'left'; up: '+Y'; forward: '+Z'; yaw: 'clockwise-degrees'; glbMirrorAxis: 'X'};
  assets: {id: string; native: {high: string; low: string}; glb: {high: string; low: string}}[];
  entities: {id: string; type: 'model'; asset: string; group: string; position: Vec3; yaw: number; scale: Vec3}[];
  signals: {periodSeconds: number; stages: SignalStage[]; installations: SignalInstallation[]};
  layout: SceneLayout; scenarios: Scenario[]; world: WorldManifest;
}
