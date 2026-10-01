// Opt-in repeatable measurements, published in the FPS element for browser inspection.
export class PerformanceProbe {
  constructor(element, renderer, enabled, details = {}) {
    this.element = element;
    this.renderer = renderer;
    this.enabled = enabled;
    this.elapsed = 0;
    this.samples = [];
    this.details = details;
  }
  frame(seconds, updateMs) {
    if (!this.enabled || this.report) return;
    const warming = this.elapsed < 2;
    this.elapsed += seconds;
    if (warming || seconds <= 0) return; // Exclude the frame crossing the shader warmup boundary too.
    this.samples.push({ ms: seconds * 1000, updateMs, calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles });
    if (this.elapsed < 10) return;
    const samples = this.samples, sorted = samples.map(s => s.ms).sort((a, b) => a - b);
    const average = key => samples.reduce((sum, s) => sum + s[key], 0) / samples.length;
    this.report = { ...this.details, frames: samples.length, fps: 1000 / average('ms'),
      medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.floor(sorted.length * 0.95)],
      updateMs: average('updateMs'), calls: average('calls'), triangles: average('triangles'),
      width: this.renderer.domElement.width, height: this.renderer.domElement.height,
      multiDraw: this.renderer.extensions.has('WEBGL_multi_draw') };
    this.element.dataset.benchmark = JSON.stringify(this.report);
  }
}
