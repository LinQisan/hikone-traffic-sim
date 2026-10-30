import type {ReplayFrame} from '../../types/simulation.ts';

/** A successful traversal has no impact car; review the nearest recorded traffic instead. */
export function nearestReplayCar(frames: ReplayFrame[]): number | null {
  let nearest: number | null = null, distance = Infinity;
  for (const frame of frames) for (const car of frame.cars) {
    const d = Math.hypot(car.x - frame.head.x, car.z - frame.head.z);
    if (d < distance) { distance = d; nearest = car.id; }
  }
  return nearest;
}
