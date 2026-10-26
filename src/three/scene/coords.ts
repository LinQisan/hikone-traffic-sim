
// Unity (left-handed, y up) → three.js (right-handed, y up): mirror x. Native model construction uses
// this same conversion (model-builder.js), so placements and meshes agree. Unity yaw (degrees,
// clockwise from above, 0 = +z) becomes rotation.y = -yaw.
import * as THREE from 'three';

export const toThree = (x: number, y: number, z: number, out = new THREE.Vector3()) => out.set(-x, y, z);
export const yawToThree = (yawDeg: number) => -yawDeg * Math.PI / 180;

const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3();
export function placement(x: number, y: number, z: number, yawDeg: number, scale = [1, 1, 1], out = new THREE.Matrix4()) {
  q.setFromAxisAngle(up, yawToThree(yawDeg));
  return out.compose(toThree(x, y, z, p), q, s.set(scale[0], scale[1], scale[2]));
}
