// CPU-only copies of the city's silhouettes. Their transforms never follow render culling or LOD,
// so a roof behind the current camera is still an obstacle to the next replay viewpoint.
import * as THREE from 'three';
import { placement } from '../scene/coords.ts';
import { indexMeshRays } from './mesh-ray-index.js';

const probeMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const FLOOR = /^(HK_(Road|Ground|Water|Terrain)|ART_(PavingDetails|MoatRoad|MoatBankPatch|Kyobashi(Roads|Land|Water)))/;

export class CameraObstacles {
  constructor(definitions = []) {
    this.parts = [];
    this.ray = new THREE.Raycaster();
    this.direction = new THREE.Vector3();
    this.hit = new THREE.Vector3();
    this.hits = [];
    this.probes = new WeakMap();
    for (const { asset, items, low, cameraSolids } of definitions) {
      if (FLOOR.test(asset)) continue;
      for (const item of items) {
        const transform = placement(...item.p, item.r, item.s);
        if (cameraSolids) this.addSolids(low, cameraSolids, transform);
        else for (const part of low) this.add(part.geometry, transform.clone().multiply(part.matrix));
      }
    }
  }

  /** A render batch can surround open roads. Keep camera bounds on each actual building,
   * rather than treating the composite's entire rectangle (including its ground) as solid. */
  addSolids(parts, solids, transform) {
    const groups = solids.map(s => {
      const box = new THREE.Box3();
      for (const [x, z] of s.footprint) box.expandByPoint(new THREE.Vector3(-x, 0.15, z));
      box.max.y += s.height + s.rise;
      box.expandByScalar(0.05);
      const contains = p => {
        if (!box.containsPoint(p)) return false;
        let sign = 0;
        for (let i = 0; i < s.footprint.length; i++) {
          const [ax, az] = s.footprint[i], [bx, bz] = s.footprint[(i + 1) % s.footprint.length];
          const cross = (bx - ax) * (p.z - az) - (bz - az) * (-p.x - ax);
          if (Math.abs(cross) <= 0.05 * Math.hypot(bx - ax, bz - az)) continue;
          if (sign && Math.sign(cross) !== sign) return false;
          sign = Math.sign(cross);
        }
        return true;
      };
      return { contains, positions: [] };
    });
    const points = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    for (const part of parts) {
      // These are the authored building pigments. Roads, moat banks, water and field
      // surfaces in the same draw are ground, not roof/wall obstacles.
      if (!/^(ART_(Plaster|Timber|Concrete|Window|Tile|RedRoof)|HK_RoofTile)$/.test(part.material.name)) continue;
      const geometry = part.geometry, position = geometry.attributes.position;
      const count = geometry.index?.count ?? position.count;
      for (let i = 0; i < count; i += 3) {
        for (let k = 0; k < 3; k++) {
          points[k].fromBufferAttribute(position, geometry.index ? geometry.index.getX(i + k) : i + k).applyMatrix4(part.matrix);
        }
        for (const group of groups) if (points.every(p => group.contains(p)))
          for (const p of points) group.positions.push(p.x, p.y, p.z);
      }
    }
    for (const group of groups) {
      if (!group.positions.length) continue;
      const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(group.positions, 3));
      this.add(geometry, transform);
      geometry.dispose();
    }
  }

  add(geometry, matrix) {
    let probe = this.probes.get(geometry);
    if (!probe) {
      // Ray tests need only positions and indices. Copy them once per source geometry so
      // accessor views cannot keep an entire GLB (colours, normals and all) alive.
      const silhouette = new THREE.BufferGeometry();
      silhouette.setAttribute('position', geometry.attributes.position.clone());
      if (geometry.index) silhouette.setIndex(geometry.index.clone());
      silhouette.computeBoundingBox();
      silhouette.computeBoundingSphere();
      probe = indexMeshRays(new THREE.Mesh(silhouette, probeMaterial));
      this.probes.set(geometry, probe);
    }
    const mesh = new THREE.Mesh(probe.geometry, probeMaterial);
    // The index's raycast uses its receiver's transform. Repeated trees/posts share one index.
    mesh.raycast = probe.raycast;
    mesh.matrixAutoUpdate = false;
    mesh.matrixWorld.copy(matrix);
    this.parts.push({ mesh, bounds: probe.geometry.boundingBox.clone().applyMatrix4(matrix) });
  }

  /** Signal heads and poles are separate from the instanced town. No rendered state is changed. */
  addRoot(root) {
    root.updateWorldMatrix(true, true);
    const instance = new THREE.Matrix4();
    root.traverse(object => {
      if (!object.isMesh || object.name === 'BlobShadow') return;
      if (object.isInstancedMesh) {
        for (let i = 0; i < object.count; i++) {
          object.getMatrixAt(i, instance);
          this.add(object.geometry, instance.clone().premultiply(object.matrixWorld));
        }
      } else this.add(object.geometry, object.matrixWorld);
    });
  }

  withRoot(root) {
    const copy = new CameraObstacles();
    copy.parts = this.parts.slice();
    copy.addRoot(root);
    return copy;
  }

  cameraClear(position) {
    return this.parts.every(part => part.bounds.distanceToPoint(position) > 0.35);
  }

  liftOut(position) {
    // A custom subject can be under cover. Even then, the fallback camera must stay outside it.
    for (const { bounds } of this.parts) {
      if (position.x >= bounds.min.x - 0.35 && position.x <= bounds.max.x + 0.35
        && position.z >= bounds.min.z - 0.35 && position.z <= bounds.max.z + 0.35)
        position.y = Math.max(position.y, bounds.max.y + 0.5);
    }
  }

  /** Double-sided segment test: open eaves and pitched roofs use triangles, not solid AABBs. */
  clear(from, to) {
    const distance = this.direction.subVectors(to, from).length();
    if (distance < 0.01) return true;
    this.ray.set(from, this.direction.divideScalar(distance));
    this.ray.near = 0.02;
    this.ray.far = distance - 0.02;
    for (const { mesh, bounds } of this.parts) {
      const hit = this.ray.ray.intersectBox(bounds, this.hit);
      if (!bounds.containsPoint(from) && (!hit || from.distanceToSquared(hit) > distance * distance)) continue;
      this.hits.length = 0;
      mesh.raycast(this.ray, this.hits);
      if (this.hits.length) return false;
    }
    return true;
  }
}
