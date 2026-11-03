import { buildNativeModel } from '../geometry/model-builder.js';
import { readNativeProgram } from './model-format.ts';
import { readBakedModel } from './baked-model.js';

const materialOf = material => ({ color: 0xffffff, vertexColors: true, name: material.name, side: material.side,
  transparent: material.transparent, opacity: material.opacity, depthWrite: material.depthWrite,
  emissive: material.emissive, emissiveIntensity: material.emissiveIntensity });

/** A baked file decodes straight to the worker's payload; only a program needs the builder. */
async function construct(url, resource) {
  if (url.endsWith('.hkb')) {
    const { parts, name, timing } = await readBakedModel(resource);
    const buildEnd = performance.now();
    return { asset: name, timing, buildStart: buildEnd, buildEnd, payload: parts.map(part => ({ ...part, material: materialOf(part.material) })) };
  }
  const { program, timing } = await readNativeProgram(resource);
  const buildStart = performance.now(), built = buildNativeModel(program), buildEnd = performance.now();
  return { asset: program.name, timing, buildStart, buildEnd, payload: built.map(({ geometry, material }) => ({
    attributes: Object.fromEntries(Object.entries(geometry.attributes).map(([name, value]) =>
      [name, { array: value.array, itemSize: value.itemSize, normalized: value.normalized }])),
    index: geometry.index?.array,
    material: materialOf({ ...material, emissive: material.emissive.getHex() }) })) };
}

let queue = Promise.resolve();
self.onmessage = ({ data: { id, url, measure } }) => {
  // Fetch concurrently, but decode one model at a time to bound temporary geometry memory.
  const response = fetch(url);
  queue = queue.then(async () => {
    const started = performance.now();
    try {
      const resource = await response;
      if (!resource.ok) throw new Error(`${url}: ${resource.status}`);
      const { asset, timing: readTiming, buildStart, buildEnd, payload } = await construct(url, resource);
      const transfers = [];
      for (const part of payload) {
        for (const value of Object.values(part.attributes)) transfers.push(value.array.buffer);
        if (part.index) transfers.push(part.index.buffer);
      }
      const entry = performance.getEntriesByName(url).at(-1);
      const timing = measure ? { url, asset, ...readTiming, startedEpoch: performance.timeOrigin + started,
        wireBytes: entry?.encodedBodySize || Number(resource.headers.get('Content-Length')) || readTiming.receivedBytes,
        bodyWaitMs: buildStart - started - readTiming.parseMs, buildMs: buildEnd - buildStart,
        payloadMs: performance.now() - buildEnd, networkMs: entry?.duration ?? null } : undefined;
      self.postMessage({ id, parts: payload, timing }, transfers);
    } catch (error) { self.postMessage({ id, error: error.message }); }
  });
};
