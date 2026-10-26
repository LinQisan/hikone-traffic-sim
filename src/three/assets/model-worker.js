import { buildNativeModel } from '../geometry/model-builder.js';
import { readNativeProgram } from './model-format.ts';

let queue = Promise.resolve();
self.onmessage = ({ data: { id, url, measure } }) => {
  // Fetch concurrently, but parse/build one program at a time to bound temporary geometry memory.
  const response = fetch(url);
  queue = queue.then(async () => {
    const started = performance.now();
    try {
      const resource = await response;
      if (!resource.ok) throw new Error(`${url}: ${resource.status}`);
      const { program, timing: readTiming } = await readNativeProgram(resource);
      const buildStart = performance.now();
      const parts = buildNativeModel(program);
      const buildEnd = performance.now();
      const transfers = [];
      const payload = parts.map(({ geometry, material }) => {
        const attributes = Object.fromEntries(Object.entries(geometry.attributes).map(([name, value]) => {
          transfers.push(value.array.buffer);
          return [name, { array: value.array, itemSize: value.itemSize, normalized: value.normalized }];
        }));
        const index = geometry.index?.array;
        if (index) transfers.push(index.buffer);
        return { attributes, index, material: { name: material.name, color: 0xffffff, vertexColors: true,
          side: material.side, transparent: material.transparent, opacity: material.opacity,
          depthWrite: material.depthWrite, emissive: material.emissive.getHex(), emissiveIntensity: material.emissiveIntensity } };
      });
      const entry = performance.getEntriesByName(url).at(-1);
      const timing = measure ? { url, asset: program.name, ...readTiming, startedEpoch: performance.timeOrigin + started,
        wireBytes: entry?.encodedBodySize || Number(resource.headers.get('Content-Length')) || readTiming.receivedBytes,
        bodyWaitMs: buildStart - started - readTiming.parseMs, buildMs: buildEnd - buildStart,
        payloadMs: performance.now() - buildEnd, networkMs: entry?.duration ?? null } : undefined;
      self.postMessage({ id, parts: payload, timing }, transfers);
    } catch (error) { self.postMessage({ id, error: error.message }); }
  });
};
