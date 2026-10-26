import type {VehicleSpec, DriverParameters} from '../../types/scenario.ts';
import type {DriverState, RandomSource} from '../../types/simulation.ts';
// Practice-model settings, not measured population distributions. Sample once per vehicle.
export const DRIVER_LIMITS: Record<keyof DriverParameters, [number, number]> = {
  reactionTimeSeconds: [0.2, 2.5],
  desiredSpeedKmh: [5, 80],
  maxBrakingMps2: [2, 9],
  accelerationMps2: [0.5, 4],
  timeHeadwaySeconds: [0.8, 3],
};
export const DRIVER_BEHAVIORS = ['adaptive', 'lawful', 'red-light', 'speeding', 'failure-to-yield'];
export const DRIVER_BEHAVIOR_LABELS = { adaptive: '行動に応じて抽選', pending: '通行判断前', lawful: '通常運転',
  'red-light': '信号無視', speeding: '速度超過', 'failure-to-yield': '譲らず反応が遅れる' };

/** A single saved draw per driver, independent of frame rate and traffic scheduling. */
export function chooseDriverBehavior(probability: number, roll: number, kind: number): DriverState['behavior'] {
  return (roll < probability ? DRIVER_BEHAVIORS[2 + Math.min(2, Math.floor(kind * 3))] : 'lawful') as DriverState['behavior'];
}

export function createDriver(vehicle: Pick<VehicleSpec, 'speedKmh' | 'driver'>, random: RandomSource, hazardRandom = random): DriverState {
  const settings = vehicle.driver ?? {};
  const between = (lo: number, hi: number) => lo + (hi - lo) * random();
  const defaults = {
    reactionTimeSeconds: between(0.6, 1.4),
    desiredSpeedKmh: vehicle.speedKmh * between(0.9, 1.05),
    maxBrakingMps2: between(4.5, 7.5),
    accelerationMps2: between(1.8, 3),
    timeHeadwaySeconds: between(1.2, 2),
  };
  const driver = {} as DriverParameters;
  for (const [key, [lo, hi]] of Object.entries(DRIVER_LIMITS) as [keyof DriverParameters, [number, number]][])
    driver[key] = Math.max(lo, Math.min(hi, Number.isFinite(settings[key]) ? settings[key]! : defaults[key]));
  return Object.assign(driver, {
    behavior: DRIVER_BEHAVIORS.includes(settings.behavior ?? '') && settings.behavior !== 'adaptive' ? settings.behavior : 'pending',
    behaviorRoll: hazardRandom(), behaviorKind: hazardRandom(), decisionProbability: null,
    state: 'cruising', reason: null, hazardSeconds: 0, clearSeconds: 0,
    hazardDistance: Infinity, targetSpeed: 0, acceleration: 0,
  } as Omit<DriverState, keyof DriverParameters>);
}

/** A stopping envelope including reaction travel; distances and speeds use SI units. */
export function safeSpeed(distance: number, braking: number, reaction = 0, exitSpeed = 0) {
  return Math.max(0, Math.sqrt((braking * reaction) ** 2
    + exitSpeed ** 2 + 2 * braking * Math.max(0, distance)) - braking * reaction);
}
