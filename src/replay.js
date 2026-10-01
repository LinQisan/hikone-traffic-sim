// The accident replay: the recorded window (8 s before to 1.6 s after contact), seen from above at an
// angle across the car's path, slow motion around contact (like AccidentReplayPresenter). The live
// cars stay frozen and hidden; render-only copies are driven from the recording. It stops on its
// last frame and waits for the participant (Next), as in the Unity app.
import * as THREE from 'three';
import { toThree, yawToThree } from './coords.js';
import { instance, BODY_MODEL, paintFor } from './vehicles.js';
import { sample, GAZE_HALF_ANGLE } from './analysis.js';

const SLOW_FROM = 0.8, SLOW_UNTIL = 0.4, SLOW_RATE = 0.45;
const LIME = 0x7dff33, CONTACT = 0xff4033;

export class Replay {
  constructor(scene, materials, ground) {
    this.scene = scene;
    this.materials = materials;
    this.ground = ground;
    this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.3, 800);
    this.target = new THREE.WebGLRenderTarget(1280, 720, { samples: 4 });
    this.target.texture.colorSpace = THREE.SRGBColorSpace;
    this.root = null;
    this.playing = false;
    this.atEnd = false;
  }

  start(frames, impactTime, carId, heightCm) {
    this.stop();
    this.frames = frames;
    this.impact = impactTime;
    this.start_ = frames[0].t;
    this.end = frames[frames.length - 1].t;
    this.time = this.start_;
    this.atEnd = false;
    this.playing = true;
    this.root = new THREE.Group();
    this.scene.add(this.root);
    // copies of every car seen in the window
    this.cars = new Map();
    for (const f of frames)
      for (const c of f.cars)
        if (!this.cars.has(c.id)) {
          const mesh = instance(BODY_MODEL[c.body] ?? BODY_MODEL.sedan, this.materials, { paint: paintFor(c.id) });
          if (c.id === carId) {
            const pin = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 8), new THREE.MeshBasicMaterial({ color: 0xffb826 }));
            pin.position.y = 2.6;
            mesh.add(pin);
          }
          this.root.add(mesh);
          this.cars.set(c.id, { mesh, track: frames.flatMap(g => g.cars.filter(k => k.id === c.id).map(k => ({ t: g.t, ...k }))) });
        }
    this.headTrack = frames.map(f => ({ t: f.t, ...f.head }));
    // the participant: a lime figure with a ground ring and the gaze fan
    const h = Math.max(0.9, Math.min(2.1, heightCm / 100));
    const lime = new THREE.MeshBasicMaterial({ color: LIME });
    this.figure = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.18 * h, 0.55 * h, 4, 12), lime);
    body.position.y = 0.5 * h;
    const headBall = new THREE.Mesh(new THREE.SphereGeometry(0.1 * h, 12, 8), lime);
    headBall.position.y = 0.93 * h;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 32), new THREE.MeshBasicMaterial({ color: LIME, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
    const fan = new THREE.Mesh(this.fanGeometry(6), new THREE.MeshBasicMaterial({ color: LIME, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    fan.position.y = 0.93 * h;
    this.figure.add(body, headBall, ring, fan);
    this.root.add(this.figure);
    // the path walked and the contact point
    const path = this.headTrack.map(p => toThree(p.x, this.ground.heightAt(p.x, p.z) + 0.08, p.z));
    this.root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(path), new THREE.LineBasicMaterial({ color: LIME })));
    const at = sample(this.headTrack, impactTime) ?? this.headTrack[this.headTrack.length - 1];
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.9, 32), new THREE.MeshBasicMaterial({ color: CONTACT, transparent: true, opacity: 0.8 }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.copy(toThree(at.x, this.ground.heightAt(at.x, at.z) + 0.04, at.z));
    disc.visible = false;
    this.contact = disc;
    this.root.add(disc);
    this.frame(this.start_);
    // camera: across the car's direction of travel, from the side the participant came from
    const car = this.cars.get(carId)?.track ?? [];
    const c1 = sample(car, impactTime) ?? at, c0 = sample(car, impactTime - 1) ?? c1;
    let vx = c1.x - c0.x, vz = c1.z - c0.z;
    if (Math.hypot(vx, vz) < 0.1) { vx = 1; vz = 0; }
    const len = Math.hypot(vx, vz);
    let sideX = -vz / len, sideZ = vx / len;
    const s0 = this.headTrack[0];
    if ((s0.x - at.x) * sideX + (s0.z - at.z) * sideZ < 0) { sideX = -sideX; sideZ = -sideZ; }
    this.focus = toThree((at.x + c1.x) / 2, 0.4, (at.z + c1.z) / 2);
    this.camera.position.copy(toThree(at.x + sideX * 16, 15, at.z + sideZ * 16));
    this.camera.lookAt(this.focus);
  }

  fanGeometry(length) {
    const a = GAZE_HALF_ANGLE * Math.PI / 180, pts = [0, 0, 0];
    for (let i = 0; i <= 12; i++) {
      const t = -a + (2 * a * i) / 12;
      pts.push(Math.sin(t) * length, 0, Math.cos(t) * length);
    }
    const index = [];
    for (let i = 1; i <= 12; i++) index.push(0, i, i + 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setIndex(index);
    return g;
  }

  frame(t) {
    for (const { mesh, track } of this.cars.values()) {
      const p = sample(track, t);
      mesh.visible = !!p;
      if (!p) continue;
      mesh.position.copy(toThree(p.x, this.ground.heightAt(p.x, p.z), p.z));
      mesh.rotation.set(0, yawToThree(p.yaw), 0);
    }
    const h = sample(this.headTrack, t);
    if (h) {
      this.figure.position.copy(toThree(h.x, this.ground.heightAt(h.x, h.z), h.z));
      this.figure.rotation.set(0, yawToThree(h.yaw), 0);
      // fall over after contact, away from the car
      const fall = t > this.impact ? Math.min(1, (t - this.impact) / 0.7) : 0;
      this.figure.children[0].rotation.z = fall * 1.3;
      this.figure.children[1].position.x = Math.sin(fall * 1.3) * 0.55;
    }
    this.contact.visible = t >= this.impact;
  }

  /** Advance; returns the label shown above the replay. */
  update(dt) {
    if (!this.playing) return '';
    const slow = this.time > this.impact - SLOW_FROM && this.time < this.impact + SLOW_UNTIL;
    this.time = Math.min(this.end, this.time + Math.min(dt, 0.1) * (slow ? SLOW_RATE : 1));
    this.frame(this.time);
    if (this.time >= this.end) this.atEnd = true;
    const toContact = this.impact - this.time;
    return toContact > 0.05 ? `接触まで ${toContact.toFixed(1)} 秒` : toContact > -0.35 ? '接触 / Contact' : `接触後 ${(-toContact).toFixed(1)} 秒`;
  }

  restart() { this.time = this.start_; this.atEnd = false; }

  /** Renders the replay view into its texture (shown on the desktop canvas or a panel in VR). */
  render(renderer) {
    const xr = renderer.xr.enabled;
    renderer.xr.enabled = false;
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(previous);
    renderer.xr.enabled = xr;
  }

  stop() {
    this.playing = false;
    if (this.root) { this.scene.remove(this.root); this.root = null; }
  }
}
