// The participant as a small, texture-free bear. One vertex-coloured material; static parts are
// merged per body group (torso, head) and every limb is a three-part chain (upper, lower, paw/foot)
// that can be posed by angle (walking) or by reaching for a point (handlebar, pedal).
// Body shape follows the menu: height scales the whole bear (the ears touch the height), weight
// sets the girth through the BMI, like the Unity ReplayMannequin.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const BEAR_EYE_HEIGHT = 0.785;               // normalized eye height of the standing bear
export const HIP_HEIGHT = 0.26;
const FOOT_HALF = 0.052;                            // half height of the foot: the sole touches y = 0
const COLOURS = {
  fur: 0xe0b47c, furShade: 0xc79a64, cream: 0xffe7c4, pad: 0xc98d70, blush: 0xeba091,
  ink: 0x2a3441, white: 0xfffdf6, scarf: 0x4ea596, scarfShade: 0x3c897d,
};

/** Girth factor from height and weight: 1 at BMI 21.5, clamped to a slender or a round bear. */
export function bearGirth(heightCm = 170, weightKg = 60) {
  const h = Math.max(0.9, Math.min(2.1, heightCm / 100));
  const bmi = Math.max(10, Math.min(200, weightKg)) / (h * h);
  return Math.max(0.82, Math.min(1.45, Math.sqrt(bmi / 21.5)));
}

/** Collects coloured shapes per group and turns them into one mesh per group. */
function shapeKit() {
  const parts = new Map(), matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  function add(group, colour, geometry, position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0]) {
    geometry.deleteAttribute('uv');
    const base = new THREE.Color(COLOURS[colour]), c = new THREE.Color(), pos = geometry.attributes.position;
    const colours = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      // a soft value change across the shape reads as painted fur, without a texture
      const shade = 0.035 * Math.sin(pos.getX(i) * 9.1 + pos.getY(i) * 7.3 + pos.getZ(i) * 5.7);
      c.copy(base).offsetHSL(0, 0, shade).toArray(colours, i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    geometry.applyMatrix4(matrix.compose(new THREE.Vector3(...position), q.setFromEuler(e.set(...rotation)), new THREE.Vector3(...scale)));
    if (!parts.has(group)) parts.set(group, []);
    parts.get(group).push(geometry);
  }
  function build(material, geometries) {
    for (const [group, list] of parts) {
      const geometry = mergeGeometries(list);
      list.forEach(g => g.dispose());
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      geometries.add(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = (group.name || 'Bear') + 'Mesh';
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
  return { add, build };
}

const ball = (w = 16, h = 12) => new THREE.SphereGeometry(1, w, h);
/** A tapering limb segment hanging down -y from its joint, rounded at both ends. */
function segment(length, top, bottom) {
  const points = [];
  for (let i = 4; i >= 0; i--) { const a = i * Math.PI / 8; points.push(new THREE.Vector2(Math.cos(a) * top, Math.sin(a) * top)); }
  for (let i = 0; i <= 4; i++) { const a = i * Math.PI / 8; points.push(new THREE.Vector2(Math.cos(a) * bottom, -length - Math.sin(a) * bottom)); }
  points[0].x = 0; points[points.length - 1].x = 0;
  return new THREE.LatheGeometry(points.reverse(), 10);
}

/**
 * options: weightKg; splitHead (head in its own group, for turning it); limbs: lengths for the arm
 * and leg chains (a riding bear needs a longer reach than a standing one).
 */
export function createReplayAnimal(heightCm = 170, { weightKg = 60, splitHead = false, limbs = {} } = {}) {
  const height = Math.max(0.9, Math.min(2.1, heightCm / 100));
  const girth = bearGirth(heightCm, weightKg), limb = 1 + (girth - 1) * 0.7;
  const arm = limbs.arm ?? [0.135, 0.125], leg = limbs.leg ?? [0.115, HIP_HEIGHT - 0.115 - FOOT_HALF];
  const root = new THREE.Group();
  root.name = 'ReplayBear';
  root.scale.setScalar(height);
  const pivot = new THREE.Group();
  pivot.name = 'BearPose';
  root.add(pivot);
  const material = new THREE.MeshLambertMaterial({ name: 'BearPigment', vertexColors: true });
  const geometries = new Set(), kit = shapeKit();

  // torso: a pear-shaped body, wider with weight; cream belly, tail, scarf
  const torso = new THREE.Group();
  torso.name = 'BearTorso';
  pivot.add(torso);
  const profile = [[0, 0.215], [0.13, 0.222], [0.19, 0.26], [0.212, 0.33], [0.205, 0.41], [0.18, 0.49], [0.14, 0.555], [0.08, 0.59], [0, 0.6]];
  kit.add(torso, 'fur', new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 20), [0, 0, 0], [girth, 1, girth * 0.92]);
  kit.add(torso, 'cream', ball(), [0, 0.36, 0.122 * girth], [0.13 * girth, 0.145, 0.085 * girth]);
  kit.add(torso, 'furShade', ball(10, 8), [0, 0.27, -0.19 * girth], [0.055, 0.055, 0.05]);
  kit.add(torso, 'scarf', new THREE.TorusGeometry(0.15, 0.034, 8, 20), [0, 0.575, 0], [girth * 0.95, girth * 0.9, 1], [Math.PI / 2, 0, 0]);
  kit.add(torso, 'scarfShade', ball(10, 8), [0.07, 0.55, 0.15 * girth], [0.045, 0.04, 0.035]);
  kit.add(torso, 'scarf', ball(10, 8), [0.085, 0.47, 0.16 * girth], [0.04, 0.085, 0.022], [0, 0, -0.15]);

  // head: round fur, muzzle, nose, eyes with highlights, ears with inner pads, cheeks
  const head = splitHead ? new THREE.Group() : torso;
  if (splitHead) { head.name = 'BearHead'; head.position.set(0, 0.6, 0); torso.add(head); }
  const hy = splitHead ? -0.6 : 0, H = (x, y, z) => [x, y + hy, z];
  const hs = 1 + (girth - 1) * 0.25;
  kit.add(head, 'fur', ball(20, 14), H(0, 0.75, 0.01), [0.262 * hs, 0.228, 0.245 * hs]);
  for (const side of [-1, 1]) {
    kit.add(head, 'fur', ball(12, 10), H(side * 0.19, 0.925, -0.01), [0.08, 0.075, 0.055]);
    kit.add(head, 'blush', ball(10, 8), H(side * 0.19, 0.925, 0.035), [0.047, 0.044, 0.02]);
    kit.add(head, 'ink', ball(12, 10), H(side * 0.092, BEAR_EYE_HEIGHT, 0.222 * hs), [0.026, 0.033, 0.018]);
    kit.add(head, 'white', ball(8, 6), H(side * 0.092 - 0.008, BEAR_EYE_HEIGHT + 0.011, 0.238 * hs), [0.008, 0.009, 0.004]);
    kit.add(head, 'blush', ball(10, 8), H(side * 0.16, 0.71, 0.2 * hs), [0.04, 0.022, 0.014]);
    kit.add(head, 'ink', new THREE.TorusGeometry(0.024, 0.0045, 4, 12, Math.PI), H(side * 0.024, 0.693, 0.268 * hs), [1, 1, 1], [0.25, 0, Math.PI]);
  }
  kit.add(head, 'cream', ball(16, 12), H(0, 0.708, 0.19 * hs), [0.122, 0.085, 0.085]);
  kit.add(head, 'ink', ball(12, 8), H(0, 0.735, 0.272 * hs), [0.04, 0.028, 0.026]);
  kit.add(head, 'white', ball(6, 4), H(-0.012, 0.745, 0.293 * hs), [0.01, 0.006, 0.004]);

  // limbs: chain groups limb (at the shoulder/hip) → lower (elbow/knee) → end (paw/foot)
  function chain(name, at, [a, b], [rTop, rMid, rEnd], endShape) {
    const top = new THREE.Group(); top.name = name; top.position.set(...at);
    const lower = new THREE.Group(); lower.name = name + 'Lower'; lower.position.y = -a; top.add(lower);
    const end = new THREE.Group(); end.name = name + 'End'; end.position.y = -b; lower.add(end);
    kit.add(top, 'fur', segment(a, rTop, rMid));
    kit.add(lower, 'fur', segment(b, rMid, rEnd));
    endShape(end);
    Object.assign(top, { lower, end, lengths: [a, b] });
    pivot.add(top);
    return top;
  }
  const arms = [], legs = [];
  for (const side of [-1, 1]) {
    const shoulder = [side * (0.15 * girth + 0.03), 0.535, 0.01];
    arms.push(chain(side < 0 ? 'BearLeftArm' : 'BearRightArm', shoulder, arm, [0.058 * limb, 0.05 * limb, 0.045 * limb], end => {
      kit.add(end, 'fur', ball(12, 10), [0, -0.02, 0.005], [0.058 * limb, 0.055, 0.056 * limb]);
      kit.add(end, 'pad', ball(10, 8), [0, -0.03, 0.045 * limb], [0.033, 0.03, 0.016]);
    }));
    const hip = [side * 0.095 * girth, HIP_HEIGHT, 0];
    legs.push(chain(side < 0 ? 'BearLeftLeg' : 'BearRightLeg', hip, leg, [0.074 * limb, 0.062 * limb, 0.048], end => {
      kit.add(end, 'fur', ball(14, 10), [0, 0, 0.03], [0.07 * limb, FOOT_HALF, 0.092]);
      kit.add(end, 'cream', ball(10, 8), [0, -0.012, 0.105], [0.045 * limb, 0.034, 0.018], [0.35, 0, 0]);
    }));
  }
  kit.build(material, geometries);

  // ---- posing
  const DOWN = new THREE.Vector3(0, -1, 0), FORWARD = new THREE.Vector3(0, 0, 1), q = new THREE.Quaternion(), e = new THREE.Euler();
  const _turn = new THREE.Quaternion();
  const dir = new THREE.Vector3(), bend = new THREE.Vector3(), joint = new THREE.Vector3(), local = new THREE.Vector3();
  /**
   * Reaches a limb for `target` (pivot space); `hint` is where the elbow/knee points. `levelEnd`
   * keeps a foot level (on a pedal); `palm` (pivot-space direction) turns a paw's pad that way
   * (onto a grip).
   */
  function reach(top, target, hint, levelEnd = false, palm = null) {
    const [a, b] = top.lengths, start = top.position;
    dir.subVectors(target, start);
    const length = Math.min(a + b - 1e-4, Math.max(Math.abs(a - b) + 1e-4, dir.length()));
    dir.normalize();
    const along = (a * a - b * b + length * length) / (2 * length);
    bend.copy(hint).addScaledVector(dir, -hint.dot(dir));
    if (bend.lengthSq() < 1e-8) bend.set(0, 0, 1).addScaledVector(dir, -dir.z);
    bend.normalize();
    joint.copy(start).addScaledVector(dir, along).addScaledVector(bend, Math.sqrt(Math.max(0, a * a - along * along)));
    top.quaternion.setFromUnitVectors(DOWN, local.subVectors(joint, start).normalize());
    local.copy(start).addScaledVector(dir, length).sub(joint).normalize().applyQuaternion(q.copy(top.quaternion).invert());
    top.lower.quaternion.setFromUnitVectors(DOWN, local);
    if (levelEnd || palm) {
      top.end.quaternion.copy(q.multiplyQuaternions(top.quaternion, top.lower.quaternion).invert());
      if (palm) top.end.quaternion.multiply(_turn.setFromUnitVectors(FORWARD, palm));
    } else top.end.quaternion.identity();
  }
  /** Walking by angles; `flail` (0..1) lifts and spreads the limbs (thrown by a car). */
  function pose(time, speed = 0, flail = 0) {
    const walking = Math.min(1, speed / 2.4) * (1 - flail);
    const stride = Math.sin(time * 9) * 0.38 * walking, wave = Math.sin(time * 17) * flail;
    legs.forEach((l, i) => {
      const side = i ? 1 : -1, s = i ? -stride : stride;
      l.quaternion.setFromEuler(e.set(s - flail * 0.55 - wave * 0.25 * side, 0, side * flail * 0.35));
      l.lower.rotation.set(Math.max(0, -s) * 0.9 + flail * 0.9, 0, 0);
      l.end.quaternion.identity();
    });
    arms.forEach((a, i) => {
      const side = i ? 1 : -1, s = i ? stride : -stride;
      a.quaternion.setFromEuler(e.set(s * 0.7 - flail * 1.6 - wave * 0.4 * side, 0, side * (0.14 + flail * 0.9)));
      a.lower.rotation.set(-0.15 - flail * 0.5, 0, 0);
      a.end.quaternion.identity();
    });
    pivot.position.y = Math.abs(Math.sin(time * 9)) * 0.012 * walking;
  }
  pose(0);
  let disposed = false;
  return { root, height, girth, arms, legs, pivot, torso, head, material, furMaterial: material, pose, reach,
    /** The middle of the body (pivot space): the bear tumbles around it. */
    centre: new THREE.Vector3(0, 0.45, 0),
    dispose() {
      if (disposed) return;
      geometries.forEach(g => g.dispose());
      material.dispose();
      disposed = true;
    },
  };
}
