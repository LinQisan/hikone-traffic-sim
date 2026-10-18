// Five Kyobashi installations: four vehicle poles and the separate east-crossing lamp pole.
// Only the town-west pole carries pedestrian heads for two different crossings.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { model, material } from './world.js';
import { painted } from './style.js';
import { toThree } from './coords.js';
import { signalPlacements, signalRigs, GUIDE_SIGNS, LANTERNS, POLE, ARM_ABOVE_HEAD, ARM_BEYOND_HEAD } from './signal-layout.js';

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
      ...GUIDE_SIGNS.map(s => ({ x: s.pole[0], z: s.pole[1], kind: 'guide' })),
      ...LANTERNS.map(s => ({ x: s.pole[0], z: s.pole[1], kind: 'lantern' }))]
      .map(({ x, z, kind }) => { const d = POLE[kind].base * 2; return { x, z, yaw: 0, size: [d, d] }; }) };
}

function buildPosts(rigs) {
  const brown = [], grey = [], taupe = [], dark = [], back = [], glass = [];
  const plates = { name: [], phase: [], walk: [], guide: [] };
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
  // a square-section beam between two Unity points (the town masts are folded steel boxes)
  const beam = (list, a, b, w, h = w) => {
    const from = toThree(a.x, a.y, a.z), to = toThree(b.x, b.y, b.z);
    const d = new THREE.Vector3().subVectors(to, from), length = d.length();
    if (length < 1e-6) return;
    const g = new THREE.BoxGeometry(w, length, h);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
    g.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    list.push(g);
  };
  // Map a face onto part of an atlas: [u0, v0, u1, v1] with v measured down from the top.
  const atlas = (g, [u0, v0, u1, v1]) => {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), 1 - v1 + uv.getY(i) * (v1 - v0));
    return g;
  };
  // a plate facing `facing` (Unity [x, z]) centred at a Unity point, with a thin back
  const plate = (list, c, facing, width, height, region = null) => {
    const yaw = Math.atan2(-facing[0], facing[1]);
    const p = toThree(c.x, c.y, c.z);
    const front = new THREE.PlaneGeometry(width, height);
    if (region) atlas(front, region);
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
    // Bridge-side truss poles are round dark brown; the town-side masts and the lamp pole are
    // square taupe steel with flat arms (18 October 2026 photographs).
    const square = r.style !== 'truss';
    const metal = square ? taupe : brown;
    const P = (y, out = 0) => ({ x: pole.x + facing[0] * out, y, z: pole.z + facing[1] * out });
    if (square) beam(metal, P(0.16), P(r.height), spec.base * 1.75);
    else tube(metal, P(0.16), P(r.height), spec.base, spec.top);
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
        beam(metal, A(0, armY), A(reach, armY), 0.13, 0.16);
        beam(metal, A(0, armY - 0.4), A(0.55, armY), 0.07);
      }
      tube(metal, P(armY - 0.22), P(armY + 0.18), spec.base + 0.018);
      // The car model's two hanging brackets meet a crossbar behind the housing.
      const right = [-facing[1], facing[0]];
      const H = (side, y) => ({ x: head.x + right[0] * side - facing[0] * 0.05, y,
        z: head.z + right[1] * side - facing[1] * 0.05 });
      tube(metal, H(-0.64, armY), H(0.64, armY), 0.028);
      tube(metal, A(l, r.style === 'truss' ? armY - 0.95 * (1 - l / reach) : armY), H(0, armY), 0.03);
      if (r.phase) {
        const phaseY = head.y + (r.phase === 'below' ? -0.62 : 0.79);
        plate(plates.phase, { x: head.x + facing[0] * 0.06, y: phaseY, z: head.z + facing[1] * 0.06 }, facing, 1.5, 0.46);
        for (const side of [-0.57, 0.57]) tube(metal, H(side, armY), H(side, phaseY), 0.017);
      }
      // A second head at the arm's end turns to another approach on its own crossbar.
      for (const e of r.extraHeads ?? []) {
        const right2 = [-e.facing[1], e.facing[0]];
        const E = (side, y) => ({ x: e.head.x + right2[0] * side - e.facing[0] * 0.05, y,
          z: e.head.z + right2[1] * side - e.facing[1] * 0.05 });
        tube(metal, E(-0.64, armY), E(0.64, armY), 0.028);
        tube(metal, H(0, armY), E(0, armY), 0.03);
      }
    }
    if (r.lampFacing) {
      const [lx, lz] = r.lampFacing;
      const L = (s, y) => ({ x: pole.x + lx * s, y, z: pole.z + lz * s });
      if (square) beam(metal, P(r.height - 0.05), L(1.2, r.height - 0.05), 0.1, 0.12);
      else tube(metal, P(r.height - 0.25), L(1.15, r.height + 0.12), 0.045);
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
  // Brown cantilever: the arm carries the double-sided board over the west lane on two hangers.
  // Both faces and the lantern's disc share one atlas texture (one draw call).
  for (const s of GUIDE_SIGNS) {
    const [px, pz] = s.pole, [bx, by, bz] = s.board, [w, h] = s.size, [fx, fz] = s.facing;
    tube(brown, { x: px, y: 0.16, z: pz }, { x: px, y: s.height, z: pz }, POLE.guide.base, POLE.guide.top);
    const armY = by + h / 2 + 0.25, far = bx + w / 2 - 0.15;
    tube(brown, { x: px, y: armY, z: pz }, { x: far, y: armY, z: pz }, 0.085, 0.06);
    tube(brown, { x: px, y: armY - 0.75, z: pz }, { x: px + 1.1, y: armY, z: pz }, 0.04);
    for (const dx of [-w / 3, w / 3]) tube(brown, { x: bx + dx, y: armY, z: bz }, { x: bx + dx, y: by + h / 2 - 0.05, z: bz }, 0.025);
    plate(plates.guide, { x: bx + fx * 0.02, y: by, z: bz + fz * 0.02 }, s.facing, w, h, [0, 0, 0.5, 0.33]);
    plate(plates.guide, { x: bx - fx * 0.02, y: by, z: bz - fz * 0.02 }, [-fx, -fz], w, h, [0, 0.33, 0.5, 0.66]);
  }
  // Dark pole, a square glazed lantern under a cap, and the blue disc on a short bracket.
  for (const l of LANTERNS) {
    const [px, pz] = l.pole, top = l.height, d = l.disc;
    tube(dark, { x: px, y: 0.16, z: pz }, { x: px, y: top - 0.55, z: pz }, POLE.lantern.base, POLE.lantern.top);
    box(glass, { x: px, y: top - 0.28, z: pz }, [0.46, 0.5, 0.46]);
    box(dark, { x: px, y: top - 0.55, z: pz }, [0.52, 0.06, 0.52]);
    box(dark, { x: px, y: top - 0.01, z: pz }, [0.56, 0.06, 0.56]);
    for (const [ex, ez] of [[-1, -1], [-1, 1], [1, -1], [1, 1]])
      box(dark, { x: px + ex * 0.24, y: top - 0.28, z: pz + ez * 0.24 }, [0.04, 0.5, 0.04]);
    const c = toThree(px + d.facing[0] * 0.1, d.height, pz + d.facing[1] * 0.1);
    const yaw = Math.atan2(-d.facing[0], d.facing[1]);
    const face = atlas(new THREE.CircleGeometry(0.3, 28), [0.52, 0, 0.77, 0.25]);
    face.rotateY(yaw); face.translate(c.x, c.y, c.z); plates.guide.push(face);
    const rim = new THREE.CylinderGeometry(0.305, 0.305, 0.02, 28);
    rim.rotateX(Math.PI / 2); rim.translate(0, 0, -0.012); rim.rotateY(yaw); rim.translate(c.x, c.y, c.z);
    back.push(rim);
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
    [taupe, [0.6, 0.51, 0.43]], [dark, [0.22, 0.21, 0.2]],
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
  const [w, h] = { name: [400, 300], phase: [600, 184], walk: [100, 400], guide: [1040, 1030] }[kind];
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
    // Atlas: south-facing front, north-facing back, then the pedestrian-and-bicycle disc. Only the
    // destinations legible in the October 2024 panorama and today's photograph; no distances.
    const white = '#f2f4f2', blue = '#2459a8';
    const board = (oy, draw) => {
      g.save(); g.translate(0, oy);
      g.fillStyle = blue; g.fillRect(0, 0, 520, 340);
      g.strokeStyle = g.fillStyle = white; g.lineWidth = 6; g.strokeRect(9, 9, 502, 322);
      g.lineWidth = 16; g.lineCap = 'butt';
      draw(); g.restore();
    };
    const head = (x, y, dx, dy) => {
      g.beginPath(); g.moveTo(x + dx * 44, y + dy * 44);
      g.lineTo(x - dy * 28, y + dx * 28); g.lineTo(x + dy * 28, y - dx * 28); g.closePath(); g.fill();
    };
    const meishin = (x, y) => {
      g.fillStyle = '#2f7d57'; g.fillRect(x, y, 228, 58); g.lineWidth = 4; g.strokeRect(x, y, 228, 58);
      g.fillStyle = white; g.textAlign = 'left'; g.font = `700 40px ${FONT}`; g.fillText('E1 名神', x + 14, y + 29);
    };
    board(0, () => {   // leaving southward: 東近江 ahead, the expressway and Route 8 to the left
      g.beginPath(); g.moveTo(440, 300); g.lineTo(440, 128); g.moveTo(448, 270); g.lineTo(150, 270); g.stroke();
      head(440, 128, 0, -1); head(150, 270, -1, 0);
      g.textAlign = 'right'; g.font = `700 52px ${FONT}`; g.fillText('東近江', 400, 52);
      g.font = `500 22px ${FONT}`; g.fillText('Higashiomi', 400, 92);
      meishin(34, 118);
      g.textAlign = 'left'; g.font = `700 54px ${FONT}`; g.fillText('国道8号', 36, 212);
      g.font = `500 24px ${FONT}`; g.fillText('Route 8', 196, 250);
    });
    board(340, () => {  // approaching northward: 彦根城 ahead, the expressway and Route 8 to the right
      g.beginPath(); g.moveTo(110, 310); g.lineTo(110, 128); g.moveTo(102, 262); g.lineTo(400, 262); g.stroke();
      head(110, 128, 0, -1); head(400, 262, 1, 0);
      g.textAlign = 'left'; g.font = `700 52px ${FONT}`; g.fillText('彦根城', 40, 52);
      g.font = `500 22px ${FONT}`; g.fillText('Hikone Castle', 40, 92);
      meishin(262, 26);
      g.textAlign = 'right'; g.font = `700 54px ${FONT}`; g.fillText('国道8号', 484, 150);
      g.font = `500 24px ${FONT}`; g.fillText('Route 8', 484, 200);
    });
    // 自転車及び歩行者専用: white adult-and-child walking above a bicycle on blue
    g.save(); g.translate(671, 128);
    g.fillStyle = white; g.beginPath(); g.arc(0, 0, 128, 0, Math.PI * 2); g.fill();
    g.fillStyle = blue; g.beginPath(); g.arc(0, 0, 118, 0, Math.PI * 2); g.fill();
    g.fillStyle = g.strokeStyle = white; g.lineCap = 'round';
    // adult (left) holding the child's hand
    for (const [x, s] of [[-20, 1], [24, 0.7]]) {
      const top = -84 + (1 - s) * 84, hip = -18 - (1 - s) * 8, foot = 8 - (1 - s) * 4;
      g.beginPath(); g.arc(x, top + 11 * s, 11 * s, 0, Math.PI * 2); g.fill();
      g.lineWidth = 14 * s; g.beginPath(); g.moveTo(x, top + 26 * s); g.lineTo(x, hip);
      g.moveTo(x, hip); g.lineTo(x - 10 * s, foot); g.moveTo(x, hip); g.lineTo(x + 10 * s, foot); g.stroke();
    }
    g.lineWidth = 7; g.beginPath(); g.moveTo(-20, -52); g.lineTo(2, -34); g.lineTo(24, -40); g.stroke();
    g.lineWidth = 8;
    for (const x of [-42, 42]) { g.beginPath(); g.arc(x, 52, 24, 0, Math.PI * 2); g.stroke(); }
    g.beginPath(); g.moveTo(-42, 52); g.lineTo(-12, 22); g.lineTo(26, 22); g.lineTo(42, 52);
    g.moveTo(-12, 22); g.lineTo(2, 52); g.lineTo(26, 22); g.moveTo(-16, 14); g.lineTo(-4, 14);
    g.moveTo(26, 22); g.lineTo(22, 10); g.lineTo(34, 10); g.stroke();
    g.restore();
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
