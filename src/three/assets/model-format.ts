import type {NativeTransport, NativeProgram} from '../../types/assets.ts';
// Gzip is only a transport encoding. The decoded construction program is unchanged.
export function nativeModelURL(entry: NativeTransport, compressed = typeof DecompressionStream !== 'undefined') {
  return compressed ? entry.url : entry.rawUrl;
}

export async function readNativeProgram(response: Response) {
  const start = performance.now(), buffer = await response.arrayBuffer();
  const bodyEnd = performance.now(), bytes = new Uint8Array(buffer);
  // A server can also set Content-Encoding itself, in which case fetch already decoded it.
  const zipped = bytes[0] === 0x1f && bytes[1] === 0x8b;
  let text: string | null = zipped ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
    : new TextDecoder().decode(bytes);
  const parseStart = performance.now(), program = JSON.parse(text) as NativeProgram, sourceBytes = text.length;
  text = null;
  return { program, timing: { bytes: sourceBytes, receivedBytes: buffer.byteLength, bodyMs: bodyEnd - start,
    decodeMs: parseStart - bodyEnd, parseMs: performance.now() - parseStart } };
}
