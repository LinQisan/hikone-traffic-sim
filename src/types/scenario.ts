/** Version-one browser/Unity coordinates: metres, +Z forward, yaw clockwise in degrees. */
export interface Point { x: number; z: number }
export interface Pose extends Point { yaw: number }
export interface Area extends Pose { width: number; depth: number }
export type PlayerMode = 'walking' | 'bicycle';
export type Setting = 'crossing' | 'midblock' | 'bicycle';
export type BodyId = 'sedan' | 'kei-tall' | 'kei-hatch';
export type DriverBehavior = 'adaptive' | 'lawful' | 'red-light' | 'speeding' | 'failure-to-yield';
export interface DriverParameters {
  reactionTimeSeconds: number; desiredSpeedKmh: number; maxBrakingMps2: number;
  accelerationMps2: number; timeHeadwaySeconds: number;
}
export type DriverOverrides = { [K in keyof DriverParameters]?: number | null } & { behavior?: DriverBehavior | null };
export interface HazardPolicy { safeProbability?: number | null; unsafeProbability?: number | null }
export interface Environment { visibilityMeters?: number | null; roadGrip?: number | null }
export interface VehicleSpec {
  name: string | null; model: string; body: string | null; route: Point[];
  speedKmh: number; start: 'begin' | 'trigger'; delaySeconds: number;
  repeatMinSeconds: number; repeatMaxSeconds: number; stopOnTrigger: boolean;
  accident: boolean; overrideYaw: boolean; yaw: number;
  entrySpeedKmh?: number | null; noStop?: boolean | null; driver?: DriverOverrides | null;
  flow?: string; redEntry?: number; event?: string;
}
export type VehicleDraft = Omit<Partial<VehicleSpec>, 'route'> & { route?: Partial<Point>[] | null };
export interface Scenario {
  format: string; version: number; id: string; name: string; nameEn: string | null;
  setting: Setting; map: string; playerMode: PlayerMode;
  learningGoal: string | null; situation: string | null; point: string | null;
  spawn: Point; goal: Area; trigger: Area; vehicles: VehicleSpec[];
  environment?: Environment | null; hazardPolicy?: HazardPolicy | null;
}
export type ScenarioDraft = Omit<Partial<Scenario>, 'spawn' | 'goal' | 'trigger' | 'vehicles'> & {
  spawn?: Partial<Point> | null; goal?: Partial<Area> | null; trigger?: Partial<Area> | null;
  vehicles?: VehicleDraft[] | null;
};
export interface ScenarioEntry {
  id: string; file: string; name: string; nameEn?: string | null;
  setting: Setting; playerMode: PlayerMode; template: boolean;
}
export interface ProblemTarget { kind: 'spawn' | 'goal' | 'trigger' | 'vehicle' | 'meta'; index?: number; point?: number }
export interface ScenarioProblem { level: 'error' | 'warning'; message: string; path?: string; target?: ProblemTarget }
export interface Surface { kind: string; triangles: number[]; name?: string }
export interface Wall { polygon: number[]; name?: string }
export interface ScenarioMap {
  surfaces: Surface[]; walls?: Wall[]; vehicleModels?: string[];
  lanes?: {id: string; name?: string; points: Point[]}[];
  [extension: string]: unknown;
}

export type DrivingSpec = Pick<VehicleSpec, 'route' | 'speedKmh'> & Partial<VehicleSpec>;
