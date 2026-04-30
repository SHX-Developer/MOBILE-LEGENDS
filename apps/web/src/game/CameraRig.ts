import * as THREE from 'three';

/**
 * Dota / Mobile Legends-style top-down camera. Angled ~55° from vertical so
 * the world reads as 3D, but you mostly look straight down.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  // Slightly higher and further back than the original (0,18,12) so more of
  // the surrounding lane fits in the player's view.
  private offset = new THREE.Vector3(0, 24, 16);

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 500);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  follow(target: THREE.Vector3): void {
    this.camera.position.set(
      target.x + this.offset.x,
      target.y + this.offset.y,
      target.z + this.offset.z,
    );
    this.camera.lookAt(target.x, target.y, target.z);
  }
}
