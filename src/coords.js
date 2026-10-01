// Unity (left-handed, y up) → three.js (right-handed, y up): mirror x. The models are exported with
// the same mirror (tools/export_models.py), so placements and meshes agree. Unity yaw (degrees,
// clockwise from above, 0 = +z) becomes rotation.y = -yaw.
import * as THREE from 'three';

export const toThree = (x, y, z, out = new THREE.Vector3()) => out.set(-x, y, z);
export const yawToThree = yawDeg => -yawDeg * Math.PI / 180;

/** Unity yaw (degrees) of a three.js direction projected on the ground. */
export const unityYaw = dir => Math.atan2(-dir.x, dir.z) * 180 / Math.PI;

const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3();
export function placement(x, y, z, yawDeg, scale = [1, 1, 1], out = new THREE.Matrix4()) {
  q.setFromAxisAngle(up, yawToThree(yawDeg));
  return out.compose(toThree(x, y, z, p), q, s.set(scale[0], scale[1], scale[2]));
}
