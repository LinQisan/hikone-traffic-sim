import type {Player} from './Player.ts';
// Phones and tablets: a stick at the bottom left walks or rides, dragging anywhere else on the view
// looks around (like the mouse on a desktop). Shown only while a scenario is being played.
export const LOOK_DEGREES_PER_PIXEL = 0.25;

/** True on devices whose main pointer is a finger (phones, tablets). */
export function isTouchDevice() {
  return matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches;
}

/** Stick vector from a finger offset: [strafe, forward] in -1..1, the length clamped to 1. */
export function stickVector(dx: number, dy: number, radius: number) {
  let x = dx / radius, y = 0 - dy / radius;     // screen up = forward
  const length = Math.hypot(x, y);
  if (length > 1) { x /= length; y /= length; }
  return [x, y];
}

export class TouchControls {
  declare player: Player; declare root: HTMLElement; declare base: HTMLElement; declare knob: HTMLElement;
  declare stickPointer: number | null; declare look: {id: number; x: number; y: number} | null;
  private readonly listeners = new AbortController();
  private onActive?: (active: boolean) => void;
  private isActive = false;
  constructor(player: Player, view: HTMLCanvasElement, root: HTMLElement, onActive?: (active: boolean) => void) {
    this.onActive = onActive;
    const signal = this.listeners.signal;
    this.player = player;
    this.root = root;
    this.base = root.querySelector<HTMLElement>('.stick')!;
    this.knob = root.querySelector<HTMLElement>('.knob')!;
    this.stickPointer = null;
    this.look = null;                       // { id, x, y }
    this.base.addEventListener('pointerdown', e => this.stickStart(e), {signal});
    this.base.addEventListener('pointermove', e => this.stickMove(e), {signal});
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) this.base.addEventListener(type, e => this.stickEnd(e as PointerEvent), {signal});
    view.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' || this.look || !this.active) return;
      this.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
      view.setPointerCapture?.(e.pointerId);
    }, {signal});
    view.addEventListener('pointermove', e => {
      if (!this.look || e.pointerId !== this.look.id) return;
      this.player.look((e.clientX - this.look.x) * LOOK_DEGREES_PER_PIXEL, (e.clientY - this.look.y) * LOOK_DEGREES_PER_PIXEL);
      this.look.x = e.clientX; this.look.y = e.clientY;
    }, {signal});
    for (const type of ['pointerup', 'pointercancel']) view.addEventListener(type, e => { if (this.look?.id === (e as PointerEvent).pointerId) this.look = null; }, {signal});
    this.setActive(false);
  }

  get active() { return this.onActive ? this.isActive : !this.root.hidden; }

  setActive(on: boolean) {
    this.isActive = on;
    if (this.onActive) this.onActive(on); else this.root.hidden = !on;
    if (!on) { this.reset(); this.look = null; }
  }

  stickStart(e: PointerEvent) {
    if (this.stickPointer !== null) return;
    e.preventDefault();
    this.stickPointer = e.pointerId;
    this.base.setPointerCapture?.(e.pointerId);
    this.stickMove(e);
  }

  stickMove(e: PointerEvent) {
    if (e.pointerId !== this.stickPointer) return;
    const r = this.base.getBoundingClientRect(), radius = r.width / 2;
    const [x, y] = stickVector(e.clientX - (r.left + radius), e.clientY - (r.top + radius), radius * 0.8);
    this.player.stick = [x, y];
    this.knob.style.transform = `translate(${x * radius * 0.6}px, ${-y * radius * 0.6}px)`;
  }

  stickEnd(e: PointerEvent) {
    if (e.pointerId === this.stickPointer) this.reset();
  }

  dispose() { this.listeners.abort(); this.setActive(false); }

  reset() {
    this.stickPointer = null;
    this.player.stick = [0, 0];
    this.knob.style.transform = '';
  }
}
