// Render resolution that follows the GPU: below ~50 fps the pixel ratio steps down (to half);
// after three windows in a row with headroom it steps back up. A step down blocks raising above it
// for a while, so the scale settles instead of oscillating (each change is visible as a sharpness
// change). The painted look tolerates a softer image far better than a stuttering one.
export class AdaptiveResolution {
  constructor({ enabled = true, min = 0.5, slow = 1 / 50, fast = 1 / 58, window = 0.5, hold = 15000 } = {}) {
    Object.assign(this, { enabled, min, slow, fast, window, hold });
    this.scale = 1;
    this.ceiling = 1;
    this.ceilingUntil = 0;
    this.time = 0;
    this.frames = 0;
    this.headroom = 0;
  }
  /** Feeds one frame; returns true when the scale changed (resize the canvas before drawing). */
  frame(seconds, now, paused = false) {
    // stalls (loading, tab switches) say nothing about the GPU
    if (!this.enabled || paused) { this.time = this.frames = 0; return false; }
    if (seconds <= 0 || seconds > 0.25) return false;
    this.time += seconds; this.frames++;
    if (this.time < this.window) return false;
    const average = this.time / this.frames;
    this.time = this.frames = 0;
    if (now > this.ceilingUntil) this.ceiling = 1;
    let next = this.scale;
    this.headroom = average < this.fast ? this.headroom + 1 : 0;
    if (average > this.slow) {
      next = Math.max(this.min, this.scale * 0.85);
      this.ceiling = Math.max(this.min, this.scale * 0.95);
      this.ceilingUntil = now + this.hold;
    } else if (this.headroom >= 3) { next = Math.min(this.ceiling, this.scale * 1.1); this.headroom = 0; }
    if (Math.abs(next - this.scale) < 0.005) return false;
    this.scale = next;
    return true;
  }
}
