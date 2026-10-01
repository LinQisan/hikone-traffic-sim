// The inside of the accident car for the replay's driver view, built to the car's size. Right-hand
// drive: the driver sits 0.37 m right of the centre line. Everything is laid out in the car's own
// frame (Unity: x right, y up, z forward; three: x mirrored), so the cockpit moves with the car.
import * as THREE from 'three';
import { painted } from './style.js';

/**
 * Per body: bonnet length (m), height of the windscreen base, windscreen rake (horizontal run),
 * nose drop of the bonnet and the driver's eye height. Kei cars have a short, steep nose and an
 * upright windscreen; the tall kei car seats the driver higher.
 */
const LAYOUT = {
  sedan: { hood: 1.25, cowl: 0.88, run: 0.8, drop: 0.1, eye: 1.14 },
  'kei-tall': { hood: 0.6, cowl: 0.98, run: 0.6, drop: 0.2, eye: 1.36 },
  'kei-hatch': { hood: 0.65, cowl: 0.9, run: 0.7, drop: 0.18, eye: 1.18 },
};
export const DRIVER_RIGHT = 0.37;

/** Car-frame positions (Unity axes, metres from the car's centre on the ground). */
export function cockpitLayout(body, [width, height, length]) {
  const L = LAYOUT[body] ?? LAYOUT.sedan;
  const cowlF = length / 2 - L.hood, roofF = cowlF - L.run, roofH = height - 0.06, half = width / 2 - 0.08;
  return { ...L, cowlF, roofF, roofH, half, length,
    eye: { right: DRIVER_RIGHT, up: L.eye, forward: roofF - 0.42 } };
}

export function buildCockpit(body, size, paint = [0.8, 0.8, 0.8]) {
  const c = cockpitLayout(body, size);
  const root = new THREE.Group();
  root.name = 'DriverCockpit';
  root.visible = false;
  const material = (name, color) => painted(new THREE.MeshLambertMaterial({ name, color }));
  const m = {
    paint: material('HK_KeiPaint', new THREE.Color().setRGB(...paint, THREE.SRGBColorSpace)),
    dash: material('CockpitDash', 0x343c48), trim: material('CockpitTrim', 0x262d38),
    lining: material('CockpitLining', 0xc9c1b2), glass: material('CockpitMirror', 0x8fa3b8),
  };
  const geometries = [];
  const P = (right, up, forward) => new THREE.Vector3(-right, up, forward);   // car frame → three local
  const add = (geometry, mat, position = new THREE.Vector3(), quaternion = null) => {
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.copy(position);
    if (quaternion) mesh.quaternion.copy(quaternion);
    mesh.castShadow = false; mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const beam = (a, b, thickness, mat) => {
    const d = new THREE.Vector3().subVectors(b, a);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    return add(new THREE.BoxGeometry(thickness, d.length(), thickness), mat, a.clone().add(b).multiplyScalar(0.5), q);
  };

  // bonnet: a crowned surface from the windscreen base to the nose, sloping down towards the front
  const cols = 12, rows = 8, positions = [], index = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
    const u = i / cols * 2 - 1, v = j / rows;
    const crown = 0.035 * (1 - u * u), edge = Math.max(0, Math.abs(u) - 0.85) * 0.5;
    positions.push(...P(u * (c.half + 0.02), c.cowl + crown - edge - c.drop * Math.pow(v, 1.6) - 0.06 * Math.pow(v, 8), c.cowlF + c.hood * v).toArray());
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = j * (cols + 1) + i, b = a + 1, d = a + cols + 1, e = d + 1;
    index.push(a, d, b, b, d, e);
  }
  const hood = new THREE.BufferGeometry();
  hood.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  hood.setIndex(index);
  hood.computeVertexNormals();
  if (hood.attributes.normal.getY(0) < 0) { index.reverse(); hood.setIndex(index); hood.computeVertexNormals(); }
  add(hood, m.paint);

  // dashboard from the windscreen base back towards the driver, with the instrument hood
  const dashBack = c.eye.forward + 0.5;
  add(new THREE.BoxGeometry(c.half * 2, 0.32, c.cowlF - dashBack), m.dash, P(0, c.cowl - 0.15, (c.cowlF + dashBack) / 2));
  add(new THREE.BoxGeometry(0.42, 0.07, 0.22), m.trim, P(DRIVER_RIGHT, c.cowl + 0.035, dashBack + 0.14));
  // doors: the lower edges of the side windows
  for (const side of [-1, 1]) add(new THREE.BoxGeometry(0.1, 0.06, c.cowlF - c.eye.forward + 0.7), m.trim,
    P(side * (c.half + 0.02), c.cowl + 0.04, (c.cowlF + c.eye.forward - 0.7) / 2));
  // A-pillars: from the windscreen base up and back to the roof
  for (const side of [-1, 1]) beam(P(side * c.half, c.cowl, c.cowlF), P(side * (c.half - 0.06), c.roofH, c.roofF), 0.085, m.trim);
  // roof lining with the header bar above the windscreen, and the rear-view mirror at the centre
  add(new THREE.BoxGeometry(c.half * 2, 0.03, 1.4), m.lining, P(0, c.roofH, c.roofF - 0.7));
  add(new THREE.BoxGeometry(c.half * 2, 0.07, 0.09), m.trim, P(0, c.roofH - 0.025, c.roofF));
  // the mirror hangs from the top of the windscreen, about 0.6 m ahead of the eyes
  const glassAt = h => c.roofF + (c.cowlF - c.roofF) * (c.roofH - h) / (c.roofH - c.cowl);   // forward of the glass at height h
  const mirrorH = c.roofH - 0.13, mirrorF = glassAt(mirrorH) - 0.06;
  beam(P(0, c.roofH - 0.02, glassAt(c.roofH - 0.02)), P(0, mirrorH + 0.03, mirrorF + 0.02), 0.022, m.trim);
  add(new THREE.BoxGeometry(0.22, 0.065, 0.03), m.trim, P(0, mirrorH, mirrorF));
  add(new THREE.BoxGeometry(0.2, 0.048, 0.01), m.glass, P(0, mirrorH, mirrorF - 0.018));
  // steering wheel in front of the driver, its top tilted away
  const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.45, 0, 0));
  const wheelCentre = P(DRIVER_RIGHT, c.eye.up - 0.36, c.eye.forward + 0.46);
  add(new THREE.TorusGeometry(0.18, 0.024, 8, 32), m.trim, wheelCentre, tilt);
  add(new THREE.CylinderGeometry(0.045, 0.06, 0.05, 16), m.dash, wheelCentre.clone().add(new THREE.Vector3(0, 0, 0.02).applyQuaternion(tilt)),
    tilt.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0))));
  for (const a of [Math.PI / 2 + 0.6, Math.PI / 2 - 0.6, -Math.PI / 2]) {
    const end = new THREE.Vector3(Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0).applyQuaternion(tilt).add(wheelCentre);
    beam(wheelCentre, end, 0.022, m.trim);
  }
  return {
    root, layout: c,
    dispose() { geometries.forEach(g => g.dispose()); Object.values(m).forEach(x => x.dispose()); },
  };
}
