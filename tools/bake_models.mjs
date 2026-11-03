// Bakes each construction program to meshopt-coded triangles: ground sheets closed with risers,
// vertices in cache order, and a far detail level for geometry that is cheap to simplify. Output is
// content-addressed by its program, so unchanged models are never rebuilt.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import * as THREE from 'three';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { buildNativeModel } from '../src/three/geometry/model-builder.js';
import { addSkirts } from '../src/three/geometry/model-closure.js';
import { packBaked, POSITION_UNIT } from '../src/three/assets/baked-model.js';

const BAKE_VERSION = 4;
const FOLIAGE = /^(HK_(Leaf|LeafDark|LeafDeep|Sakura)|ART_(PineNeedle|Needle|Foliage))/;
const WATER = /Water/;
// Far-level geometric error in metres: about a pixel and a half where each class switches.
const FAR_ERROR = 0.22, FAR_FOLIAGE_RATIO = 0.45, FAR_MINIMUM = 240, FAR_WORTHWHILE = 0.7;
// A far part keeps at least this share of its surface; canopies lose some folds, solids nothing visible.
const FAR_AREA = 0.9, FAR_FOLIAGE_AREA = 0.8;

const bytesOf = view => new Uint8Array(view.buffer, view.byteOffset, view.byteLength);

function encodePart({ geometry, material }) {
  const position = geometry.attributes.position.array, normal = geometry.attributes.normal.array, color = geometry.attributes.color.array;
  const order = Uint32Array.from(geometry.index.array);
  const [remap, unique] = MeshoptEncoder.reorderMesh(order, true, false);           // rewrites `order`
  const units = new Int32Array(unique * 3), packed = new Uint8Array(unique * 8);
  for (let old = 0; old < remap.length; old++) {
    const v = remap[old];
    if (v === 0xffffffff) continue;
    for (let k = 0; k < 3; k++) {
      units[v * 3 + k] = Math.round(position[old * 3 + k] * POSITION_UNIT);
      packed[v * 8 + k] = normal[old * 3 + k] & 255;
      packed[v * 8 + 4 + k] = color[old * 3 + k];
    }
  }
  const wide = unique > 65535, index = wide ? order : Uint16Array.from(order);
  const streams = [MeshoptEncoder.encodeVertexBuffer(bytesOf(units), unique, 12), MeshoptEncoder.encodeVertexBuffer(packed, unique, 8),
    MeshoptEncoder.encodeIndexBuffer(bytesOf(index), index.length, wide ? 4 : 2)];
  return { header: { material: { name: material.name, side: material.side, transparent: material.transparent, opacity: material.opacity,
    depthWrite: material.depthWrite, emissive: material.emissive.getHex(), emissiveIntensity: material.emissiveIntensity },
  vertices: unique, indices: index.length, sizes: streams.map(s => s.length) }, streams };
}

function surfaceArea(indices, p) {
  let area = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  return area;
}

/** One welded vertex per position, so colour seams do not read as borders. Borders stay put. */
function simplifyPart(part) {
  const { geometry, material } = part, positions = Float32Array.from(geometry.attributes.position.array);
  if (WATER.test(material.name)) return part;
  const remap = MeshoptSimplifier.generatePositionRemap(positions, 3);
  const welded = Uint32Array.from(geometry.index.array, i => remap[i]);
  const foliage = FOLIAGE.test(material.name);
  const [indices] = foliage
    ? MeshoptSimplifier.simplifySloppy(welded, positions, 3, null, Math.max(36, Math.floor(welded.length * FAR_FOLIAGE_RATIO / 3) * 3), 0.5)
    : MeshoptSimplifier.simplify(welded, positions, 3, 0, FAR_ERROR, ['ErrorAbsolute', 'LockBorder']);
  if (surfaceArea(indices, positions) < surfaceArea(welded, positions) * (foliage ? FAR_FOLIAGE_AREA : FAR_AREA)) return part;
  const simplified = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(geometry.attributes)) simplified.setAttribute(name, attribute);
  simplified.setIndex(new THREE.BufferAttribute(indices, 1));
  return { ...part, geometry: simplified };
}

const triangleCount = parts => parts.reduce((n, p) => n + p.geometry.index.count / 3, 0);

async function write(parts, name, target) {
  const encoded = parts.filter(p => p.geometry.index.count).map(encodePart);
  const body = gzipSync(packBaked({ name, parts: encoded.map(e => e.header) }, encoded.flatMap(e => e.streams)), { level: 6 });
  await fs.writeFile(target, body);
  return body.length;
}

export async function bakeModels(directory, manifest, packed) {
  await Promise.all([MeshoptEncoder.ready, MeshoptSimplifier.ready]);
  const cacheFile = path.join(packed, 'bake-cache.json');
  const previous = JSON.parse(await fs.readFile(cacheFile, 'utf8').catch(() => '{}')), cache = {};
  const exists = name => fs.stat(path.join(packed, name)).then(() => true, () => false);
  for (const key of Object.keys(manifest.files)) {
    const [name, detail] = key.split('/'), entry = manifest.files[key];
    const hash = createHash('sha256').update(`${BAKE_VERSION}/${entry.url}/${detail}`).digest('hex').slice(0, 20);
    let baked = previous[hash];
    if (!baked || !await exists(path.basename(baked.url)) || (baked.far && !await exists(path.basename(baked.far.url)))) {
      const parts = buildNativeModel(JSON.parse(await fs.readFile(path.join(directory, `${name}${detail === 'low' ? '.lod' : ''}.json`), 'utf8')));
      addSkirts(parts);
      const solid = parts.filter(p => !p.material.transparent), simplified = detail === 'low' ? solid.map(simplifyPart) : [];
      const far = detail === 'low' && triangleCount(solid) > FAR_MINIMUM && triangleCount(simplified) < triangleCount(solid) * FAR_WORTHWHILE;
      baked = { url: `models/packed/${hash}.hkb` };
      if (far) baked.far = { url: `models/packed/${hash}-far.hkb`, bytes: await write(simplified, name, path.join(packed, hash + '-far.hkb')) };
      baked.bytes = await write(parts, name, path.join(packed, hash + '.hkb'));
    }
    cache[hash] = baked;
    entry.baked = { url: baked.url, bytes: baked.bytes };
    if (baked.far) manifest.files[name + '/far'] = { baked: baked.far };
  }
  await fs.writeFile(cacheFile, JSON.stringify(cache));
}
