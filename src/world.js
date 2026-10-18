// Impressionist Hikone meshes at imported and browser-owned placements.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { placement } from './coords.js';
import { LIGHT, painted, paintedSky, PigmentPalette } from './style.js';
import { environmentInstances } from './environment-instances.js';
import { packPigments } from './geometry-budget.js';
import { buildOverheadWires } from './overhead-wires.js';
import { CameraObstacles } from './camera-obstacles.js';
import { APPROACH_BUILDINGS } from './castle-approach.js';

const NO_SHADOW = /^(HK_(Road|Ground|Water|Terrain|Sign|Bollard|Guardrail|ChainFence)|ART_(PavingDetails|MoatRoad|Kyobashi(Roads|Land|Water)))/;
const loader = new GLTFLoader();
const models = new Map();
const loaded = new Map();

async function loadParts(name, detail, packed) {
  const gltf = await loader.loadAsync(`data/models/impressionist/${name}${detail === 'low' ? '.lod' : ''}.glb`);
  gltf.scene.updateMatrixWorld(true);
  const parts = [];
  gltf.scene.traverse(o => { if (o.isMesh) parts.push({ geometry: packed ? packPigments(o.geometry) : o.geometry,
    material: o.material, matrix: o.matrixWorld.clone() }); });
  return parts;
}

/** The parts (geometry, material, local matrix) of a model, loaded once. */
export async function model(name, detail = 'high', { packed = true } = {}) {
  const key = name + '/' + detail + '/' + packed;
  if (!models.has(key)) {
    models.set(key, loadParts(name, detail, packed).then(parts => {
      if (detail === 'high') loaded.set(name, parts);
      return parts;
    }).catch(error => { models.delete(key); throw error; }));
  }
  return models.get(key);
}

/** Registers parts for a model name without loading a file (tests run without a browser). */
export function registerModel(name, parts) { loaded.set(name, parts); }

/** Parts of a model already loaded with model() (for objects created during the run). */
export function loadedModel(name) {
  const parts = loaded.get(name);
  if (!parts) throw new Error(`model ${name} was not preloaded`);
  return parts;
}

export function buildMaterials(specs) {
  const map = new Map();
  for (const s of specs) {
    // The pigment is baked into COLOR_0, including the separate relief strokes.
    // Original photographic/regular-tile textures would hide this mesh painting.
    const m = painted(new THREE.MeshLambertMaterial({
      name: s.name, color: 0xffffff, vertexColors: true,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    }));
    if (s.emissive) { m.emissive.setRGB(...s.color, THREE.SRGBColorSpace); m.emissiveIntensity = 0.4; }
    map.set(s.name, m);
  }
  return map;
}

export function material(materials, m) {
  const shared = m && materials.get(m.name);
  if (shared) return shared;
  if (m?.userData.hkPainted === true) return m;
  if (m && !m.userData.hkPainted) {
    const simple = painted(new THREE.MeshLambertMaterial({ name: m.name, color: m.color,
      vertexColors: m.vertexColors, emissive: m.emissive, emissiveIntensity: m.emissiveIntensity,
      side: m.side, transparent: m.transparent, opacity: m.opacity }));
    simple.userData.hkPainted = true;
    m.userData.hkPainted = simple;
  }
  return m?.userData.hkPainted || m;
}

/**
 * The city from layout.json items { a: asset, p: [x, y, z], r: yaw, s: scale }: one shared pigment
 * material, one InstancedMesh per asset and detail level (environment-instances.js).
 */
// ground models that must stay under the roads: where their surface reached above a road (the castle
// terrain's bank edge at the bridge stood 14 cm proud of the carriageway, a green lip seen from the
// castle side), their vertices are pressed just under it
const UNDER_ROADS = /^HK_(Terrain|Ground)/;
const UNDER = 0.02;

export async function buildEnvironment(scene, layout, materials, ground = null) {
  const byAsset = new Map();
  for (const item of layout.items) {
    if (!byAsset.has(item.a)) byAsset.set(item.a, []);
    byAsset.get(item.a).push(item);
  }
  // scene.json's pigments (and their emissive light) win over the GLB's own material
  const resolve = parts => parts.map(part => ({ ...part, material: materials.get(part.material.name) ?? part.material }));
  // ground models pressed under the roads (one placement each)
  const pressUnderRoads = (parts, item) => parts.map(part => {
    const base = item.p[1];
    const geometry = part.geometry.clone(), position = geometry.getAttribute('position');
    const local = new THREE.Vector3(), world = new THREE.Vector3(), inverse = part.matrix.clone().invert();
    const place = placement(...item.p, item.r, item.s), at = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      world.fromBufferAttribute(position, i).applyMatrix4(part.matrix);
      at.copy(world).applyMatrix4(place);                   // three.js world; Unity x = -x
      const road = ground.roadHeightAt(-at.x, at.z);
      if (road != null && at.y > road - UNDER) world.y = road - UNDER - base;
      local.copy(world).applyMatrix4(inverse);
      position.setXYZ(i, local.x, local.y, local.z);
    }
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return { ...part, geometry };
  });
  const definitions = await Promise.all([...byAsset].map(async ([asset, items]) => {
    // These are merge inputs, not reusable runtime models. Keeping them in the model cache
    // retains both original GLBs alongside the merged city for the lifetime of the page.
    let [high, low] = await Promise.all([loadParts(asset, 'high', false), loadParts(asset, 'low', false)]);
    const background = items.every(item => item.g === 'WebLandmark');
    if (ground && !background && UNDER_ROADS.test(asset) && items.length === 1)
      [high, low] = [pressUnderRoads(high, items[0]), pressUnderRoads(low, items[0])];
    return { asset, items, high: resolve(high), low: resolve(low), background,
      batched: asset === 'ART_CastleApproach',
      cameraSolids: asset === 'ART_CastleApproach' ? APPROACH_BUILDINGS : null };
  }));
  const palette = new PigmentPalette();
  const env = environmentInstances(definitions, palette, asset => !NO_SHADOW.test(asset), m => m.side);
  const wires = buildOverheadWires(layout.overheadWires ?? []);
  if (wires) env.root.add(wires);
  scene.add(env.root);
  return Object.assign(env, { palette, assetCount: byAsset.size, style: 'mesh-pigment-impasto',
    cameraObstacles: new CameraObstacles(definitions) });
}

/** Bake the painted sky once; diffuse light and cached shadows follow the participant. */
export function buildLight(scene, renderer, light) {
  const rgb = c => new THREE.Color().setRGB(...c, THREE.SRGBColorSpace);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), paintedSky());
  sky.name = 'Sky';
  sky.renderOrder = -1;
  const envScene = new THREE.Scene();
  envScene.add(sky);
  const skyTarget = new THREE.WebGLCubeRenderTarget(512, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  new THREE.CubeCamera(1, 1700, skyTarget).update(renderer, envScene);
  scene.background = skyTarget.texture;
  sky.geometry.dispose(); sky.material.dispose();

  scene.add(new THREE.HemisphereLight(rgb(LIGHT.sky), rgb(LIGHT.ground), LIGHT.hemisphere));
  // the port's own sun (Unity's light now carries this sun converted to its Lambert, VRLearn D38)
  const sun = new THREE.DirectionalLight(rgb(LIGHT.sunColor), LIGHT.sunIntensity);
  // Unity's light travels along its forward; three's points from position to target (x mirrored)
  const d = new THREE.Vector3(light.direction[0], -light.direction[1], -light.direction[2]).normalize();
  sun.userData.offset = d.multiplyScalar(80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.autoUpdate = false;
  sun.shadow.needsUpdate = true;
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 220 });
  // The first instance caster list is built before the renderer updates this camera.
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  scene.fog = new THREE.Fog(rgb(LIGHT.fog), LIGHT.fogStart, LIGHT.fogEnd);
  const followed = new THREE.Vector3(Infinity, Infinity, Infinity);
  const RECENTER = 4, texel = (sun.shadow.camera.right - sun.shadow.camera.left) / sun.shadow.mapSize.x;
  const lightZ = sun.userData.offset.clone().normalize();
  const lightX = new THREE.Vector3(0, 1, 0).cross(lightZ).normalize(), lightY = lightZ.clone().cross(lightX);
  return {
    sky, sun,
    /** The shadow camera as it stands (env culling keeps every caster inside it). */
    get shadowCamera() { return sun.shadow.camera; },
    invalidate() { sun.shadow.needsUpdate = true; },
    /**
     * Centres the shadow box on the participant. The centre moves in whole shadow-map texels of the
     * light's own axes (the basis three's lookAt gives the shadow camera), so re-centring never
     * shifts shadow edges by a fraction of a texel (that showed as shimmering while walking).
     * Moving things never cast into this map, so it is redrawn only here and on LOD changes.
     */
    follow(position) {
      const moved = followed.distanceToSquared(position) > RECENTER * RECENTER;
      if (moved) {
        followed.copy(position);
        const a = Math.round(position.dot(lightX) / texel) * texel, b = Math.round(position.dot(lightY) / texel) * texel;
        const c = position.dot(lightZ);
        sun.target.position.copy(lightX).multiplyScalar(a).addScaledVector(lightY, b).addScaledVector(lightZ, c);
        sun.position.copy(sun.target.position).add(sun.userData.offset);
        sun.updateMatrixWorld(); sun.target.updateMatrixWorld();
        sun.shadow.updateMatrices(sun);
      }
      if (moved) sun.shadow.needsUpdate = true;              // only still things cast (blob-shadow.js)
    }
  };
}
