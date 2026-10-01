// A world-locked panel for VR (HTML overlays are not visible in a headset): text drawn on a canvas,
// optionally above the replay view. Placed 1.6 m in front of the participant, level, like VrPanel.
import * as THREE from 'three';

const W = 1600, H = 1000;

export class Panel {
  constructor() {
    this.canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const width = 1.9, height = width * H / W;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false, fog: false }));
    this.image = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.62, width * 0.62 * 9 / 16),
      new THREE.MeshBasicMaterial({ toneMapped: false, fog: false }));
    this.image.position.set(0, height * 0.08, 0.002);
    this.mesh.add(this.image);
    this.mesh.visible = false;
    this.mesh.renderOrder = 10;
  }

  /** Put the panel in front of the camera, level, at eye height. */
  placeInFront(camera, distance = 1.6) {
    const p = new THREE.Vector3(), d = new THREE.Vector3();
    camera.getWorldPosition(p);
    camera.getWorldDirection(d);
    d.y = 0;
    if (d.lengthSq() < 1e-4) d.set(0, 0, -1);
    d.normalize();
    this.mesh.position.copy(p).addScaledVector(d, distance);
    this.mesh.lookAt(p.x, this.mesh.position.y, p.z);
  }

  /** title, lines (strings), hint; image: a texture shown in the upper part (the replay) */
  draw({ title = '', lines = [], hint = '', image = null, accent = '#ff6b5e' }) {
    const g = this.canvas.getContext('2d');
    g.fillStyle = '#0b1220'; g.fillRect(0, 0, W, H);
    g.fillStyle = accent; g.fillRect(60, 60, 120, 14);
    g.fillStyle = '#f1f5f9'; g.font = 'bold 64px sans-serif'; g.fillText(title, 60, 150);
    this.image.visible = !!image;
    if (image) this.image.material.map = image, this.image.material.needsUpdate = true;
    g.font = '44px sans-serif';
    let y = image ? 820 : 260;
    for (const line of lines) {
      for (const chunk of wrap(g, line, W - 120)) { g.fillText(chunk, 60, y); y += 62; }
      y += 14;
    }
    g.fillStyle = '#94a3b8'; g.font = '40px sans-serif'; g.fillText(hint, 60, H - 50);
    this.texture.needsUpdate = true;
  }
}

function wrap(g, text, width) {
  const out = [];
  let line = '';
  for (const ch of text) {
    if (g.measureText(line + ch).width > width) { out.push(line); line = ch; } else line += ch;
  }
  if (line) out.push(line);
  return out;
}
