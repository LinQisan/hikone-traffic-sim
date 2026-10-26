import type {WebGLRenderer} from 'three';
type FrameSample = {ms: number; updateMs: number; calls: number; triangles: number};
type Details = Record<string, unknown> | (() => Record<string, unknown>);
export interface PerformanceReport {
  frames: number; fps: number; medianMs: number; p95Ms: number; updateMs: number; calls: number; triangles: number;
  width: number; height: number; geometries: number; textures: number; programs: number; readyMs: number | null;
  resourceTransferBytes: number; resourceBodyBytes: number; heapBytes: number | null; multiDraw: boolean;
  [metric: string]: unknown;
}
/** Opt-in fixed-view sampling; reports stay available without coupling simulation to UI. */
export class PerformanceProbe {
  declare element: Pick<HTMLElement, 'dataset'>;
  declare renderer: WebGLRenderer; declare enabled: boolean; declare readyMs: number | null;
  declare details: Details; declare elapsed: number; declare samples: FrameSample[]; declare report: PerformanceReport | null;
  constructor(element: Pick<HTMLElement, 'dataset'>, renderer: WebGLRenderer, enabled: boolean, details: Details = {}) {
    this.element = element; this.renderer = renderer; this.enabled = enabled; this.readyMs = null;
    this.reset(details);
  }
  reset(details = this.details) {
    this.details = details; this.elapsed = 0; this.samples = []; this.report = null;
    delete this.element.dataset.benchmark;
  }
  frame(seconds: number, updateMs: number) {
    if (!this.enabled || this.report) return;
    this.readyMs ??= performance.now();
    const warming = this.elapsed < 2;
    this.elapsed += seconds;
    if (warming || seconds <= 0) return;
    this.samples.push({ms: seconds * 1000, updateMs, calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles});
    if (this.elapsed < 10) return;
    const samples = this.samples, sorted = samples.map(s => s.ms).sort((a, b) => a - b);
    const average = (key: keyof FrameSample) => samples.reduce((sum, s) => sum + s[key], 0) / samples.length;
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const total = (key: 'transferSize' | 'decodedBodySize') => resources.reduce((sum, resource) => sum + resource[key], 0);
    const memory = (performance as Performance & {memory?: {usedJSHeapSize: number}}).memory;
    this.report = {...(typeof this.details === 'function' ? this.details() : this.details), frames: samples.length, fps: 1000 / average('ms'),
      medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.floor(sorted.length * 0.95)],
      updateMs: average('updateMs'), calls: average('calls'), triangles: average('triangles'),
      width: this.renderer.domElement.width, height: this.renderer.domElement.height,
      geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures,
      programs: this.renderer.info.programs?.length ?? 0, readyMs: this.readyMs,
      resourceTransferBytes: total('transferSize'), resourceBodyBytes: total('decodedBodySize'),
      heapBytes: memory?.usedJSHeapSize ?? null, multiDraw: this.renderer.extensions.has('WEBGL_multi_draw')};
    this.element.dataset.benchmark = JSON.stringify(this.report);
  }
}
