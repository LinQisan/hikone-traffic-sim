// World cells share a few materials, so each material's cells can be one multi-draw: the frustum
// test still runs per cell, but the driver sees a single call. On ANGLE and mobile GPUs a draw costs
// more than the triangles it saves; a walk through the moat street otherwise submits 200.
// A cell stays a logical Mesh that updateLOD selects by its `visible`; here it holds no vertices.
import * as THREE from 'three';

const shadowView = new THREE.Frustum(), shadowProjection = new THREE.Matrix4(), cellSphere = new THREE.Sphere();

export function batchCells(cells, root) {
  const groups = new Map();
  for (const cell of cells) for (const mesh of [cell.highMesh, cell.lowMesh, cell.distantMesh]) {
    if (!mesh) continue;
    if (!groups.has(mesh.material)) groups.set(mesh.material, []);
    const { boundingBox } = mesh.geometry;
    groups.get(mesh.material).push({ mesh, id: -1, shown: false, center: boundingBox.getCenter(new THREE.Vector3()), radius: boundingBox.getSize(new THREE.Vector3()).length() / 2 });
  }
  const batches = [...groups].map(([material, entries]) => {
    let vertices = 0, indices = 0;
    for (const { mesh } of entries) { vertices += mesh.geometry.attributes.position.count; indices += mesh.geometry.index.count; }
    const batch = new THREE.BatchedMesh(entries.length, vertices, indices, material);
    batch.name = `cells/${material.uuid.slice(0, 8)}`;
    // sync() culls when the view moves; three's own test would walk every cell on every frame.
    batch.sortObjects = false; batch.perObjectFrustumCulled = false; batch.frustumCulled = false; batch.matrixAutoUpdate = false;
    batch.receiveShadow = true;
    batch.castShadow = entries.some(({ mesh }) => mesh.castShadow);
    for (const entry of entries) {
      const { mesh } = entry, { geometry } = mesh;
      entry.id = batch.addInstance(batch.addGeometry(geometry));
      batch.setVisibleAt(entry.id, false);
      root.remove(mesh);
      // Bounds keep selecting the cell; the vertices now live in the batch alone.
      geometry.dispose();
      for (const name of Object.keys(geometry.attributes)) geometry.deleteAttribute(name);
      geometry.setIndex(null);
    }
    root.add(batch);
    const { onBeforeShadow, onBeforeRender } = THREE.BatchedMesh.prototype;
    let shadowed = false;
    batch.onBeforeShadow = function (...args) {
      const shadowCamera = args[3];
      shadowView.setFromProjectionMatrix(shadowProjection.multiplyMatrices(shadowCamera.projectionMatrix, shadowCamera.matrixWorldInverse));
      for (const { mesh, id, center, radius } of entries) this.setVisibleAt(id, mesh.castShadow && (mesh.visible || mesh.userData.shadowOnly === true)
        && shadowView.intersectsSphere(cellSphere.set(center, radius)));
      shadowed = true;
      onBeforeShadow.apply(this, args);
    };
    batch.onBeforeRender = function (...args) {
      if (shadowed) { for (const { id, shown } of entries) this.setVisibleAt(id, shown); shadowed = false; }
      onBeforeRender.apply(this, args);
    };
    return { batch, entries };
  });
  return {
    batches,
    /** Copies this view's selection; a light level kept only for the shadow pass stays out of it. */
    sync(inView) {
      for (const { batch, entries } of batches) {
        let any = false;
        for (const entry of entries) {
          const shown = entry.mesh.visible && !entry.mesh.userData.near && inView(entry.center, entry.radius);
          any ||= shown;
          if (shown !== entry.shown) { entry.shown = shown; batch.setVisibleAt(entry.id, shown); }
        }
        batch.visible = any || batch.castShadow;
      }
    },
  };
}
