// Kyobashi's pale, staggered stone courses, painted once for every castle wall.
import * as THREE from 'three';

let texture: THREE.DataTexture | undefined;
const WIDTH = 32, HEIGHT = 16, SIZE = 1024;
const TONES = [[184, 181, 166], [156, 163, 168], [122, 128, 153]];
function random(seed: number): number {
  let n = Math.imul(seed + 719, 374761393);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function stoneTexture(): THREE.DataTexture {
  if (texture) return texture;
  const rows = Array.from({length: 18}, (_, i) => 0.7 + random(i) * 0.4);
  const height = rows.reduce((a, b) => a + b, 0);
  let bottom = 0;
  const courses = rows.map((h, row) => {
    const top = bottom + h / height * HEIGHT;
    const widths = Array.from({length: 19}, (_, i) => 1 + random(row * 71 + i + 91) * 1.4);
    const total = widths.reduce((a, b) => a + b, 0), edges = [0];
    let edge = 0;
    for (const width of widths) {edge += width / total * WIDTH; edges.push(edge);}
    edges[edges.length - 1] = WIDTH;
    const course = {bottom, top, edges, offset: random(row + 631) * WIDTH,
      lean: (random(row + 859) - 0.5) * 0.24};
    bottom = top;
    return course;
  });
  const data = new Uint8Array(SIZE * SIZE * 4);
  let row = 0;
  for (let y = 0; y < SIZE; y++) {
    const py = (y + 0.5) / SIZE * HEIGHT;
    while (row < courses.length - 1 && py >= courses[row].top) row++;
    const course = courses[row], v = (py - course.bottom) / (course.top - course.bottom);
    for (let x = 0; x < SIZE; x++) {
      const px = ((x + 0.5) / SIZE * WIDTH + course.offset + v * course.lean) % WIDTH;
      let col = 0;
      while (px >= course.edges[col + 1]) col++;
      const joint = Math.min(px - course.edges[col], course.edges[col + 1] - px) < 0.04
        || Math.min(py - course.bottom, course.top - py) < 0.035;
      const tone = random(row * 97 + col + 217);
      const colour = TONES[joint ? 2 : tone < 0.35 ? 0 : tone < 0.88 ? 1 : 2];
      const at = (y * SIZE + x) * 4;
      data.set(colour, at);
      data[at + 3] = 255;
    }
  }
  texture = new THREE.DataTexture(data, SIZE, SIZE);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export function resetStoneTexture() {texture?.dispose(); texture = undefined;}
