// The Hikone Kyobashi environment: the same layout and models as the Unity scene, instanced, with
// the Unity materials, light and fog (data/scene.json from Tools/VRLearn/Web/Export Scene For Web).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { placement } from './coords.js';

const NO_SHADOW = /^HK_(Road|Ground|Water|Terrain|Sign|Bollard|Guardrail|ChainFence)/;
const loader = new GLTFLoader();
const models = new Map();
const loaded = new Map();

/** The parts (geometry, material, local matrix) of a model, loaded once. */
export async function model(name) {
  if (!models.has(name)) {
    models.set(name, loader.loadAsync(`data/models/${name}.glb`).then(gltf => {
      gltf.scene.updateMatrixWorld(true);
      const parts = [];
      gltf.scene.traverse(o => { if (o.isMesh) parts.push({ geometry: o.geometry, material: o.material, matrix: o.matrixWorld.clone() }); });
      loaded.set(name, parts);
      return parts;
    }));
  }
  return models.get(name);
}

/** Parts of a model already loaded with model() (for objects created during the run). */
export function loadedModel(name) {
  const parts = loaded.get(name);
  if (!parts) throw new Error(`model ${name} was not preloaded`);
  return parts;
}

export function buildMaterials(specs) {
  const textureLoader = new THREE.TextureLoader();
  const textures = new Map();
  const texture = (name, tile, color) => {
    const key = name + '@' + tile;
    if (!textures.has(key)) {
      const t = textureLoader.load(`data/textures/${name}.png`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(1 / tile, 1 / tile);       // model UVs are in metres
      t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 4;
      textures.set(key, t);
    }
    return textures.get(key);
  };
  const map = new Map();
  for (const s of specs) {
    const color = new THREE.Color().setRGB(s.color[0], s.color[1], s.color[2], THREE.SRGBColorSpace);
    const m = new THREE.MeshStandardMaterial({
      name: s.name, color, roughness: 1 - s.smoothness, metalness: s.metallic,
      map: s.texture ? texture(s.texture, s.tileMeters, true) : null,
      normalMap: s.normalMap ? texture(s.normalMap, s.normalTileMeters, false) : null,
    });
    if (s.emissive) { m.emissive = color.clone(); m.emissiveIntensity = 0.7; }
    if (s.name === 'HK_Glass') { m.roughness = 0.08; m.metalness = 0.3; }
    map.set(s.name, m);
  }
  return map;
}

export const material = (materials, m) => (m && materials.get(m.name)) || m;

/** Instanced environment from layout.json items { a: asset, p: [x, y, z], r: yaw, s: scale }. */
export async function buildEnvironment(scene, layout, materials) {
  const byAsset = new Map();
  for (const item of layout.items) {
    if (!byAsset.has(item.a)) byAsset.set(item.a, []);
    byAsset.get(item.a).push(item);
  }
  const root = new THREE.Group();
  root.name = 'HikoneEnvironment';
  const m = new THREE.Matrix4();
  let drawCalls = 0;
  await Promise.all([...byAsset.entries()].map(async ([asset, items]) => {
    let parts;
    try { parts = await model(asset); } catch (e) { console.warn('missing model', asset, e); return; }
    for (const part of parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, material(materials, part.material), items.length);
      items.forEach((it, i) => {
        placement(it.p[0], it.p[1], it.p[2], it.r, it.s, m).multiply(part.matrix);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = !NO_SHADOW.test(asset);
      mesh.receiveShadow = true;
      mesh.name = asset;
      root.add(mesh);
      drawCalls++;
    }
  }));
  scene.add(root);
  return { root, drawCalls, assets: byAsset.size };
}

/** Sky dome, image-based light from it, sun with a shadow box that follows the participant, fog. */
export function buildLight(scene, renderer, light) {
  const horizon = new THREE.Color().setRGB(...light.fogColor, THREE.SRGBColorSpace);
  const zenith = new THREE.Color().setRGB(0.3, 0.52, 0.86, THREE.SRGBColorSpace);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { horizon: { value: horizon }, zenith: { value: zenith } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 horizon; uniform vec3 zenith; varying vec3 vDir;\nvoid main(){ float t = pow(clamp(vDir.y,0.0,1.0),0.55); gl_FragColor = vec4(mix(horizon, zenith, t),1.0);\n#include <colorspace_fragment>\n}',
  }));
  sky.name = 'Sky';
  sky.renderOrder = -1;
  scene.add(sky);

  const envScene = new THREE.Scene();
  envScene.add(sky.clone());
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;
  scene.environmentIntensity = 0.55;

  scene.add(new THREE.HemisphereLight(
    new THREE.Color().setRGB(...light.ambientSky, THREE.SRGBColorSpace),
    new THREE.Color().setRGB(...light.ambientGround, THREE.SRGBColorSpace), 1.0));
  const sun = new THREE.DirectionalLight(new THREE.Color().setRGB(...light.color, THREE.SRGBColorSpace), 2.4 * light.intensity);
  // Unity's light travels along its forward; three's points from position to target (x mirrored)
  const d = new THREE.Vector3(light.direction[0], -light.direction[1], -light.direction[2]).normalize();
  sun.userData.offset = d.multiplyScalar(80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 220 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  scene.fog = new THREE.Fog(horizon, light.fogStart, light.fogEnd);
  return {
    sky, sun,
    follow(position) {
      sky.position.copy(position);
      sun.target.position.copy(position);
      sun.position.copy(position).add(sun.userData.offset);
    }
  };
}
