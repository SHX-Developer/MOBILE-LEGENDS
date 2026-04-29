import * as THREE from 'three';
import { PLAYER_SPEED_3D } from '../constants.js';

/**
 * Layla — markswoman. Built so that her gun points along the local +Z axis,
 * which matches the rotation formula in update(): atan2(input.x, input.z).
 */
export class PlayerObject {
  readonly group = new THREE.Group();
  readonly facing = new THREE.Vector3(0, 0, 1); // last move direction (default: south)
  private velocity = new THREE.Vector3();

  constructor(spawn: THREE.Vector3) {
    this.buildLayla();
    this.group.position.copy(spawn);
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  update(input: { x: number; z: number }, deltaSec: number): void {
    const len = Math.hypot(input.x, input.z);
    if (len > 0) {
      const nx = input.x / len;
      const nz = input.z / len;
      this.velocity.set(nx * PLAYER_SPEED_3D, 0, nz * PLAYER_SPEED_3D);
      this.group.rotation.y = Math.atan2(nx, nz);
      this.facing.set(nx, 0, nz);
    } else {
      this.velocity.set(0, 0, 0);
    }
    this.group.position.x += this.velocity.x * deltaSec;
    this.group.position.z += this.velocity.z * deltaSec;
  }

  private buildLayla(): void {
    const skin = new THREE.MeshStandardMaterial({ color: 0xf3c8a4, roughness: 0.7 });
    const cloak = new THREE.MeshStandardMaterial({ color: 0x4a2a78, roughness: 0.6 });
    const cloakLight = new THREE.MeshStandardMaterial({ color: 0x6c3fa8, roughness: 0.6 });
    const trim = new THREE.MeshStandardMaterial({
      color: 0xf2cf5a,
      roughness: 0.4,
      metalness: 0.4,
    });
    const hair = new THREE.MeshStandardMaterial({ color: 0xf6e3a8, roughness: 0.7 });
    const gunMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a36,
      roughness: 0.4,
      metalness: 0.7,
    });
    const gunAccent = new THREE.MeshStandardMaterial({
      color: 0xd6a93a,
      roughness: 0.4,
      metalness: 0.6,
    });

    // legs
    const legGeom = new THREE.CylinderGeometry(0.18, 0.18, 0.9, 12);
    for (const x of [-0.2, 0.2]) {
      const leg = new THREE.Mesh(legGeom, cloak);
      leg.position.set(x, 0.45, 0);
      leg.castShadow = true;
      this.group.add(leg);
    }

    // skirt / cloak base — slight cone
    const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.65, 0.7, 16), cloak);
    skirt.position.y = 1.05;
    skirt.castShadow = true;
    this.group.add(skirt);

    // torso
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.55, 6, 12), cloakLight);
    torso.position.y = 1.55;
    torso.castShadow = true;
    this.group.add(torso);

    // gold belt trim
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 24), trim);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 1.32;
    this.group.add(belt);

    // arms
    const armGeom = new THREE.CylinderGeometry(0.12, 0.12, 0.7, 10);
    const leftArm = new THREE.Mesh(armGeom, cloakLight);
    leftArm.position.set(-0.5, 1.55, 0);
    leftArm.rotation.z = Math.PI / 12;
    leftArm.castShadow = true;
    this.group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeom, cloakLight);
    rightArm.position.set(0.45, 1.4, 0.25);
    rightArm.rotation.x = -Math.PI / 3; // forward, holding gun
    rightArm.castShadow = true;
    this.group.add(rightArm);

    // head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 14), skin);
    head.position.y = 2.15;
    head.castShadow = true;
    this.group.add(head);

    // hair cap
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 14), hair);
    hairCap.position.y = 2.22;
    hairCap.scale.set(1, 0.85, 1);
    hairCap.castShadow = true;
    this.group.add(hairCap);

    // twintails
    const tailGeom = new THREE.CylinderGeometry(0.1, 0.05, 0.8, 8);
    for (const x of [-0.3, 0.3]) {
      const tail = new THREE.Mesh(tailGeom, hair);
      tail.position.set(x, 1.85, -0.05);
      tail.castShadow = true;
      this.group.add(tail);
    }

    // hat ribbon — small purple bow on top
    const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.1, 0.15), cloak);
    ribbon.position.y = 2.5;
    this.group.add(ribbon);

    // gun — points along local +Z (forward)
    const gun = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.95), gunMat);
    barrel.position.z = 0.4;
    gun.add(barrel);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.18), gunMat);
    grip.position.set(0, -0.18, 0);
    gun.add(grip);
    const accent = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.4), gunAccent);
    accent.position.set(0, 0.12, 0.55);
    gun.add(accent);
    gun.position.set(0.45, 1.25, 0.55);
    gun.castShadow = true;
    this.group.add(gun);
  }
}
