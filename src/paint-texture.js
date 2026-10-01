// Cache a seamless brush mask once. Rendering samples it instead of evaluating noise per pixel.
import * as THREE from 'three';

let texture;
const PERIOD = 32, SIZE = 512;
function hash(x, y, salt = 0) {
  x = ((x % PERIOD) + PERIOD) % PERIOD;
  y = ((y % PERIOD) + PERIOD) % PERIOD;
  let n = Math.imul(x + 19, 374761393) ^ Math.imul(y + 47, 668265263) ^ salt;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
export function brushTexture() {
  if (texture) return texture;
  const cells = Array.from({ length: PERIOD * PERIOD }, (_, i) => {
    const x = i % PERIOD, y = Math.floor(i / PERIOD), seed = hash(x, y);
    const angle = (seed - 0.5) * 0.8;
    return { x: hash(x, y, 7351), y: hash(x, y, 15329), seed, c: Math.cos(angle), s: Math.sin(angle) };
  });
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const px = (x + 0.5) / SIZE * PERIOD, py = (y + 0.5) / SIZE * PERIOD;
    const cx = Math.floor(px - 0.5), cy = Math.floor(py - 0.5);
    let mask = 0, pigment = 0;
    const grain = hash(x, y, 90787);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const ix = cx + i, iy = cy + j;
      const cell = cells[((iy + PERIOD) % PERIOD) * PERIOD + ((ix + PERIOD) % PERIOD)];
      const dx = px - ix - cell.x, dy = py - iy - cell.y;
      const qx = dx * cell.c - dy * cell.s, qy = dx * cell.s + dy * cell.c;
      const edge = Math.max(Math.abs(qx) / (0.63 + cell.seed * 0.19), Math.abs(qy) / (0.27 + cell.seed * 0.12))
        + (grain - 0.5) * 0.20 + Math.abs(qx + qy) * 0.13;
      const t = Math.max(0, Math.min(1, (edge - 0.71) / 0.33));
      const dab = 1 - t * t * (3 - 2 * t);
      if (dab > mask) { mask = dab; pigment = cell.seed; }
    }
    const offset = (y * SIZE + x) * 4;
    data[offset] = Math.round(mask * 255);
    data[offset + 1] = Math.round(pigment * 255);
    data[offset + 2] = Math.round(grain * 255);
    data[offset + 3] = 255;
  }
  texture = new THREE.DataTexture(data, SIZE, SIZE);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
