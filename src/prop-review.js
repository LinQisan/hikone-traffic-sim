// Optional inspection views of the actual runtime GLBs, with no scenario changes.
import * as THREE from 'three';
import { instance } from './vehicles.js';
import { toThree, yawToThree } from './coords.js';
import { createReplayAnimal } from './replay-animal.js';
import { createReplayCyclist } from './replay-cyclist.js';
import { createBicycle } from './bicycle.js';

export function propReview(view, scene, materials) {
  const cameras = {
    animal: [2.4, 1.8, 3.2, 0, 0.88, 0, 38],
    cyclist: [3.5, 2.0, 3.8, 0, 0.85, 0, 38],
    bicycle: [3.5, 1.8, 3.2, 0, 0.65, 0, 38],
    lamp: [1.2, 3.2, 3.8, 0, 4.55, 1.2, 38],
    'lamp-top': [1.4, 5.9, 3.7, 0, 4.65, 1.2, 38],
    signals: [-2.9, 3.15, -5.7, 0, 2.45, 0, 42],
    'signals-back': [2.9, 3.15, 5.7, 0, 2.45, 0, 42],
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
  ground.position.y = -0.006;
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
  else if (view.startsWith('signals')) {
    add('ART_Signal_Car', -1.1, 2.8, 0);
    add('ART_Signal_Pedestrian', 1.15, 2.8, 0);
    for (const x of [-1.1, 1.15]) add('ART_Signal_Support', x, 1.38, 0, 0, null, [0.13, 1.38, 0.13]);
  } else {
    add('WEB_Sedan', -5, 0, 8, 0, [0.51, 0.66, 0.80]);
    add('HK_Kei_Tall', 0, 0, 8, 0, [0.85, 0.55, 0.45]);
    add('HK_Kei_Hatch', 5, 0, 8, 0, [0.60, 0.76, 0.61]);
    add('HK_Truck_Large', -4, 0, -1.5, 90, [0.74, 0.81, 0.88]);
    add('HK_Truck_Medium', 4, 0, -1.5, 90, [0.86, 0.75, 0.54]);
  }
  return cameras[view];
}
