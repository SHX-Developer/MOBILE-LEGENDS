import * as THREE from 'three';
import { PROJECTILE_SPEED_3D, PROJECTILE_LIFETIME_MS } from '../constants.js';

interface Projectile {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  spawnedAt: number;
}

export class ProjectileManager {
  private projectiles: Projectile[] = [];
  private geom = new THREE.SphereGeometry(0.35, 10, 10);
  private mat = new THREE.MeshStandardMaterial({
    color: 0xffd166,
    emissive: 0xffae42,
    emissiveIntensity: 0.8,
  });

  constructor(private readonly scene: THREE.Scene) {}

  spawn(origin: THREE.Vector3, target: THREE.Vector3, now: number): void {
    const dir = new THREE.Vector3().subVectors(target, origin);
    dir.y = 0;
    if (dir.lengthSq() === 0) return;
    dir.normalize().multiplyScalar(PROJECTILE_SPEED_3D);

    const mesh = new THREE.Mesh(this.geom, this.mat);
    mesh.position.copy(origin);
    mesh.position.y = 1.4;
    mesh.castShadow = true;
    this.scene.add(mesh);

    this.projectiles.push({ mesh, velocity: dir, spawnedAt: now });
  }

  update(deltaSec: number, now: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.mesh.position.x += p.velocity.x * deltaSec;
      p.mesh.position.z += p.velocity.z * deltaSec;
      if (now - p.spawnedAt > PROJECTILE_LIFETIME_MS) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }
}
