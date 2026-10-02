// Impressionism is authored in the GLBs: rebuilt silhouettes, vertex pigments and
// raised, irregular brush meshes. This module supplies light, bristle relief and sky.
// There is no screen-space oil-paint pass; desktop and mobile render the same models.
import * as THREE from 'three';
import { brushTexture } from './paint-texture.js';

export const LIGHT = {
  sunColor: [1, 0.94, 0.81], sunIntensity: 2.5,
  sky: [0.76, 0.84, 1], ground: [0.80, 0.75, 0.68], hemisphere: 2.1,
  fog: [0.78, 0.84, 0.87], fogStart: 85, fogEnd: 430, environment: 0.38,
  horizon: [0.89, 0.90, 0.84], zenith: [0.39, 0.64, 0.88],
};
export const paint = { strength: { value: 1 } };

const NOISE = /* glsl */`
float hkHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float hkNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hkHash(i), hkHash(i + vec2(1.0, 0.0)), u.x), mix(hkHash(i + vec2(0.0, 1.0)), hkHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// Jittered centres and chipped bristle edges hide the lattice behind short dabs.
vec2 hkDabs(vec2 p) {
  vec2 cell = floor(p - 0.5); float mask = 0.0, pigment = 0.0;
  float bristle = (hkNoise(p * vec2(8.0, 31.0)) - 0.5) * 0.20;
  for (int j = 0; j <= 1; j++) {
    for (int i = 0; i <= 1; i++) {
      vec2 id = cell + vec2(float(i), float(j));
      float seed = hkHash(id + 8.7);
      vec2 centre = id + vec2(hkHash(id + 1.2), hkHash(id + 5.8));
      vec2 q = p - centre;
      float a = (seed - 0.5) * 0.8;
      q = mat2(cos(a), -sin(a), sin(a), cos(a)) * q;
      float edge = max(abs(q.x) / (0.63 + seed * 0.19), abs(q.y) / (0.27 + seed * 0.12));
      edge += bristle + abs(q.x + q.y) * 0.13;
      float dab = 1.0 - smoothstep(0.71, 1.04, edge);
      if (dab > mask) { mask = dab; pigment = seed; }
    }
  }
  return vec2(mask, pigment);
}`;

const PIGMENTS = {
  HK_Asphalt: [[0.88, 0.74, 0.55], [0.56, 0.64, 0.83]],
  HK_Sidewalk: [[0.98, 0.86, 0.61], [0.61, 0.67, 0.83]],
  HK_Curb: [[0.93, 0.85, 0.65], [0.59, 0.68, 0.83]],
  HK_Plaster: [[1.0, 0.91, 0.71], [0.62, 0.73, 0.90]],
  HK_PlasterWarm: [[0.98, 0.83, 0.62], [0.69, 0.75, 0.89]],
  HK_RoofTile: [[0.76, 0.64, 0.53], [0.47, 0.59, 0.78]],
  HK_WoodDark: [[0.62, 0.46, 0.32], [0.43, 0.43, 0.55]],
  HK_WoodMid: [[0.80, 0.60, 0.38], [0.49, 0.49, 0.62]],
  HK_Bark: [[0.65, 0.48, 0.32], [0.44, 0.44, 0.54]],
  HK_Stone: [[0.89, 0.81, 0.63], [0.55, 0.66, 0.83]],
  HK_StoneDark: [[0.80, 0.72, 0.59], [0.50, 0.60, 0.78]],
  HK_Leaf: [[0.75, 0.79, 0.35], [0.34, 0.59, 0.58]],
  HK_LeafDark: [[0.57, 0.69, 0.37], [0.32, 0.51, 0.58]],
  HK_Sakura: [[1.0, 0.85, 0.76], [0.83, 0.55, 0.72]],
  HK_Grass: [[0.79, 0.78, 0.43], [0.39, 0.57, 0.57]],
  HK_Water: [[0.86, 0.84, 0.63], [0.42, 0.61, 0.83]],
};

/** The pigments a material name paints with: warm/cool dab colours and how strongly dabs show. */
export function pigmentOf(name) {
  const pigments = PIGMENTS[name];
  return {
    warm: pigments?.[0] ?? [0.76, 0.64, 0.49], cool: pigments?.[1] ?? [0.45, 0.55, 0.72],
    // Abstract props use deliberate broad colour planes; signal colours stay legible.
    dab: name.startsWith('ART_') || name === 'HK_KeiPaint' ? 0 : pigments ? 0.65 : 0.12,
  };
}

const DAB_FRAGMENT = `
        vec3 hkAn = abs(normalize(vHkNormal));
        vec2 hkP = hkAn.y > max(hkAn.x, hkAn.z) ? vHkWorld.xz : (hkAn.x > hkAn.z ? vHkWorld.zy : vHkWorld.xy);
        vec2 hkQ = mat2(0.86, -0.51, 0.51, 0.86) * hkP;
        float hkScale = hkAn.y > 0.7 ? 2.3 : 3.7;
        vec2 hkDab = texture2D(hkBrush, hkQ * vec2(hkScale, hkScale * 1.35) / 32.0).rg;
        vec3 hkPigment = mix(hkCool, hkWarm, hkDab.y);
        hkPigment = mix(hkPigment, vec3(0.71, 0.43, 0.39), smoothstep(0.84, 1.0, hkDab.y) * 0.20);
        float hkAmount = hkDab.x * hkDabStrength * hkStrength;
        diffuseColor.rgb = mix(diffuseColor.rgb, hkPigment, hkAmount);`;

/**
 * Fine bristles and coloured light on top of the model's baked pigment strokes. Coordinates are
 * anchored in the scene; walking never resizes/slides the paint. `pigments` declares where the
 * GLSL names hkWarm, hkCool and hkDabStrength come from (uniforms, or the per-vertex palette).
 */
function injectPaint(shader, { vertexDeclarations = '', vertexBody = '', fragmentDeclarations, dabs = true, emissive = '' }) {
  shader.uniforms.hkStrength = paint.strength;
  shader.uniforms.hkBrush = { value: brushTexture() };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>
      varying vec3 vHkWorld;
      varying vec3 vHkNormal;
      ${vertexDeclarations}`)
    .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vec4 hkW = vec4(transformed, 1.0);
      vec3 hkN = objectNormal;
      #ifdef USE_BATCHING
        hkW = batchingMatrix * hkW;
        hkN = mat3(batchingMatrix) * hkN;
      #endif
      #ifdef USE_INSTANCING
        hkW = instanceMatrix * hkW;
        hkN = mat3(instanceMatrix) * hkN;
      #endif
      vHkWorld = (modelMatrix * hkW).xyz;
      vHkNormal = normalize(mat3(modelMatrix) * hkN);
      ${vertexBody}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
      uniform float hkStrength;
      uniform sampler2D hkBrush;
      varying vec3 vHkWorld;
      varying vec3 vHkNormal;
      ${fragmentDeclarations}`)
    .replace('#include <color_fragment>', '#include <color_fragment>' + (dabs ? DAB_FRAGMENT : ''))
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + emissive)
    .replace('#include <opaque_fragment>', `#include <opaque_fragment>
      vec3 n = normalize(vHkNormal), an = abs(n);
      vec2 p = an.y > max(an.x, an.z) ? vHkWorld.xz : (an.x > an.z ? vHkWorld.zy : vHkWorld.xy);
      vec2 q = mat2(0.91, -0.41, 0.41, 0.91) * p;
      float fibre = texture2D(hkBrush, q * vec2(34.0, 170.0) / 32.0).b - 0.5;
      // Avoid high-frequency shimmer on distant surfaces and in stereo views.
      float detail = 1.0 - smoothstep(0.008, 0.045, max(length(dFdx(p)), length(dFdy(p))));
      vec3 c = gl_FragColor.rgb;
      float lightValue = dot(c, vec3(0.2126, 0.7152, 0.0722));
      vec3 shadow = c * vec3(0.88, 0.94, 1.10) + vec3(0.022, 0.021, 0.042);
      c = mix(c, shadow, 1.0 - smoothstep(0.06, 0.36, lightValue));
      c *= 1.0 + fibre * 0.10 * detail;
      gl_FragColor.rgb = mix(gl_FragColor.rgb, c, hkStrength);`);
}

/** One material's paint, its pigments as uniforms (vehicles, signals, replay copies). */
export function painted(material) {
  const pigment = pigmentOf(material.name), dabs = pigment.dab > 0;
  material.onBeforeCompile = shader => {
    const col = c => new THREE.Color().setRGB(...c, THREE.SRGBColorSpace);
    shader.uniforms.hkWarm = { value: col(pigment.warm) };
    shader.uniforms.hkCool = { value: col(pigment.cool) };
    shader.uniforms.hkDabStrength = { value: pigment.dab };
    injectPaint(shader, { dabs, fragmentDeclarations: 'uniform vec3 hkWarm;\nuniform vec3 hkCool;\nuniform float hkDabStrength;' });
  };
  material.customProgramCacheKey = () => 'hk-cached-pigment-v4-' + dabs;
  return material;
}

/**
 * Every pigment of the city in one material: each vertex carries its pigment's row (hkPigment) in
 * a small palette texture (warm, cool, dab strength, emissive). Merging all colours into one
 * material lets an asset draw in one call instead of one call per colour.
 */
export class PigmentPalette {
  static ROWS = 64;
  constructor() {
    this.rows = new Map();
    this.data = new Float32Array(3 * PigmentPalette.ROWS * 4);
    this.texture = new THREE.DataTexture(this.data, 3, PigmentPalette.ROWS, THREE.RGBAFormat, THREE.FloatType);
    this.texture.magFilter = this.texture.minFilter = THREE.NearestFilter;
    this.materials = new Map();
  }
  /** Row of a source material (name + emissive light), added on first use. */
  row(material) {
    if (this.rows.has(material.name)) return this.rows.get(material.name);
    const index = this.rows.size;
    if (index >= PigmentPalette.ROWS) throw new Error('pigment palette is full');
    const pigment = pigmentOf(material.name), linear = c => new THREE.Color().setRGB(...c, THREE.SRGBColorSpace);
    const emissive = material.emissive ? material.emissive.clone().multiplyScalar(material.emissiveIntensity ?? 1) : new THREE.Color(0, 0, 0);
    // Strength shares warm.a, saving one vertex texture lookup without quantizing any pigment.
    const texels = [[...linear(pigment.warm).toArray(), pigment.dab], [...linear(pigment.cool).toArray(), 1],
      [...emissive.toArray(), 1]];
    texels.forEach((t, i) => this.data.set(t, (index * 3 + i) * 4));
    this.texture.needsUpdate = true;
    this.rows.set(material.name, index);
    return index;
  }
  /**
   * The shared painted material (single- or double-sided). `behind` pushes depth a little further
   * back: low-detail ground cells overlap their high-detail neighbours at cell borders, and the
   * high-detail surface must always win there instead of flickering.
   */
  material(side = THREE.FrontSide, behind = false) {
    const key = side + (behind ? '/behind' : '');
    if (this.materials.has(key)) return this.materials.get(key);
    const material = new THREE.MeshLambertMaterial({
      name: 'HikonePigments', color: 0xffffff, vertexColors: true, side,
      polygonOffset: true, polygonOffsetFactor: behind ? 2 : 1, polygonOffsetUnits: behind ? 8 : 1,
    });
    material.onBeforeCompile = shader => {
      shader.uniforms.hkPalette = { value: this.texture };
      injectPaint(shader, {
        vertexDeclarations: `attribute float hkPigment;
          uniform highp sampler2D hkPalette;
          varying vec3 vHkWarm;
          varying vec3 vHkCool;
          varying float vHkDab;
          varying vec3 vHkEmissive;`,
        vertexBody: `int hkRow = int(hkPigment + 0.5);
          vec4 hkWarmDab = texelFetch(hkPalette, ivec2(0, hkRow), 0);
          vHkWarm = hkWarmDab.rgb;
          vHkCool = texelFetch(hkPalette, ivec2(1, hkRow), 0).rgb;
          vHkDab = hkWarmDab.a;
          vHkEmissive = texelFetch(hkPalette, ivec2(2, hkRow), 0).rgb;`,
        fragmentDeclarations: `varying vec3 vHkWarm;
          varying vec3 vHkCool;
          varying float vHkDab;
          varying vec3 vHkEmissive;
          #define hkWarm vHkWarm
          #define hkCool vHkCool
          #define hkDabStrength vHkDab`,
        emissive: 'totalEmissiveRadiance += vHkEmissive;',
      });
    };
    material.customProgramCacheKey = () => 'hk-palette-v2';
    this.materials.set(key, material);
    return material;
  }
}

/** Painted sky with distinct short cream/blue dabs inside airy cloud masses. */
export function paintedSky() {
  const col = c => new THREE.Color().setRGB(...c, THREE.SRGBColorSpace);
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { horizon: { value: col(LIGHT.horizon) }, zenith: { value: col(LIGHT.zenith) } },
    vertexShader: 'varying vec3 vDir;\nvoid main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 horizon; uniform vec3 zenith; varying vec3 vDir;
      ${NOISE}
      float fbm(vec2 p) { float v = 0.0, a = 0.55; for (int i = 0; i < 4; i++) { v += a * hkNoise(p); p = p * 2.03 + 1.7; a *= 0.5; } return v; }
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 blue = mix(horizon, zenith, pow(h, 0.38));
        vec2 uv = d.xz / (h + 0.48) * 2.0;
        vec2 q = mat2(0.88, -0.47, 0.47, 0.88) * uv;
        float mass = fbm(uv * 1.55 + 4.0);
        vec2 brush = hkDabs(q * vec2(22.0, 36.0));
        float pigment = brush.y, dab = brush.x;
        float cloud = smoothstep(0.46, 0.69, mass + (pigment - 0.5) * 0.13);
        cloud *= smoothstep(0.015, 0.14, h);
        vec3 cream = mix(vec3(0.91, 0.91, 0.87), vec3(1.0, 0.90, 0.71), pigment * 0.5);
        vec3 c = mix(blue * (0.90 + pigment * 0.18), cream, cloud * (0.43 + dab * 0.47));
        c = mix(c, vec3(0.73, 0.81, 0.94), (1.0 - dab) * cloud * 0.15);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

/** Direct scene render. Kept as a small adapter for the simulation's FPS display. */
export class PaintRenderer {
  constructor(renderer) { this.renderer = renderer; }
  render(scene, camera) {
    this.renderer.render(scene, camera);
    this.calls = this.renderer.info.render.calls;
  }
}
