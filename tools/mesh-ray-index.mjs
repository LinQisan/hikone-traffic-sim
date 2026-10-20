// Exact static-mesh queries for offline checks. The browser keeps its own rendering/camera path.
import * as THREE from 'three';

/** Bound triangle batches, then let three.js perform its original intersection/material tests.
 * Position/normal/UV buffers and the source index stay intact. Rebuild after editing geometry.
 * Skinned, morphing and multi-material meshes retain their unmodified raycast implementation.
 */
export function indexMeshRays(root) {
  root.traverse(mesh => {
    if (!mesh.isMesh || mesh.isSkinnedMesh || mesh.isInstancedMesh || mesh.morphTargetInfluences?.length
      || Array.isArray(mesh.material) || mesh.raycast !== THREE.Mesh.prototype.raycast) return;
    const source = mesh.geometry, p = source.attributes.position, index = source.index;
    const start = source.drawRange.start, end = Math.min(index?.count ?? p.count, start + source.drawRange.count);
    if (start % 3 || end % 3 || end - start <= 96) return;
    const count = (end - start) / 3, ids = new Uint32Array(count);
    const bounds = new Float64Array(count * 6), centres = new Float64Array(count * 3);
    const point = new THREE.Vector3();
    for (let i = start; i < end; i += 3) {
      const id = (i - start) / 3, b = id * 6;
      bounds[b] = bounds[b + 1] = bounds[b + 2] = Infinity;
      bounds[b + 3] = bounds[b + 4] = bounds[b + 5] = -Infinity;
      for (let k = 0; k < 3; k++) {
        point.fromBufferAttribute(p, index ? index.getX(i + k) : i + k);
        bounds[b] = Math.min(bounds[b], point.x); bounds[b + 3] = Math.max(bounds[b + 3], point.x);
        bounds[b + 1] = Math.min(bounds[b + 1], point.y); bounds[b + 4] = Math.max(bounds[b + 4], point.y);
        bounds[b + 2] = Math.min(bounds[b + 2], point.z); bounds[b + 5] = Math.max(bounds[b + 5], point.z);
      }
      ids[id] = id;
      for (let k = 0; k < 3; k++) centres[id * 3 + k] = (bounds[b + k] + bounds[b + 3 + k]) / 2;
    }
    // Select only the median, instead of repeatedly sorting every large subtree.
    const partition = (lo, hi, mid, axis) => {
      while (lo < hi) {
        const pivot = centres[ids[(lo + hi) >>> 1] * 3 + axis];
        let a = lo, b = hi;
        while (a <= b) {
          while (centres[ids[a] * 3 + axis] < pivot) a++;
          while (centres[ids[b] * 3 + axis] > pivot) b--;
          if (a <= b) { const value = ids[a]; ids[a++] = ids[b]; ids[b--] = value; }
        }
        if (mid <= b) hi = b;
        else if (mid >= a) lo = a;
        else break;
      }
    };
    const build = (lo, hi) => {
      const box = new THREE.Box3();
      for (let i = lo; i < hi; i++) {
        const b = ids[i] * 6;
        box.min.x = Math.min(box.min.x, bounds[b]); box.max.x = Math.max(box.max.x, bounds[b + 3]);
        box.min.y = Math.min(box.min.y, bounds[b + 1]); box.max.y = Math.max(box.max.y, bounds[b + 4]);
        box.min.z = Math.min(box.min.z, bounds[b + 2]); box.max.z = Math.max(box.max.z, bounds[b + 5]);
      }
      box.expandByScalar(1e-9); // Keep exact edge/vertex hits in the candidate set.
      if (hi - lo <= 32) return { box, lo, hi };
      const x = box.max.x - box.min.x, y = box.max.y - box.min.y, z = box.max.z - box.min.z;
      const mid = (lo + hi) >>> 1;
      partition(lo, hi - 1, mid, x >= y && x >= z ? 0 : y >= z ? 1 : 2);
      return { box, left: build(lo, mid), right: build(mid, hi) };
    };
    const tree = build(0, ids.length), ordered = new Uint32Array(ids.length * 3);
    for (let i = 0; i < ids.length; i++) for (let k = 0; k < 3; k++)
      ordered[i * 3 + k] = index ? index.getX(start + ids[i] * 3 + k) : start + ids[i] * 3 + k;
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
    geometry.setIndex(new THREE.BufferAttribute(ordered, 1));
    geometry.boundingBox = tree.box;
    geometry.boundingSphere = tree.box.getBoundingSphere(new THREE.Sphere());
    const proxy = new THREE.Mesh(geometry, mesh.material), ray = new THREE.Ray(), inverse = new THREE.Matrix4();
    const hit = new THREE.Vector3(), original = mesh.raycast;
    mesh.raycast = function (raycaster, intersections) {
      ray.copy(raycaster.ray).applyMatrix4(inverse.copy(this.matrixWorld).invert());
      proxy.matrixWorld.copy(this.matrixWorld); proxy.material = this.material;
      const visit = node => {
        if (!ray.intersectBox(node.box, hit)) return;
        if (node.left) { visit(node.left); visit(node.right); return; }
        geometry.setDrawRange(node.lo * 3, (node.hi - node.lo) * 3);
        const first = intersections.length;
        original.call(proxy, raycaster, intersections);
        for (let i = first; i < intersections.length; i++) {
          const result = intersections[i];
          result.object = this; result.faceIndex = start / 3 + ids[result.faceIndex];
        }
      };
      visit(tree);
    };
  });
  return root;
}
