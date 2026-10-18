// Exact ground contact for rigid, posed meshes. Only the world-space minimum Y is needed;
// computing a full Box3 with getVertexPosition() for every vertex was a replay hot path.
export class GroundContact {
  constructor(root) {
    this.parts = [];
    root.traverse(part => {
      if (!part.isMesh) return;
      part.geometry.boundingBox ?? part.geometry.computeBoundingBox();
      this.parts.push(part);
    });
  }

  /** Call after updating the posed hierarchy's world matrices. No bounds approximation. */
  minimumY() {
    let lowest = Infinity;
    for (const part of this.parts) {
      const e = part.matrixWorld.elements, { min, max } = part.geometry.boundingBox;
      // The transformed local box is a lower bound. Most limbs cannot be the lowest part.
      const bound = e[1] * (e[1] < 0 ? max.x : min.x) + e[5] * (e[5] < 0 ? max.y : min.y)
        + e[9] * (e[9] < 0 ? max.z : min.z) + e[13];
      if (bound >= lowest) continue;
      const position = part.geometry.attributes.position;
      const packed = !position.isInterleavedBufferAttribute && !position.normalized && position.itemSize === 3;
      const array = position.array;
      for (let i = 0; i < position.count; i++) {
        const x = packed ? array[i * 3] : position.getX(i);
        const y = packed ? array[i * 3 + 1] : position.getY(i);
        const z = packed ? array[i * 3 + 2] : position.getZ(i);
        lowest = Math.min(lowest, e[1] * x + e[5] * y + e[9] * z + e[13]);
      }
    }
    return lowest;
  }
}
