// Optional inspection views of the actual runtime GLBs, with no scenario changes.
import * as THREE from 'three';
import { instance, BODY_MODEL } from './vehicles.js';
import { toThree, yawToThree } from './coords.js';
import { createReplayAnimal } from './replay-animal.js';
import { createReplayCyclist } from './replay-cyclist.js';
import { createBicycle } from './bicycle.js';
import { buildSignals } from './signals.js';
import { signalRigs } from './signal-layout.js';
import { model } from './world.js';

export async function propReview(view, scene, materials) {
  const cameras = {
    animal: [2.4, 1.8, 3.2, 0, 0.88, 0, 38],
    cyclist: [3.5, 2.0, 3.8, 0, 0.85, 0, 38],
    bicycle: [3.5, 1.8, 3.2, 0, 0.65, 0, 38],
    lamp: [1.2, 3.2, 3.8, 0, 4.55, 1.2, 38],
    'lamp-top': [1.4, 5.9, 3.7, 0, 4.65, 1.2, 38],
    'path-lamp': [2.5, 2.4, 3.5, 0, 1.6, 0, 42],
    'utility-pole': [10, 7.5, 13, 0, 5.9, 0, 46],
    storefront: [10, 5, 12, 0, 3.1, -1.0, 42],
    'display-kiosk': [-2.7, 1.8, 4.2, 0, 1.15, 0, 36],
    'display-kiosk-back': [2.7, 1.8, -4.2, 0, 1.15, 0, 36],
    'kei-box': [4.2, 2.1, 5.0, 0, 0.85, 0, 40],
    tree: [11, 6.2, 16, 0, 5.1, 0, 42],
    'tree-broad': [11, 5.2, 16, 0, 4.0, 0, 42],
    'tree-airy': [-11, 5.8, 16, 0, 4.6, 0, 42],
    'tree-detail': [3.8, 5.4, 5.5, 0, 6.2, 0, 40],
    signals: [8.7, 4.7, -10.4, 0, 4.2, -1.1, 48],
    'signals-back': [-8.7, 4.7, 10.4, 0, 4.2, -1.1, 48],
    'signals-name': [4.5, 7.4, -6.5, 0, 8, -0.4, 38],
    'signals-walk-detail': [2.4, 2.8, -3.4, 0.2, 2.75, -0.25, 38],
    'signals-walk-side': [-3.4, 2.8, -2.4, -0.25, 2.75, -0.2, 38],
    'signals-bridge-west': [9, 5, -9, 1, 3.6, 0, 48],
    'signals-town': [-5.5, 3.8, 13, -2, 3.25, 0, 42],
    'signals-town-back': [2, 3.8, -13, -2, 3.25, 0, 42],
    'signals-double': [10.5, 4.4, -6.5, 0, 3.55, 1.8, 46],
    'signals-double-back': [-10.5, 4.4, 8.5, 0, 3.55, 1.8, 46],
    'signals-walk': [7.0, 4.0, 8.0, 0.3, 3.4, 0.5, 44],
    'signals-walk-back': [-7.0, 4.0, -8.0, 0.3, 3.4, 0.5, 44],
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
  ground.position.y = view.startsWith('signals') ? 0.004 : -0.006;
  ground.receiveShadow = true;
  root.add(ground);
  async function add(name, x, y, z, yaw = 0, paint = null, scale = null) {
    await model(name);
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
  else if (view.startsWith('lamp')) await add('HK_StreetLamp', 0, 0, 0);
  else if (view === 'path-lamp') await add('ART_PathLamp', 0, 0, 0);
  else if (view === 'utility-pole') await add('ART_UtilityPole', 0, 0, 0);
  else if (view === 'storefront') await add('ART_CornerShop', 0, 0, 0);
  else if (view.startsWith('display-kiosk')) await add('ART_DisplayKiosk', 0, 0, 0);
  else if (view === 'kei-box') await add('ART_KeiBox', 0, 0, 0, 0, [0.93, 0.93, 0.91]);
  else if (view.startsWith('tree')) await add(view === 'tree-broad' ? 'ART_MoatTree_Broad'
    : view === 'tree-airy' ? 'ART_MoatTree_Airy' : 'ART_TownTree', 0, 0, 0);
  else if (view.startsWith('signals')) {
    // Inspect the same complete assembly used on the street, centred on its pole.
    const id = view === 'signals-bridge-west' ? 'bridge-west' : view.includes('town') ? 'town-east' : view.startsWith('signals-double') ? 'town-west'
      : ['signals-walk', 'signals-walk-back'].includes(view) ? 'town-east-walk' : 'bridge-east';
    const rig = signalRigs().find(r => r.id === id), { x, z } = rig.pole;
    const centre = p => p && ({ ...p, x: p.x - x, z: p.z - z });
    root.userData.signals = await buildSignals(root, materials, [{ ...rig, pole: { x: 0, z: 0 }, head: centre(rig.head),
      extraHeads: rig.extraHeads.map(e => ({ ...e, head: centre(e.head) })),
      pedestrians: rig.pedestrians.map(w => ({ ...w, head: centre(w.head) })) }]);
  } else {
    await add('WEB_Sedan', -5, 0, 8, 0, [0.51, 0.66, 0.80]);
    await add(BODY_MODEL['kei-tall'], 0, 0, 8, 0, [0.85, 0.55, 0.45]);
    await add('HK_Kei_Hatch', 5, 0, 8, 0, [0.60, 0.76, 0.61]);
    await add('HK_Truck_Large', -4, 0, -1.5, 90, [0.74, 0.81, 0.88]);
    await add('HK_Truck_Medium', 4, 0, -1.5, 90, [0.86, 0.75, 0.54]);
  }
  return cameras[view];
}
