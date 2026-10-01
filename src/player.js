// The participant: position and head yaw in Unity coordinates. Desktop: pointer-lock mouse look and
// WASD / arrow keys. WebXR: the headset drives the head, the left stick moves (like the Quest app).
// Movement speed matches the Quest app: OVRPlayerController with Acceleration 0.1 adds 0.01 per
// frame and damps by 1 + 0.3 x 60 x dt, which settles at about 2.4 m/s at 72 Hz. The invisible walls
// of the map stop the participant.
import * as THREE from 'three';
import { crossesWall } from './shared/scenario.js';
import { toThree, unityYaw } from './coords.js';

export const MOVE_SPEED = 2.4;
export const EYE_RATIO = 0.936;        // eye height / body height (ReplayMannequin.EyeRatio)

export class Player {
  constructor(camera, renderer, map, ground) {
    this.camera = camera;
    this.renderer = renderer;
    this.map = map;
    this.ground = ground;
    this.rig = new THREE.Group();
    this.rig.add(camera);
    this.x = 0; this.z = 0; this.yaw = 0; this.pitch = 0;
    this.eye = 1.6;
    this.keys = new Set();
    this.enabled = false;
    this.speed = 0;
    addEventListener('keydown', e => this.keys.add(e.code));
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    const canvas = renderer.domElement;
    canvas.addEventListener('click', () => { if (this.enabled && !this.xr) canvas.requestPointerLock?.(); });
    addEventListener('mousemove', e => {
      if (document.pointerLockElement !== canvas) return;
      this.yaw = (this.yaw + e.movementX * 0.12) % 360;
      this.pitch = Math.max(-80, Math.min(80, this.pitch - e.movementY * 0.12));
    });
  }

  get xr() { return this.renderer.xr.isPresenting; }

  place(x, z, yaw, heightCm) {
    this.x = x; this.z = z; this.yaw = yaw; this.pitch = 0;
    this.eye = Math.max(0.9, Math.min(2.1, heightCm / 100)) * EYE_RATIO;
    this.rig.position.copy(toThree(x, this.ground.heightAt(x, z), z));
    this.rig.rotation.set(0, 0, 0);
    if (this.xr) this.alignXr();
    this.apply();
  }

  /** In VR the rig is turned so the participant faces the scenario's direction at the start. */
  alignXr() {
    const head = new THREE.Vector3();
    this.camera.getWorldDirection(head);
    const turn = (this.yaw - unityYaw(head)) * Math.PI / 180;
    this.rig.rotation.y -= turn;
  }

  /** Left stick (XR) or keys (desktop) as [strafe, forward], -1..1. */
  input() {
    if (this.xr) {
      for (const source of this.renderer.xr.getSession()?.inputSources ?? []) {
        if (source.handedness === 'left' && source.gamepad && source.gamepad.axes.length >= 4)
          return [source.gamepad.axes[2], -source.gamepad.axes[3]];
      }
      return [0, 0];
    }
    const k = c => this.keys.has(c) ? 1 : 0;
    return [k('KeyD') + k('ArrowRight') - k('KeyA') - k('ArrowLeft'), k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown')];
  }

  update(dt) {
    if (this.xr) this.readHead();
    let [sx, sf] = this.input();
    const len = Math.hypot(sx, sf);
    if (!this.enabled || len < 0.15) { this.speed = 0; this.apply(); return; }
    if (len > 1) { sx /= len; sf /= len; }
    const a = this.yaw * Math.PI / 180;
    const dx = (Math.sin(a) * sf + Math.cos(a) * sx) * MOVE_SPEED * dt;
    const dz = (Math.cos(a) * sf - Math.sin(a) * sx) * MOVE_SPEED * dt;
    const from = { x: this.x, z: this.z };
    // a little look-ahead so the participant stops just short of a wall; slide along it
    const reach = (ddx, ddz) => {
      const l = Math.hypot(ddx, ddz) || 1;
      return !crossesWall(this.map, from, { x: this.x + ddx + ddx / l * 0.25, z: this.z + ddz + ddz / l * 0.25 });
    };
    let mx = 0, mz = 0;
    if (reach(dx, dz)) { mx = dx; mz = dz; }
    else if (reach(dx, 0)) mx = dx;
    else if (reach(0, dz)) mz = dz;
    this.x += mx; this.z += mz;
    this.speed = Math.hypot(mx, mz) / Math.max(dt, 1e-4);
    if (this.xr) {
      this.rig.position.x -= mx;          // unity +x is three -x
      this.rig.position.z += mz;
    }
    this.apply();
  }

  /** XR: the participant is where the head is. */
  readHead() {
    const p = new THREE.Vector3(), d = new THREE.Vector3();
    this.camera.getWorldPosition(p);
    this.camera.getWorldDirection(d);
    this.x = -p.x; this.z = p.z;
    this.yaw = unityYaw(d);
    this.pitch = Math.asin(Math.max(-1, Math.min(1, d.y))) * 180 / Math.PI;
  }

  apply() {
    const groundY = this.ground.heightAt(this.x, this.z);
    if (this.xr) { this.rig.position.y = groundY; return; }
    this.rig.position.copy(toThree(this.x, groundY, this.z));
    this.camera.position.set(0, this.eye, 0);
    // three cameras look down -z; unity forward (sin yaw, cos yaw) is three (-sin yaw, cos yaw)
    this.camera.rotation.set(this.pitch * Math.PI / 180, Math.PI - this.yaw * Math.PI / 180, 0, 'YXZ');
  }

  /** Head pose for the recorder: Unity x, z and yaw. */
  head() { return { x: this.x, z: this.z, yaw: this.yaw }; }
}
