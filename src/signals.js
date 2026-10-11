// The Kyobashi signals as photographed: the new heads (models) at the source anchors, and posts
// built here: tall brown poles with a two-pipe mast arm out to each car head, the intersection's
// name plate on top, the "歩車分離式 7:30–18:00" plate under each car head and a blue plate by
// each pedestrian head. Poles, arms and plates are merged into a few meshes (a handful of draws).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { model, material } from './world.js';
import { painted } from './style.js';
import { toThree } from './coords.js';
import { signalPlacements, signalRigs, POLE, ARM_ABOVE_HEAD, ARM_BEYOND_HEAD } from './signal-layout.js';

const UP = new THREE.Vector3(0, 1, 0);

/** Newly modeled solid housings, lenses, visors; posts and plates from the source rigs. */
export async function buildSignals(scene, data, materials) {
  const root = new THREE.Group();
  root.name = 'AbstractTrafficSignals';
  const placements = signalPlacements(data);
  const byAsset = new Map();
  for (const placement of placements) {
    if (!byAsset.has(placement.asset)) byAsset.set(placement.asset, []);
    byAsset.get(placement.asset).push(placement);
  }
  for (const [asset, items] of byAsset) {
    const parts = await model(asset);
    for (const part of parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, material(materials, part.material), items.length);
      items.forEach((item, index) => {
        mesh.setMatrixAt(index, new THREE.Matrix4().fromArray(item.matrix).multiply(part.matrix));
      });
      mesh.name = `${asset}/${part.material.name}`;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      root.add(mesh);
    }
  }
  const rigs = signalRigs(data);
  for (const mesh of buildPosts(rigs)) root.add(mesh);
  scene.add(root);
  return { root, placements, rigs, heads: placements.length,
    /** Footprints of the poles for obstacles.js (Unity x, z, yaw, [width, length]). */
    poles: rigs.map(r => { const d = POLE[r.kind].base * 2; return { x: r.pole.x, z: r.pole.z, yaw: 0, size: [d, d] }; }) };
}

function buildPosts(rigs) {
  const metal = [], back = [], plates = { name: [], phase: [], walk: [] };
  // a tube between two Unity points
  const tube = (list, a, b, r0, r1 = r0) => {
    const from = toThree(a.x, a.y, a.z), to = toThree(b.x, b.y, b.z);
    const d = new THREE.Vector3().subVectors(to, from), length = d.length();
    const g = new THREE.CylinderGeometry(r1, r0, length, 14, 1);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
    g.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    list.push(g);
  };
  // a plate facing `facing` (Unity [x, z]) centred at a Unity point, with a thin back
  const plate = (list, c, facing, width, height) => {
    const yaw = Math.atan2(-facing[0], facing[1]);
    const p = toThree(c.x, c.y, c.z);
    const front = new THREE.PlaneGeometry(width, height);
    front.rotateY(yaw); front.translate(p.x, p.y, p.z);
    list.push(front);
    const box = new THREE.BoxGeometry(width + 0.03, height + 0.03, 0.025);
    box.translate(0, 0, -0.016); box.rotateY(yaw); box.translate(p.x, p.y, p.z);
    back.push(box);
  };
  for (const r of rigs) {
    const { head, facing, pole } = r, spec = POLE[r.kind];
    const P = (y, out = 0) => ({ x: pole.x + facing[0] * out, y, z: pole.z + facing[1] * out });
    tube(metal, P(0), P(spec.height), spec.base, spec.top);
    tube(metal, P(spec.height), P(spec.height + 0.06), spec.top + 0.015, 0.02);          // cap
    if (r.kind === 'car') {
      // the mast arm: a lower pipe level with the brackets, an upper one closing on it at the end
      const dx = head.x - pole.x, dz = head.z - pole.z, l = Math.hypot(dx, dz) || 1;
      const ux = dx / l, uz = dz / l, armY = head.y + ARM_ABOVE_HEAD, reach = l + ARM_BEYOND_HEAD;
      const A = (s, y) => ({ x: pole.x + ux * s, y, z: pole.z + uz * s });
      const upper = s => armY + 1.05 + (0.09 - 1.05) * Math.min(1, s / (reach - 0.15));   // height of the upper pipe
      tube(metal, A(0, armY), A(reach, armY), 0.06, 0.045);
      tube(metal, A(0, upper(0)), A(reach - 0.15, upper(reach - 0.15)), 0.04, 0.03);
      for (const s of [0.35, 0.68]) tube(metal, A(reach * s, armY), A(reach * s, upper(reach * s)), 0.022);
      tube(metal, A(0, armY - 0.18), A(0, armY + 1.2), spec.base + 0.03);                  // collar
      // "歩車分離式 7:30–18:00" under the head, the name of the crossing on top of the pole
      plate(plates.phase, { x: head.x + facing[0] * 0.06, y: head.y - 0.62, z: head.z + facing[1] * 0.06 }, facing, 1.05, 0.4);
      plate(plates.name, P(spec.height - 0.6, spec.top + 0.03), facing, 0.36, 0.9);
    } else {
      // two short brackets from the pole to the back of the head; the blue plate on the pole's front
      const rear = { x: head.x - facing[0] * 0.1, z: head.z - facing[1] * 0.1 };
      for (const dy of [-0.22, 0.22]) tube(metal, P(head.y + dy), { x: rear.x, y: head.y + dy, z: rear.z }, 0.025);
      plate(plates.walk, P(head.y, spec.base + 0.03), facing, 0.13, 0.6);
    }
  }
  const meshes = [];
  const add = (list, mat, name) => {
    if (!list.length) return;
    const geometry = mergeGeometries(list.map(g => g.index ? g.toNonIndexed() : g));
    list.forEach(g => g.dispose());
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true;
    meshes.push(mesh);
  };
  const lambert = (name, options) => painted(new THREE.MeshLambertMaterial({ name, ...options }));
  add(metal, lambert('ART_SignalPole', { color: new THREE.Color().setRGB(0.36, 0.29, 0.25, THREE.SRGBColorSpace) }), 'SignalPosts');
  add(back, lambert('ART_SignalPlateBack', { color: new THREE.Color().setRGB(0.52, 0.53, 0.53, THREE.SRGBColorSpace) }), 'SignalPlateBacks');
  add(plates.name, lambert('ART_SignalPlateName', { map: plateTexture('name') }), 'SignalNamePlates');
  add(plates.phase, lambert('ART_SignalPlatePhase', { map: plateTexture('phase') }), 'SignalPhasePlates');
  add(plates.walk, lambert('ART_SignalPlateWalk', { map: plateTexture('walk') }), 'SignalWalkPlates');
  return meshes;
}

// The plates' faces, drawn once (bilingual name plate, the phase plate, the pedestrian plate).
const FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", "Meiryo", sans-serif';
function plateTexture(kind) {
  const [w, h] = { name: [160, 400], phase: [420, 160], walk: [64, 300] }[kind];
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (kind === 'name') {
    g.fillStyle = '#f4f6f4'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2f5fae'; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#2f5fae';
    g.font = `600 22px ${FONT}`; g.fillText('彦根市', w / 2, 38);
    g.font = `700 96px ${FONT}`; g.fillText('京', w / 2, 120); g.fillText('橋', w / 2, 230);
    g.font = `600 26px ${FONT}`; g.fillText('Kyobashi', w / 2, 340);
  } else if (kind === 'phase') {
    g.fillStyle = '#d8652d'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#eef2f0'; g.fillRect(12, 12, w - 24, h - 24);
    g.fillStyle = '#2652a3';
    g.font = `800 62px ${FONT}`; g.fillText('歩車分離式', w / 2, 58);
    g.font = `700 44px ${FONT}`; g.fillText('7:30 − 18:00', w / 2, 118);
  } else {
    g.fillStyle = '#2652a3'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f4f6f4'; g.font = `700 40px ${FONT}`;
    [...'歩車分離式'].forEach((c, i) => g.fillText(c, w / 2, 40 + i * 55));
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
