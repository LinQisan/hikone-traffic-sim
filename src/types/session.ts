import type {PlayerMode} from './scenario.ts';
import type {ReplayFrame, WalkSignal} from './simulation.ts';
export interface SessionHeader {world?: string; mode?: PlayerMode; heightCm?: number; weightKg?: number; seed?: number; note?: string}
export interface SessionSample {x: number; z: number; yaw: number; rideYaw?: number | null; speed: number; onRoad: boolean; wrongWay: boolean; walk: WalkSignal; risk: number; probability: number}
export interface IncidentRecord {time: number; car: number; event: string | null; kmh: number; x: number; z: number; instance?: string | null; driverBehavior?: string; violation?: string | null; mode?: PlayerMode}
export interface SessionIncident extends IncidentRecord {frames: ReplayFrame[] | null}
