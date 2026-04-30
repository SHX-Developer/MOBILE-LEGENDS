import * as THREE from 'three';
import {
  BASIC_PROJECTILE_SPEED_3D,
  PROJECTILE_LIFETIME_MS,
  PROJECTILE_RADIUS,
  PROJECTILE_SPEED_3D,
} from '../constants.js';
import type { Team, Unit } from '../combat/Unit.js';
import type { UnitRegistry } from '../combat/UnitRegistry.js';

export type ProjectileKind = 'basic' | 'heavy' | 'slow';

export interface ProjectileSpec {
  team: Team;
  damage: number;
  kind?: ProjectileKind;
  /** Status effect applied to whatever the projectile hits. */
  effect?: { slow?: { factor: number; durationMs: number } };
  /** Auto attacks pass a target so the shot follows and cannot miss. */
  target?: Unit;
  /** Skillshots pass maxDistance so they expire at their cast range. */
  maxDistance?: number;
  speed?: number;
  /** Set by the local player so we can fire haptics on hit. */
  fromPlayer?: boolean;
}

interface Projectile {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  spawnedAt: number;
  team: Team;
  damage: number;
  effect?: ProjectileSpec['effect'];
  target?: Unit;
  maxDistance?: number;
  distanceTravelled: number;
  speed: number;
  fromPlayer: boolean;
}

interface Variant {
  geom: THREE.BufferGeometry;
  mat: THREE.MeshStandardMaterial;
}

export class ProjectileManager {
  /** Fires whenever a projectile flagged `fromPlayer` connects. */
  onPlayerHit?: () => void;

  private projectiles: Projectile[] = [];
  private readonly variants: Record<ProjectileKind, Variant>;

  constructor(private readonly scene: THREE.Scene) {
    const basicGeom = new THREE.ConeGeometry(0.28, 1.1, 12);
    basicGeom.rotateX(Math.PI / 2);

    this.variants = {
      basic: {
        geom: basicGeom,
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
    const speed = spec.speed ?? (spec.target ? BASIC_PROJECTILE_SPEED_3D : PROJECTILE_SPEED_3D);
    dir.normalize().multiplyScalar(speed);

    const variant = this.variants[spec.kind ?? 'basic'];
    const mesh = new THREE.Mesh(variant.geom, variant.mat);
    mesh.position.copy(origin);
    mesh.position.y = 1.4;
    mesh.rotation.y = Math.atan2(dir.x, dir.z);
    mesh.castShadow = true;
    this.scene.add(mesh);

    this.projectiles.push({
      mesh,
      velocity: dir,
      spawnedAt: now,
      team: spec.team,
      damage: spec.damage,
      effect: spec.effect,
      target: spec.target,
      maxDistance: spec.maxDistance,
      distanceTravelled: 0,
      speed,
      fromPlayer: spec.fromPlayer === true,
    });
  }

  update(deltaSec: number, now: number, registry: UnitRegistry): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (p.target && !p.target.alive) {
        this.removeAt(i);
        continue;
      }

      if (p.target) {
        const dx = p.target.position.x - p.mesh.position.x;
        const dz = p.target.position.z - p.mesh.position.z;
        const dist = Math.hypot(dx, dz);
        const hitDist = p.target.radius + PROJECTILE_RADIUS;
        const step = p.speed * deltaSec;
        if (dist <= hitDist + step) {
          this.hitUnit(p, p.target, now);
          this.removeAt(i);
          continue;
        }
        p.velocity.set((dx / dist) * p.speed, 0, (dz / dist) * p.speed);
      }
      p.mesh.rotation.y = Math.atan2(p.velocity.x, p.velocity.z);

      const stepX = p.velocity.x * deltaSec;
      const stepZ = p.velocity.z * deltaSec;
      p.mesh.position.x += stepX;
      p.mesh.position.z += stepZ;
      p.distanceTravelled += Math.hypot(stepX, stepZ);

      const hit = registry.findHit(p.mesh.position, PROJECTILE_RADIUS, p.team);
      if (hit) {
        this.hitUnit(p, hit, now);
        this.removeAt(i);
        continue;
      }

      const exceededRange = p.maxDistance !== undefined && p.distanceTravelled >= p.maxDistance;
      if (exceededRange || now - p.spawnedAt > PROJECTILE_LIFETIME_MS) {
        this.removeAt(i);
      }
    }
  }

  private hitUnit(p: Projectile, unit: Unit, now: number): void {
    unit.takeDamage(p.damage);
    if (p.effect?.slow) {
      const until = now + p.effect.slow.durationMs;
      if (until > unit.slowUntil) unit.slowUntil = until;
    }
    if (p.fromPlayer) this.onPlayerHit?.();
  }

  private removeAt(index: number): void {
    this.scene.remove(this.projectiles[index].mesh);
    this.projectiles.splice(index, 1);
  }
}
