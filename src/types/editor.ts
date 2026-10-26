import type {Point, Scenario, ScenarioMap, ScenarioProblem, PlayerMode} from './scenario.ts';
export interface Bounds {xMin: number; xMax: number; zMin: number; zMax: number}
export interface MapCoordinates {world: Bounds; pixelsPerMeter: number}
export interface EditorMap extends ScenarioMap, MapCoordinates {
  imageWidth: number; imageHeight: number; imageRevision?: string; imageUrl?: string;
  detail?: {file: string; world: Bounds};
  lanes: {id: string; name: string; points: Point[]}[];
  walls: {name?: string; polygon: number[]}[];
  signals: (Point & {name: string; yaw: number})[];
  vehicleModels: string[]; vehicleBodies?: {id: string; label: string}[];
  places?: (Point & {name: string})[];
}
export interface EditorFile {path: string; template: boolean}
export interface EditorEntry extends EditorFile {id: string; name: string; playerMode?: PlayerMode; errors: number; warnings: number; unreadable?: string}
export type Selection = {kind: 'spawn' | 'goal' | 'trigger'; index?: never; point?: never} | {kind: 'vehicle'; index: number; point?: number};
export type EditorTool = 'select' | 'draw' | 'coordinates';
export interface EditorState {
  map: EditorMap | null; list: EditorEntry[]; file: EditorFile | null; scenario: Scenario;
  saved: string; selection: Selection | null; tab: string; tool: EditorTool; drawing: number | null;
  cursor: Point | null; reference: Point | null; view: {scale: number; tx: number; ty: number};
  undo: string[]; redo: string[]; lastEdit: {key: string | null; at: number};
  time: number; playing: boolean; lastFrame: number; problems: ScenarioProblem[]; server: boolean;
}
export interface QuestStatus {error?: string; package?: string | null; devices: {state: string; model?: string; serial: string}[]}
export interface QuestReport {results: {error?: string; model?: string; serial: string; pushed: string[]; removed: string[]}[]; skipped: {id: string}[]}
