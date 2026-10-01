// The same bear in a seated riding pose; its limb chains reach for the handlebar grips and the
// pedals, so hands and feet move with the bicycle.
import * as THREE from 'three';
import { createReplayAnimal, BEAR_EYE_HEIGHT } from './replay-animal.js';
import { createBicycle } from './bicycle.js';
import { deltaYaw, yawTo } from './analysis.js';

/** Body heading comes from travel; head yaw remains the recorded traffic check. */
export function ridingTrack(headTrack, impact = Infinity) {
  let distance = 0, yaw = headTrack[0]?.rideYaw ?? headTrack[0]?.yaw ?? 0;
  return headTrack.map((h, i) => {
    const before = headTrack[Math.max(0, i - 1)], after = headTrack[Math.min(headTrack.length - 1, i + 1)];
    if (h.t <= impact && Math.hypot(after.x - before.x, after.z - before.z) > 0.005)
      yaw = yawTo(before.x, before.z, after.x, after.z);
    if (Number.isFinite(h.rideYaw)) yaw = h.rideYaw;
    if (i && h.t <= impact) distance += Math.hypot(h.x - before.x, h.z - before.z);
    return { t: h.t, yaw, distance };
  });
}

export function sampleRide(track, t) {
  for (let i = 1; i < track.length; i++) if (t <= track[i].t) {
    const a = track[i - 1], b = track[i], f = Math.max(0, (t - a.t) / Math.max(1e-6, b.t - a.t));
    return { yaw: a.yaw + deltaYaw(a.yaw, b.yaw) * f, distance: a.distance + (b.distance - a.distance) * f };
  }
  return track.at(-1);
}

/**
 * The bear seated on the city bicycle. Rider and bicycle are separate groups (`rider`, `bike`) so a
 * crash can throw them apart; the limbs reach for the grips and the pedals every frame.
 * `firstPerson` hides the head (the camera sits there) for the live riding view.
 */
const TWIST = 0.45, HEAD_TURN = 1.5;      // radians: body twist with hands on the bar, then the neck
const GRIP_PALM = new THREE.Vector3(0, -0.85, -0.5).normalize();   // pads down and back, round the grip

export function createReplayCyclist(heightCm = 170, { weightKg = 60, firstPerson = false } = {}) {
  const bear = createReplayAnimal(heightCm, { weightKg, splitHead: true, limbs: { arm: [0.232, 0.222], leg: [0.215, 0.205] } });
  const { root, pivot: rider, torso, head, height } = bear;
  root.name = 'ReplayCyclist';
  rider.name = 'Rider';
  const frame = new THREE.Group();                       // follows the tyre's flat edge
  frame.name = 'CyclistFrame';
  root.add(frame);
  rider.removeFromParent();
  frame.add(rider);
  const bicycle = createBicycle();
  frame.add(bicycle.root);
  // seat the torso on the saddle, leaning forward
  torso.scale.setScalar(0.8);
  torso.rotation.x = 0.2;
  torso.position.set(0, bicycle.saddle.y + 0.03 - 0.215 * 0.8, bicycle.saddle.z - 0.02);
  torso.updateMatrix();
  // hips stay on the saddle; shoulders follow the upper body when it twists to look back
  const shoulders = bear.arms.map(a => a.position.clone());
  for (const leg of bear.legs) leg.position.applyMatrix4(torso.matrix);
  for (const arm of bear.arms) arm.position.applyMatrix4(torso.matrix);
  // first person: the camera is in the head and the belly would hide the pedalling legs
  if (firstPerson) torso.visible = false;
  const eye = new THREE.Vector3(0, BEAR_EYE_HEIGHT, 0.22).applyMatrix4(torso.matrix);
  // first person: a little behind and above the bear's eyes, so the paws and the handlebar sit in
  // the lower part of the view as on a real bicycle instead of filling it
  if (firstPerson) eye.add(new THREE.Vector3(0, 0.04, -0.16));
  const target = new THREE.Vector3(), flailTarget = new THREE.Vector3(), _slack = new THREE.Vector3();
  const elbowHints = [-1, 1].map(side => new THREE.Vector3(side * 0.8, -0.4, -0.4));
  const kneeHint = new THREE.Vector3(0, 0.2, 1);
  /** `thrown`: after contact the paws and feet leave the bicycle (flailing, then slack along the body). */
  function pose(time, speed = 0, flail = 0, distance = 0, lookYaw = 0, thrown = false) {
    bicycle.pose(distance / height);
    // looking round: the upper body twists up to ~26°, the head turns the rest (up to ~86°)
    const twist = Math.max(-TWIST, Math.min(TWIST, lookYaw * 0.45));
    torso.rotation.set(0.2, twist, 0);
    torso.updateMatrix();
    bear.arms.forEach((arm, i) => arm.position.copy(shoulders[i]).applyMatrix4(torso.matrix));
    head.rotation.y = Math.max(-HEAD_TURN, Math.min(HEAD_TURN, lookYaw - twist));
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1, arm = bear.arms[i], leg = bear.legs[i];
      if (thrown) target.copy(arm.position).add(_slack.set(side * 0.08, -0.3, 0.06));
      else target.copy(bicycle.grips[i]);
      if (flail > 0) target.lerp(flailTarget.copy(arm.position).add(_slack.set(side * 0.22, 0.12 + 0.05 * Math.sin(time * 17 + i), 0.12)), flail);
      bear.reach(arm, target, elbowHints[i], false, thrown ? null : GRIP_PALM);
      if (thrown) target.copy(leg.position).add(_slack.set(side * 0.05, -0.36, 0.14));
      else { target.copy(bicycle.feet[i]); target.y += 0.052; }
      if (flail > 0) target.lerp(flailTarget.copy(leg.position).add(_slack.set(side * 0.16, -0.25, 0.18 + 0.06 * Math.sin(time * 15 + i))), flail);
      bear.reach(leg, target, kneeHint, true);
    }
    frame.position.y = -bicycle.floorOffset;
  }
  pose(0);
  let disposed = false;
  return { ...bear, root, rider, bike: bicycle.root, bicycle, eyeHeight: eye.y, eye, pose,
    /** Centres the crash turns the rider and the bicycle around (in their parent's space). */
    riderCentre: new THREE.Vector3(0, 0.62, -0.1), bikeCentre: new THREE.Vector3(0, 0.3, 0),
    /** World position of a paw (0 left, 1 right) or a sole, for checks. */
    pawWorld(i, out = new THREE.Vector3()) { return bear.arms[i].end.getWorldPosition(out); },
    soleWorld(i, out = new THREE.Vector3()) { return bear.legs[i].end.localToWorld(out.set(0, -0.052, 0)); },
    dispose() {
      if (disposed) return;
      bicycle.dispose(); bear.dispose(); disposed = true;
    },
  };
}
