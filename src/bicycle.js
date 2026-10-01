// A closed, texture-free city bicycle. Broad mint/ochre pigment faces are part of
// the geometry; wheels, crank and pedals are the only moving meshes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const WHEEL_RADIUS = 0.205;
export const CRANK_RADIUS = 0.09;
export const SADDLE = new THREE.Vector3(0, 0.465, -0.18);
export const GRIPS = [-1, 1].map(side => new THREE.Vector3(side * 0.22, 0.76, 0.255));
const REAR = -0.34, FRONT = 0.39, CRANK = new THREE.Vector3(0, 0.225, -0.035);

export function createBicycle() {
  const root = new THREE.Group();
  root.name = 'CityBicycle';
  const material = new THREE.MeshLambertMaterial({ name: 'BicyclePigment', vertexColors: true });
  const geometries = new Set(), batches = new Map();
  const palette = { mint: 0x65ad9d, light: 0xc2d5b3, ink: 0x34495b, rubber: 0x3d4753,
    cream: 0xe8d6ae, ochre: 0xdab36b, saddle: 0x986949, red: 0xbd725e };
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  function part(group, geometry, colour, position, scale = [1, 1, 1], rotation = [0, 0, 0]) {
    // Slightly broken, flat colour planes stay visible without a shader/filter.
    const g = geometry.toNonIndexed();
    geometry.dispose();
    g.deleteAttribute('uv');
    const colors = new Float32Array(g.attributes.position.count * 3);
    const base = new THREE.Color(palette[colour]), dab = new THREE.Color();
    for (let i = 0; i < g.attributes.position.count; i += 3) {
      const shade = Math.sin(i * 1.73 + position[1] * 11) * 0.055;
      dab.copy(base).offsetHSL(shade * 0.2, 0, shade);
      for (let v = 0; v < 3; v++) dab.toArray(colors, (i + v) * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    matrix.compose(new THREE.Vector3(...position), quaternion.setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale));
    g.applyMatrix4(matrix);
    if (!batches.has(group)) batches.set(group, []);
    batches.get(group).push(g);
  }
  function tube(group, a, b, radius, colour) {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), d = to.clone().sub(from);
    const rotation = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(up, d.clone().normalize()));
    part(group, new THREE.CylinderGeometry(radius, radius, d.length(), 8, 1, false), colour,
      from.add(to).multiplyScalar(0.5).toArray(), [1, 1, 1], rotation.toArray().slice(0, 3));
  }
  function ball(group, p, scale, colour) {
    part(group, new THREE.SphereGeometry(1, 10, 6), colour, p, scale);
  }
  const bb = CRANK.toArray(), seat = [0, 0.43, -0.18], head = [0, 0.53, 0.26];
  tube(root, bb, seat, 0.026, 'mint');
  tube(root, bb, [0, 0.35, 0.315], 0.029, 'mint');
  tube(root, seat, head, 0.025, 'light');
  tube(root, head, [0, 0.35, 0.315], 0.027, 'mint');
  tube(root, seat, SADDLE.toArray(), 0.018, 'ink');
  for (const side of [-1, 1]) {
    const axle = [side * 0.037, WHEEL_RADIUS, REAR];
    tube(root, bb, axle, 0.014, 'mint');
    tube(root, seat, axle, 0.015, 'mint');
    tube(root, [side * 0.034, 0.54, 0.265], [side * 0.034, WHEEL_RADIUS, FRONT], 0.018, 'ochre');
  }
  tube(root, head, [0, 0.735, 0.255], 0.017, 'ink');
  tube(root, [-0.22, 0.76, 0.255], [0.22, 0.76, 0.255], 0.018, 'ochre');
  for (const side of [-1, 1]) {
    tube(root, [side * 0.15, 0.76, 0.255], [side * 0.25, 0.76, 0.255], 0.024, 'ink');
    tube(root, [side * 0.12, 0.745, 0.275], [side * 0.20, 0.745, 0.29], 0.009, 'cream');
  }
  ball(root, [0, 0.748, 0.255], [0.037, 0.013, 0.029], 'cream'); // bell
  ball(root, SADDLE.toArray(), [0.095, 0.035, 0.115], 'saddle');
  ball(root, [0, 0.57, 0.307], [0.045, 0.034, 0.042], 'ochre');
  ball(root, [0, 0.57, 0.338], [0.033, 0.026, 0.008], 'cream'); // front lamp
  ball(root, [0, 0.435, -0.365], [0.032, 0.018, 0.016], 'red');
  // A small rear rack and guards keep the familiar city-bike silhouette.
  for (const x of [-0.065, 0.065]) {
    tube(root, [x, 0.43, -0.22], [x, 0.43, -0.46], 0.009, 'ochre');
    tube(root, [x, 0.43, -0.43], [x, WHEEL_RADIUS, REAR], 0.007, 'ink');
  }
  tube(root, [-0.065, 0.43, -0.46], [0.065, 0.43, -0.46], 0.009, 'ochre');
  for (const z of [REAR, FRONT]) {
    const guard = Array.from({ length: 13 }, (_, i) => {
      const angle = Math.PI * (0.09 + i * 0.82 / 12);
      return [0, WHEEL_RADIUS + Math.sin(angle) * 0.219, z + Math.cos(angle) * 0.219];
    });
    for (let i = 1; i < guard.length; i++) tube(root, guard[i - 1], guard[i], 0.009, 'cream');
  }
  const wheels = [];
  for (const z of [REAR, FRONT]) {
    const wheel = new THREE.Group();
    wheel.position.set(0, WHEEL_RADIUS, z);
    wheel.name = z === FRONT ? 'FrontWheel' : 'RearWheel';
    root.add(wheel); wheels.push(wheel);
    part(wheel, new THREE.TorusGeometry(WHEEL_RADIUS - 0.016, 0.016, 6, 24), 'rubber',
      [0, 0, 0], [1, 1, 1], [0, Math.PI / 2, 0]);
    part(wheel, new THREE.TorusGeometry(0.17, 0.009, 4, 24), 'cream',
      [0, 0, 0], [1, 1, 1], [0, Math.PI / 2, 0]);
    tube(wheel, [-0.045, 0, 0], [0.045, 0, 0], 0.022, 'ochre');
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      tube(wheel, [0, 0, 0], [0, Math.sin(angle) * 0.168, Math.cos(angle) * 0.168], 0.003, 'light');
    }
  }
  const crank = new THREE.Group();
  crank.name = 'BicycleCrank'; crank.position.copy(CRANK); root.add(crank);
  part(root, new THREE.TorusGeometry(0.059, 0.01, 4, 16), 'ochre',
    [0.035, CRANK.y, CRANK.z], [1, 1, 1], [0, Math.PI / 2, 0]);
  tube(root, [0.042, WHEEL_RADIUS, REAR], [0.042, CRANK.y + 0.055, CRANK.z], 0.005, 'ink');
  tube(root, [0.042, WHEEL_RADIUS - 0.027, REAR], [0.042, CRANK.y - 0.055, CRANK.z], 0.005, 'ink');
  const pedals = [], feet = [-1, 1].map(() => new THREE.Vector3());
  for (const side of [-1, 1]) {
    tube(crank, [side * 0.045, 0, 0], [side * 0.09, 0, side * CRANK_RADIUS], 0.013, 'ochre');
    const pedal = new THREE.Group();
    pedal.name = side < 0 ? 'LeftPedal' : 'RightPedal';
    root.add(pedal); pedals.push(pedal);
    part(pedal, new THREE.BoxGeometry(0.10, 0.024, 0.065), 'ink', [0, 0, 0]);
    part(pedal, new THREE.BoxGeometry(0.102, 0.008, 0.021), 'ochre', [0, 0.002, 0]);
  }
  for (const [group, parts] of batches) {
    const geometry = mergeGeometries(parts); parts.forEach(g => g.dispose());
    geometry.computeBoundingBox(); geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  let lastDistance = null, floorOffset = 0, disposed = false;
  function pose(distance = 0) {
    if (distance === lastDistance) return;
    lastDistance = distance;
    // Distance is in normalized model units. One crank turn covers 1.8 wheel turns.
    const rotation = distance / WHEEL_RADIUS;
    // Compensate the tiny flat edges of the 24-sided tyres, without scanning vertices.
    const sector = Math.PI / 12;
    floorOffset = WHEEL_RADIUS * (1 - Math.cos(rotation - Math.round(rotation / sector) * sector));
    wheels.forEach(w => { w.rotation.x = rotation; });
    const phase = rotation / 1.8;
    crank.rotation.x = phase;
    for (let i = 0; i < pedals.length; i++) {
      const side = i === 0 ? -1 : 1;
      feet[i].set(side * 0.135, CRANK.y - Math.sin(phase) * side * CRANK_RADIUS,
        CRANK.z + Math.cos(phase) * side * CRANK_RADIUS);
      pedals[i].position.copy(feet[i]); // pedals remain level while the crank rotates
    }
  }
  pose(0);
  return { root, wheels, crank, pedals, feet, grips: GRIPS, saddle: SADDLE, pose,
    get floorOffset() { return floorOffset; },
    dispose() {
      if (disposed) return;
      geometries.forEach(g => g.dispose()); material.dispose(); disposed = true;
    },
  };
}
