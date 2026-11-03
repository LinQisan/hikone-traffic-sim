// Baked model transport: the construction program's finished triangles, meshopt-coded. A program
// stays the authoritative source and the fallback; this only removes parsing and rebuilding it.
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export const POSITION_UNIT = 1024;                // positions in 1/1024 m, exactly representable as Float32
const MAGIC = 0x31424b48;                         // 'HKB1'

async function gunzip(bytes) {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
}

/** Header, then each part's position, normal + colour and index streams. */
export function packBaked(header, streams) {
  const text = new TextEncoder().encode(JSON.stringify(header));
  const length = 8 + text.length + streams.reduce((n, s) => n + s.length, 0);
  const bytes = new Uint8Array(length), view = new DataView(bytes.buffer);
  view.setUint32(0, MAGIC, true); view.setUint32(4, text.length, true);
  bytes.set(text, 8);
  let at = 8 + text.length;
  for (const stream of streams) { bytes.set(stream, at); at += stream.length; }
  return bytes;
}

export async function readBakedModel(response) {
  await MeshoptDecoder.ready;
  const started = performance.now(), received = new Uint8Array(await response.arrayBuffer());
  const bodyEnd = performance.now(), bytes = await gunzip(received);
  const unpacked = performance.now(), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== MAGIC) throw new Error('Not a baked model');
  const headerLength = view.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + headerLength)));
  let at = 8 + headerLength;
  const take = length => { const stream = bytes.subarray(at, at + length); at += length; return stream; };
  const parts = header.parts.map(({ material, vertices, indices, sizes }) => {
    const units = new Int32Array(vertices * 3), packed = new Uint8Array(vertices * 8);
    MeshoptDecoder.decodeVertexBuffer(new Uint8Array(units.buffer), vertices, 12, take(sizes[0]));
    MeshoptDecoder.decodeVertexBuffer(packed, vertices, 8, take(sizes[1]));
    const wide = vertices > 65535, index = wide ? new Uint32Array(indices) : new Uint16Array(indices);
    MeshoptDecoder.decodeIndexBuffer(new Uint8Array(index.buffer), indices, wide ? 4 : 2, take(sizes[2]));
    const position = new Float32Array(vertices * 3), normal = new Int8Array(vertices * 3), color = new Uint8Array(vertices * 3);
    for (let i = 0; i < position.length; i++) position[i] = units[i] / POSITION_UNIT;
    for (let i = 0, o = 0; i < vertices; i++, o += 8) {
      normal[i * 3] = packed[o] << 24 >> 24; normal[i * 3 + 1] = packed[o + 1] << 24 >> 24; normal[i * 3 + 2] = packed[o + 2] << 24 >> 24;
      color[i * 3] = packed[o + 4]; color[i * 3 + 1] = packed[o + 5]; color[i * 3 + 2] = packed[o + 6];
    }
    return { material, index, attributes: {
      position: { array: position, itemSize: 3, normalized: false },
      normal: { array: normal, itemSize: 3, normalized: true },
      color: { array: color, itemSize: 3, normalized: true } } };
  });
  return { parts, name: header.name, timing: { receivedBytes: received.length, bytes: bytes.length,
    bodyMs: bodyEnd - started, decodeMs: unpacked - bodyEnd, parseMs: performance.now() - unpacked } };
}
