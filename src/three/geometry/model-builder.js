// Native construction programs: no mesh loader, scene deserializer or GLB fallback.
// Recipes contain dimensions, profiles, placements and authored polygon boundaries.
import * as THREE from 'three';
import { toThree } from '../scene/coords.ts';
import { leafSpray, tuft } from './model-vegetation.js';
import { indexNativeGeometry } from './model-index.js';

const linear = c => c < 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const identity = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
const emission = {
  ART_LampGlow: [[1, 0.70, 0.32], 0.20], ART_SignalRed: [[1, 0.12, 0.06], 0.38],
  ART_SignalYellow: [[1, 0.65, 0.04], 0.38], ART_SignalGreen: [[0.04, 0.85, 0.24], 0.38],
  ART_SignalGlyph: [[1, 0.91, 0.68], 0.18],
};

/** Dimensions use the project's map coordinates; only coords.js mirrors them for rendering. */
export class ModelBuilder {
  constructor() { this.faces = []; }

  face(points, material, pigment, smooth = false, matrix = identity) {
    const vertices = points.map(([x, y, z]) => toThree(
      matrix[0][0] * x + matrix[0][1] * y + matrix[0][2] * z + matrix[0][3],
      matrix[1][0] * x + matrix[1][1] * y + matrix[1][2] * z + matrix[1][3],
      matrix[2][0] * x + matrix[2][1] * y + matrix[2][2] * z + matrix[2][3])).reverse();
    const colours = Array.isArray(pigment[0]) ? [...pigment].reverse() : points.map(() => pigment);
    this.faces.push({ vertices, material, colours, smooth });
  }

  /** Closed loft with matching cross sections, used for bodywork, roofs and bevelled furniture. */
  loft(rings, emit) {
    emit(rings[0]);
    emit([...rings.at(-1)].reverse());
    for (let k = 1; k < rings.length; k++) {
      const a = rings[k - 1], c = rings[k];
      for (let i = 0; i < a.length; i++) { const j = (i + 1) % a.length; emit([a[i], c[i], c[j], a[j]]); }
    }
  }

  beveled_box({ center: [x, y, z], size: [w, h, d], bevel }, emit) {
    const c = Math.min(bevel, w * 0.2, h * 0.2, d * 0.2);
    const outline = (width, height) => {
      const a = width / 2, b = height / 2, cut = Math.min(c, a * 0.45, b * 0.45);
      return [[-a + cut, -b], [-a, -b + cut], [-a, b - cut], [-a + cut, b],
        [a - cut, b], [a, b - cut], [a, -b + cut], [a - cut, -b]];
    };
    this.loft([[-d / 2, c], [-d / 2 + c, 0], [d / 2 - c, 0], [d / 2, c]]
      .map(([depth, inset]) => outline(w - inset * 2, h - inset * 2).map(([u, v]) => [x + u, y + v, z + depth])), emit);
  }

  cylinder({ start, end, radius, segments, end_radius, bevel, steps }, emit) {
    const a = new THREE.Vector3(...start), c = new THREE.Vector3(...end);
    const axis = c.clone().sub(a).normalize(), ref = Math.abs(axis.y) < 0.9
      ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const u = ref.addScaledVector(axis, -ref.dot(axis)).normalize(), v = axis.clone().cross(u);
    const rt = end_radius ?? radius, t = Math.min(bevel, a.distanceTo(c) * 0.2, radius * 0.2);
    let profiles = [[a, radius], [c, rt]];
    if (t) profiles = [[a, radius - t], [a.clone().addScaledVector(axis, t), radius],
      [c.clone().addScaledVector(axis, -t), rt], [c, rt - t]];
    else if (steps > 1) profiles = Array.from({ length: steps + 1 }, (_, i) =>
      [a.clone().lerp(c, i / steps), radius + (rt - radius) * i / steps]);
    const rings = profiles.map(([p, r]) => Array.from({ length: segments }, (_, i) => p.clone()
      .addScaledVector(u, r * Math.cos(i * Math.PI * 2 / segments))
      .addScaledVector(v, r * Math.sin(i * Math.PI * 2 / segments)).toArray()));
    emit([...rings[0]].reverse()); emit(rings.at(-1));
    for (let k = 1; k < rings.length; k++) for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments, lower = rings[k - 1], upper = rings[k];
      emit([lower[i], lower[j], upper[j], upper[i]]);
    }
  }

  panel({ points, inside }, emit) {
    const p = points.map(p => new THREE.Vector3(...p));
    const n = p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0])).normalize();
    const center = p.reduce((sum, v) => sum.add(v), new THREE.Vector3()).divideScalar(p.length);
    if (n.dot(center.sub(new THREE.Vector3(...inside))) < 0) { p.reverse(); n.negate(); }
    const back = p.map(p => p.clone().addScaledVector(n, 0.001).toArray());
    const front = p.map(p => p.clone().addScaledVector(n, 0.009).toArray());
    emit([...back].reverse()); emit(front);
    for (let i = 0; i < p.length; i++) { const j = (i + 1) % p.length; emit([back[i], back[j], front[j], front[i]]); }
  }

  command([op, material, params, pigments, smooth, matrix]) {
    if (op === 'face') { this.face(params, material, pigments, smooth); return; }
    if (op === 'leaf_spray' || op === 'tuft') {
      (op === 'leaf_spray' ? leafSpray : tuft)(params, (points, pigment, smooth) => this.face(points, material, pigment, smooth, matrix));
      return;
    }
    if (!['beveled_box', 'cylinder', 'loft', 'panel'].includes(op)) throw new Error(`Unknown model operation: ${op}`);
    let i = 0;
    this[op](op === 'loft' ? params.rings : params, points => {
      if (!pigments[i]) throw new Error(`Missing pigment for ${op}/${material}/${i}`);
      this.face(points, material, pigments[i], smooth[i], matrix); i++;
    });
    if (i !== pigments.length) throw new Error(`Model operation face mismatch: ${op}/${i}/${pigments.length}`);
  }

  finish(name) {
    const normals = new Map(), groups = new Map();
    const pigments = new WeakMap();
    const colour = tone => {
      let value = pigments.get(tone);
      if (!value) { value = tone.map(linear); pigments.set(tone, value); }
      return value;
    };
    const key = p => `${Math.round(p.x * 1e5)},${Math.round(p.y * 1e5)},${Math.round(p.z * 1e5)}`;
    for (const face of this.faces) {
      if (!groups.has(face.material)) groups.set(face.material, { capacity: 0, used: 0 });
      groups.get(face.material).capacity += (face.vertices.length - 2) * 9;
      const p = face.vertices, normal = new THREE.Vector3();
      // Newell's normal handles concave polygons and collinear first corners.
      for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length];
        normal.x += (a.y - b.y) * (a.z + b.z); normal.y += (a.z - b.z) * (a.x + b.x);
        normal.z += (a.x - b.x) * (a.y + b.y);
      }
      face.normal = normal.normalize();
      if (face.smooth) for (const point of p) {
        const id = key(point);
        if (!normals.has(id)) normals.set(id, new THREE.Vector3());
        normals.get(id).add(face.normal);
      }
    }
    for (const normal of normals.values()) normal.normalize();
    for (const group of groups.values()) {
      group.position = new Float32Array(group.capacity);
      group.normal = new Int8Array(group.capacity);
      group.color = new Uint8Array(group.capacity);
    }
    for (const face of this.faces) {
      const { vertices: p, normal, material } = face;
      const group = groups.get(material);
      const axis = Math.abs(normal.x) > Math.abs(normal.y) && Math.abs(normal.x) > Math.abs(normal.z) ? 'x'
        : Math.abs(normal.y) > Math.abs(normal.z) ? 'y' : 'z';
      // Triangles already have the face's winding; do not allocate projection/cross vectors for
      // every leaf triangle. Only authored n-gons need planar triangulation and winding checks.
      const triangles = p.length === 3 ? [[0, 1, 2]] : THREE.ShapeUtils.triangulateShape(p.map(v =>
        axis === 'x' ? new THREE.Vector2(v.y, v.z) : axis === 'y' ? new THREE.Vector2(v.x, v.z)
          : new THREE.Vector2(v.x, v.y)), []);
      for (const indices of triangles) {
        if (p.length > 3) {
          const a = p[indices[0]], b = p[indices[1]], c = p[indices[2]];
          const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
          const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
          if ((uy * vz - uz * vy) * normal.x + (uz * vx - ux * vz) * normal.y
            + (ux * vy - uy * vx) * normal.z < 0) indices.reverse();
        }
        for (const i of indices) {
          const position = p[i], n = face.smooth ? normals.get(key(position)) : normal;
          const pigment = colour(face.colours[i]);
          const at = group.used;
          group.position[at] = position.x; group.position[at + 1] = position.y; group.position[at + 2] = position.z;
          group.normal[at] = Math.round(n.x * 127); group.normal[at + 1] = Math.round(n.y * 127); group.normal[at + 2] = Math.round(n.z * 127);
          group.color[at] = Math.round(pigment[0] * 255); group.color[at + 1] = Math.round(pigment[1] * 255); group.color[at + 2] = Math.round(pigment[2] * 255);
          group.used += 3;
        }
      }
    }
    this.faces.length = 0;
    return [...groups].map(([name, attributes]) => {
      let geometry = new THREE.BufferGeometry();
      for (const key of ['position', 'normal', 'color']) {
        const values = attributes[key];
        geometry.setAttribute(key, new THREE.BufferAttribute(attributes.used === values.length ? values : values.slice(0, attributes.used), 3, key !== 'position'));
      }
      const merged = indexNativeGeometry(geometry); geometry.dispose(); geometry = merged;
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const glass = name === 'ART_DisplayGlass';
      const material = new THREE.MeshLambertMaterial({ name, color: 0xffffff, vertexColors: true,
        side: name === 'ART_TreeBark' ? THREE.FrontSide : THREE.DoubleSide,
        transparent: glass, opacity: glass ? 0.12 : 1, depthWrite: !glass });
      if (emission[name]) {
        material.emissive.setRGB(...emission[name][0], THREE.SRGBColorSpace);
        material.emissiveIntensity = emission[name][1];
      }
      return { geometry, material, matrix: new THREE.Matrix4() };
    });
  }
}

/** Also accepts a program built directly in JavaScript, for new code-authored assets. */
export function buildNativeModel(program) {
  if (program.format !== 'hikone-native-model' || program.version !== 1) throw new Error('Unsupported native model recipe');
  const builder = new ModelBuilder();
  for (const command of program.commands) builder.command(command);
  return builder.finish(program.name);
}

