// A soft shadow pool under things that move (cars, bicycles, the replay figure). They do not cast
// into the sun's shadow map: that map holds only the still town and is redrawn when the view
// re-centres, not 10 times a second whenever a car passes (those redraws made the frame pacing
// uneven). One shared geometry, texture and material; one small transparent draw per object.
import * as THREE from 'three';

let shared = null;
function parts() {
  if (shared) return shared;
  // a soft round falloff (no canvas: also runs under node:test)
  const size = 64, data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const r = Math.min(1, Math.hypot((i + 0.5) / size * 2 - 1, (j + 0.5) / size * 2 - 1));
    const a = r < 0.55 ? 1 - 0.25 * r / 0.55 : 0.75 * (1 - (r - 0.55) / 0.45) ** 2;
    data.set([255, 255, 255, Math.round(255 * a)], (j * size + i) * 4);
  }
  const map = new THREE.DataTexture(data, size, size);
  map.magFilter = map.minFilter = THREE.LinearFilter;
  map.needsUpdate = true;
  const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ map, color: 0x141c34, transparent: true, opacity: 0.75,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  material.name = 'BlobShadow';
  shared = { geometry, material };
  return shared;
}

/** A shadow pool of `width` × `length` metres (local x × z), lying just above the ground. */
export function blobShadow(width, length) {
  const { geometry, material } = parts();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'BlobShadow';
  mesh.matrixWorldAutoUpdate = true;
  mesh.scale.set(width, 1, length);
  mesh.position.y = 0.03;
  mesh.renderOrder = 1;
  mesh.userData.shared = true;           // geometry and material are shared: never dispose them
  return mesh;
}

// Where a shadow falls from the sun, per metre of height (three.js world x, z); set from the
// scene's light once (setSunDirection), like the town's real shadows.
const sunShift = new THREE.Vector3();
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

/** `direction`: the sun light's travel direction in Unity coordinates (scene.json light.direction). */
export function setSunDirection(direction) {
  const [x, y, z] = direction;
  if (y >= -0.05) { sunShift.set(0, 0, 0); return; }
  sunShift.set(-x / -y, 0, z / -y);                      // Unity → three: mirror x
}

/** Stop an object casting into the shadow map and give it a shadow pool instead. `height`: the
 * height of the object's middle (m), which sets how far the pool lies from it on the shadow side. */
export function withBlobShadow(object, width, length, height = 0.6) {
  object.traverse(o => { if (o.isMesh) o.castShadow = false; });
  const pool = blobShadow(width, length);
  pool.userData.height = height;
  object.add(pool);
  object.userData.blob = pool;
  return object;
}

/** Keep the pool on the sun's side as the object turns (call after placing it). */
export function alignBlobShadow(object) {
  const pool = object.userData.blob;
  if (!pool) return;
  object.updateWorldMatrix(true, false);
  object.matrixWorld.decompose(_v, _q, _v);
  const scale = _v.x || 1; // decompose already wrote the world scale; avoid a second hierarchy update.
  pool.position.copy(sunShift).multiplyScalar(pool.userData.height / scale).applyQuaternion(_q.invert());
  pool.position.y = 0.03 / scale;
}

/** Shared by actors: release only when the entire engine unmounts. */
export function resetBlobShadow() {if (!shared) return; shared.geometry.dispose(); shared.material.map.dispose(); shared.material.dispose(); shared = null;}
