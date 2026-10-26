import type {HeadFrame, ReplayFrame, TimedPose, TrafficCar, AccidentMetrics, CrossingMetrics, RecordedCar, RecordableCar} from '../../types/simulation.ts';
// Recording and feedback figures, the same definitions as Unity's AccidentReplayRecorder /
// AccidentReplayAnalysis / CrossingAnalysis. Unity coordinates, yaw clockwise from above (0 = +z).
// Pure logic (node:test).
export const SAMPLE_INTERVAL = 0.05;
export const BUFFER_SECONDS = 12;
export const SECONDS_BEFORE_IMPACT = 8;
export const SECONDS_AFTER_IMPACT = 1.6;
export const GAZE_HALF_ANGLE = 35;
export const GAZE_MAX_DISTANCE = 60;
export const SIDE_CHECK_MIN = 35;
export const SIDE_CHECK_MAX = 150;

const deg = (r: number) => r * 180 / Math.PI;
/** Signed angle from yaw a to yaw b in degrees, -180..180 (+ = clockwise from above = to the right). */
export const deltaYaw = (a: number, b: number) => ((b - a + 540) % 360) - 180;
export const yawTo = (fx: number, fz: number, tx: number, tz: number) => deg(Math.atan2(tx - fx, tz - fz));

export class Recorder {
  declare next: number; declare recording: boolean;
  declare frames: ReplayFrame[];
  constructor() { this.frames = []; this.next = 0; this.recording = true; }

  /** head: { x, z, yaw }; cars: [{ id, x, z, yaw, body, accident }] */
  capture(time: number, head: HeadFrame, cars: RecordableCar[]) {
    if (!this.recording || time < this.next) return;
    this.next = time + SAMPLE_INTERVAL;
    this.frames.push({ t: time, head: { ...head }, cars: cars.map(c => ({ id: c.id, x: c.x, z: c.z, yaw: c.yaw, steer: c.steer ?? 0, body: c.body, accident: c.accident,
      driverBehavior: c.driver?.behavior ?? 'lawful', violation: c.violation ?? null })) });
    while (this.frames.length && this.frames[0].t < time - BUFFER_SECONDS) this.frames.shift();
  }

  stop() { this.recording = false; }

  /** Frames from `from` to `to` (seconds), after the last placement jump before `cut`. */
  window(from: number, to: number, cut = to) {
    let frames = this.frames.filter(f => f.t >= from - 1e-4 && f.t <= to + 1e-4);
    let first = 0;
    for (let i = 1; i < frames.length && frames[i].t <= cut; i++) {
      const a = frames[i - 1].head, b = frames[i].head;
      if (Math.hypot(b.x - a.x, b.z - a.z) > 1.5) first = i;
    }
    return frames.slice(first);
  }
}

function speedKmh(track: TimedPose[], atTime: number) {
  // A hidden car may appear less than a second before contact (event 04).
  const a = sample(track, Math.max(atTime - 1, track[0]?.t ?? atTime)), b = sample(track, atTime - 0.05);
  if (!a || !b || b.t <= a.t) return 0;
  return Math.hypot(b.x - a.x, b.z - a.z) / (b.t - a.t) * 3.6;
}

/** Linear sample of a [{ t, x, z }] track (null outside it). */
export function sample(track: TimedPose[], t: number) {
  if (!track.length || t < track[0].t - 1e-6 || t > track[track.length - 1].t + 1e-6) return null;
  let lo = 1, hi = track.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (track[mid].t < t) lo = mid + 1; else hi = mid; }
  if (lo === track.length) return track[track.length - 1];
  const a = track[lo - 1], b = track[lo], f = (t - a.t) / Math.max(1e-6, b.t - a.t);
  return { t, x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, yaw: a.yaw + deltaYaw(a.yaw, b.yaw) * f,
    steer: (a.steer ?? 0) + ((b.steer ?? 0) - (a.steer ?? 0)) * f };
}

export const isLookingAt = (head: HeadFrame, x: number, z: number) => {
  const d = Math.hypot(x - head.x, z - head.z);
  if (d > GAZE_MAX_DISTANCE || d < 0.3) return false;
  return Math.abs(deltaYaw(head.yaw, yawTo(head.x, head.z, x, z))) <= GAZE_HALF_ANGLE;
};

/** Whether and when the participant looked toward the car that hit them. */
export function accidentAnalysis(frames: ReplayFrame[], impactTime: number, carId: number): AccidentMetrics {
  const headTrack = frames.map(f => ({ t: f.t, ...f.head }));
  const carTrack = frames.flatMap(f => f.cars.filter(c => c.id === carId).map(c => ({ t: f.t, x: c.x, z: c.z, yaw: c.yaw })));
  let seen = 0, lastLook = -1;
  for (let i = 1; i < frames.length; i++) {
    const f = frames[i];
    if (f.t > impactTime - 0.1) break;
    const car = f.cars.find(c => c.id === carId);
    if (!car) continue;
    if (isLookingAt(f.head, car.x, car.z)) {
      seen += f.t - frames[i - 1].t;
      lastLook = impactTime - f.t;
    }
  }
  return {
    hasVehicle: carTrack.length > 0, secondsLooking: seen, lastLookBeforeImpact: lastLook,
    lookedAtVehicle: lastLook >= 0, vehicleKmh: speedKmh(carTrack, impactTime), participantKmh: speedKmh(headTrack, impactTime)
  };
}

/** Side checks relative to the direction of travel, and the closest car, over the recorded window. */
export function crossingAnalysis(frames: ReplayFrame[]): CrossingMetrics {
  if (frames.length < 2) return { hasData: false, left: 0, right: 0, closest: -1, duration: 0 };
  const first = frames[0].head, last = frames[frames.length - 1].head;
  const travelLength = Math.hypot(last.x - first.x, last.z - first.z);
  const travelYaw = yawTo(first.x, first.z, last.x, last.z);
  let left = 0, right = 0, closest = Infinity;
  for (let i = 1; i < frames.length; i++) {
    const dt = frames[i].t - frames[i - 1].t, h = frames[i].head;
    if (travelLength > 0.5) {
      const a = deltaYaw(travelYaw, h.yaw), m = Math.abs(a);
      if (m >= SIDE_CHECK_MIN && m <= SIDE_CHECK_MAX) { if (a > 0) right += dt; else left += dt; }
    }
    for (const c of frames[i].cars) closest = Math.min(closest, Math.hypot(c.x - h.x, c.z - h.z));
  }
  return {
    hasData: true, left, right, closest: closest === Infinity ? -1 : closest,
    duration: frames[frames.length - 1].t - frames[0].t,
    checkedLeft: left >= 0.3, checkedRight: right >= 0.3
  };
}

/** The feedback sentences of AccidentResultPresenter. */
export function accidentVerdict(a: AccidentMetrics | null) {
  if (!a || !a.hasVehicle) return 'リプレイを思い出して、どこで止まって確認すればよかったか考えてみましょう。';
  if (!a.lookedAtVehicle) return 'ぶつかった車を見ていませんでした。渡る前に、左右をしっかり確認しましょう。';
  if (a.lastLookBeforeImpact > 1.5) return '車は見ていましたが、確認のあとも車は近づいていました。渡る直前にもう一度確認しましょう。';
  return '車に気づいていました。気づいたときに止まれる距離と速さかを考えましょう。';
}

export function successVerdict(c: CrossingMetrics, bicycle: boolean) {
  const goal = bicycle ? '安全に走れました' : '安全に渡れました';
  if (!c.hasData) return `${goal}。いつも左右を確認するくせをつけましょう。`;
  if (c.checkedLeft && c.checkedRight) return `左右をよく確認して、${goal}。この確認をいつも続けましょう。`;
  if (c.checkedLeft || c.checkedRight) return `${goal}が、${c.checkedLeft ? '右' : '左'}の確認が少なめでした。両側を見るくせをつけましょう。`;
  return '今回は無事でしたが、左右をほとんど見ていませんでした。次は首を回して確かめましょう。';
}
