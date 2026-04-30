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
  /** Online mode uses server combat events; these projectiles are display-only. */
  visualOnly?: boolean;
  /** For visualOnly projectiles, fires when the bullet visually reaches its
   *  endpoint (target if set, otherwise after travelling maxDistance). Used to
   *  defer the floating damage number / haptic until the shot actually
   *  "lands", since the server already applied the real damage. */
  onArrive?: () => void;
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
  visualOnly: boolean;
  onArrive?: () => void;
  arrived: boolean;
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
  private fx: FxBurst[] = [];

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
      visualOnly: spec.visualOnly === true,
      onArrive: spec.onArrive,
      arrived: false,
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
          if (p.visualOnly) {
            this.fireOnArrive(p);
          } else {
            this.hitUnit(p, p.target, now);
          }
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

      if (!p.visualOnly) {
        const hit = registry.findHit(p.mesh.position, PROJECTILE_RADIUS, p.team);
        if (hit) {
          this.hitUnit(p, hit, now);
          this.removeAt(i);
          continue;
        }
      }

      const exceededRange = p.maxDistance !== undefined && p.distanceTravelled >= p.maxDistance;
      if (exceededRange || now - p.spawnedAt > PROJECTILE_LIFETIME_MS) {
        if (p.visualOnly) this.fireOnArrive(p);
        this.removeAt(i);
      }
    }
  }

  private fireOnArrive(p: Projectile): void {
    if (p.arrived) return;
    p.arrived = true;
    this.spawnHitBurst(p.mesh.position, p.team);
    p.onArrive?.();
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
    this.spawnHitBurst(unit.position, p.team);
  }

  private removeAt(index: number): void {
    this.scene.remove(this.projectiles[index].mesh);
    this.projectiles.splice(index, 1);
  }

  /** Brief flash + scatter at the impact point. Pure FX, no damage.
   *  Skipped when too many bursts are already in flight to keep FPS up. */
  spawnHitBurst(at: THREE.Vector3, team: Team): void {
    if (this.fx.length > FX_BUDGET) return;
    const color = team === 'blue' ? 0x9fd8ff : 0xffb37a;
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(HIT_RING_GEOM, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(at.x, 1.0, at.z);
    this.scene.add(ring);
    this.fx.push({ mesh: ring, spawnedAt: performance.now(), kind: 'ring', durationMs: 260 });

    for (let i = 0; i < 6; i++) {
      const speckMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
        depthWrite: false,
      });
      const speck = new THREE.Mesh(HIT_SPECK_GEOM, speckMat);
      speck.position.set(at.x, 1.2, at.z);
      const a = (Math.PI * 2 * i) / 6 + Math.random() * 0.4;
      const v = new THREE.Vector3(Math.cos(a) * 5, 2 + Math.random() * 2, Math.sin(a) * 5);
      this.scene.add(speck);
      this.fx.push({
        mesh: speck,
        spawnedAt: performance.now(),
        kind: 'speck',
        durationMs: 380,
        velocity: v,
      });
    }
  }

  /** Quick flash at the muzzle when a hero fires. */
  spawnMuzzleFlash(at: THREE.Vector3, facing: THREE.Vector3): void {
    if (this.fx.length > FX_BUDGET) return;
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffe28a,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
    const flash = new THREE.Mesh(MUZZLE_FLASH_GEOM, flashMat);
    flash.position.set(at.x + facing.x * 0.7, 1.45, at.z + facing.z * 0.7);
    this.scene.add(flash);
    this.fx.push({ mesh: flash, spawnedAt: performance.now(), kind: 'flash', durationMs: 140 });
  }

  /** Drives the FX layer; cheap per-frame loop over short-lived sprites. */
  updateFx(deltaSec: number, now: number): void {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      const t = (now - f.spawnedAt) / f.durationMs;
      if (t >= 1) {
        this.scene.remove(f.mesh);
        // Materials are per-instance (animated opacity), dispose them.
        // Geometries are shared module-level singletons — leave them alone.
        const m = f.mesh as THREE.Mesh;
        (m.material as THREE.Material).dispose();
        this.fx.splice(i, 1);
        continue;
      }
      const mat = (f.mesh as THREE.Mesh).material as THREE.MeshBasicMaterial;
      if (f.kind === 'ring') {
        const s = 1 + t * 2.4;
        f.mesh.scale.set(s, s, s);
        mat.opacity = (1 - t) * 0.9;
      } else if (f.kind === 'speck' && f.velocity) {
        f.mesh.position.x += f.velocity.x * deltaSec;
        f.mesh.position.y += f.velocity.y * deltaSec;
        f.mesh.position.z += f.velocity.z * deltaSec;
        f.velocity.y -= 9 * deltaSec;
        mat.opacity = 1 - t;
      } else {
        const s = 1 + t * 1.5;
        f.mesh.scale.set(s, s, s);
        mat.opacity = (1 - t) * 1.0;
      }
    }
  }
}

interface FxBurst {
  mesh: THREE.Object3D;
  spawnedAt: number;
  kind: 'ring' | 'speck' | 'flash';
  durationMs: number;
  velocity?: THREE.Vector3;
}

// FX cap — beyond this many concurrent sprites we drop new bursts entirely.
const FX_BUDGET = 80;
const HIT_RING_GEOM = new THREE.RingGeometry(0.1, 0.55, 18);
const HIT_SPECK_GEOM = new THREE.SphereGeometry(0.13, 6, 6);
const MUZZLE_FLASH_GEOM = new THREE.SphereGeometry(0.28, 8, 8);

// --- Cached projectile assets ---------------------------------------------
// Geometries and materials are immutable per kind, so allocate them once
// at module load and clone the lightweight Object3Ds for each shot.
const ARROW_SHAFT_MAT = new THREE.MeshStandardMaterial({
  color: 0xd9b56d,
  roughness: 0.55,
  metalness: 0.15,
});
const ARROW_TIP_MAT = new THREE.MeshStandardMaterial({
  color: 0xf8f0dc,
  emissive: 0xffcf5a,
  emissiveIntensity: 0.35,
  roughness: 0.35,
  metalness: 0.6,
});
const ARROW_SHAFT_GEOM = new THREE.CylinderGeometry(0.045, 0.045, 1.2, 8);
const ARROW_TIP_GEOM = new THREE.ConeGeometry(0.13, 0.34, 10);
const ARROW_TAIL_GEOM = new THREE.ConeGeometry(0.11, 0.22, 8);

function createArrowProjectile(): THREE.Object3D {
  const arrow = new THREE.Group();
  const shaft = new THREE.Mesh(ARROW_SHAFT_GEOM, ARROW_SHAFT_MAT);
  shaft.rotation.x = Math.PI / 2;
  arrow.add(shaft);
  const tip = new THREE.Mesh(ARROW_TIP_GEOM, ARROW_TIP_MAT);
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 0.76;
  arrow.add(tip);
  const tail = new THREE.Mesh(ARROW_TAIL_GEOM, ARROW_SHAFT_MAT);
  tail.rotation.x = -Math.PI / 2;
  tail.position.z = -0.68;
  arrow.add(tail);
  return arrow;
}

const ORB_GEOM_CACHE = new Map<number, THREE.SphereGeometry>();
const ORB_MAT_CACHE = new Map<string, THREE.MeshStandardMaterial>();

function createOrbProjectile(radius: number, color: number, emissive: number): THREE.Object3D {
  let geom = ORB_GEOM_CACHE.get(radius);
  if (!geom) {
    geom = new THREE.SphereGeometry(radius, 12, 12);
    ORB_GEOM_CACHE.set(radius, geom);
  }
  const matKey = `${color.toString(16)}-${emissive.toString(16)}`;
  let mat = ORB_MAT_CACHE.get(matKey);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color, emissive, emissiveIntensity: 1.0,
    });
    ORB_MAT_CACHE.set(matKey, mat);
  }
  return new THREE.Mesh(geom, mat);
}

const METEOR_CORE_GEOM = new THREE.DodecahedronGeometry(0.65, 0);
const METEOR_TAIL_GEOM = new THREE.ConeGeometry(0.38, 1.1, 12);
const METEOR_CORE_MAT = new THREE.MeshStandardMaterial({
  color: 0xff7a2f,
  emissive: 0xff3300,
  emissiveIntensity: 1.25,
  roughness: 0.85,
  flatShading: true,
});
const METEOR_TAIL_MAT = new THREE.MeshStandardMaterial({
  color: 0xffc34d,
  emissive: 0xff6a00,
  emissiveIntensity: 0.9,
  transparent: true,
  opacity: 0.82,
});

function createMeteorProjectile(): THREE.Object3D {
  const meteor = new THREE.Group();
  const core = new THREE.Mesh(METEOR_CORE_GEOM, METEOR_CORE_MAT);
  meteor.add(core);
  const tail = new THREE.Mesh(METEOR_TAIL_GEOM, METEOR_TAIL_MAT);
  tail.rotation.x = -Math.PI / 2;
  tail.position.z = -0.72;
  meteor.add(tail);
  return meteor;
}
