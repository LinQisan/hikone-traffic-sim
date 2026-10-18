// Plan against the complete recording once, then interpolate a small, deterministic camera track.
// Visibility wins over composition; one continuous angle wins over changing sides of the road.
import * as THREE from 'three';

const STEP = 0.2, CHECK_STEP = 0.05, MARGIN = 0.76;
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
    this.track = this.stabilize(chosen, shots);
    this.index = 0;
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

  stabilize(track, shots) {
    // Ease changes in velocity and zoom with anticipation, then validate the smoothed path again.
    // Never smooth across a necessary cut, nor accept an ease that clips a roof or a subject.
    for (const radius of [0.8, 0.4, 0.2]) {
      const eased = track.map((pose, i) => {
        const position = new THREE.Vector3(), focus = new THREE.Vector3();
        let weight = 0;
        for (let j = i; j >= 0 && pose.t - track[j].t <= radius; j--) {
          if (j < i && track[j + 1].cut) break;
          const w = 1 - (pose.t - track[j].t) / (radius + 0.01);
          position.addScaledVector(track[j].position, w); focus.addScaledVector(track[j].focus, w); weight += w;
        }
        for (let j = i + 1; j < track.length && track[j].t - pose.t <= radius && !track[j].cut; j++) {
          const w = 1 - (track[j].t - pose.t) / (radius + 0.01);
          position.addScaledVector(track[j].position, w); focus.addScaledVector(track[j].focus, w); weight += w;
        }
        return { ...pose, position: position.divideScalar(weight), focus: focus.divideScalar(weight) };
      });
      if (!eased.every((p, i) => this.clear(p.position, shots[i].targets, shots[i].blockers) && this.fits(p, shots[i].bounds))) continue;
      if (!eased.every((p, i) => !i || p.cut || this.edge(eased[i - 1], p, shots[i - 1], shots[i]))) continue;
      return eased;
    }
    return track;
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
          const change = (turn * 16 + lift * 24 + move * 0.1) * (this.reducedMotion ? 3 : 1);
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
    let i = this.index;
    if (t < this.track[i].t) i = 0;
    while (i + 1 < this.track.length && t >= this.track[i + 1].t) i++;
    this.index = i;
    const a = this.track[i], b = this.track[Math.min(i + 1, this.track.length - 1)];
    const u = b.t > a.t && !b.cut ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 0;
    this.camera.position.lerpVectors(a.position, b.position, u);
    this.focus.lerpVectors(a.focus, b.focus, u);
    this.camera.lookAt(this.focus);
    this.camera.updateMatrixWorld();
  }
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
