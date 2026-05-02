import * as THREE from 'three';

/**
 * Dota / Mobile Legends-style top-down camera. Angled ~55° from vertical so
 * the world reads as 3D, but you mostly look straight down.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  // Slightly higher tactical view so the larger map and lane spacing read.
  // Brought in a touch — the further view was making minions/HP read too small.
  private offset = new THREE.Vector3(0, 18, 11.5);
  /** User-driven look-ahead, applied on top of the followed target. */
  private lookOffset = new THREE.Vector3();
  /** Where the look offset is being eased toward when no input is active. */
  private lookTarget = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 500);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Drag-to-look. Caller passes a world-space delta clamped to taste. */
  setLookOffset(x: number, z: number): void {
    this.lookTarget.set(x, 0, z);
  }

  follow(target: THREE.Vector3, deltaSec = 0): void {
    // Ease the look offset toward its target each frame.
    if (deltaSec > 0) {
      const k = Math.min(1, deltaSec * 6);
      this.lookOffset.x += (this.lookTarget.x - this.lookOffset.x) * k;
      this.lookOffset.z += (this.lookTarget.z - this.lookOffset.z) * k;
    } else {
      this.lookOffset.copy(this.lookTarget);
    }
    const cx = target.x + this.lookOffset.x;
    const cz = target.z + this.lookOffset.z;
    this.camera.position.set(cx + this.offset.x, target.y + this.offset.y, cz + this.offset.z);
    this.camera.lookAt(cx, target.y, cz);
  }
}
