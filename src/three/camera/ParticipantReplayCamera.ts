import * as THREE from 'three';
import type {HeadFrame} from '../../types/simulation.ts';
import {deltaYaw} from '../../simulation/metrics/analysis.ts';
import {toThree} from '../scene/coords.ts';

type HeadSample = HeadFrame & {t: number};
const mix = THREE.MathUtils.lerp;

/** Recorded eyes, including independent head turns, bicycle offsets and the fall after contact. */
export class ParticipantReplayCamera extends THREE.PerspectiveCamera {
  reducedMotion = false;
  constructor() { super(70, 16 / 9, 0.05, 900); }

  place(track: HeadSample[], time: number, ground: {heightAt(x: number, z: number): number}, eyeHeight: number) {
    if (!track.length) return;
    let lo = 0, hi = track.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (track[mid].t < time) lo = mid + 1; else hi = mid;
    }
    const b = track[lo], a = track[Math.max(0, lo - 1)];
    const f = THREE.MathUtils.clamp((time - a.t) / Math.max(1e-6, b.t - a.t), 0, 1);
    const x = mix(a.eyeX ?? a.x, b.eyeX ?? b.x, f), z = mix(a.eyeZ ?? a.z, b.eyeZ ?? b.z, f);
    const y = mix(a.y ?? ground.heightAt(a.x, a.z) + eyeHeight, b.y ?? ground.heightAt(b.x, b.z) + eyeHeight, f);
    toThree(x, y, z, this.position);
    this.rotation.set(mix(a.pitch ?? 0, b.pitch ?? 0, f) * Math.PI / 180,
      Math.PI - (a.yaw + deltaYaw(a.yaw, b.yaw) * f) * Math.PI / 180,
      this.reducedMotion ? 0 : mix(a.roll ?? 0, b.roll ?? 0, f) * Math.PI / 180, 'YXZ');
  }
}
