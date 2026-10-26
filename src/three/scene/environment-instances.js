// The city in few draw calls. Every asset's parts are merged into one geometry per detail level
// (their colours become per-vertex pigment rows of one shared material), and all placements of
// an asset draw as one InstancedMesh per level. The CPU picks the placements in view and their
// detail level, so near objects keep every brush stroke while distant ones use the light LOD. The
// few very large unique assets (raised road, ground planes, castle-hill terrain) are cut into
// coarse world cells instead.
//
// Shadows: the sun's shadow map is drawn from the light LOD only, by a shadow-only InstancedMesh per
// asset with its own list (every caster inside the shadow box). So the view's LOD switches (every
// few metres while walking or riding) never change the shadow casters and never force the whole
// shadow map to be redrawn; it is redrawn only when the shadow box itself moves. The light LOD
// keeps every silhouette within 4 cm (art.test.mjs), well under a shadow-map texel (~9 cm).
//
// Why: on ANGLE/Metal (macOS) and on mobile GPUs each draw costs microseconds of driver time; the
// earlier per-colour, per-object multi-draw issued about 3,900 draws per frame and the GPU sat idle.
import * as THREE from 'three';
import { placement } from './coords.ts';
import { geometryBytes } from './geometry-budget.js';

export const LOD_FAR = 60, LOD_NEAR = 52.8;       // hysteresis: switch out at 60 m, back in at 52.8 m
const BIG = 100;                                  // assets wider than this are cut into cells
const MARGIN = 1.5;                               // safety for fast turns and the camera's near plane
// Lists rebuild only after the view moves 25 cm or turns 1° (quaternion dots use half angles).
// The culling margin grows with distance to cover the turn in between.
const MOVE_AGAIN = 0.25, TURN_AGAIN = Math.cos(0.5 * Math.PI / 180), TURN_MARGIN = Math.tan(2 * Math.PI / 180);
const cullBounds = new THREE.Box3();

// Flat or elongated cells have loose bounding spheres. Test their actual boxes in both passes;
// a distant campus behind the viewer should not draw because a sphere also encloses open space.
function cellInFrustum(frustum) {
  return frustum.intersectsBox(cullBounds.copy(this.geometry.boundingBox).applyMatrix4(this.matrixWorld));
}

/** The attribute as plain floats (normalized integers scaled back), without per-element getters. */
function floats(attribute) {
  if (!attribute.isInterleavedBufferAttribute && attribute.array instanceof Float32Array) return attribute.array;
  // GLBs store byte normals/pigments (tools/quantize_glb.py): rescale in one pass.
  const scale = { Int8Array: 127, Uint8Array: 255 }[attribute.array.constructor.name];
  if (scale && attribute.normalized && !attribute.isInterleavedBufferAttribute
    && attribute.array.length === attribute.count * attribute.itemSize) {
    const source = attribute.array, out = new Float32Array(source.length);
    for (let i = 0; i < source.length; i++) out[i] = Math.max(source[i] / scale, -1);
    return out;
  }
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

/** Splits by triangle centroid, retaining every triangle. A distant proxy can share the low attributes. */
export function cutIntoCells(geometry, cellSize, shareAttributes = false) {
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
  const point = new THREE.Vector3();
  for (const [key, ids] of cells) {
    if (shareAttributes) {
      const cell = new THREE.BufferGeometry();
      for (const [name, attribute] of Object.entries(geometry.attributes)) cell.setAttribute(name, attribute);
      cell.setIndex(new THREE.BufferAttribute(new index.constructor(ids), 1));
      // BufferGeometry's default bounds include unused vertices in the shared attributes.
      cell.boundingBox = new THREE.Box3();
      for (const id of ids) cell.boundingBox.expandByPoint(point.fromBufferAttribute(geometry.attributes.position, id));
      cell.boundingSphere = new THREE.Sphere();
      cell.boundingBox.getCenter(cell.boundingSphere.center);
      let radiusSquared = 0;
      for (const id of ids) radiusSquared = Math.max(radiusSquared,
        point.fromBufferAttribute(geometry.attributes.position, id).distanceToSquared(cell.boundingSphere.center));
      cell.boundingSphere.radius = Math.sqrt(radiusSquared);
      result.push({ key, geometry: cell });
      continue;
    }
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
 * definitions: [{ asset, items, high: parts, low: parts, background?, batched?, cellSize?, lodFar? }] with parts { geometry, material, matrix }.
 * Background landmarks retain one compact silhouette draw and their longer atmospheric range.
 * cellSize partitions a large composite even when it uses the background atmospheric range.
 * Batched composites otherwise retain one draw; background selects the longer atmospheric range.
 * castsShadow(asset) → boolean. sideOf(material) → THREE side (scene pigments are single-sided).
 */
export function environmentInstances(definitions, palette, castsShadow, sideFor = () => THREE.FrontSide) {
  const root = new THREE.Group();
  root.name = 'HikoneEnvironment';
  const assets = [], cells = [], regions = [];
  const matrix = new THREE.Matrix4(), box = new THREE.Box3(), size = new THREE.Vector3();
  for (const definition of definitions) {
    const { asset, items, background = false, batched = false, cellSize = null } = definition;
    // Alpha-blended panes cannot enter the opaque pigment merge or the shadow silhouette.
    const glazing = [definition.high, definition.low].map(parts => parts.filter(p => p.material.transparent));
    const [high, low] = [definition.high, definition.low].map(parts => parts.filter(p => !p.material.transparent));
    const shadow = castsShadow(asset);
    box.makeEmpty();
    for (const part of high) {
      part.geometry.boundingBox ?? part.geometry.computeBoundingBox();
      box.union(part.geometry.boundingBox.clone().applyMatrix4(part.matrix));
    }
    box.getSize(size);
    // A distant, compact-polygon landmark hill is cheaper as one low-detail draw than many cells.
    if (!glazing.some(parts => parts.length) && items.length === 1
      && (cellSize != null || (!background && !batched && Math.max(size.x, size.z) > BIG))) {
      // Cap cells at 128 m: the 1.4 km ground otherwise submits 280 m of brush
      // geometry at once, including much that is outside the view or behind fog.
      const step = cellSize ?? Math.max(64, Math.min(128, Math.max(size.x, size.z) / 5));
      placement(...items[0].p, items[0].r, items[0].s, matrix);
      const region = cellSize != null ? { bounds: new THREE.Box3(), low: false, farMesh: null, cells: [] } : null;
      const levels = [high, low].map((parts, detail) => {
        const merged = mergeParts(parts, palette, matrix), split = cutIntoCells(merged, step, !!region && detail === 1);
        if (region) region.bounds.union(merged.boundingBox);
        if (region && detail === 1) {
          // Far away, draw the whole silhouette once instead of submitting dozens of tiny cells.
          // Nearby cells share these attributes, retaining only their own triangle indices/bounds.
          const mesh = new THREE.Mesh(merged, palette.material(sideFor(high[0].material), true, background ? 0.55 : 1));
          mesh.name = `${asset}/distant`;
          mesh.visible = false; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
          mesh.intersectsFrustum = cellInFrustum;
          region.farMesh = mesh; root.add(mesh);
        } else merged.dispose();
        return new Map(split.map(c => [c.key, c.geometry]));
      });
      if (region) regions.push(region);
      for (const key of new Set([...levels[0].keys(), ...levels[1].keys()])) {
        const meshes = levels.map((level, detail) => {
          const geometry = level.get(key);
          if (!geometry) return null;
          const mesh = new THREE.Mesh(geometry, palette.material(sideFor(high[0].material), detail === 1, background ? 0.55 : 1));
          mesh.name = `${asset}/${key}`;
          mesh.castShadow = shadow; mesh.receiveShadow = true;
          mesh.matrixAutoUpdate = false;
          mesh.intersectsFrustum = cellInFrustum;
          root.add(mesh);
          return mesh;
        });
        const [highMesh, lowMesh] = meshes;
        if (shadow && lowMesh) {
          // only the light level casts; it stays in the scene for the shadow pass and draws nothing
          // in the view while the cell is near (its draw range is emptied just before that draw)
          if (highMesh) highMesh.castShadow = false;
          lowMesh.onBeforeShadow = () => { lowMesh.geometry.drawRange.count = Infinity; };
          lowMesh.onBeforeRender = () => { lowMesh.geometry.drawRange.count = lowMesh.userData.near ? 0 : Infinity; };
          lowMesh.userData.shadowOnly = true;
        }
        const bounds = new THREE.Box3();
        for (const m of meshes) if (m) bounds.union(m.geometry.boundingBox);
        const cell = { asset, key, highMesh: meshes[0], lowMesh: meshes[1], bounds, low: false, region };
        cells.push(cell);
        if (region) region.cells.push(cell);
      }
      continue;
    }
    // Repeated or compact asset: one InstancedMesh per detail level, updated on view changes.
    const side = sideFor(high[0].material);
    const levels = [high, low].map((parts, level) => {
      const geometry = mergeParts(parts, palette);
      const mesh = new THREE.InstancedMesh(geometry, palette.material(side, false, background ? 0.55 : 1), items.length);
      mesh.name = asset + (level ? '/low' : '/high');
      mesh.count = 0;
      mesh.visible = false;
      mesh.frustumCulled = false;                  // culled per placement below
      mesh.castShadow = false; mesh.receiveShadow = true;      // the shadow mesh below casts
      mesh.matrixAutoUpdate = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.userData.drawCount = 0;
      root.add(mesh);
      return mesh;
    });
    const transparent = glazing.map((parts, level) => {
      const groups = new Map();
      for (const part of parts) {
        if (!groups.has(part.material.name)) groups.set(part.material.name, []);
        groups.get(part.material.name).push(part);
      }
      return [...groups].map(([name, panes]) => {
        const material = panes[0].material;
        material.depthWrite = false;
        material.forceSinglePass = true;
        const mesh = new THREE.InstancedMesh(mergeParts(panes, palette), material, items.length);
        mesh.name = `${asset}/${level ? 'low' : 'high'}/${name}`;
        // Reuse the placement upload, LOD and culling of the opaque frame.
        mesh.instanceMatrix = levels[level].instanceMatrix;
        mesh.count = 0; mesh.visible = false; mesh.frustumCulled = false;
        mesh.matrixAutoUpdate = false;
        mesh.castShadow = false; mesh.receiveShadow = false;
        root.add(mesh);
        return mesh;
      });
    });
    // the casters: light LOD, every placement inside the shadow box; drawn by the shadow pass only
    // (in the view pass its count is 0 for the draw, so nothing is drawn; three skips the GL call)
    let shadowMesh = null;
    if (shadow) {
      shadowMesh = new THREE.InstancedMesh(levels[1].geometry, levels[1].material, items.length);
      shadowMesh.name = asset + '/shadow';
      shadowMesh.castShadow = true; shadowMesh.receiveShadow = false;
      shadowMesh.frustumCulled = false; shadowMesh.matrixAutoUpdate = false;
      shadowMesh.count = 0; shadowMesh.visible = false;
      shadowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      shadowMesh.userData.shadowOnly = true;
      shadowMesh.userData.shadowCount = 0;
      // hidden except on the frames that redraw the shadow map (casters(true)); then, in that frame's
      // view pass, it draws nothing
      shadowMesh.onBeforeRender = () => { shadowMesh.count = 0; };
      shadowMesh.onAfterRender = () => { shadowMesh.count = shadowMesh.userData.shadowCount; };
      root.add(shadowMesh);
    }
    const sphere = levels[0].geometry.boundingSphere;
    const placements = items.map((item, index) => {
      const m = placement(...item.p, item.r, item.s, new THREE.Matrix4());
      const center = sphere.center.clone().applyMatrix4(m);
      return { item, index, matrix: m, center, radius: sphere.radius * m.getMaxScaleOnAxis(), low: false };
    });
    assets.push({ asset, shadow, high: levels[0], low: levels[1], transparent, shadowMesh, placements,
      lodFar: definition.lodFar ?? LOD_FAR,
      highIndices: new Uint32Array(items.length).fill(0xffffffff), lowIndices: new Uint32Array(items.length).fill(0xffffffff) });
  }

  const frustum = new THREE.Frustum(), second = new THREE.Frustum(), shadowFrustum = new THREE.Frustum();
  const projection = new THREE.Matrix4();
  const eye = new THREE.Vector3(), secondEye = new THREE.Vector3(), sphere = new THREE.Sphere();
  const lastView = new Float64Array(80).fill(NaN), view = new Float64Array(80);
  const rotation = new THREE.Quaternion(), lastRotation = new THREE.Quaternion(), lastEye = new THREE.Vector3(Infinity, 0, 0);
  const frustumOf = (camera, f, position) => {
    camera.updateWorldMatrix(true, false);
    f.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    camera.getWorldPosition(position);
  };
  const lodOf = (thing, distance, far = LOD_FAR) => {
    const low = distance > far * (thing.low ? LOD_NEAR / LOD_FAR : 1);
    const changed = low !== thing.low;
    thing.low = low;
    return changed;
  };
  let builds = 0;
  return {
    root, assets, cells, regions,
    get drawCalls() { return root.children.filter(m => m.visible && !m.userData.shadowOnly).length; },
    /**
     * Shows the shadow casters for a frame that redraws the shadow map (call before rendering with
     * the light's needsUpdate); hidden otherwise, they cost the view pass nothing.
     */
    casters(on) {
      for (const a of assets) if (a.shadowMesh) a.shadowMesh.visible = on && a.shadowMesh.userData.shadowCount > 0;
      for (const c of cells) if (c.lowMesh?.userData.shadowOnly)
        c.lowMesh.visible = (!c.region?.farMesh.visible && (c.low || !c.highMesh)) || on;
    },
    get builds() { return builds; },
    objects: definitions.reduce((n, d) => n + d.items.length, 0),
    get geometryBytes() { return geometryBytes(root); },
    /**
     * Chooses the placements to draw and their detail for this view (and an optional second view);
     * casters inside `shadowCamera`'s frustum are always kept so shadows from behind the viewer
     * stay. Instances keep their layout order (a stable order keeps coplanar overlaps from
     * flickering). Returns true when a detail level changed.
     */
    /** @param {import('three').Camera | null} shadowCamera */
    updateLOD(camera, secondCamera = null, shadowCamera = null) {
      if (!root.visible) return false;
      frustumOf(camera, frustum, eye);
      if (secondCamera) frustumOf(secondCamera, second, secondEye);
      view.fill(0);
      view.set(camera.projectionMatrix.elements);
      if (secondCamera) {
        view.set(secondCamera.matrixWorld.elements, 16);
        view.set(secondCamera.projectionMatrix.elements, 32);
      }
      camera.getWorldQuaternion(rotation);
      let same = eye.distanceToSquared(lastEye) < MOVE_AGAIN * MOVE_AGAIN && Math.abs(rotation.dot(lastRotation)) > TURN_AGAIN;
      for (let i = 0; same && i < 48; i++) if (view[i] !== lastView[i]) same = false;
      // the shadow list follows the shadow box only (it moves when the view re-centres)
      let shadowMoved = false;
      if (shadowCamera) {
        shadowCamera.updateMatrixWorld();
        view.set(shadowCamera.matrixWorld.elements, 48);
        view.set(shadowCamera.projectionMatrix.elements, 64);
        for (let i = 48; i < 80; i++) if (view[i] !== lastView[i]) shadowMoved = true;
      }
      if (same && !shadowMoved) return false;
      if (shadowMoved) {
        lastView.set(view);
        shadowFrustum.setFromProjectionMatrix(projection.multiplyMatrices(shadowCamera.projectionMatrix, shadowCamera.matrixWorldInverse));
        for (const a of assets) {
          const mesh = a.shadowMesh;
          if (!mesh) continue;
          const array = mesh.instanceMatrix.array;
          let n = 0;
          for (const p of a.placements) {
            sphere.set(p.center, p.radius + MARGIN);
            if (shadowFrustum.intersectsSphere(sphere)) array.set(p.matrix.elements, 16 * n++);
          }
          mesh.count = mesh.userData.shadowCount = n;
          mesh.instanceMatrix.clearUpdateRanges();
          if (n) { mesh.instanceMatrix.addUpdateRange(0, n * 16); mesh.instanceMatrix.needsUpdate = true; }
        }
      }
      let changed = shadowMoved;
      if (!same) {
        lastView.set(view); lastEye.copy(eye); lastRotation.copy(rotation);
        builds++;
        for (const a of assets) {
          let highCount = 0, lowCount = 0, highDirty = false, lowDirty = false;
          for (const p of a.placements) {
            p.distance = Math.max(0, Math.min(p.center.distanceTo(eye), secondCamera ? p.center.distanceTo(secondEye) : Infinity) - p.radius);
            lodOf(p, p.distance, a.lodFar);
            sphere.set(p.center, p.radius + MARGIN + p.distance * TURN_MARGIN);
            if (!frustum.intersectsSphere(sphere) && !(secondCamera && second.intersectsSphere(sphere))) continue;
            const mesh = p.low ? a.low : a.high, indices = p.low ? a.lowIndices : a.highIndices;
            const n = p.low ? lowCount++ : highCount++;
            if (indices[n] !== p.index) {
              indices[n] = p.index;
              mesh.instanceMatrix.array.set(p.matrix.elements, 16 * n);
              if (p.low) lowDirty = true; else highDirty = true;
            }
          }
          a.high.count = a.high.userData.drawCount = highCount;
          a.low.count = a.low.userData.drawCount = lowCount;
          if (highDirty) {
            a.high.instanceMatrix.clearUpdateRanges(); a.high.instanceMatrix.addUpdateRange(0, highCount * 16); a.high.instanceMatrix.needsUpdate = true;
          }
          if (lowDirty) {
            a.low.instanceMatrix.clearUpdateRanges(); a.low.instanceMatrix.addUpdateRange(0, lowCount * 16); a.low.instanceMatrix.needsUpdate = true;
          }
        }
      }
      for (const a of assets) {
        a.high.visible = a.high.userData.drawCount > 0;
        a.low.visible = a.low.userData.drawCount > 0;
        for (let level = 0; level < 2; level++) for (const mesh of a.transparent[level]) {
          const frame = level ? a.low : a.high;
          mesh.count = frame.count;
          mesh.visible = frame.visible;
        }
      }
      for (const r of regions) {
        lodOf(r, Math.min(r.bounds.distanceToPoint(eye), secondCamera ? r.bounds.distanceToPoint(secondEye) : Infinity));
        let visible = 0;
        if (r.low) for (const c of r.cells) if (c.lowMesh && (frustum.intersectsBox(c.lowMesh.geometry.boundingBox)
          || (secondCamera && second.intersectsBox(c.lowMesh.geometry.boundingBox)))) visible++;
        // A narrow glimpse of the hill is cheaper as a few cells. A panorama is cheaper as one
        // complete silhouette. This only chooses grouping, so small camera changes cannot open gaps.
        r.farMesh.visible = r.low && visible > 8;
      }
      for (const c of cells) {
        const d = Math.min(c.bounds.distanceToPoint(eye), secondCamera ? c.bounds.distanceToPoint(secondEye) : Infinity);
        const switched = lodOf(c, d);
        // three culls cells by their bounds; a level without triangles in a cell draws nothing
        if (c.highMesh) c.highMesh.visible = !c.low && !c.region?.farMesh.visible;
        if (c.lowMesh) {
          c.lowMesh.userData.near = (!c.low && !!c.highMesh) || !!c.region?.farMesh.visible;
          c.lowMesh.visible = (c.low || !c.highMesh) && !c.region?.farMesh.visible; // casters() shows light levels for shadow frames
        }
        // a casting cell with only one level: its casters appear or vanish with the switch
        if (switched && !c.lowMesh?.userData.shadowOnly && (c.highMesh?.castShadow || c.lowMesh?.castShadow)) changed = true;
      }
      return changed;
    },
  };
}
