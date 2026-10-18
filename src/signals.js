// Five Kyobashi installations: four vehicle poles and the separate east-crossing lamp pole.
// Only the town-west pole carries pedestrian heads for two different crossings.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { model, material } from './world.js';
import { painted } from './style.js';
import { toThree } from './coords.js';
import { signalPlacements, signalRigs, GUIDE_SIGNS, POLE, ARM_ABOVE_HEAD, ARM_BEYOND_HEAD } from './signal-layout.js';

const UP = new THREE.Vector3(0, 1, 0);

/** Instanced solid heads; merged static poles, brackets, lamps and plates. */
export async function buildSignals(scene, materials, rigs = signalRigs()) {
  const root = new THREE.Group();
  root.name = 'AbstractTrafficSignals';
  const placements = signalPlacements(rigs);
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
  for (const mesh of buildPosts(rigs)) root.add(mesh);
  scene.add(root);
  return { root, placements, rigs, heads: placements.length,
    /** Footprints of the poles for obstacles.js (Unity x, z, yaw, [width, length]). */
    poles: [...rigs.map(r => ({ x: r.pole.x, z: r.pole.z, kind: r.kind })),
      ...GUIDE_SIGNS.map(s => ({ x: s.pole[0], z: s.pole[1], kind: 'guide' }))]
      .map(({ x, z, kind }) => { const d = POLE[kind].base * 2; return { x, z, yaw: 0, size: [d, d] }; }) };
}

function buildPosts(rigs) {
  const brown = [], grey = [], back = [], glass = [], plates = { name: [], phase: [], walk: [], guide: [] };
  // a tube between two Unity points
  const tube = (list, a, b, r0, r1 = r0) => {
    const from = toThree(a.x, a.y, a.z), to = toThree(b.x, b.y, b.z);
    const d = new THREE.Vector3().subVectors(to, from), length = d.length();
    if (length < 1e-6) return;
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
  const box = (list, c, size, yaw = 0) => {
    const p = toThree(c.x, c.y, c.z), g = new THREE.BoxGeometry(...size);
    g.rotateY(yaw); g.translate(p.x, p.y, p.z); list.push(g);
  };
  for (const r of rigs) {
    const { head, facing, pole } = r, spec = POLE[r.kind];
    const metal = r.style === 'truss' ? brown : grey;
    const P = (y, out = 0) => ({ x: pole.x + facing[0] * out, y, z: pole.z + facing[1] * out });
    tube(metal, P(0.16), P(r.height), spec.base, spec.top);
    tube(metal, P(r.height), P(r.height + 0.06), spec.top + 0.015, 0.02);
    if (head) {
      const dx = head.x - pole.x, dz = head.z - pole.z, l = Math.hypot(dx, dz) || 1;
      const ux = dx / l, uz = dz / l, armY = head.y + ARM_ABOVE_HEAD, reach = l + ARM_BEYOND_HEAD;
      // Keep the mast behind the heads' mounting brackets, not through their front lenses.
      const A = (s, y) => ({ x: pole.x + ux * s - facing[0] * 0.05, y,
        z: pole.z + uz * s - facing[1] * 0.05 });
      if (r.style === 'truss') {
        const lower = s => armY - 0.95 * (1 - s / reach);
        const upper = s => armY - 0.20 + 0.29 * s / reach;
        tube(metal, A(0, lower(0)), A(reach, lower(reach)), 0.06, 0.045);
        tube(metal, A(0, upper(0)), A(reach, upper(reach)), 0.04, 0.03);
        for (const s of [0.35, 0.68]) tube(metal, A(reach * s, lower(reach * s)), A(reach * s, upper(reach * s)), 0.022);
        // Thin tension cable above the paired pipes.
        tube(metal, P(r.height - 0.1), A(reach, armY + 0.12), 0.008);
      } else {
        tube(metal, A(0, armY), A(reach, armY), 0.075, 0.055);
        tube(metal, A(0, armY - 0.4), A(0.55, armY), 0.045);
      }
      tube(metal, P(armY - 0.22), P(armY + 0.18), spec.base + 0.018);
      // The car model's two hanging brackets meet a crossbar behind the housing.
      const right = [-facing[1], facing[0]];
      const H = (side, y) => ({ x: head.x + right[0] * side - facing[0] * 0.05, y,
        z: head.z + right[1] * side - facing[1] * 0.05 });
      tube(metal, H(-0.64, armY), H(0.64, armY), 0.028);
      tube(metal, A(l, r.style === 'truss' ? armY - 0.95 * (1 - l / reach) : armY), H(0, armY), 0.03);
      const phaseY = head.y + (r.phase === 'below' ? -0.62 : 0.79);
      plate(plates.phase, { x: head.x + facing[0] * 0.06, y: phaseY, z: head.z + facing[1] * 0.06 }, facing, 1.5, 0.46);
      for (const side of [-0.57, 0.57]) tube(metal, H(side, armY), H(side, phaseY), 0.017);
    }
    if (r.lampFacing) {
      const [lx, lz] = r.lampFacing;
      const L = (s, y) => ({ x: pole.x + lx * s, y, z: pole.z + lz * s });
      tube(metal, P(r.height - 0.25), L(1.15, r.height + 0.12), 0.045);
      const yaw = Math.atan2(-lx, lz);
      box(back, L(1.35, r.height + 0.12), [0.42, 0.12, 0.58], yaw);
      box(glass, L(1.35, r.height + 0.052), [0.34, 0.018, 0.46], yaw);
    }
    if (r.nameHeight != null) {
      const f = r.nameFacing, c = { x: pole.x + f[0] * 0.17, y: r.nameHeight, z: pole.z + f[1] * 0.17 };
      plate(plates.name, c, f, ...(r.nameSize ?? [0.96, 0.72]));
      for (const dy of [-0.23, 0.23]) tube(metal, P(c.y + dy), { ...c, y: c.y + dy }, 0.018);
    }
    // Each explicitly authored pedestrian head uses short upper/lower brackets on its pole.
    for (const walk of r.pedestrians) {
      const rear = { x: walk.head.x - walk.facing[0] * 0.1, z: walk.head.z - walk.facing[1] * 0.1 };
      for (const dy of [-0.42, 0.42]) {
        const y = walk.head.y + dy;
        tube(metal, P(y), { x: rear.x, y, z: rear.z }, 0.025);
        tube(metal, { x: rear.x, y, z: rear.z }, { x: rear.x, y: walk.head.y + Math.sign(dy) * 0.31, z: rear.z }, 0.025);
      }
      plate(plates.walk, { x: pole.x + walk.facing[0] * 0.18 - walk.side[0] * 0.16,
        y: walk.head.y, z: pole.z + walk.facing[1] * 0.18 - walk.side[1] * 0.16 }, walk.facing, 0.18, 0.72);
    }
    // Clamps and the slim control box read as part of the shared installation.
    for (const y of [2.4, 3.3]) tube(metal, P(y - 0.035), P(y + 0.035), spec.base + 0.025);
    box(metal, P(3.75, -0.17), [0.22, 0.48, 0.16]);
  }
  // Galvanised cantilever: the arm carries the board over the west lane, held by two short hangers.
  for (const s of GUIDE_SIGNS) {
    const [px, pz] = s.pole, [bx, by, bz] = s.board, [w, h] = s.size;
    tube(grey, { x: px, y: 0.16, z: pz }, { x: px, y: s.height, z: pz }, POLE.guide.base, POLE.guide.top);
    const armY = by + h / 2 + 0.25, far = bx + w / 2 - 0.15;
    tube(grey, { x: px, y: armY, z: pz }, { x: far, y: armY, z: pz }, 0.085, 0.06);
    tube(grey, { x: px, y: armY - 0.75, z: pz }, { x: px + 1.1, y: armY, z: pz }, 0.04);
    for (const dx of [-w / 3, w / 3]) {
      tube(grey, { x: bx + dx, y: armY, z: pz }, { x: bx + dx, y: by + h / 2 - 0.05, z: bz - s.facing[1] * 0.05 }, 0.025);
    }
    plate(plates.guide, { x: bx, y: by, z: bz }, s.facing, w, h);
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
  // Bake the support colours into one static mesh, including town masts and lamp undersides.
  const solids = [];
  for (const [list, rgb] of [[brown, [0.36, 0.29, 0.25]], [grey, [0.49, 0.48, 0.44]],
    [back, [0.52, 0.53, 0.53]], [glass, [0.88, 0.86, 0.71]]]) {
    const color = new THREE.Color().setRGB(...rgb, THREE.SRGBColorSpace);
    for (const g of list) {
      const values = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < values.length; i += 3) { values[i] = color.r; values[i + 1] = color.g; values[i + 2] = color.b; }
      g.setAttribute('color', new THREE.BufferAttribute(values, 3)); solids.push(g);
    }
  }
  add(solids, lambert('ART_SignalPole', { vertexColors: true }), 'SignalPosts');
  add(plates.name, lambert('ART_SignalPlateName', { map: plateTexture('name') }), 'SignalNamePlates');
  add(plates.phase, lambert('ART_SignalPlatePhase', { map: plateTexture('phase') }), 'SignalPhasePlates');
  add(plates.walk, lambert('ART_SignalPlateWalk', { map: plateTexture('walk') }), 'SignalWalkPlates');
  add(plates.guide, lambert('ART_GuideSignFace', { map: plateTexture('guide') }), 'GuideSignFaces');
  return meshes;
}

// The plates' faces, drawn once (bilingual name plate, the phase plate, the pedestrian plate).
const FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", "Meiryo", sans-serif';
function plateTexture(kind) {
  const [w, h] = { name: [400, 300], phase: [600, 184], walk: [100, 400], guide: [520, 340] }[kind];
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (kind === 'name') {
    g.fillStyle = '#f4f6f4'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2f5fae'; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#2f5fae';
    g.font = `600 30px ${FONT}`; g.fillText('彦根市', w / 2, 42);
    g.font = `700 112px ${FONT}`; g.fillText('京 橋', w / 2, 143);
    g.font = `500 49px ${FONT}`; g.fillText('Kyobashi', w / 2, 239);
  } else if (kind === 'phase') {
    g.fillStyle = '#d8652d'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#eda36a'; g.fillRect(12, 12, w - 24, h - 24);
    g.strokeStyle = '#2652a3'; g.lineWidth = 5; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#2652a3';
    g.font = `800 70px ${FONT}`; g.fillText('歩車分離式', w / 2, 61);
    g.font = `700 54px ${FONT}`; g.fillText('7:30 − 18:00', w / 2, 141);
  } else if (kind === 'guide') {
    // Only the destinations legible in the October 2024 panorama; no invented distances.
    g.fillStyle = '#2459a8'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#f2f4f2'; g.lineWidth = 6; g.strokeRect(9, 9, w - 18, h - 18);
    g.fillStyle = g.strokeStyle = '#f2f4f2';
    g.lineWidth = 16; g.lineCap = 'butt';
    g.beginPath(); g.moveTo(440, 300); g.lineTo(440, 120); g.moveTo(448, 270); g.lineTo(150, 270); g.stroke();
    g.beginPath(); g.moveTo(440, 82); g.lineTo(470, 128); g.lineTo(410, 128); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(108, 270); g.lineTo(152, 242); g.lineTo(152, 298); g.closePath(); g.fill();
    g.textAlign = 'right';
    g.font = `700 52px ${FONT}`; g.fillText('東近江', 400, 52);
    g.font = `500 22px ${FONT}`; g.fillText('Higashiomi', 400, 92);
    g.textAlign = 'left';
    g.fillStyle = '#2f7d57'; g.fillRect(34, 118, 228, 58);
    g.strokeRect(34, 118, 228, 58);
    g.fillStyle = '#f2f4f2';
    g.font = `700 40px ${FONT}`; g.fillText('E1 名神', 48, 145);
    g.font = `700 54px ${FONT}`; g.fillText('国道8号', 36, 212);
    g.font = `500 24px ${FONT}`; g.fillText('Route 8', 196, 250);
  } else {
    g.fillStyle = '#f4eee0'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2652a3'; g.lineWidth = 5; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = '#2652a3'; g.font = `700 57px ${FONT}`;
    [...'歩車分離式'].forEach((c, i) => g.fillText(c, 60, 47 + i * 75));
    g.save(); g.translate(19, h / 2); g.rotate(-Math.PI / 2);
    g.font = `500 22px ${FONT}`; g.fillText('7:30 − 18:00', 0, 0); g.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
