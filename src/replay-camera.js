// Plan against the complete recording once, then interpolate a small, deterministic camera track.
// Visibility wins over composition; one continuous angle wins over changing sides of the road.
import * as THREE from 'three';

const STEP = 0.2, CHECK_STEP = 0.05, MARGIN = 0.76;
// Playback path: uniform samples, and smoothing widths in seconds of replay time.
const PATH_STEP = 1 / 30;
const SMOOTH = { focus: 0.3, turn: 0.55, boom: 0.6 }, SOFTEN_WIDTH = 0.4, WHIP_SPEED = 40;
const UP = new THREE.Vector3(0, 1, 0);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export class ReplayCamera {
  constructor(camera, ground, obstacles = null) {
    this.camera = camera;
    this.ground = ground;
    this.obstacles = obstacles;
    this.focus = new THREE.Vector3();
    this.offset = new THREE.Vector3();
    this.probe = new THREE.Vector3();
    this.ray = new THREE.Ray();
    this.hit = new THREE.Vector3();
    this.betweenTargets = Array.from({ length: 6 }, () => new THREE.Vector3());
    this.track = [];
    this.bottomInset = 0;
  }

  start(samples, impact, preferredAngle, reducedMotion = false) {
    this.samples = samples;
    this.impact = impact;
    this.preferred = preferredAngle;
    this.reducedMotion = reducedMotion;
    this.plan();
  }

  // A temporal envelope anticipates a turn and the thrown body. It also keeps distance changes
  // gradual when the accident car first enters the useful (32 m) part of the recording.
  compose() {
    return this.samples.map((sample, i, samples) => {
      const bounds = sample.bounds.clone();
      const focus = new THREE.Vector3();
      let weight = 0;
      for (let j = 0; j < samples.length; j++) {
        const dt = Math.abs(sample.t - samples[j].t);
        if (dt > 0.6) continue;
        const interval = ((samples[j + 1]?.t ?? samples[j].t) - (samples[j - 1]?.t ?? samples[j].t)) || STEP;
        const w = (1 - dt / 0.7) * interval;
        focus.addScaledVector(samples[j].bounds.getCenter(this.offset), w); weight += w;
        bounds.union(samples[j].bounds);
      }
      focus.divideScalar(weight);
      return { ...sample, bounds, focus };
    });
  }

  pose(shot, angle, pitch) {
    const direction = new THREE.Vector3(Math.sin(angle) * Math.cos(pitch), Math.sin(pitch), Math.cos(angle) * Math.cos(pitch));
    const right = new THREE.Vector3().crossVectors(UP, direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right);
    const tangent = Math.tan(this.camera.fov * Math.PI / 360);
    const vertical = tangent * MARGIN * (1 - this.bottomInset);
    const horizontal = tangent * MARGIN * this.camera.aspect;
    // Fit all eight corners in camera coordinates, including depth. A spherical fit would zoom
    // unnecessarily far out on a long road, especially in a portrait phone viewport.
    let distance = 12;
    const { min, max } = shot.bounds;
    for (let i = 0; i < 8; i++) {
      this.offset.set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z).sub(shot.focus);
      const depth = this.offset.dot(direction);
      distance = Math.max(distance, depth + Math.abs(this.offset.dot(right)) / horizontal,
        depth + Math.abs(this.offset.dot(up)) / vertical);
    }
    return { t: shot.t, angle, pitch, position: shot.focus.clone().addScaledVector(direction, distance), focus: shot.focus.clone() };
  }

  clear(position, targets, blockers = [], count = targets.length) {
    if (position.y < this.ground.heightAt(-position.x, position.z) + 1) return false;
    if (this.obstacles && !this.obstacles.cameraClear(position)) return false;
    // Each subject has three sight lines. A thin pole or the bonnet covering the feet must not
    // force a dramatic change of angle, while a roof hiding most of either subject must do so.
    for (let group = 0; group < count; group += 3) {
      let visible = 0;
      for (let j = group; j < Math.min(group + 3, count); j++) {
        const point = targets[j];
        if (this.obstacles && !this.obstacles.clear(position, point)) continue;
        this.offset.subVectors(point, position);
        const distance = this.offset.length();
        this.ray.set(position, this.offset.divideScalar(distance || 1));
        let blocked = false;
        for (const blocker of blockers) {
          if (j >= blocker.ignoreFrom || (Number.isFinite(blocker.ignoreFrom) && blocker.bounds.containsPoint(point))) continue;
          const hit = this.ray.intersectBox(blocker.bounds, this.hit);
          if (hit && position.distanceTo(hit) < distance - 0.4) { blocked = true; break; }
        }
        if (!blocked) visible++;
      }
      if (visible < Math.min(2, count - group)) return false;
    }
    return true;
  }

  edge(a, b, first, last) {
    // Check the actual translation, not a boom pivot: an orbit between two clear cameras can
    // otherwise take a shortcut through a roof. Camera endpoints also have near-plane clearance.
    const distance = a.position.distanceTo(b.position);
    const steps = Math.max(4, Math.ceil(distance / 0.6));
    if (this.obstacles && !this.obstacles.clear(a.position, b.position)) return false;
    for (let i = 1; i < steps; i++) {
      const u = i / steps;
      this.probe.lerpVectors(a.position, b.position, u);
      if (!this.clear(this.probe, first.targets, first.blockers) || !this.clear(this.probe, last.targets, last.blockers)) return false;
      if (first.targets.length === last.targets.length) {
        for (let j = 0; j < first.targets.length; j++) this.betweenTargets[j].lerpVectors(first.targets[j], last.targets[j], u);
        if (!this.clear(this.probe, this.betweenTargets, first.blockers, first.targets.length)) return false;
      }
    }
    return true;
  }

  plan() {
    if (!this.samples?.length) return;
    this.aspect = this.camera.aspect;
    const shots = this.compose();
    const all = new THREE.Box3();
    for (const shot of shots) all.union(shot.bounds);
    const stationary = { bounds: all, focus: all.getCenter(new THREE.Vector3()) };
    const candidates = [];
    for (const degrees of [48, 62, 75, 84]) for (const turn of [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180]) {
      const angle = this.preferred + turn * Math.PI / 180, pitch = degrees * Math.PI / 180;
      const fixed = this.reducedMotion ? this.pose(stationary, angle, pitch) : null;
      candidates.push({ angle, pitch, cost: Math.abs(turn) / 90 + (degrees - 48) / 12,
        poses: shots.map(shot => fixed ? { ...fixed, t: shot.t } : this.pose(shot, angle, pitch)) });
    }
    candidates.sort((a, b) => a.cost - b.cost);
    let chosen = null;
    // Prefer a single angle that sees the entire clip. Inspect contact first to reject unsuitable
    // rooftops cheaply; the complete path is still checked before accepting an angle.
    const order = shots.map((s, i) => i).sort((a, b) => Math.abs(shots[a].t - this.impact) - Math.abs(shots[b].t - this.impact));
    for (const candidate of candidates) {
      if (!order.every(i => this.clear(candidate.poses[i].position, shots[i].targets, shots[i].blockers))) continue;
      if (!shots.every((s, i) => !i || this.edge(candidate.poses[i - 1], candidate.poses[i], shots[i - 1], s))) continue;
      chosen = candidate.poses; break;
    }
    if (!chosen) chosen = this.route(shots, candidates);
    this.track = chosen;
    this.path = this.smoothPath(chosen, shots);
    this.frame(this.samples[0].t);
  }

  fits(pose, bounds) {
    const direction = new THREE.Vector3().subVectors(pose.position, pose.focus).normalize();
    const right = new THREE.Vector3().crossVectors(UP, direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right);
    const tangent = Math.tan(this.camera.fov * Math.PI / 360) * 0.82;
    for (let i = 0; i < 8; i++) {
      this.offset.set(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y,
        i & 4 ? bounds.max.z : bounds.min.z).sub(pose.position);
      const depth = -this.offset.dot(direction);
      if (depth < this.camera.near || Math.abs(this.offset.dot(right)) > depth * tangent * this.aspect
        || Math.abs(this.offset.dot(up)) > depth * tangent * (1 - this.bottomInset)) return false;
    }
    return true;
  }

  // The planned key poses become a continuous orbit: focus, heading, pitch and boom length are
  // resampled on a uniform clock and smoothed there (positions would cut chords across a turn).
  // The boom is dilated before smoothing, so the camera pulls back ahead of a widening shot and
  // returns slowly. Smoothing never crosses a cut; a smoothed path is re-validated at every key
  // pose and softened step by step only where that is needed to stay clear and framed.
  smoothPath(track, shots) {
    // A move that stays faster than a whip pan after local softening reads worse than an edit:
    // make it a clean cut (visibility still wins) and smooth both sides fully.
    for (let pass = 0; pass < 4; pass++) {
      const path = this.segmentsOf(track, shots);
      const whip = this.whip(path, track);
      if (whip < 0) return path;
      track[whip].cut = true;
    }
    return this.segmentsOf(track, shots);
  }

  /** Index of the first key reached by a smoothed move faster than WHIP_SPEED, or -1. */
  whip(path, track) {
    for (const segment of path) {
      for (let k = 1; k < segment.points.length; k++) {
        if (segment.points[k].position.distanceTo(segment.points[k - 1].position) <= WHIP_SPEED * segment.h) continue;
        const t = segment.t0 + k * segment.h;
        const i = track.findIndex(pose => pose.t >= t - 1e-9);
        return i > 0 ? i : -1;
      }
    }
    return -1;
  }

  segmentsOf(track, shots) {
    const segments = [];
    for (let i = 0; i < track.length; i++) if (!i || track[i].cut) segments.push([i, i]); else segments.at(-1)[1] = i;
    return segments.map(([first, last]) => {
      // Full smoothing everywhere; where a key pose fails, soften only around that moment.
      const t0 = track[first].t, t1 = track[last].t, n = Math.max(1, Math.ceil((t1 - t0) / PATH_STEP)) + 1;
      const h = n > 1 ? (t1 - t0) / (n - 1) : 0, strength = new Float32Array(n).fill(1);
      const soften = (times, factor) => {
        for (const time of times) for (let k = 0; k < n; k++)
          strength[k] *= 1 - factor * Math.exp(-0.5 * ((t0 + k * h - time) / SOFTEN_WIDTH) ** 2);
      };
      let segment = null;
      for (let attempt = 0; attempt < 8; attempt++) {
        segment = this.orbit(track, first, last, strength);
        const failed = this.failures(segment, track, shots, first, last);
        if (!failed.length) return segment;
        soften(failed, attempt < 7 ? 0.6 : 1);
      }
      return this.orbit(track, first, last, strength);
    });
  }

  orbit(track, first, last, strength) {
    const keys = track.slice(first, last + 1).map(pose => {
      this.offset.subVectors(pose.position, pose.focus);
      const length = this.offset.length() || 1;
      return { t: pose.t, focus: pose.focus, angle: Math.atan2(this.offset.x, this.offset.z),
        pitch: Math.asin(clamp(this.offset.y / length, -1, 1)), length };
    });
    for (let i = 1; i < keys.length; i++) keys[i].angle = keys[i - 1].angle + angleDelta(keys[i].angle, keys[i - 1].angle);
    const t0 = keys[0].t, t1 = keys.at(-1).t, n = Math.max(1, Math.ceil((t1 - t0) / PATH_STEP)) + 1;
    const h = n > 1 ? (t1 - t0) / (n - 1) : 0;
    const channels = { x: [], y: [], z: [], angle: [], pitch: [], length: [] };
    for (let k = 0, j = 0; k < n; k++) {
      const t = t0 + k * h;
      while (j + 1 < keys.length - 1 && keys[j + 1].t <= t) j++;
      const a = keys[j], b = keys[Math.min(j + 1, keys.length - 1)];
      const u = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 0;
      channels.x.push(a.focus.x + (b.focus.x - a.focus.x) * u);
      channels.y.push(a.focus.y + (b.focus.y - a.focus.y) * u);
      channels.z.push(a.focus.z + (b.focus.z - a.focus.z) * u);
      channels.angle.push(a.angle + (b.angle - a.angle) * u);
      channels.pitch.push(a.pitch + (b.pitch - a.pitch) * u);
      channels.length.push(a.length + (b.length - a.length) * u);
    }
    const widths = seconds => Array.from(strength, s => (h > 0 ? seconds * s / h : 0));
    const focusWidth = widths(SMOOTH.focus), turnWidth = widths(SMOOTH.turn), boomWidth = widths(SMOOTH.boom);
    for (const axis of ['x', 'y', 'z']) channels[axis] = gaussian(channels[axis], focusWidth);
    channels.angle = gaussian(channels.angle, turnWidth);
    channels.pitch = gaussian(channels.pitch, turnWidth);
    // Never closer than any shot needs within the kernel's reach, then a soft ease of that
    // envelope: dilating by the full (unsoftened) kernel radius keeps the eased boom at or above
    // every sample's need, so the final clamp is only a guard and adds no kink.
    const needed = channels.length.slice(), reach = h > 0 ? Math.ceil(3 * SMOOTH.boom / h) : 0;
    channels.length = gaussian(dilate(channels.length, reach), boomWidth)
      .map((length, k) => Math.max(length, needed[k]));
    const points = [];
    for (let k = 0; k < n; k++) {
      const focus = new THREE.Vector3(channels.x[k], channels.y[k], channels.z[k]);
      const c = Math.cos(channels.pitch[k]);
      const position = new THREE.Vector3(Math.sin(channels.angle[k]) * c, Math.sin(channels.pitch[k]),
        Math.cos(channels.angle[k]) * c).multiplyScalar(channels.length[k]).add(focus);
      points.push({ position, focus });
    }
    return { t0, t1, h, points };
  }

  /** Smoothed pose at a recorded key time (validation only; playback uses spline()). */
  at(segment, t) {
    const u = segment.h > 0 ? clamp((t - segment.t0) / segment.h, 0, segment.points.length - 1) : 0;
    const k = Math.min(Math.floor(u), segment.points.length - 1), f = u - k;
    const a = segment.points[k], b = segment.points[Math.min(k + 1, segment.points.length - 1)];
    return { t, position: a.position.clone().lerp(b.position, f), focus: a.focus.clone().lerp(b.focus, f) };
  }

  /** Key times where the smoothed path is blocked, unframed or crosses an obstacle. */
  failures(segment, track, shots, first, last) {
    const failed = [];
    let previous = null;
    for (let i = first; i <= last; i++) {
      const pose = this.at(segment, track[i].t);
      if (!this.clear(pose.position, shots[i].targets, shots[i].blockers) || !this.fits(pose, shots[i].bounds)) failed.push(pose.t);
      else if (previous && !this.edge(previous, pose, shots[i - 1], shots[i])) failed.push(previous.t, pose.t);
      previous = pose;
    }
    return failed;
  }

  route(shots, candidates) {
    // Whole-clip dynamic programming discourages oscillation and anticipates blind corners.
    // A cut is a last resort when there is no collision-free, visible continuous connection.
    const layers = [];
    for (let i = 0; i < shots.length; i++) {
      const layer = candidates.map(c => ({ ...c.poses[i], cost: Infinity, previous: -1, cut: false }));
      for (let j = 0; j < layer.length; j++) {
        const node = layer[j];
        if (!this.clear(node.position, shots[i].targets, shots[i].blockers)) continue;
        const local = candidates[j].cost * (this.reducedMotion ? 0.015 : 0.04);
        if (!i) { node.cost = local; continue; }
        const previous = layers[i - 1];
        // First try holding the angle, then small changes. Long moves are expensive and cuts
        // during the contact window carry an additional penalty.
        for (let k = 0; k < previous.length; k++) {
          const from = previous[k];
          if (!Number.isFinite(from.cost)) continue;
          const turn = Math.abs(angleDelta(from.angle, node.angle));
          const lift = Math.abs(from.pitch - node.pitch);
          const move = from.position.distanceTo(node.position);
          // Per second, not per sample: around contact the keys are 4x denser, and a turn there
          // would otherwise cost as little as one spread over the slower approach.
          const pace = STEP / Math.max(CHECK_STEP, shots[i].t - shots[i - 1].t);
          const change = (turn * 16 + lift * 24 + move * 0.1) * pace * (this.reducedMotion ? 3 : 1);
          const base = from.cost + local + change;
          if (base >= node.cost) continue;
          const continuous = turn < 0.6 && lift < 0.3 && move < 7 && this.edge(from, node, shots[i - 1], shots[i]);
          const cost = base + (continuous ? 0 : 1000 + (Math.abs(shots[i].t - this.impact) < 1 ? 4000 : 0));
          if (cost < node.cost) { node.cost = cost; node.previous = k; node.cut = !continuous; }
        }
      }
      // Completely enclosed subjects cannot be made visible without changing the scene. Keep a
      // valid camera above the local ground and let later samples recover instead of crashing.
      if (!layer.some(n => Number.isFinite(n.cost))) {
        const previous = i ? layers[i - 1] : null;
        const k = previous ? previous.reduce((best, n, index, all) => n.cost < all[best].cost ? index : best, 0) : -1;
        const from = previous?.[k];
        // Keep the previous angle through an unobservable interval rather than cutting on every
        // sample. The rest of the clip must still play, including custom recordings under cover.
        const j = from ? k : 0, fallback = layer[j];
        this.obstacles?.liftOut?.(fallback.position);
        fallback.position.y = Math.max(fallback.position.y, this.ground.heightAt(-fallback.position.x, fallback.position.z) + 1);
        fallback.cost = (from?.cost ?? 0) + 10000;
        fallback.previous = k;
        fallback.cut = !!from && !!this.obstacles && !this.obstacles.clear(from.position, fallback.position);
      }
      layers.push(layer);
    }
    let j = layers.at(-1).reduce((best, n, k, all) => n.cost < all[best].cost ? k : best, 0);
    const track = new Array(layers.length);
    for (let i = layers.length - 1; i >= 0; i--) { track[i] = layers[i][j]; j = track[i].previous; }
    return track;
  }

  frame(t) {
    if (!this.track.length) return;
    if (this.aspect !== this.camera.aspect) this.plan();
    // Before a cut the previous segment holds its last pose, as a cut would in an edit.
    let segment = this.path[0];
    for (const candidate of this.path) if (t >= candidate.t0) segment = candidate;
    this.spline(segment, t, this.camera.position, this.focus);
    this.camera.lookAt(this.focus);
    this.camera.updateMatrixWorld();
  }

  /** Centripetal-free uniform Catmull-Rom between path samples: continuous velocity. */
  spline(segment, t, position, focus) {
    const points = segment.points, last = points.length - 1;
    const u = segment.h > 0 ? clamp((t - segment.t0) / segment.h, 0, last) : 0;
    const k = Math.min(Math.floor(u), Math.max(0, last - 1)), f = u - k;
    const p0 = points[Math.max(0, k - 1)], p1 = points[k], p2 = points[Math.min(last, k + 1)], p3 = points[Math.min(last, k + 2)];
    catmullRom(position, p0.position, p1.position, p2.position, p3.position, f);
    catmullRom(focus, p0.focus, p1.focus, p2.focus, p3.focus, f);
  }
}

function catmullRom(out, a, b, c, d, f) {
  const f2 = f * f, f3 = f2 * f;
  const wa = -0.5 * f3 + f2 - 0.5 * f, wb = 1.5 * f3 - 2.5 * f2 + 1;
  const wc = -1.5 * f3 + 2 * f2 + 0.5 * f, wd = 0.5 * f3 - 0.5 * f2;
  return out.set(a.x * wa + b.x * wb + c.x * wc + d.x * wd, a.y * wa + b.y * wb + c.y * wc + d.y * wd,
    a.z * wa + b.z * wb + c.z * wc + d.z * wd);
}

/**
 * Truncated, renormalized Gaussian blur of a uniformly sampled channel. `sigmas` gives each
 * output sample its own width (in samples), so smoothing can soften locally around a tight spot.
 */
function gaussian(values, sigmas) {
  return values.map((value, i) => {
    const sigma = sigmas[i];
    if (!(sigma > 0.25)) return value;
    const radius = Math.ceil(sigma * 3);
    let sum = 0, weight = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(values.length - 1, i + radius); j++) {
      const w = Math.exp(-0.5 * ((j - i) / sigma) ** 2);
      sum += values[j] * w; weight += w;
    }
    return sum / weight;
  });
}

/** Running maximum over ±radius samples: the boom never shortens before a wider shot needs it. */
function dilate(values, r) {
  return values.map((value, i) => {
    let max = value;
    for (let j = Math.max(0, i - r); j <= Math.min(values.length - 1, i + r); j++) max = Math.max(max, values[j]);
    return max;
  });
}

export function replaySampleTimes(start, end, impact) {
  const contact = clamp(impact, start, end);
  const times = new Set([start, end, contact]);
  for (let t = start; t < end; t += STEP) times.add(Math.min(end, Math.round(t * 1e6) / 1e6));
  // Dense checks around contact also cover a fast car crossing a thin foreground obstruction.
  for (let t = Math.max(start, impact - 1); t < Math.min(end, impact + 0.8); t += CHECK_STEP) times.add(Math.round(t * 1e6) / 1e6);
  const unique = [];
  for (const t of [...times].sort((a, b) => a - b)) {
    if (unique.length && t - unique.at(-1) < 1e-4) {
      if (t === start || t === end || t === contact) unique[unique.length - 1] = t;
    } else unique.push(t);
  }
  return unique;
}
