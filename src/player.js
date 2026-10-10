// The participant: position and head yaw in Unity coordinates. Desktop: pointer-lock mouse look and
// WASD / arrow keys. Phones/tablets: the on-screen stick moves, dragging looks (touch-controls.js).
// Movement speed matches the Quest app: OVRPlayerController with Acceleration 0.1 adds 0.01 per
// frame and damps by 1 + 0.3 x 60 x dt, which settles at about 2.4 m/s at 72 Hz. The invisible walls
// of the map, the buildings and the parked vehicles (obstacles.js) stop the participant.
import * as THREE from 'three';
import { crossesWall } from './shared/scenario.js';
import { deltaYaw } from './analysis.js';
import { toThree, yawToThree } from './coords.js';
import { createReplayCyclist } from './replay-cyclist.js';

export const MOVE_SPEED = 2.4;
export const EYE_RATIO = 0.936;        // eye height / body height (ReplayMannequin.EyeRatio)
export const FALL_SECONDS = 0.55;      // eye level to the ground
// riding: m/s² pedalling, braking and coasting; push-back speed; turning rates in °/s; how far the
// rider can look round over the shoulder (body twist + head turn), in degrees
const PEDAL = 2.5, BRAKE = 6, COAST = 0.4, PUSH_BACK = 0.6, TURN_RATE = 75, STAND_TURN = 30;
export const LOOK_LIMIT = 150;
// body radius when walking; riding: the wheels' contact points, metres ahead of and behind the centre
export const BODY_RADIUS = 0.25;
const WHEEL_REACH = 0.8, WHEEL_RADIUS = 0.2;
const UP = new THREE.Vector3(0, 1, 0);
const LYING_EYE = 0.25, THROW = 0.9, ROLL = 75 * Math.PI / 180, LYING_PITCH = 8;

export class Player {
  constructor(camera, renderer, map, ground, obstacles = null) {
    this.camera = camera;
    this.renderer = renderer;
    this.map = map;
    this.ground = ground;
    this.obstacles = obstacles;
    this.rig = new THREE.Group();
    this.rig.add(camera);
    this.x = 0; this.z = 0; this.yaw = 0; this.pitch = 0;
    this.eye = 1.6;
    this.keys = new Set();
    this.stick = [0, 0];                 // on-screen stick: [strafe, forward], -1..1
    this.fall = null;                    // after contact: the camera goes down with the body
    this.enabled = false;
    this.speed = 0;
    this.rideSpeed = 0;                  // signed, along the bicycle's heading
    // riding: the seated bear without its head (the camera is there), so the participant sees
    // their paws on the grips and the legs pedalling. Rebuilt for each height/weight.
    const vehicle = new THREE.Group();
    vehicle.name = 'LiveBicycle';
    vehicle.visible = false;
    const self = this;
    this.bicycle = {
      root: vehicle,
      get wheels() { return self.rider.bicycle.wheels; },
      get crank() { return self.rider.bicycle.crank; },
      dispose() { self.rider?.dispose(); },
    };
    this.makeRider(170, 60);
    this.mode = 'walking'; this.distance = 0; this.rideYaw = 0;
    addEventListener('keydown', e => this.keys.add(e.code));
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    const canvas = renderer.domElement;
    canvas.addEventListener('click', e => { if (this.enabled && e.pointerType !== 'touch') canvas.requestPointerLock?.(); });
    addEventListener('mousemove', e => {
      if (document.pointerLockElement !== canvas) return;
      this.look(e.movementX * 0.12, e.movementY * 0.12);
    });
  }

  /** Turns the head by degrees (mouse or touch drag). */
  look(yawDegrees, pitchDegrees) {
    if (!this.enabled) return;
    this.yaw = (this.yaw + yawDegrees) % 360;
    // on a bicycle one can turn round only as far as the body twists (the bike keeps its heading)
    if (this.mode === 'bicycle') this.yaw = (this.rideYaw + Math.max(-LOOK_LIMIT, Math.min(LOOK_LIMIT, deltaYaw(this.rideYaw, this.yaw))) + 360) % 360;
    this.pitch = Math.max(-80, Math.min(80, this.pitch - pitchDegrees));
  }

  makeRider(heightCm, weightKg) {
    if (this.rider && this.rider.key === heightCm + '/' + weightKg) return;
    this.rider?.root.removeFromParent();
    this.rider?.dispose();
    this.rider = createReplayCyclist(heightCm, { weightKg, firstPerson: true });
    this.rider.key = heightCm + '/' + weightKg;
    this.bicycle.root.add(this.rider.root);
  }

  place(x, z, yaw, heightCm, mode = 'walking', weightKg = 60) {
    this.x = x; this.z = z; this.yaw = yaw; this.pitch = 0;
    this.height = Math.max(0.9, Math.min(2.1, heightCm / 100));
    this.mode = mode; this.distance = 0; this.rideYaw = yaw; this.rideSpeed = 0;
    if (mode === 'bicycle') this.makeRider(heightCm, weightKg);
    // walking: eye height from body height; riding: the seated bear's eyes
    this.eye = mode === 'bicycle' ? this.rider.eyeHeight * this.height : this.height * EYE_RATIO;
    this.bicycle.root.visible = mode === 'bicycle';
    this.bicycle.root.rotation.set(0, 0, 0);
    this.rider.pose(0, 0, 0, 0);
    this.rig.position.copy(toThree(x, this.ground.heightAt(x, z), z));
    this.rig.rotation.set(0, 0, 0);
    this.fall = null;
    this.stick = [0, 0];
    this.apply();
  }

  /** Keys and the on-screen stick as [strafe, forward], -1..1. */
  input() {
    const k = c => this.keys.has(c) ? 1 : 0;
    return [k('KeyD') + k('ArrowRight') - k('KeyA') - k('ArrowLeft') + this.stick[0],
      k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown') + this.stick[1]];
  }

  /**
   * Contact: from now on the view goes down with the body. `carYaw` (Unity degrees) is where the
   * car was heading; the body is thrown that way and the head rolls to that side.
   */
  knockDown(carYaw) {
    const side = Math.sin((carYaw - this.yaw) * Math.PI / 180);   // > 0: the car pushes to the right
    const a = carYaw * Math.PI / 180;
    this.fall = { t: 0, roll: side >= 0 ? -1 : 1, push: [Math.sin(a), Math.cos(a)], pitch: this.pitch };
  }

  update(dt) {
    if (this.fall) { this.fall.t += dt; this.apply(); return; }
    // keyboard looking (no mouse needed): Q / E turn the head at 90°/s
    const turn = (this.keys.has('KeyE') ? 1 : 0) - (this.keys.has('KeyQ') ? 1 : 0);
    if (turn) this.look(turn * 90 * dt, 0);
    if (this.mode === 'bicycle') { this.ride(dt); return; }
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
      return !crossesWall(this.map, from, { x: this.x + ddx + ddx / l * 0.25, z: this.z + ddz + ddz / l * 0.25 })
        && !this.obstacles?.blocked(this.x + ddx, this.z + ddz, BODY_RADIUS);
    };
    let mx = 0, mz = 0;
    if (reach(dx, dz)) { mx = dx; mz = dz; }
    else if (reach(dx, 0)) mx = dx;
    else if (reach(0, dz)) mz = dz;
    this.x += mx; this.z += mz;
    this.speed = Math.hypot(mx, mz) / Math.max(dt, 1e-4);
    this.distance += Math.hypot(mx, mz);
    this.apply();
  }

  /**
   * Riding: the bicycle keeps its own heading. Forward pedals (eases up to the walking speed of the
   * Quest app), back brakes and, once stopped, pushes the bicycle back slowly without turning it;
   * left/right steer along an arc (a U-turn is ridden, not spun on the spot; a slow turn is
   * possible when standing, like lifting the front round). Looking around never turns the
   * bicycle; when the bicycle turns, the view turns with it.
   */
  ride(dt) {
    let [steer, pedal] = this.enabled ? this.input() : [0, 0];
    steer = Math.max(-1, Math.min(1, steer)); pedal = Math.max(-1, Math.min(1, pedal));
    if (Math.abs(steer) < 0.15) steer = 0;
    if (Math.abs(pedal) < 0.15) pedal = 0;
    let v = this.rideSpeed;
    if (pedal > 0) v = v < 0 ? Math.min(0, v + BRAKE * dt) : Math.min(MOVE_SPEED * pedal, v + PEDAL * dt);
    else if (pedal < 0) v = v > 0.05 ? Math.max(0, v - BRAKE * dt) : Math.max(-PUSH_BACK, v - PEDAL * dt);
    else v = Math.sign(v) * Math.max(0, Math.abs(v) - COAST * dt);
    // turning rate: full lock at riding speed, a slow turn when (nearly) standing
    const rate = steer * Math.max(STAND_TURN, TURN_RATE * Math.min(1, Math.abs(v) / 1.2)) * (v < 0 ? -1 : 1);
    let turn = rate * dt;
    // a wheel may not swing into a building or a parked vehicle (it may turn away from one)
    if (turn && this.wheelsBlocked(this.x, this.z, this.rideYaw + turn) && !this.wheelsBlocked(this.x, this.z, this.rideYaw)) turn = 0;
    this.rideYaw = (this.rideYaw + turn + 360) % 360;
    this.yaw = (this.yaw + turn + 360) % 360;              // the head turns with the bicycle
    const a = this.rideYaw * Math.PI / 180, step = v * dt;
    const dx = Math.sin(a) * step, dz = Math.cos(a) * step;
    const l = Math.hypot(dx, dz);
    const blocked = l > 0 && (crossesWall(this.map, { x: this.x, z: this.z },
      { x: this.x + dx + dx / l * 0.6, z: this.z + dz + dz / l * 0.6 })
      || this.wheelsBlocked(this.x + dx, this.z + dz, this.rideYaw, Math.sign(v)));
    if (blocked) v = 0;
    else { this.x += dx; this.z += dz; this.distance += step; }
    this.rideSpeed = v;
    this.speed = Math.abs(v);
    this.apply();
  }

  /** Would the bicycle at (x, z) heading `yaw` touch an obstacle? `ahead` 1/-1: only that wheel. */
  wheelsBlocked(x, z, yaw, ahead = 0) {
    if (!this.obstacles) return false;
    const a = yaw * Math.PI / 180, fx = Math.sin(a) * WHEEL_REACH, fz = Math.cos(a) * WHEEL_REACH;
    return (ahead >= 0 && this.obstacles.blocked(x + fx, z + fz, WHEEL_RADIUS))
      || (ahead <= 0 && this.obstacles.blocked(x - fx, z - fz, WHEEL_RADIUS))
      || this.obstacles.blocked(x, z, BODY_RADIUS);
  }

  apply() {
    const groundY = this.ground.heightAt(this.x, this.z);
    this.rig.position.copy(toThree(this.x, groundY, this.z));
    this.camera.position.set(0, this.eye, 0);
    if (this.mode === 'bicycle') {
      this.rider.pose(this.distance, this.speed, 0, this.distance, deltaYaw(this.rideYaw, this.yaw) * Math.PI / 180 * -1);
      this.bicycle.root.position.copy(this.rig.position);
      this.bicycle.root.rotation.y = yawToThree(this.rideYaw);
      // the eyes sit where the seated bear's head is, behind the bicycle's centre
      const e = this.rider.eye;
      this.camera.position.set(e.x * this.height, e.y * this.height, e.z * this.height).applyAxisAngle(UP, this.bicycle.root.rotation.y);
    }
    // three cameras look down -z; unity forward (sin yaw, cos yaw) is three (-sin yaw, cos yaw)
    this.camera.rotation.set(this.pitch * Math.PI / 180, Math.PI - this.yaw * Math.PI / 180, 0, 'YXZ');
    if (this.fall) this.applyFall(groundY);
  }

  /**
   * The fall seen from the eyes: thrown along the car's heading while dropping (gravity), the
   * head rolls onto its side and tips up, a small bounce on landing, then lying still at about
   * 0.25 m. Only the camera moves: the recorded position for the replay stays where contact was.
   */
  applyFall(groundY) {
    const f = this.fall, T = FALL_SECONDS;
    const u = Math.min(1, f.t / T);
    const drop = u * u;                                   // accelerating like a fall
    const bounce = f.t > T ? Math.sin(Math.min(1, (f.t - T) / 0.25) * Math.PI) * 0.06 * Math.exp(-(f.t - T) * 4) : 0;
    const settle = 1 - (1 - Math.min(1, f.t / (T * 1.2))) ** 3;
    const height = this.eye + (LYING_EYE - this.eye) * drop + bounce;
    const throwDistance = THROW * settle;
    const p = toThree(this.x + f.push[0] * throwDistance, groundY, this.z + f.push[1] * throwDistance);
    this.rig.position.copy(p);
    this.camera.position.set(0, height, 0);
    const roll = this.reducedMotion ? 0 : f.roll * ROLL * settle;   // prefers-reduced-motion: no roll
    const pitch = f.pitch + (LYING_PITCH - f.pitch) * settle;
    this.camera.rotation.set(pitch * Math.PI / 180, Math.PI - this.yaw * Math.PI / 180, roll, 'YXZ');
    if (this.mode === 'bicycle') this.bicycle.root.rotation.z = -f.roll * 1.35 * settle;   // the bicycle goes down too
  }

  /** Head pose for the recorder: Unity x, z and yaw. */
  head() { return { x: this.x, z: this.z, yaw: this.yaw, ...(this.mode === 'bicycle' ? { rideYaw: this.rideYaw } : {}) }; }
}
