// Index native positions plus byte normals/pigments without temporary per-vertex hash strings.
// Exact Float32 positions are retained; nearby authored vertices are never snapped together.
import * as THREE from 'three';

export function indexNativeGeometry(source) {
  const positions = source.getAttribute('position'), normals = source.getAttribute('normal'), colours = source.getAttribute('color');
  const p = positions.array, n = normals.array, c = colours.array, count = positions.count;
  const bits = new Uint32Array(p.buffer, p.byteOffset, p.length);
  let size = 1;
  while (size < count * 1.5) size *= 2;
  const table = new Uint32Array(size), representatives = new Uint32Array(count), indices = new Uint32Array(count);
  const mask = size - 1;
  let unique = 0;
  for (let i = 0; i < count; i++) {
    const a = i * 3;
    const normal = (n[a] & 255) | ((n[a + 1] & 255) << 8) | ((n[a + 2] & 255) << 16);
    const colour = c[a] | (c[a + 1] << 8) | (c[a + 2] << 16);
    let hash = Math.imul(bits[a] ^ 0x9e3779b9, 0x85ebca6b);
    hash = Math.imul(hash ^ bits[a + 1], 0xc2b2ae35);
    hash = Math.imul(hash ^ bits[a + 2] ^ normal, 0x85ebca6b) ^ colour;
    hash ^= hash >>> 16;
    let slot = hash & mask;
    while (table[slot]) {
      const id = table[slot] - 1, b = representatives[id] * 3;
      if (bits[a] === bits[b] && bits[a + 1] === bits[b + 1] && bits[a + 2] === bits[b + 2]
        && n[a] === n[b] && n[a + 1] === n[b + 1] && n[a + 2] === n[b + 2]
        && c[a] === c[b] && c[a + 1] === c[b + 1] && c[a + 2] === c[b + 2]) {
        indices[i] = id; break;
      }
      slot = (slot + 1) & mask;
    }
    if (!table[slot]) {
      table[slot] = unique + 1; representatives[unique] = i; indices[i] = unique++;
    }
  }
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const values = new attribute.array.constructor(unique * attribute.itemSize), width = attribute.itemSize;
    for (let i = 0; i < unique; i++) for (let k = 0; k < width; k++) values[i * width + k] = attribute.array[representatives[i] * width + k];
    geometry.setAttribute(name, new THREE.BufferAttribute(values, width, attribute.normalized));
  }
  geometry.setIndex(new THREE.BufferAttribute(unique <= 65535 ? new Uint16Array(indices) : indices, 1));
  return geometry;
}
