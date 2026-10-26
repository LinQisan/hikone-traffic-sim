import type {Point, Pose, Scenario, VehicleSpec, DriverParameters, BodyId, HazardPolicy, Environment, DrivingSpec} from './scenario.ts';
export type RandomSource = () => number;
export type SignalColor = 'green' | 'yellow' | 'red';
export type WalkSignal = 'green' | 'flash' | 'red';
export interface SignalState { id: string; eastWest: SignalColor; northSouth: SignalColor; walk: WalkSignal; walkOn: boolean; remaining: number }
export interface SignalStage {id: string; seconds: number; eastWest: SignalColor; northSouth: SignalColor; walk: WalkSignal}
export interface PathPoint extends Point { s: number }
export interface PathPose extends Pose { steer?: number }
export interface SignalStop { axis: 'eastWest' | 'northSouth'; distance: number }
export interface Crossing extends Point { score: number; distance: number; s: number; dir: Point }
export interface PreparedRoute { path: PathPoint[]; signalStops: SignalStop[]; crossing?: Crossing | null }
export interface DeparturePlan extends PreparedRoute { v: VehicleSpec; index: number; next: number | null; done: boolean; stopAfter?: number }
export type DriverReason = 'turn' | 'signal' | 'traffic' | 'junction' | 'participant' | null;
export interface DriverState extends DriverParameters {
  behavior: 'pending' | 'lawful' | 'red-light' | 'speeding' | 'failure-to-yield';
  behaviorRoll: number; behaviorKind: number; decisionProbability: number | null;
  state: 'cruising' | 'following' | 'yielding' | 'reacting' | 'braking' | 'emergency-braking' | 'waiting';
  reason: DriverReason; hazardSeconds: number; clearSeconds: number; hazardDistance: number; targetSpeed: number; acceleration: number;
}
export interface Participant extends Point { vx?: number; vz?: number; yaw?: number }
export interface TrafficCar extends Pose {
  id: number; vehicle: number; spec: DrivingSpec; name: string | null | undefined; accident: boolean;
  body: BodyId; driver: DriverState; size: number[]; born: number; speed: number;
  path: PathPoint[]; wheelbase: number; steer: number; currentSpeed: number; alive: boolean; distance: number;
  violation: string | null; signalStops: SignalStop[]; nextSignal: number; signalCommitted: boolean; yellowChecked: boolean;
  crossing: Crossing | null; probe: PathPose; owner?: string | null; paintSeed?: number | null; swerve?: number; lateral?: number; closest?: number; passed?: boolean;
}
export type TrafficScenario = Pick<Scenario, 'id' | 'map' | 'playerMode' | 'vehicles'> & {
  environment?: Environment | null; hazardPolicy?: HazardPolicy | null; spawn?: Point; goal?: Point;
};
export interface HeadFrame extends Pose { y?: number; pitch?: number; roll?: number; rideYaw?: number; distance?: number; mode?: string }
export interface RecordableCar extends Pose {id: number; body: string; accident: boolean; steer?: number; driver?: DriverState; violation?: string | null}
export interface RecordedCar extends Pose { id: number; body: string; accident: boolean; steer: number; driverBehavior?: string; violation?: string | null }
export interface ReplayFrame { t: number; head: HeadFrame; cars: RecordedCar[] }
export interface TimedPose extends Pose { t: number; steer?: number }
export interface AccidentMetrics { hasVehicle: boolean; secondsLooking: number; lastLookBeforeImpact: number; lookedAtVehicle: boolean; vehicleKmh: number; participantKmh: number }
export interface CrossingMetrics { hasData: boolean; left: number; right: number; closest: number; duration: number; checkedLeft?: boolean; checkedRight?: boolean }
export interface Footprint extends Pose { size: number[] }
export interface CollisionGrid { xMin: number; zMin: number; width: number; height: number; cell: number; bits: number[]; }
export type Triangle = [number, number, number, number, number, number, number, number, number];
export type RoadTiles = Record<string, Triangle[]>;
export interface CrashInput {person: Point; personVelocity?: Point; car: Pose; carVelocity: Point; size?: number[]; bicycle?: boolean}
export interface CrashDescription {kind: 'front' | 'corner' | 'side' | 'bump'; dir: Point; speed: number; thrown: number; lift: number; spin: number; flight: number; landing: number; total: number; side: number; wrap: boolean; bicycle: boolean}
