// Decorative time is independent of traffic, player movement and replay time.
// One stable uniform drives every water batch; cloud drift reuses the baked cube sky.
export class AmbientMotion {
  constructor() {
    this.time = { value: 0 };
    this.reducedMotion = false;
  }

  setReducedMotion(value) { this.reducedMotion = value; }

  advance(seconds) {
    // Background tabs and long frames must not fast-forward the scenery on return.
    if (!this.reducedMotion && Number.isFinite(seconds) && seconds > 0)
      this.time.value += Math.min(seconds, 0.1);
  }

  get skyAngle() { return this.time.value * 0.0045; }
}

export const ambientMotion = new AmbientMotion();
