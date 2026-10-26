import test from 'node:test';
import assert from 'node:assert/strict';

const THREE = await import('three');
const { indexMeshRays } = await import('../src/three/camera/mesh-ray-index.js');

for (const indexed of [true, false]) for (const side of [THREE.FrontSide, THREE.BackSide, THREE.DoubleSide]) {
  test(`static ray index retains exact hits, faces and attributes: indexed=${indexed}, side=${side}`, () => {
    const source = new THREE.TorusKnotGeometry(1, .35, 64, 8);
    const geometry = indexed ? source : source.toNonIndexed();
    geometry.setDrawRange(6, (geometry.index?.count ?? geometry.attributes.position.count) - 12);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side })), root = new THREE.Group();
    root.position.set(12, -4, 6); root.rotation.set(.3, -.7, .2); root.scale.set(-1.4, .7, 1.2);
    mesh.rotation.x = .4; root.add(mesh); root.updateMatrixWorld(true);
    const original = mesh.raycast, originalIndex = geometry.index?.array.slice();
    const originalRange = { ...geometry.drawRange }, ray = new THREE.Raycaster(), centre = new THREE.Vector3(12, -4, 6);
    const rays = [], expected = [];
    const normalize = hits => hits.map(h => ({
      distance: h.distance, point: h.point.toArray(), faceIndex: h.faceIndex,
      face: { ...h.face, normal: h.face.normal.toArray() }, uv: h.uv?.toArray(), normal: h.normal?.toArray(),
    })).sort((a, b) => a.faceIndex - b.faceIndex || a.distance - b.distance);
    for (let i = 0; i < 120; i++) {
      const angle = i * 2.399963, origin = new THREE.Vector3(Math.cos(angle) * 4, Math.sin(i * .71) * 3, Math.sin(angle) * 4).add(centre);
      const direction = centre.clone().sub(origin).normalize();
      const near = i % 4 === 0 ? 2.3 : .02, far = i % 5 === 0 ? 2.7 : 12;
      ray.set(origin, direction); ray.near = near; ray.far = far;
      const hits = []; original.call(mesh, ray, hits);
      rays.push({ origin, direction, near, far }); expected.push(normalize(hits));
    }
    assert.ok(expected.some(hits => hits.length) && expected.some(hits => !hits.length), 'exercise hits and finite empty segments');
    indexMeshRays(root);
    for (let i = 0; i < rays.length; i++) {
      const r = rays[i]; ray.set(r.origin, r.direction); ray.near = r.near; ray.far = r.far;
      const hits = ray.intersectObject(root, true);
      assert.ok(hits.every(h => h.object === mesh), 'hit identity remains the source mesh');
      assert.deepEqual(normalize(hits), expected[i], `same three.js intersections at ray ${i}`);
    }
    assert.deepEqual(geometry.index?.array, originalIndex, 'source indices are not reordered');
    assert.deepEqual(geometry.drawRange, originalRange, 'source draw range is unchanged');
    geometry.dispose(); source.dispose(); mesh.material.dispose();
  });
}

test('static indexing leaves deformable and multi-material raycasting unchanged', () => {
  const root = new THREE.Group(), geometry = new THREE.SphereGeometry(1, 24, 16);
  const multiple = new THREE.Mesh(geometry, [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()]);
  const morph = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()); morph.morphTargetInfluences = [1];
  root.add(multiple, morph); const originals = root.children.map(o => o.raycast);
  indexMeshRays(root);
  assert.deepEqual(root.children.map(o => o.raycast), originals);
  geometry.dispose(); for (const m of [...multiple.material, morph.material]) m.dispose();
});
