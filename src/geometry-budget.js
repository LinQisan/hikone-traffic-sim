// Keep positions/triangles exact; use normalized byte attributes for paint/light (vehicles, props).
import * as THREE from 'three';

/** Resident geometry attributes, counted once even when meshes share a shadow/view buffer. */
export function geometryBytes(root, includeInstances = false) {
  const buffers = new Set();
  const add = attribute => { if (attribute) buffers.add(attribute.data ?? attribute); };
  root.traverse(object => {
    if (object.geometry) {
      add(object.geometry.index);
      for (const attribute of Object.values(object.geometry.attributes)) add(attribute);
    }
    if (includeInstances) { add(object.instanceMatrix); add(object.instanceColor); }
  });
  let bytes = 0;
  for (const buffer of buffers) bytes += buffer.array.byteLength;
  return bytes;
}

/**
 * GLB byte normals/pigments arrive 4-byte strided (an interleaved view; tools/quantize_glb.py).
 * Copy them into compact attributes of the same type, so merging, cutting and vehicle splits see
 * plain arrays and the padding byte is not kept resident.
 */
export function compactAttributes(geometry) {
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    if (!attribute.isInterleavedBufferAttribute) continue;
    const { data, offset, itemSize, count } = attribute, stride = data.stride, source = data.array;
    const array = new source.constructor(count * itemSize);
    for (let i = 0; i < count; i++) for (let c = 0; c < itemSize; c++) array[i * itemSize + c] = source[i * stride + offset + c];
    geometry.setAttribute(name, new THREE.BufferAttribute(array, itemSize, attribute.normalized));
  }
  return geometry;
}

export function packPigments(geometry) {
  for (const [name, Type, maximum] of [['normal', Int8Array, 127], ['color', Uint8Array, 255]]) {
    const source = geometry.getAttribute(name);
    if (!source || source.array instanceof Type && source.normalized) continue;
    const array = new Type(source.count * source.itemSize);
    for (let i = 0; i < source.count; i++) for (let c = 0; c < source.itemSize; c++)
      array[i * source.itemSize + c] = Math.round(source.getComponent(i, c) * maximum);
    geometry.setAttribute(name, new THREE.BufferAttribute(array, source.itemSize, true));
  }
  return geometry;
}
