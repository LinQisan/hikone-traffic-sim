// Load construction programs; the worker builds native three.js geometry off the UI thread.
import * as THREE from 'three';
import { buildNativeModel } from '../geometry/model-builder.js';
import { startup, startupModel } from '../renderer/startup.ts';
import { ModelWorkerPool } from './ModelWorkerPool.ts';
import { nativeModelURL, readNativeProgram } from './model-format.ts';
import runtime from '../../../models/runtime.json' with { type: 'json' };
export { ModelBuilder, buildNativeModel } from '../geometry/model-builder.js';

let pool;
let generation = 0;
let activeManager = THREE.DefaultLoadingManager;
let activeSignal = null;
/** A single mounted engine owns workers; stale completions cannot enter a later session. */
export function beginModelSession(manager, signal = /** @type {AbortSignal | null} */ (null)) {
  const current = ++generation;
  activeManager = manager; activeSignal = signal;
  return () => {
    if (current !== generation) return;
    generation++; pool?.dispose(); pool = undefined;
    activeManager = THREE.DefaultLoadingManager; activeSignal = null;
  };
}

async function constructInWorker(url) {
  if (!pool) {
    // Keep touch devices on one worker to bound peak construction memory. Desktop CPUs can
    // build the large terrain's independent detail levels concurrently.
    const override = startup.enabled ? new URLSearchParams(location.search).get('modelWorkers') : null;
    const limit = override === '1' ? 1 : override === '2' ? 2
      : navigator.hardwareConcurrency >= 4 && !navigator.maxTouchPoints ? 2 : 1;
    pool = new ModelWorkerPool(() => new Worker(new URL('./model-worker.js', import.meta.url), { type: 'module' }), limit);
    if (startup.enabled) startup.workerCount = limit;
  }
  const queuedAt = performance.now();
  const { parts, timing, workerIndex } = await pool.run({ url, measure: startup.enabled });
  const received = performance.now();
  const result = parts.map(part => {
    const geometry = new THREE.BufferGeometry();
    for (const [name, values] of Object.entries(part.attributes))
      geometry.setAttribute(name, new THREE.BufferAttribute(values.array, values.itemSize, values.normalized));
    if (part.index) geometry.setIndex(new THREE.BufferAttribute(part.index, 1));
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return { geometry, material: new THREE.MeshLambertMaterial(part.material), matrix: new THREE.Matrix4() };
  });
  if (timing) startupModel({ ...timing, workerIndex, queuedAt, receivedAt: received,
    rehydrateMs: performance.now() - received, startedAt: timing.startedEpoch - performance.timeOrigin });
  return result;
}

export async function loadNativeModel(name, detail = 'high') {
  if (!/^[A-Za-z0-9_]+$/.test(name) || !['high', 'low'].includes(detail)) throw new Error('Invalid native model name or detail');
  const entry = runtime.files[`${name}/${detail}`];
  if (!entry) throw new Error(`Unknown native model: ${name}/${detail}`);
  const raw = startup.enabled && new URLSearchParams(location.search).get('modelEncoding') === 'plain';
  const url = nativeModelURL(entry, !raw && typeof DecompressionStream !== 'undefined');
  const manager = activeManager, current = generation, signal = activeSignal;
  manager.itemStart(url);
  try {
    // Construct once off the UI thread; transfer attribute storage without copying the meshes.
    if (typeof Worker !== 'undefined') {
      const parts = await constructInWorker(new URL(url, document.baseURI).href);
      if (current !== generation) {for (const part of parts) {part.geometry.dispose(); part.material.dispose();} throw new DOMException('Engine unmounted', 'AbortError');}
      return parts;
    }
    const response = await fetch(url, {signal});
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return buildNativeModel((await readNativeProgram(response)).program);
  } catch (error) { manager.itemError(url); throw error; }
  finally { manager.itemEnd(url); }
}
