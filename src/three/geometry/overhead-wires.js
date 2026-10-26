// Static wires above the east-side building bank; endpoints share the pole insulator positions.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toThree } from '../scene/coords.ts';
import { painted } from '../materials/style.js';

export function buildOverheadWires(spans) {
  if (!spans.length) return null;
  const parts = spans.map(({ a, b, sag }) => {
    const points = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      points.push(toThree(a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t - 4 * sag * t * (1 - t), a[2] + (b[2] - a[2]) * t));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 16, 0.012, 5, false);
  });
  const geometry = mergeGeometries(parts);
  parts.forEach(p => p.dispose());
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry,
    painted(new THREE.MeshLambertMaterial({ name: 'ART_OverheadWire', color: 0x35323b })));
  mesh.name = 'OverheadDistributionWires';
  // Thin, high wires need no sun-map silhouette. Poles retain their ordinary static shadows.
  mesh.castShadow = mesh.receiveShadow = false;
  return mesh;
}
