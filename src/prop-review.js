// Optional inspection views of the actual runtime GLBs, with no scenario changes.
import * as THREE from 'three';
import { instance } from './vehicles.js';
import { toThree, yawToThree } from './coords.js';
import { createReplayAnimal } from './replay-animal.js';
import { createReplayCyclist } from './replay-cyclist.js';
import { createBicycle } from './bicycle.js';
import { buildSignals } from './signals.js';
import { signalRigs } from './signal-layout.js';

export async function propReview(view, scene, materials) {
  const cameras = {
    animal: [2.4, 1.8, 3.2, 0, 0.88, 0, 38],
    cyclist: [3.5, 2.0, 3.8, 0, 0.85, 0, 38],
    bicycle: [3.5, 1.8, 3.2, 0, 0.65, 0, 38],
    lamp: [1.2, 3.2, 3.8, 0, 4.55, 1.2, 38],
    'lamp-top': [1.4, 5.9, 3.7, 0, 4.65, 1.2, 38],
    'path-lamp': [2.5, 2.4, 3.5, 0, 1.6, 0, 42],
    'utility-pole': [9, 7, 11, 0, 5.2, 0, 46],
    signals: [-9.4, 4.0, -3.8, 0, 3.1, -1.2, 44],
    'signals-back': [8.5, 4.0, 5.3, 0, 3.1, -1.2, 44],
    'signals-bridge-west': [7.2, 4.0, -7.3, 0.8, 3.1, 0, 44],
    'signals-town': [-7.2, 4.0, 7.3, -0.8, 3.3, 0, 44],
    'signals-town-back': [6.8, 4.0, -6.3, -0.8, 3.3, 0, 44],
    'signals-double': [8.5, 4.4, 7.0, 0, 3.1, 1.2, 44],
    'signals-walk': [6.0, 4.0, 8.0, 0.5, 3.2, 0, 44],
    vehicles: [14, 10, 20, 0, 1.5, 2.5, 42],
    'vehicles-back': [-14, 8, -18, 0, 1.5, 2.5, 45],
  };
  if (!cameras[view]) return null;
  const root = new THREE.Group();
  root.name = 'PropReview';
  scene.add(root);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(55, 55),
    new THREE.MeshStandardMaterial({ color: 0xd3c8b0, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = view.startsWith('signals') ? 0.154 : -0.006;
  ground.receiveShadow = true;
  root.add(ground);
  function add(name, x, y, z, yaw = 0, paint = null, scale = null) {
    const mesh = instance(name, materials, { paint });
    mesh.position.copy(toThree(x, y, z));
    mesh.rotation.y = yawToThree(yaw);
    if (scale) mesh.scale.set(...scale);
    root.add(mesh);
  }
  if (view === 'animal') root.add(createReplayAnimal(170).root);
  else if (view === 'cyclist') {
    const cyclist = createReplayCyclist(170);
    cyclist.pose(0, 2.4, 0, undefined, 0.4);
    root.add(cyclist.root);
  } else if (view === 'bicycle') {
    const bicycle = createBicycle(); bicycle.root.scale.setScalar(1.7); root.add(bicycle.root);
  }
  else if (view.startsWith('lamp')) add('HK_StreetLamp', 0, 0, 0);
  else if (view === 'path-lamp') add('ART_PathLamp', 0, 0, 0);
  else if (view === 'utility-pole') add('ART_UtilityPole', 0, 0, 0);
  else if (view.startsWith('signals')) {
    // Inspect the same complete assembly used on the street, centred on its pole.
    const id = view === 'signals-bridge-west' ? 'bridge-west' : view.includes('town') ? 'town-east' : view === 'signals-double' ? 'town-west'
      : view === 'signals-walk' ? 'town-east-walk' : 'bridge-east';
    const rig = signalRigs().find(r => r.id === id), { x, z } = rig.pole;
    const centre = p => p && ({ ...p, x: p.x - x, z: p.z - z });
    await buildSignals(root, materials, [{ ...rig, pole: { x: 0, z: 0 }, head: centre(rig.head),
      pedestrians: rig.pedestrians.map(w => ({ ...w, head: centre(w.head) })) }]);
  } else {
    add('WEB_Sedan', -5, 0, 8, 0, [0.51, 0.66, 0.80]);
    add('HK_Kei_Tall', 0, 0, 8, 0, [0.85, 0.55, 0.45]);
    add('HK_Kei_Hatch', 5, 0, 8, 0, [0.60, 0.76, 0.61]);
    add('HK_Truck_Large', -4, 0, -1.5, 90, [0.74, 0.81, 0.88]);
    add('HK_Truck_Medium', 4, 0, -1.5, 90, [0.86, 0.75, 0.54]);
  }
  return cameras[view];
}
