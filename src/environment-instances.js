// The city in few draw calls. Every asset's parts are merged into one geometry per detail level
// (their colours become per-vertex pigment rows of one shared material), and all placements of
// an asset draw as one InstancedMesh per level. The CPU picks, per frame, the placements in view
// (or inside the sun's shadow box) and their detail level, so near objects keep every brush
// stroke while distant ones use the light LOD. The few very large unique assets (raised road,
// ground planes, castle-hill terrain) are cut into coarse world cells instead.
//
// Why: on ANGLE/Metal (macOS) and on mobile GPUs each draw costs microseconds of driver time; the
// earlier per-colour, per-object multi-draw issued about 3,900 draws per frame and the GPU sat idle.
import * as THREE from 'three';
import { placement } from './coords.js';

export const LOD_FAR = 60, LOD_NEAR = 52.8;       // hysteresis: switch out at 60 m, back in at 52.8 m
const BIG = 100;                                  // assets wider than this are cut into cells
const MARGIN = 1.5;                               // safety for fast turns and the camera's near plane
// the lists are rebuilt only once the view has moved this far or turned this much (1–2 ms of CPU
// each); the culling margin grows with distance to cover the turn in between
const MOVE_AGAIN = 0.25, TURN_AGAIN = Math.cos(1 * Math.PI / 180), TURN_MARGIN = Math.tan(2 * Math.PI / 180);

/** The attribute as plain floats (normalized integers scaled back), without per-element getters. */
function floats(attribute) {
  if (!attribute.isInterleavedBufferAttribute && attribute.array instanceof Float32Array) return attribute.array;
  const out = new Float32Array(attribute.count * attribute.itemSize);
  for (let i = 0; i < attribute.count; i++) for (let c = 0; c < attribute.itemSize; c++)
    out[i * attribute.itemSize + c] = attribute.getComponent(i, c);
  return out;
}

/** One geometry from an asset's parts: positions/normals transformed, colours kept, pigment row added. */
export function mergeParts(parts, palette, transform = null) {
  let vertices = 0, indices = 0;
  for (const p of parts) { vertices += p.geometry.attributes.position.count; indices += p.geometry.index.count; }
  const position = new Float32Array(vertices * 3), normal = new Int8Array(vertices * 3);
  const color = new Uint8Array(vertices * 3).fill(255), pigment = new Uint8Array(vertices);
  const index = vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
  const m = new THREE.Matrix4(), nm = new THREE.Matrix3();
  let vo = 0, io = 0;
  for (const part of parts) {
    const g = part.geometry, count = g.attributes.position.count;
    m.copy(part.matrix);
    if (transform) m.premultiply(transform);
    nm.getNormalMatrix(m);
    const e = m.elements, n = nm.elements, row = palette.row(part.material);
    const pos = floats(g.attributes.position);
    for (let i = 0; i < count; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2], o = (vo + i) * 3;
      position[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
      position[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      position[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
    if (g.attributes.normal) {
      const nor = floats(g.attributes.normal);
      for (let i = 0; i < count; i++) {
        const x = nor[i * 3], y = nor[i * 3 + 1], z = nor[i * 3 + 2], o = (vo + i) * 3;
        const nx = n[0] * x + n[3] * y + n[6] * z, ny = n[1] * x + n[4] * y + n[7] * z, nz = n[2] * x + n[5] * y + n[8] * z;
        const k = 127 / (Math.hypot(nx, ny, nz) || 1);
        normal[o] = Math.round(nx * k); normal[o + 1] = Math.round(ny * k); normal[o + 2] = Math.round(nz * k);
      }
    }
    if (g.attributes.color) {
      const col = floats(g.attributes.color), size = g.attributes.color.itemSize;
      for (let i = 0; i < count; i++) for (let c = 0; c < 3; c++)
        color[(vo + i) * 3 + c] = Math.round(Math.min(1, Math.max(0, col[i * size + c])) * 255);
    }
    pigment.fill(row, vo, vo + count);
    const src = g.index.array;
    for (let i = 0; i < src.length; i++) index[io + i] = src[i] + vo;
    vo += count; io += src.length;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3, true));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3, true));
  geometry.setAttribute('hkPigment', new THREE.BufferAttribute(pigment, 1));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Splits a world-space geometry into square cells by triangle centroid; every triangle lands in one cell. */
export function cutIntoCells(geometry, cellSize) {
  const position = geometry.attributes.position.array, index = geometry.index.array, cells = new Map();
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i], b = index[i + 1], c = index[i + 2];
    const x = Math.floor((position[a * 3] + position[b * 3] + position[c * 3]) / (3 * cellSize));
    const z = Math.floor((position[a * 3 + 2] + position[b * 3 + 2] + position[c * 3 + 2]) / (3 * cellSize));
    const key = x + ',' + z;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(a, b, c);
  }
  const result = [], remap = new Int32Array(geometry.attributes.position.count).fill(-1);
  for (const [key, ids] of cells) {
    const order = [];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (remap[id] < 0) { remap[id] = order.length; order.push(id); }
    }
    // The whole ground can need 32-bit indices while each cell fits in 16 bits.
    const local = new (order.length > 65535 ? Uint32Array : Uint16Array)(ids.length);
    for (let i = 0; i < ids.length; i++) local[i] = remap[ids[i]];
    for (const id of order) remap[id] = -1;
    const cell = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      const size = attribute.itemSize, source = attribute.array, array = new source.constructor(order.length * size);
      for (let i = 0; i < order.length; i++) for (let c = 0; c < size; c++) array[i * size + c] = source[order[i] * size + c];
      cell.setAttribute(name, new THREE.BufferAttribute(array, size, attribute.normalized));
    }
    cell.setIndex(new THREE.BufferAttribute(local, 1));
    cell.computeBoundingBox();
    cell.computeBoundingSphere();
    result.push({ key, geometry: cell });
  }
  return result;
}

/**
 * definitions: [{ asset, items, high: parts, low: parts }] with parts { geometry, material, matrix }.
 * castsShadow(asset) → boolean. sideOf(material) → THREE side (scene pigments are single-sided).
 */
export function environmentInstances(definitions, palette, castsShadow, sideFor = () => THREE.FrontSide) {
  const root = new THREE.Group();
  root.name = 'HikoneEnvironment';
  const assets = [], cells = [];
  const matrix = new THREE.Matrix4(), box = new THREE.Box3(), size = new THREE.Vector3();
  for (const { asset, items, high, low } of definitions) {
    const shadow = castsShadow(asset);
    box.makeEmpty();
    for (const part of high) {
      part.geometry.boundingBox ?? part.geometry.computeBoundingBox();
      box.union(part.geometry.boundingBox.clone().applyMatrix4(part.matrix));
    }
    box.getSize(size);
    if (items.length === 1 && Math.max(size.x, size.z) > BIG) {
      // Cap cells at 128 m: the 1.4 km ground otherwise submits 280 m of brush
      // geometry at once, including much that is outside the view or behind fog.
      const cellSize = Math.max(64, Math.min(128, Math.max(size.x, size.z) / 5));
      placement(...items[0].p, items[0].r, items[0].s, matrix);
      const levels = [high, low].map(parts => {
        const merged = mergeParts(parts, palette, matrix), split = cutIntoCells(merged, cellSize);
        merged.dispose();
        return new Map(split.map(c => [c.key, c.geometry]));
      });
      for (const key of new Set([...levels[0].keys(), ...levels[1].keys()])) {
        const meshes = levels.map((level, detail) => {
          const geometry = level.get(key);
          if (!geometry) return null;
          const mesh = new THREE.Mesh(geometry, palette.material(sideFor(high[0].material), detail === 1));
          mesh.name = `${asset}/${key}`;
          mesh.castShadow = shadow; mesh.receiveShadow = true;
          mesh.matrixAutoUpdate = false;
          root.add(mesh);
          return mesh;
        });
        const bounds = new THREE.Box3();
        for (const m of meshes) if (m) bounds.union(m.geometry.boundingBox);
        cells.push({ asset, key, highMesh: meshes[0], lowMesh: meshes[1], bounds, low: false });
      }
      continue;
    }
    // Repeated or compact asset: one InstancedMesh per detail level, filled each frame.
    const side = sideFor(high[0].material);
    const levels = [high, low].map((parts, level) => {
      const geometry = mergeParts(parts, palette);
      const mesh = new THREE.InstancedMesh(geometry, palette.material(side), items.length);
      mesh.name = asset + (level ? '/low' : '/high');
      mesh.count = 0;
      mesh.visible = false;
      mesh.frustumCulled = false;                  // culled per placement below
      mesh.castShadow = shadow; mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // The list starts with the placements inside the shadow box; the shadow pass draws only those.
      mesh.userData.drawCount = mesh.userData.shadowCount = 0;
      mesh.onBeforeShadow = () => { mesh.count = mesh.userData.shadowCount; };
      mesh.onAfterShadow = () => { mesh.count = mesh.userData.drawCount; };
      root.add(mesh);
      return mesh;
    });
    const sphere = levels[0].geometry.boundingSphere;
    const placements = items.map(item => {
      const m = placement(...item.p, item.r, item.s, new THREE.Matrix4());
      const center = sphere.center.clone().applyMatrix4(m);
      return { item, matrix: m, center, radius: sphere.radius * m.getMaxScaleOnAxis(), low: false };
    });
    assets.push({ asset, shadow, high: levels[0], low: levels[1], placements });
  }

  const frustum = new THREE.Frustum(), second = new THREE.Frustum(), shadowFrustum = new THREE.Frustum();
  const projection = new THREE.Matrix4();
  const eye = new THREE.Vector3(), secondEye = new THREE.Vector3(), sphere = new THREE.Sphere();
  const lastView = new Float32Array(64).fill(NaN), view = new Float32Array(64);
  const look = new THREE.Vector3(), lastLook = new THREE.Vector3(), lastEye = new THREE.Vector3(Infinity, 0, 0);
  const frustumOf = (camera, f, position) => {
    camera.updateWorldMatrix(true, false);
    f.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    camera.getWorldPosition(position);
  };
  const lodOf = (thing, distance) => {
    const low = distance > (thing.low ? LOD_NEAR : LOD_FAR);
    const changed = low !== thing.low;
    thing.low = low;
    return changed;
  };
  let builds = 0;
  return {
    root, assets, cells,
    get drawCalls() { return root.children.filter(m => m.visible).length; },
    get builds() { return builds; },
    objects: definitions.reduce((n, d) => n + d.items.length, 0),
    geometryBytes: root.children.reduce((sum, m) => sum + m.geometry.index.array.byteLength
      + Object.values(m.geometry.attributes).reduce((bytes, a) => bytes + a.array.byteLength, 0), 0),
    /**
     * Chooses the placements to draw and their detail for this view (and an optional second view);
     * casters inside `shadowCamera`'s frustum are always kept so shadows from behind the viewer
     * stay. Instances keep their layout order (a stable order keeps coplanar overlaps from
     * flickering). Returns true when a detail level changed.
     */
    updateLOD(camera, secondCamera = null, shadowCamera = null) {
      if (!root.visible) return false;
      frustumOf(camera, frustum, eye);
      if (secondCamera) frustumOf(secondCamera, second, secondEye);
      if (shadowCamera) shadowFrustum.setFromProjectionMatrix(projection.multiplyMatrices(shadowCamera.projectionMatrix, shadowCamera.matrixWorldInverse));
      view.fill(0);
      view.set(camera.projectionMatrix.elements, 16);
      if (secondCamera) view.set(secondCamera.matrixWorld.elements, 32);
      if (shadowCamera) view.set(shadowCamera.matrixWorld.elements, 48);
      camera.getWorldDirection(look);
      let same = eye.distanceTo(lastEye) < MOVE_AGAIN && look.dot(lastLook) > TURN_AGAIN;
      for (let i = 16; same && i < 64; i++) if (view[i] !== lastView[i]) same = false;
      if (same) return false;
      lastView.set(view); lastEye.copy(eye); lastLook.copy(look);
      builds++;
      let changed = false;
      const near = p => Math.min(p.distanceTo(eye), secondCamera ? p.distanceTo(secondEye) : Infinity);
      for (const a of assets) {
        // per level: [inside the shadow frustum | in view only]; the shadow pass draws the first part
        const lists = [[[], []], [[], []]];
        for (const p of a.placements) {
          p.distance = Math.max(0, near(p.center) - p.radius);
          if (lodOf(p, p.distance)) changed = true;
          sphere.set(p.center, p.radius + MARGIN + p.distance * TURN_MARGIN);
          const box = a.shadow && shadowCamera && shadowFrustum.intersectsSphere(sphere);
          if (box) lists[p.low ? 1 : 0][0].push(p);
          else if (frustum.intersectsSphere(sphere) || (secondCamera && second.intersectsSphere(sphere))) lists[p.low ? 1 : 0][1].push(p);
        }
        [a.high, a.low].forEach((mesh, level) => {
          const [box, view] = lists[level], array = mesh.instanceMatrix.array;
          let n = 0;
          for (const p of box) array.set(p.matrix.elements, 16 * n++);
          for (const p of view) array.set(p.matrix.elements, 16 * n++);
          mesh.count = mesh.userData.drawCount = n;
          mesh.userData.shadowCount = box.length;
          mesh.visible = n > 0;
          if (n) { mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, n * 16); mesh.instanceMatrix.needsUpdate = true; }
        });
      }
      for (const c of cells) {
        const d = Math.min(c.bounds.distanceToPoint(eye), secondCamera ? c.bounds.distanceToPoint(secondEye) : Infinity);
        if (lodOf(c, d)) changed = true;
        // three culls cells by their bounds; a level without triangles in a cell draws nothing
        if (c.highMesh) c.highMesh.visible = !c.low;
        if (c.lowMesh) c.lowMesh.visible = c.low;
      }
      return changed;
    },
  };
}
