import * as THREE from 'three';
import {
  BASIC_PROJECTILE_SPEED_3D,
  PROJECTILE_LIFETIME_MS,
  PROJECTILE_RADIUS,
  PROJECTILE_SPEED_3D,
} from '../constants.js';
import type { Team, Unit } from '../combat/Unit.js';
import type { UnitRegistry } from '../combat/UnitRegistry.js';

export type ProjectileKind = 'basic' | 'heavy' | 'slow' | 'meteor' | 'control';

export interface ProjectileSpec {
  team: Team;
  damage: number;
  kind?: ProjectileKind;
  /** Status effect applied to whatever the projectile hits. */
  effect?: {
    slow?: { factor: number; durationMs: number };
    stun?: { durationMs: number };
  };
  /** Auto attacks pass a target so the shot follows and cannot miss. */
  target?: Unit;
  owner?: Unit;
  /** Skillshots pass maxDistance so they expire at their cast range. */
  maxDistance?: number;
  speed?: number;
  /** Set by the local player so we can fire haptics on hit. */
  fromPlayer?: boolean;
}

interface Projectile {
  mesh: THREE.Object3D;
  velocity: THREE.Vector3;
  spawnedAt: number;
  team: Team;
  damage: number;
  effect?: ProjectileSpec['effect'];
  target?: Unit;
  owner?: Unit;
  maxDistance?: number;
  distanceTravelled: number;
  speed: number;
  fromPlayer: boolean;
}

interface Variant {
  create: () => THREE.Object3D;
}

export class ProjectileManager {
  /** Fires whenever a projectile flagged `fromPlayer` connects. */
  onPlayerHit?: () => void;
  onDamage?: (target: Unit, amount: number, owner?: Unit) => void;

  private projectiles: Projectile[] = [];
  private readonly variants: Record<ProjectileKind, Variant>;

  constructor(private readonly scene: THREE.Scene) {
    this.variants = {
      basic: {
        create: createArrowProjectile,
      },
      heavy: {
        create: () => createOrbProjectile(0.6, 0xff6e40, 0xff3a1f),
      },
      slow: {
        create: () => createOrbProjectile(0.42, 0x66ddff, 0x33aaff),
      },
      control: {
        create: () => createOrbProjectile(0.46, 0xb56cff, 0x7434ff),
      },
      meteor: {
        create: createMeteorProjectile,
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
    const mesh = variant.create();
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
      owner: spec.owner,
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
    const wasAlive = unit.alive;
    const damage = Math.min(unit.hp, p.damage);
    unit.takeDamage(p.damage);
    if (damage > 0) this.onDamage?.(unit, damage, p.owner);
    if (p.effect?.slow) {
      const until = now + p.effect.slow.durationMs;
      if (until > unit.slowUntil) unit.slowUntil = until;
    }
    if (p.effect?.stun) {
      const until = now + p.effect.stun.durationMs;
      if (until > unit.stunnedUntil) unit.stunnedUntil = until;
    }
    if (wasAlive && !unit.alive && p.owner?.kind === 'hero') {
      p.owner.grantXp?.(unit.xpReward);
    }
    if (p.fromPlayer) this.onPlayerHit?.();
  }

  private removeAt(index: number): void {
    this.scene.remove(this.projectiles[index].mesh);
    this.projectiles.splice(index, 1);
  }
}

function createArrowProjectile(): THREE.Object3D {
  const arrow = new THREE.Group();
  const shaftMat = new THREE.MeshStandardMaterial({
    color: 0xd9b56d,
    roughness: 0.55,
    metalness: 0.15,
  });
  const tipMat = new THREE.MeshStandardMaterial({
    color: 0xf8f0dc,
    emissive: 0xffcf5a,
    emissiveIntensity: 0.35,
    roughness: 0.35,
    metalness: 0.6,
  });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.2, 8), shaftMat);
  shaft.rotation.x = Math.PI / 2;
  arrow.add(shaft);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.34, 10), tipMat);
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 0.76;
  arrow.add(tip);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.22, 8), shaftMat);
  tail.rotation.x = -Math.PI / 2;
  tail.position.z = -0.68;
  arrow.add(tail);
  return arrow;
}

function createOrbProjectile(radius: number, color: number, emissive: number): THREE.Object3D {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, 12, 12),
    new THREE.MeshStandardMaterial({
      color,
      emissive,
      emissiveIntensity: 1.0,
    }),
  );
}

function createMeteorProjectile(): THREE.Object3D {
  const meteor = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.65, 0),
    new THREE.MeshStandardMaterial({
      color: 0xff7a2f,
      emissive: 0xff3300,
      emissiveIntensity: 1.25,
      roughness: 0.85,
      flatShading: true,
    }),
  );
  meteor.add(core);
  const tail = new THREE.Mesh(
    new THREE.ConeGeometry(0.38, 1.1, 12),
    new THREE.MeshStandardMaterial({
      color: 0xffc34d,
      emissive: 0xff6a00,
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: 0.82,
    }),
  );
  tail.rotation.x = -Math.PI / 2;
  tail.position.z = -0.72;
  meteor.add(tail);
  return meteor;
}
