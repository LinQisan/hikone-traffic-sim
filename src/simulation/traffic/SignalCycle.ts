import type {SignalState, SignalStage, SignalStop, PathPoint} from '../../types/simulation.ts';
// Hikone's transport master plan (p. 52) confirms pedestrian/vehicle separation at Kyobashi.
// Combined with the owner's synchronized walk heads, this models an exclusive walk phase.
// Exact controller
// timings are not published: these seconds are simulation settings, not a survey.
export const SIGNAL_STAGES = [
  { id: 'east-west', seconds: 28, eastWest: 'green', northSouth: 'red', walk: 'red' },
  { id: 'east-west-yellow', seconds: 3, eastWest: 'yellow', northSouth: 'red', walk: 'red' },
  { id: 'clear-east-west', seconds: 3, eastWest: 'red', northSouth: 'red', walk: 'red' },
  { id: 'north-south', seconds: 20, eastWest: 'red', northSouth: 'green', walk: 'red' },
  { id: 'north-south-yellow', seconds: 3, eastWest: 'red', northSouth: 'yellow', walk: 'red' },
  { id: 'clear-north-south', seconds: 3, eastWest: 'red', northSouth: 'red', walk: 'red' },
  { id: 'walk', seconds: 18, eastWest: 'red', northSouth: 'red', walk: 'green' },
  { id: 'walk-flash', seconds: 6, eastWest: 'red', northSouth: 'red', walk: 'flash' },
  { id: 'clear-walk', seconds: 3, eastWest: 'red', northSouth: 'red', walk: 'red' },
] satisfies SignalStage[];
export const SIGNAL_PERIOD = SIGNAL_STAGES.reduce((sum, stage) => sum + stage.seconds, 0);

/** One shared, deterministic clock, including rewind/replay; no per-frame allocation. */
export class SignalCycle {
  declare state: SignalState;
  constructor() { this.state = {} as SignalState; this.at(0); }
  at(seconds: number): SignalState {
    let time = Math.max(0, Number.isFinite(seconds) ? seconds : 0) % SIGNAL_PERIOD;
    for (const stage of SIGNAL_STAGES) {
      if (time < stage.seconds) {
        const s = this.state;
        s.id = stage.id; s.eastWest = stage.eastWest as SignalState['eastWest']; s.northSouth = stage.northSouth as SignalState['northSouth'];
        s.walk = stage.walk as SignalState['walk']; s.walkOn = stage.walk === 'green' || stage.walk === 'flash' && time % 1 < 0.5;
        s.remaining = stage.seconds - time;
        return s;
      }
      time -= stage.seconds;
    }
    return this.state;
  }
}

// Match the four authored stop bars in tools/moat_art.py (Unity metres).
const STOP_LINES = [
  { axis: 'eastWest', coordinate: 'x', value: 16.4, direction: 1, min: 26.15, max: 29.50 },
  { axis: 'eastWest', coordinate: 'x', value: 47.6, direction: -1, min: 22.50, max: 25.85 },
  { axis: 'northSouth', coordinate: 'z', value: 14.10, direction: 1, min: 28.50, max: 31.85 },
  { axis: 'northSouth', coordinate: 'z', value: 37.75, direction: -1, min: 32.15, max: 35.50 },
];

/** Approach gates crossed by this smoothed route; a car already inside can leave. */
export function junctionStops(path: PathPoint[]): SignalStop[] {
  const stops: SignalStop[] = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    for (const line of STOP_LINES) {
      const key = line.coordinate as 'x' | 'z', change = b[key] - a[key];
      if (change * line.direction <= 0 || (a[key] - line.value) * line.direction > 0
        || (b[key] - line.value) * line.direction <= 0) continue;
      const t = (line.value - a[key]) / change, other = key === 'x' ? 'z' : 'x';
      const across = a[other] + (b[other] - a[other]) * t;
      if (across >= line.min - 0.15 && across <= line.max + 0.15)
        stops.push({ axis: line.axis as SignalStop['axis'], distance: a.s + (b.s - a.s) * t });
    }
  }
  return stops.sort((a, b) => a.distance - b.distance);
}
