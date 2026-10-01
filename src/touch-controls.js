// Phones and tablets: a stick at the bottom left walks or rides, dragging anywhere else on the view
// looks around (like the mouse on a desktop). Shown only while a scenario is being played.
export const LOOK_DEGREES_PER_PIXEL = 0.25;

/** True on devices whose main pointer is a finger (phones, tablets). */
export function isTouchDevice() {
  return matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches;
}

/** Stick vector from a finger offset: [strafe, forward] in -1..1, the length clamped to 1. */
export function stickVector(dx, dy, radius) {
  let x = dx / radius, y = 0 - dy / radius;     // screen up = forward
  const length = Math.hypot(x, y);
  if (length > 1) { x /= length; y /= length; }
  return [x, y];
}

export class TouchControls {
  constructor(player, view, root) {
    this.player = player;
    this.root = root;
    this.base = root.querySelector('.stick');
    this.knob = root.querySelector('.knob');
    this.stickPointer = null;
    this.look = null;                       // { id, x, y }
    this.base.addEventListener('pointerdown', e => this.stickStart(e));
    this.base.addEventListener('pointermove', e => this.stickMove(e));
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) this.base.addEventListener(type, e => this.stickEnd(e));
    view.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' || this.look || !this.active) return;
      this.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
      view.setPointerCapture?.(e.pointerId);
    });
    view.addEventListener('pointermove', e => {
      if (!this.look || e.pointerId !== this.look.id) return;
      this.player.look((e.clientX - this.look.x) * LOOK_DEGREES_PER_PIXEL, (e.clientY - this.look.y) * LOOK_DEGREES_PER_PIXEL);
      this.look.x = e.clientX; this.look.y = e.clientY;
    });
    for (const type of ['pointerup', 'pointercancel']) view.addEventListener(type, e => { if (this.look?.id === e.pointerId) this.look = null; });
    this.setActive(false);
  }

  get active() { return !this.root.hidden; }

  setActive(on) {
    this.root.hidden = !on;
    if (!on) { this.reset(); this.look = null; }
  }

  stickStart(e) {
    if (this.stickPointer !== null) return;
    e.preventDefault();
    this.stickPointer = e.pointerId;
    this.base.setPointerCapture?.(e.pointerId);
    this.stickMove(e);
  }

  stickMove(e) {
    if (e.pointerId !== this.stickPointer) return;
    const r = this.base.getBoundingClientRect(), radius = r.width / 2;
    const [x, y] = stickVector(e.clientX - (r.left + radius), e.clientY - (r.top + radius), radius * 0.8);
    this.player.stick = [x, y];
    this.knob.style.transform = `translate(${x * radius * 0.6}px, ${-y * radius * 0.6}px)`;
  }

  stickEnd(e) {
    if (e.pointerId === this.stickPointer) this.reset();
  }

  reset() {
    this.stickPointer = null;
    this.player.stick = [0, 0];
    this.knob.style.transform = '';
  }
}
