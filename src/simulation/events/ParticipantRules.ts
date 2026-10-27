import type {PlayerMode, HazardPolicy} from '../../types/scenario.ts';
import type {PathPoint, Participant, SignalState} from '../../types/simulation.ts';
// Practice observations, not a legal assessment or real-world crash probabilities.
// Observation corridors follow the stripes in tools/road_network.py, with lateral approach
// tolerance: the built-in diagonal walks may enter beside the paint inside the signal junction.
const CROSSINGS = [
  { x0: 16.7, x1: 22.7, z0: 22, z1: 30.1, axis: 'z' },
  { x0: 41.3, x1: 47.3, z0: 22, z1: 30.1, axis: 'z' },
  { x0: 28, x1: 36.1, z0: 14.7, z1: 20.7, axis: 'x' },
  { x0: 28, x1: 36.1, z0: 31.4, z1: 37.4, axis: 'x' },
  // The junction interior between the stripes: legal only for the diagonal walk of the pedestrian phase.
  { x0: 22.7, x1: 41.3, z0: 20.7, z1: 31.4, axis: 'any' },
];
export const DEFAULT_HAZARD_POLICY = { safeProbability: 0.03, unsafeProbability: 0.6 };
// Within this distance of a signal crosswalk, drivers expect a pedestrian on the pavement to wait
// for the walk signal instead of extrapolating their walk off the kerb.
export const KERB_EXPECTATION_METERS = 4;

export function hazardProbability(score: number, policy: HazardPolicy | null = DEFAULT_HAZARD_POLICY) {
  policy ??= DEFAULT_HAZARD_POLICY;
  const safe = Math.max(0, Math.min(1, policy.safeProbability ?? DEFAULT_HAZARD_POLICY.safeProbability));
  const unsafe = Math.max(safe, Math.min(1, policy.unsafeProbability ?? DEFAULT_HAZARD_POLICY.unsafeProbability));
  return safe + (unsafe - safe) * Math.max(0, Math.min(1, score));
}

/** Closest authored lane segment, reused for observation; never uses spawn/goal progress. */
export function nearestLane(paths: PathPoint[][], x: number, z: number, out: {distance: number; yaw: number}) {
  out.distance = Infinity; out.yaw = 0;
  for (const path of paths) for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b.x - a.x, dz = b.z - a.z;
    const length2 = dx * dx + dz * dz;
    if (length2 < 1e-8) continue;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / length2));
    const distance = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
    if (distance < out.distance) { out.distance = distance; out.yaw = Math.atan2(dx, dz) * 180 / Math.PI; }
  }
  return out;
}

export class ParticipantRules {
  declare paths: PathPoint[][]; declare mode: PlayerMode; declare policy: HazardPolicy | null | undefined;
  declare score: number; declare probability: number; declare time: number;
  declare lane: {distance: number; yaw: number}; declare crossing: number;
  declare alongLook: number; declare againstLook: number; declare lastAlong: number; declare lastAgainst: number;
  declare redEntries: number; declare uncheckedEntries: number; declare wrongWaySeconds: number;
  declare onRoad: boolean; declare wrongWay: boolean;
  declare againstSignal: boolean; declare kerbExpected: boolean;
  declare wasOnRoad: boolean | null;
  constructor(paths: PathPoint[][], mode: PlayerMode, policy?: HazardPolicy | null) {
    this.paths = paths; this.mode = mode; this.policy = policy;
    this.score = 0; this.probability = hazardProbability(0, policy);
    this.time = 0; this.lane = {} as {distance: number; yaw: number}; this.wasOnRoad = null; this.crossing = -1;
    this.alongLook = 0; this.againstLook = 0;
    this.lastAlong = -Infinity; this.lastAgainst = -Infinity;
    this.redEntries = 0; this.uncheckedEntries = 0; this.wrongWaySeconds = 0;
    this.onRoad = false; this.wrongWay = false;    // current state, read by the open-world session
    this.againstSignal = false; this.kerbExpected = false;   // current state, read by drivers
  }

  step(dt: number, q: Participant | null, signal: SignalState) {
    if (!q) return;
    this.time += dt;
    this.score = Math.max(0, this.score - dt / 30);
    const lane = nearestLane(this.paths, q.x, q.z, this.lane);
    const vx = q.vx ?? 0, vz = q.vz ?? 0, speed = Math.hypot(vx, vz);
    const onRoad = lane.distance < 1.7;
    // Both directions of a lane axis count consistently even when its opposing lane is closest.
    if (Number.isFinite(q.yaw) && lane.distance < 8) {
      const axis = ((lane.yaw % 180) + 180) % 180;
      const facing = Math.cos((q.yaw! - axis) * Math.PI / 180);
      this.alongLook = facing > 0.82 ? this.alongLook + dt : 0;
      this.againstLook = facing < -0.82 ? this.againstLook + dt : 0;
      if (this.alongLook >= 0.25) this.lastAlong = this.time;
      if (this.againstLook >= 0.25) this.lastAgainst = this.time;
    }
    if (this.wasOnRoad === false && onRoad && speed > 0.15 && Number.isFinite(q.yaw)
      && (this.time - this.lastAlong > 6 || this.time - this.lastAgainst > 6)) {
      this.uncheckedEntries++; this.score = Math.min(1, this.score + 0.65);
    }
    let crossing = -1, nearCrossing = false;
    const m = KERB_EXPECTATION_METERS;
    for (let i = 0; i < CROSSINGS.length; i++) {
      const c = CROSSINGS[i];
      if (q.x >= c.x0 && q.x <= c.x1 && q.z >= c.z0 && q.z <= c.z1) { crossing = i; break; }
      if (q.x >= c.x0 - m && q.x <= c.x1 + m && q.z >= c.z0 - m && q.z <= c.z1 + m) nearCrossing = true;
    }
    if (this.wasOnRoad != null && crossing >= 0 && crossing !== this.crossing
      && (CROSSINGS[crossing].axis === 'any' ? speed : Math.abs(CROSSINGS[crossing].axis === 'x' ? vx : vz)) > 0.15
      && signal.walk !== 'green') {
      this.redEntries++; this.score = 1; this.againstSignal = true;
    }
    // A crossing entered against the signal stays unexpected until the participant leaves it.
    if (crossing < 0) this.againstSignal = false;
    this.kerbExpected = signal.walk !== 'green' && crossing < 0 && !onRoad && nearCrossing;
    let wrongWay = false;
    if (this.mode === 'bicycle' && onRoad && speed > 0.4) {
      const a = lane.yaw * Math.PI / 180;
      if ((vx * Math.sin(a) + vz * Math.cos(a)) / speed < -0.5) {
        wrongWay = true;
        this.wrongWaySeconds += dt; this.score = Math.min(1, this.score + 0.75 * dt);
      }
    }
    this.onRoad = onRoad; this.wrongWay = wrongWay;
    this.wasOnRoad = onRoad; this.crossing = crossing;
    this.probability = hazardProbability(this.score, this.policy);
  }
}
