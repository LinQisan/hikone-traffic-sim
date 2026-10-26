import * as THREE from 'three';
/** Deduplicate resources across scene instances, palettes and reusable vehicle prototypes. */
export class ResourceDisposer {
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Set<THREE.Material>();
  private textures = new Set<THREE.Texture>();
  geometry = (geometry: THREE.BufferGeometry) => {if (!this.geometries.has(geometry)) {this.geometries.add(geometry); geometry.dispose();}};
  material = (material: THREE.Material) => {if (!this.materials.has(material)) {this.materials.add(material); material.dispose();}};
  texture = (texture: THREE.Texture) => {if (!this.textures.has(texture)) {this.textures.add(texture); texture.dispose();}};
  object(root: THREE.Object3D) {
    root.traverse(object => {if (object instanceof THREE.Mesh && !object.userData.shared) {
      this.geometry(object.geometry); for (const material of Array.isArray(object.material) ? object.material : [object.material]) this.material(material);
    }});
    root.removeFromParent();
  }
  scene(scene: THREE.Scene) {this.object(scene); scene.clear(); scene.background = null;}
}
