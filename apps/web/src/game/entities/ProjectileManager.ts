import * as THREE from 'three';
import {
  PROJECTILE_LIFETIME_MS,
  PROJECTILE_RADIUS,
  PROJECTILE_SPEED_3D,
} from '../constants.js';
import type { Team } from '../combat/Unit.js';
import type { UnitRegistry } from '../combat/UnitRegistry.js';

export type ProjectileKind = 'basic' | 'heavy' | 'slow';

export interface ProjectileSpec {
  team: Team;
  damage: number;
  kind?: ProjectileKind;
  /** Status effect applied to whatever the projectile hits. */
  effect?: { slow?: { factor: number; durationMs: number } };
}

interface Projectile {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  spawnedAt: number;
  team: Team;
  damage: number;
  effect?: ProjectileSpec['effect'];
}

interface Variant {
  geom: THREE.SphereGeometry;
  mat: THREE.MeshStandardMaterial;
}

export class ProjectileManager {
  private projectiles: Projectile[] = [];
  private readonly variants: Record<ProjectileKind, Variant>;

  constructor(private readonly scene: THREE.Scene) {
    this.variants = {
      basic: {
        geom: new THREE.SphereGeometry(0.35, 10, 10),
        mat: new THREE.MeshStandardMaterial({
          color: 0xffd166,
          emissive: 0xffae42,
          emissiveIntensity: 0.8,
        }),
      },
      heavy: {
        geom: new THREE.SphereGeometry(0.6, 12, 12),
        mat: new THREE.MeshStandardMaterial({
          color: 0xff6e40,
          emissive: 0xff3a1f,
          emissiveIntensity: 1.0,
        }),
      },
      slow: {
        geom: new THREE.SphereGeometry(0.42, 12, 12),
        mat: new THREE.MeshStandardMaterial({
          color: 0x66ddff,
          emissive: 0x33aaff,
          emissiveIntensity: 0.9,
        }),
      },
    };
  }

  spawn(
    origin: THREE.Vector3,
    target: THREE.Vector3,
    now: number,
    spec: ProjectileSpec,
  ): void {
    const dir = new THREE.Vector3().subVectors(target, origin);
    dir.y = 0;
    if (dir.lengthSq() === 0) return;
    dir.normalize().multiplyScalar(PROJECTILE_SPEED_3D);

    const variant = this.variants[spec.kind ?? 'basic'];
    const mesh = new THREE.Mesh(variant.geom, variant.mat);
    mesh.position.copy(origin);
    mesh.position.y = 1.4;
    mesh.castShadow = true;
    this.scene.add(mesh);

    this.projectiles.push({
      mesh,
      velocity: dir,
      spawnedAt: now,
      team: spec.team,
      damage: spec.damage,
      effect: spec.effect,
    });
  }

  update(deltaSec: number, now: number, registry: UnitRegistry): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.mesh.position.x += p.velocity.x * deltaSec;
      p.mesh.position.z += p.velocity.z * deltaSec;

      const hit = registry.findHit(p.mesh.position, PROJECTILE_RADIUS, p.team);
      if (hit) {
        hit.takeDamage(p.damage);
        if (p.effect?.slow) {
          const until = now + p.effect.slow.durationMs;
          if (until > hit.slowUntil) hit.slowUntil = until;
        }
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
        continue;
      }

      if (now - p.spawnedAt > PROJECTILE_LIFETIME_MS) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }
}
