import * as THREE from 'three';
import { PLAYER_RADIUS, PLAYER_HEIGHT, PLAYER_SPEED_3D } from '../constants.js';

export class PlayerObject {
  readonly group = new THREE.Group();
  private velocity = new THREE.Vector3();

  constructor(spawn: THREE.Vector3) {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xeac74a,
      roughness: 0.5,
      metalness: 0.3,
    });

    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(PLAYER_RADIUS, PLAYER_HEIGHT - PLAYER_RADIUS * 2, 8, 16),
      bodyMat,
    );
    body.position.y = PLAYER_HEIGHT / 2;
    body.castShadow = true;
    this.group.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xffd9a8 }),
    );
    head.position.y = PLAYER_HEIGHT + 0.4;
    head.castShadow = true;
    this.group.add(head);

    this.group.position.copy(spawn);
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  update(input: { x: number; z: number }, deltaSec: number): void {
    const len = Math.hypot(input.x, input.z);
    if (len > 0) {
      this.velocity.set((input.x / len) * PLAYER_SPEED_3D, 0, (input.z / len) * PLAYER_SPEED_3D);
      // face movement direction
      this.group.rotation.y = Math.atan2(input.x, input.z);
    } else {
      this.velocity.set(0, 0, 0);
    }
    this.group.position.x += this.velocity.x * deltaSec;
    this.group.position.z += this.velocity.z * deltaSec;
  }
}
