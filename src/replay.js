// The accident replay: the recorded window (8 s before to 1.6 s after contact), seen from above at an
// angle across the car's path, slow motion around contact (like AccidentReplayPresenter). The live
// cars stay frozen and hidden; render-only copies are driven from the recording. It stops on its
// last frame and waits for the participant (Next), as in the Unity app.
import * as THREE from 'three';
import { toThree, yawToThree } from './coords.js';
import { instance, BODY_MODEL, paintFor } from './vehicles.js';
import { sample, GAZE_HALF_ANGLE } from './analysis.js';
import { createReplayAnimal, BEAR_EYE_HEIGHT } from './replay-animal.js';
import { createReplayCyclist, ridingTrack, sampleRide } from './replay-cyclist.js';
import { classifyCrash, crashMotion, bicycleMotion } from './crash.js';
import { BODY_SIZE } from './traffic.js';
import { buildCockpit } from './cockpit.js';

const SLOW_FROM = 0.8, SLOW_UNTIL = 0.4, SLOW_RATE = 0.45;
const LIME = 0x7dff33, CONTACT = 0xff4033;
const UP = new THREE.Vector3(0, 1, 0), _box = new THREE.Box3();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();

export class Replay {
  constructor(scene, materials, ground) {
    this.scene = scene;
    this.materials = materials;
    this.ground = ground;
    this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.3, 500);
    // the driver's view: from the accident car's driver seat (right-hand drive), along its travel
    this.driverCamera = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 500);
    this.view = 'overview';

    this.root = null;
    this.playing = false;
    this.atEnd = false;
  }

  start(frames, impactTime, carId, heightCm, playerMode = 'walking', weightKg = 60) {
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
    this.root.add(this.driverCamera);
    this.overlays = [];
    const owned = object => { this.overlays.push(object); return object; };
    // copies of every car seen in the window
    this.cars = new Map();
    for (const f of frames)
      for (const c of f.cars)
        if (!this.cars.has(c.id)) {
          const mesh = instance(BODY_MODEL[c.body] ?? BODY_MODEL.sedan, this.materials, { paint: paintFor(c.id) });
          if (c.id === carId) {
            const pin = owned(new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 8), new THREE.MeshBasicMaterial({ color: 0xffb826 })));
            pin.name = 'ReplayContactPin';
            pin.position.y = 2.6;
            mesh.add(pin);
          }
          this.root.add(mesh);
          this.cars.set(c.id, { mesh, track: frames.flatMap(g => g.cars.filter(k => k.id === c.id).map(k => ({ t: g.t, ...k }))) });
        }
    this.headTrack = frames.map(f => ({ t: f.t, ...f.head }));
    this.rideTrack = playerMode === 'bicycle' ? ridingTrack(this.headTrack, impactTime) : null;
    this.rideCameraOffset = null;
    // A simple cream bear follows the participant; the ring/fan remain data overlays.
    const h = Math.max(0.9, Math.min(2.1, heightCm / 100));
    this.figure = new THREE.Group();
    this.animal = this.rideTrack ? createReplayCyclist(heightCm, { weightKg }) : createReplayAnimal(heightCm, { weightKg });
    const ring = owned(new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 32), new THREE.MeshBasicMaterial({ color: LIME, side: THREE.DoubleSide })));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
    const fan = owned(new THREE.Mesh(this.fanGeometry(6), new THREE.MeshBasicMaterial({ color: LIME, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })));
    fan.position.y = (this.animal.eyeHeight ?? BEAR_EYE_HEIGHT) * h;
    this.gaze = fan;
    this.figure.add(this.animal.root, ring, fan);
    this.root.add(this.figure);
    // the recorded travel path and the contact point
    const path = this.headTrack.map(p => toThree(p.x, this.ground.heightAt(p.x, p.z) + 0.08, p.z));
    this.root.add(owned(new THREE.Line(new THREE.BufferGeometry().setFromPoints(path), new THREE.LineBasicMaterial({ color: LIME }))));
    const at = sample(this.headTrack, impactTime) ?? this.headTrack[this.headTrack.length - 1];
    // how the participant is thrown follows from where and how fast the car hit (crash.js)
    const carTrack = this.cars.get(carId)?.track ?? [];
    const carNow = sample(carTrack, impactTime), carBefore = sample(carTrack, impactTime - 0.15);
    const meBefore = sample(this.headTrack, impactTime - 0.15) ?? at;
    const span = Math.max(0.05, impactTime - (carBefore?.t ?? impactTime - 0.15));
    const recorded = carTrack.find(c => c.id === carId) ?? carTrack[0];
    this.driverTrack = carTrack;
    this.driverCarId = carId;
    this.driverSize = BODY_SIZE[recorded?.body] ?? BODY_SIZE.sedan;
    this.cockpit = buildCockpit(recorded?.body ?? 'sedan', this.driverSize, paintFor(carId));
    this.root.add(this.cockpit.root);              // drawn only in the driver view
    this.crash = carNow ? classifyCrash({
      person: at,
      personVelocity: { x: (at.x - meBefore.x) / 0.15, z: (at.z - meBefore.z) / 0.15 },
      car: carNow,
      carVelocity: carBefore ? { x: (carNow.x - carBefore.x) / span, z: (carNow.z - carBefore.z) / span } : { x: 0, z: 0 },
      size: BODY_SIZE[recorded?.body] ?? BODY_SIZE.sedan,
      bicycle: !!this.rideTrack,
    }) : classifyCrash({ person: at, car: { x: at.x - 1, z: at.z, yaw: 90 }, carVelocity: { x: 0, z: 0 }, bicycle: !!this.rideTrack });
    const disc = owned(new THREE.Mesh(new THREE.CircleGeometry(0.9, 32), new THREE.MeshBasicMaterial({ color: CONTACT, transparent: true, opacity: 0.8 })));
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
    const distance = this.rideTrack ? 13 : 16, elevation = this.rideTrack ? 10 : 15;
    this.camera.position.copy(toThree(at.x + sideX * distance, elevation, at.z + sideZ * distance));
    this.camera.lookAt(this.focus);
    if (this.rideTrack) {
      this.impactTrack = car;
      // Three-quarter view separates the two wheels and shows hands on the grips.
      this.rideCameraOffset = toThree(sideX * 11 + vx / len * 8, elevation, sideZ * 11 + vz / len * 8);
      this.frame(this.start_);
    }
  }

  /**
   * Puts a body part where the crash motion has thrown it: offset and turn are worked out in the
   * world (Unity metres), then expressed in the part's parent space (yawed figure, scaled bear),
   * turning around `centre`. Afterwards nothing may sink below the road.
   */
  applyCrash(group, centre, m, h, kind) {
    const base = this.animal.root, height = this.animal.height;
    if (m.tilt === 0 && m.spin === 0 && m.x === 0 && m.y === 0 && m.z === 0) {
      // before contact (and on a restart): the body back on its ring, upright (pose() sets the bob)
      group.quaternion.identity();
      if (kind !== 'body') group.position.set(0, 0, 0);
      else { group.position.x = 0; group.position.z = 0; }
      return;
    }
    const yaw = this.figure.quaternion, inverse = _q1.copy(yaw).invert();
    const dir = _v1.copy(toThree(this.crash.dir.x, 0, this.crash.dir.z));
    let axis;
    if (kind === 'bike') {
      // the bicycle goes down onto its side, towards where it is pushed
      const forward = _v2.set(0, 0, 1).applyQuaternion(yaw), right = _v3.crossVectors(forward, UP);
      axis = _v4.copy(forward).multiplyScalar(dir.dot(right) >= 0 ? -1 : 1);
    } else axis = _v4.crossVectors(UP, dir).normalize();
    const world = _q2.setFromAxisAngle(axis, m.tilt).multiply(_q3.setFromAxisAngle(UP, m.spin));
    group.quaternion.copy(inverse).multiply(world).multiply(yaw);
    const offset = _v2.copy(toThree(m.x, m.y, m.z)).applyQuaternion(inverse).divideScalar(height);
    group.position.copy(offset).add(centre).sub(_v3.copy(centre).applyQuaternion(group.quaternion));
    // on the ground the lowest point rests on the road at the landing place; in the air it only
    // must not sink below it
    base.updateWorldMatrix(true, true);
    _box.setFromObject(group, true);
    const below = this.ground.heightAt(h.x + m.x, h.z + m.z) - _box.min.y;
    if (below > 0 || m.y === 0) group.position.y += below / height;
  }

  /** The camera the replay is seen through. */
  get activeCamera() { return this.view === 'driver' && this.driverTrack?.length ? this.driverCamera : this.camera; }

  /** 'overview' (from above, across the car's path) or 'driver' (from the car's driver seat). */
  setView(view) {
    this.view = view === 'driver' ? 'driver' : 'overview';
    if (this.playing) this.frame(this.time);
  }

  /**
   * The driver's eyes in the accident car (cockpit.js lays out seat, bonnet, pillars and wheel for
   * its body type), looking ahead with a slight dip. At contact the view nods forward as the car
   * brakes hard. Before the car appears in the recording the view holds its first pose.
   */
  placeDriver(t) {
    const track = this.driverTrack;
    if (!track?.length || !this.cockpit) return;
    const c = sample(track, Math.max(track[0].t, Math.min(track.at(-1).t, t)));
    const car = this.cockpit.root;
    car.position.copy(toThree(c.x, this.ground.heightAt(c.x, c.z), c.z));
    car.rotation.set(0, yawToThree(c.yaw), 0);
    car.updateMatrixWorld();
    const e = this.cockpit.layout.eye;
    this.driverCamera.position.set(-e.right, e.up, e.forward).applyMatrix4(car.matrixWorld);
    const ahead = _v1.set(-e.right, e.up - 20 * Math.tan(4 * Math.PI / 180), e.forward + 20).applyMatrix4(car.matrixWorld);
    this.driverCamera.lookAt(ahead);
    const s = t - this.impact;
    if (s > 0) {
      const nod = 6 * Math.sin(Math.min(1, s / 0.18) * Math.PI / 2) * Math.exp(-3 * Math.max(0, s - 0.18));
      this.driverCamera.rotateX(-nod * Math.PI / 180);
    }
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
    // from the driver's seat the car itself is the cockpit, not the outer body
    const driving = this.view === 'driver' && this.driverTrack?.length;
    const own = this.cars.get(this.driverCarId);
    if (own && driving) own.mesh.visible = false;
    this.cockpit.root.visible = !!driving;
    const h = sample(this.headTrack, t);
    if (h) {
      this.figure.position.copy(toThree(h.x, this.ground.heightAt(h.x, h.z), h.z));
      const ride = this.rideTrack ? sampleRide(this.rideTrack, t) : null;
      this.figure.rotation.set(0, yawToThree(ride?.yaw ?? h.yaw), 0);
      const lookYaw = yawToThree(h.yaw - (ride?.yaw ?? h.yaw));
      this.gaze.rotation.y = lookYaw;
      const before = sample(this.headTrack, Math.max(this.start_, t - 0.05));
      const after = sample(this.headTrack, Math.min(this.end, t + 0.05));
      const speed = before && after && after.t > before.t ? Math.hypot(after.x - before.x, after.z - before.z) / (after.t - before.t) : 0;
      // Pose the body, then the crash reaction after contact (crash.js)
      const s_ = t - this.impact;
      const motion = crashMotion(this.crash, s_);
      if (this.rideTrack) this.animal.pose(t, speed, motion.flail, ride?.distance ?? 0, lookYaw, s_ > 0);
      else this.animal.pose(t, speed, motion.flail);
      this.gaze.visible = s_ <= 0 && this.view !== 'driver';   // the gaze fan is clutter through the windscreen
      if (this.rideTrack) {
        this.applyCrash(this.animal.rider, this.animal.riderCentre, motion, h, 'rider');
        this.applyCrash(this.animal.bike, this.animal.bikeCentre, bicycleMotion(this.crash, s_), h, 'bike');
      } else this.applyCrash(this.animal.pivot, this.animal.centre, motion, h, 'body');
      if (this.rideCameraOffset) {
        // A rider can cover almost 20 m in the recording window. Follow the bike
        // so it stays visible, and include the approaching car as it gets close.
        const car = sample(this.impactTrack, t);
        const blend = car ? Math.max(0, 1 - Math.hypot(car.x - h.x, car.z - h.z) / 10) * 0.5 : 0;
        this.focus.copy(toThree(h.x + ((car?.x ?? h.x) - h.x) * blend,
          this.ground.heightAt(h.x, h.z) + 0.8, h.z + ((car?.z ?? h.z) - h.z) * blend));
        this.camera.position.copy(this.focus).add(this.rideCameraOffset);
        this.camera.lookAt(this.focus);
      }
    }
    this.contact.visible = t >= this.impact;
    this.placeDriver(t);
  }

  /** Advance; returns the label shown above the replay. */
  update(dt) {
    if (!this.playing) return '';
    const slow = this.time > this.impact - SLOW_FROM && this.time < this.impact + SLOW_UNTIL;
    this.time = Math.min(this.end, this.time + Math.min(dt, 0.1) * (slow ? SLOW_RATE : 1));
    if (!this.atEnd) this.frame(this.time);
    if (this.time >= this.end) this.atEnd = true;
    const toContact = this.impact - this.time;
    return toContact > 0.05 ? `接触まで ${toContact.toFixed(1)} 秒` : toContact > -0.35 ? '接触 / Contact' : `接触後 ${(-toContact).toFixed(1)} 秒`;
  }

  restart() { this.time = this.start_; this.atEnd = false; this.frame(this.time); }

  stop() {
    this.playing = false;
    if (this.cockpit) {
      this.cockpit.root.removeFromParent();
      this.cockpit.dispose();
      this.cockpit = null;
    }
    if (this.root) {
      // Vehicle buffers/materials are shared with live traffic. Dispose only replay-owned parts.
      this.animal?.dispose();
      for (const overlay of this.overlays) {
        overlay.geometry.dispose();
        overlay.material.dispose();
      }
      this.overlays = [];
      this.scene.remove(this.root);
      this.root = null;
      this.animal = null;
    }
  }
}
