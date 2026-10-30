// Free street-level inspection camera for development: look around a map location without a
// scenario, as the editor's "3Dで見る" panel does. Map metres; heading is clockwise from +Z.
import {frame, geographicLocation} from '../../world/geography/coordinates.ts';
import * as THREE from 'three';
import {toThree} from '../scene/coords.ts';

export interface StreetPose {x: number; z: number; heading: number; pitch: number; eye: number}
interface GroundLike {heightAt(x: number, z: number): number}
interface Bounds {xMin: number; zMin: number; xMax: number; zMax: number}

const EYE = 1.6, MIN_EYE = 1, MAX_EYE = 120, WALK = 4.5, RUN = 16, TURN = 70, CLIMB = 6;
const KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyQ', 'KeyE', 'KeyR', 'KeyF', 'ShiftLeft', 'ShiftRight']);

/** Parse `x,z[,heading[,pitch[,eye]]]`; null for malformed or off-map input. */
export function parseStreetPose(text: string | null, bounds: Bounds): StreetPose | null {
  if (!text) return null;
  const [x, z, heading = 0, pitch = 0, eye = EYE] = text.split(',').map(Number);
  if (![x, z, heading, pitch, eye].every(Number.isFinite)) return null;
  if (x! < bounds.xMin || x! > bounds.xMax || z! < bounds.zMin || z! > bounds.zMax) return null;
  return {x: x!, z: z!, heading: ((heading % 360) + 360) % 360, pitch: Math.max(-80, Math.min(80, pitch)),
    eye: Math.max(MIN_EYE, Math.min(MAX_EYE, eye))};
}

/** The current view as plain text to paste to a person or an AI; the URL reopens this exact pose. */
export function describeStreetPose(pose: StreetPose, base: string): string {
  const {lat, lon} = geographicLocation(pose.x, pose.z);
  const round = (value: number, digits = 1) => +value.toFixed(digits);
  const heading = round(pose.heading, 0), bearing = (heading + frame.bearingDegrees + 360) % 360;
  return [
    `彦根 3D 視点: x=${round(pose.x, 2)}, z=${round(pose.z, 2)}, 向き=${heading}°（地図の上=0°、時計回り）, 上下=${round(pose.pitch, 0)}°, 目の高さ=${round(pose.eye)} m`,
    `緯度経度: ${lat.toFixed(6)}, ${lon.toFixed(6)}（真北からの方位 ${bearing}°）`,
    `URL: ${base}?street=${round(pose.x, 2)},${round(pose.z, 2)},${heading},${round(pose.pitch, 0)},${round(pose.eye)}`,
  ].join('\n');
}

export class StreetViewer {
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.1, 900);
  pose: StreetPose = {x: 0, z: 0, heading: 0, pitch: 0, eye: EYE};
  active = false;
  private readonly keys = new Set<string>();
  private drag: {x: number; y: number; heading: number; pitch: number} | null = null;
  private readonly target = new THREE.Vector3();

  private readonly ground: GroundLike;
  private readonly bounds: Bounds;

  constructor(element: HTMLElement, ground: GroundLike, bounds: Bounds, signal: AbortSignal) {
    this.ground = ground;
    this.bounds = bounds;
    addEventListener('keydown', event => {
      if (!this.active || !KEYS.has(event.code) || (event.target as Element | null)?.closest?.('input, textarea, select')) return;
      this.keys.add(event.code);
      if (event.code.startsWith('Arrow')) event.preventDefault();
    }, {signal});
    addEventListener('keyup', event => this.keys.delete(event.code), {signal});
    addEventListener('blur', () => this.keys.clear(), {signal});
    element.addEventListener('pointerdown', event => {
      if (!this.active || event.button !== 0) return;
      this.drag = {x: event.clientX, y: event.clientY, heading: this.pose.heading, pitch: this.pose.pitch};
      element.setPointerCapture(event.pointerId);
    }, {signal});
    element.addEventListener('pointermove', event => {
      if (!this.drag) return;
      // Drag the scene, as in a panorama viewer: moving right turns the view left.
      const degreesPerPixel = this.camera.fov / Math.max(1, element.clientHeight);
      this.pose.heading = (this.drag.heading - (event.clientX - this.drag.x) * degreesPerPixel + 360) % 360;
      this.pose.pitch = Math.max(-80, Math.min(80, this.drag.pitch + (event.clientY - this.drag.y) * degreesPerPixel));
      this.apply();
    }, {signal});
    const end = () => {this.drag = null;};
    element.addEventListener('pointerup', end, {signal});
    element.addEventListener('pointercancel', end, {signal});
    element.addEventListener('wheel', event => {
      if (!this.active) return;
      event.preventDefault();
      this.move(-Math.sign(event.deltaY) * Math.max(1, this.pose.eye / 4), 0);
    }, {signal, passive: false});
  }

  place(pose: StreetPose) {
    this.pose = {...pose};
    this.active = true;
    this.keys.clear();
    this.apply();
  }

  /** Advance held keys; returns true when the pose changed. */
  update(dt: number): boolean {
    if (!this.active || !this.keys.size) return false;
    const k = (...codes: string[]) => codes.some(code => this.keys.has(code));
    const speed = (k('ShiftLeft', 'ShiftRight') ? RUN : WALK) * Math.max(1, this.pose.eye / 8) * dt;
    const forward = (k('KeyW', 'ArrowUp') ? 1 : 0) - (k('KeyS', 'ArrowDown') ? 1 : 0);
    const strafe = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0);
    const turn = (k('KeyE', 'ArrowRight') ? 1 : 0) - (k('KeyQ', 'ArrowLeft') ? 1 : 0);
    const climb = (k('KeyR') ? 1 : 0) - (k('KeyF') ? 1 : 0);
    if (!forward && !strafe && !turn && !climb) return false;
    this.pose.heading = (this.pose.heading + turn * TURN * dt + 360) % 360;
    this.pose.eye = Math.max(MIN_EYE, Math.min(MAX_EYE, this.pose.eye * (1 + climb * dt) + climb * CLIMB * dt));
    this.move(forward * speed, strafe * speed);
    return true;
  }

  private move(forward: number, strafe: number) {
    const h = this.pose.heading * Math.PI / 180;
    const x = this.pose.x + Math.sin(h) * forward + Math.cos(h) * strafe;
    const z = this.pose.z + Math.cos(h) * forward - Math.sin(h) * strafe;
    // Inspection passes through buildings, but stays on the map.
    this.pose.x = Math.max(this.bounds.xMin, Math.min(this.bounds.xMax, x));
    this.pose.z = Math.max(this.bounds.zMin, Math.min(this.bounds.zMax, z));
    this.apply();
  }

  private apply() {
    const {x, z, heading, pitch, eye} = this.pose;
    const y = this.ground.heightAt(x, z) + eye;
    const h = heading * Math.PI / 180, p = pitch * Math.PI / 180;
    this.camera.position.copy(toThree(x, y, z));
    this.camera.lookAt(toThree(x + Math.sin(h) * Math.cos(p), y + Math.sin(p), z + Math.cos(h) * Math.cos(p), this.target));
  }

  stop() {this.active = false; this.keys.clear(); this.drag = null;}
}
