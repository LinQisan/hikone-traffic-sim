// Opt-in repeatable measurements, published in the FPS element for browser inspection.
export class PerformanceProbe {
  constructor(element, renderer, enabled, details = {}) {
    this.element = element;
    this.renderer = renderer;
    this.enabled = enabled;
    this.readyMs = null;
    this.reset(details);
  }
  /** Start another measurement after changing viewpoint or restarting a replay. */
  reset(details = this.details) {
    this.details = details;
    this.elapsed = 0;
    this.samples = [];
    this.report = null;
    delete this.element.dataset.benchmark;
  }
  frame(seconds, updateMs) {
    if (!this.enabled || this.report) return;
    this.readyMs ??= performance.now();
    const warming = this.elapsed < 2;
    this.elapsed += seconds;
    if (warming || seconds <= 0) return; // Exclude the frame crossing the shader warmup boundary too.
    this.samples.push({ ms: seconds * 1000, updateMs, calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles });
    if (this.elapsed < 10) return;
    const samples = this.samples, sorted = samples.map(s => s.ms).sort((a, b) => a - b);
    const average = key => samples.reduce((sum, s) => sum + s[key], 0) / samples.length;
    const resources = performance.getEntriesByType('resource');
    const total = key => resources.reduce((sum, resource) => sum + resource[key], 0);
    this.report = { ...(typeof this.details === 'function' ? this.details() : this.details), frames: samples.length, fps: 1000 / average('ms'),
      medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.floor(sorted.length * 0.95)],
      updateMs: average('updateMs'), calls: average('calls'), triangles: average('triangles'),
      width: this.renderer.domElement.width, height: this.renderer.domElement.height,
      geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures,
      programs: this.renderer.info.programs.length, readyMs: this.readyMs,
      resourceTransferBytes: total('transferSize'), resourceBodyBytes: total('decodedBodySize'),
      heapBytes: performance.memory?.usedJSHeapSize ?? null,
      multiDraw: this.renderer.extensions.has('WEBGL_multi_draw') };
    this.element.dataset.benchmark = JSON.stringify(this.report);
  }
}
