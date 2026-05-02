import * as THREE from 'three';
import {
  BASIC_PROJECTILE_SPEED_3D,
  PROJECTILE_LIFETIME_MS,
  PROJECTILE_RADIUS,
  PROJECTILE_SPEED_3D,
} from '../constants.js';
import type { Team, Unit } from '../combat/Unit.js';
import type { UnitRegistry } from '../combat/UnitRegistry.js';

export type ProjectileKind =
  | 'basic'
  | 'heavy'
  | 'slow'
  | 'meteor'
  | 'control'
  | 'fire'
  /** Pure flaming orb. Mage Q — no arrow shape, reads as a magic ball. */
  | 'fireball'
  /** Flat ring of flame. Mage E — wide horizontal disc that travels. */
  | 'flamewave'
  /** Tiny fire bolt. Mage auto-attack — small spark instead of arrow. */
  | 'firebolt';

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
  /**
   * If set, on impact every other enemy unit within `aoeRadius` of the hit
   * point takes `aoeDamage`. The primary target receives the regular
   * `damage` only — no double counting. Used for the mage's meteor.
   */
  aoeRadius?: number;
  aoeDamage?: number;
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
  aoeRadius?: number;
  aoeDamage?: number;
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
        // POWER — chunky orange arrow with a halo orb riding behind it.
        create: () => createSkillArrow(0xff7a3d, 0xff3a1f, 1.4),
      },
      slow: {
        // SLOW — icy blue arrow with cyan glow.
        create: () => createSkillArrow(0x66ddff, 0x2a8fdc, 1.0),
      },
      control: {
        // STUN — violet arrow with electric purple glow.
        create: () => createSkillArrow(0xb56cff, 0x7434ff, 1.0),
      },
      meteor: {
        create: createMeteorProjectile,
      },
      fire: {
        // FIRE — orange/yellow flame arrow. Kept for legacy callers.
        create: () => createSkillArrow(0xffa64a, 0xff5520, 1.15),
      },
      fireball: {
        // FIREBALL — pure burning sphere with a bright halo. Mage Q.
        create: createFireballProjectile,
      },
      flamewave: {
        // FLAME WAVE — flat ring of fire that travels horizontally. Mage E.
        create: createFlamewaveProjectile,
      },
      firebolt: {
        // FIREBOLT — tiny ember sphere for the mage's auto-attack.
        create: createFireboltProjectile,
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
    mesh.castShadow = false;
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
      aoeRadius: spec.aoeRadius,
      aoeDamage: spec.aoeDamage,
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
            this.hitUnit(p, p.target, now, registry);
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
          this.hitUnit(p, hit, now, registry);
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

  private hitUnit(p: Projectile, unit: Unit, now: number, registry: UnitRegistry): void {
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

    // AoE shockwave — damage every other enemy of `p.team` within radius.
    // Skips the primary target (already took the full hit) and stationary
    // structures stay vulnerable too. XP from AoE kills also flows to the
    // owning hero so meteor wipeouts feed the right player.
    if (p.aoeRadius && p.aoeDamage && p.aoeDamage > 0) {
      const r2 = p.aoeRadius * p.aoeRadius;
      const cx = unit.position.x;
      const cz = unit.position.z;
      for (const other of registry.allUnits()) {
        if (other === unit) continue;
        if (!other.alive || other.team === p.team) continue;
        const dx = other.position.x - cx;
        const dz = other.position.z - cz;
        if (dx * dx + dz * dz > r2) continue;
        const wasOtherAlive = other.alive;
        const otherDamage = Math.min(other.hp, p.aoeDamage);
        other.takeDamage(p.aoeDamage);
        if (otherDamage > 0) this.onDamage?.(other, otherDamage, p.owner);
        if (wasOtherAlive && !other.alive && p.owner?.kind === 'hero') {
          p.owner.grantXp?.(other.xpReward);
        }
        this.spawnHitBurst(other.position, p.team);
      }
    }
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
const ARROW_SHAFT_MAT = new THREE.MeshLambertMaterial({
  color: 0xd9b56d,
});
const ARROW_TIP_MAT = new THREE.MeshLambertMaterial({
  color: 0xf8f0dc,
  emissive: 0xffcf5a,
  emissiveIntensity: 0.35,
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

// Skill arrows reuse the arrow body geometry but get tinted/emissive
// materials per skill. Cached by colour so repeated casts don't reallocate.
const SKILL_ARROW_SHAFT_GEOM = new THREE.CylinderGeometry(0.07, 0.05, 1.4, 8);
const SKILL_ARROW_TIP_GEOM = new THREE.ConeGeometry(0.18, 0.4, 12);
const SKILL_ARROW_HALO_GEOM = new THREE.SphereGeometry(0.32, 12, 12);
const SKILL_ARROW_MAT_CACHE = new Map<string, {
  shaft: THREE.MeshLambertMaterial;
  tip: THREE.MeshLambertMaterial;
  halo: THREE.MeshBasicMaterial;
}>();

function getSkillArrowMats(color: number, emissive: number) {
  const key = `${color.toString(16)}-${emissive.toString(16)}`;
  let mats = SKILL_ARROW_MAT_CACHE.get(key);
  if (!mats) {
    mats = {
      shaft: new THREE.MeshLambertMaterial({
        color, emissive, emissiveIntensity: 1.4,
      }),
      tip: new THREE.MeshLambertMaterial({
        color: 0xffffff, emissive, emissiveIntensity: 2.2,
      }),
      halo: new THREE.MeshBasicMaterial({
        color: emissive, transparent: true, opacity: 0.55, depthWrite: false,
      }),
    };
    SKILL_ARROW_MAT_CACHE.set(key, mats);
  }
  return mats;
}

function createSkillArrow(color: number, emissive: number, scale = 1.0): THREE.Object3D {
  const mats = getSkillArrowMats(color, emissive);
  const arrow = new THREE.Group();
  const shaft = new THREE.Mesh(SKILL_ARROW_SHAFT_GEOM, mats.shaft);
  shaft.rotation.x = Math.PI / 2;
  arrow.add(shaft);
  const tip = new THREE.Mesh(SKILL_ARROW_TIP_GEOM, mats.tip);
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 0.85;
  arrow.add(tip);
  // Soft halo orb riding the arrow — gives skill shots a "energy" feel.
  const halo = new THREE.Mesh(SKILL_ARROW_HALO_GEOM, mats.halo);
  halo.position.z = -0.2;
  arrow.add(halo);
  arrow.scale.setScalar(scale);
  return arrow;
}

const METEOR_CORE_GEOM = new THREE.DodecahedronGeometry(0.65, 0);
const METEOR_TAIL_GEOM = new THREE.ConeGeometry(0.38, 1.1, 12);
const METEOR_CORE_MAT = new THREE.MeshLambertMaterial({
  color: 0xff7a2f,
  emissive: 0xff3300,
  emissiveIntensity: 1.25,
  flatShading: true,
});
const METEOR_TAIL_MAT = new THREE.MeshLambertMaterial({
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

// --- Mage-only projectiles -------------------------------------------------
// Visually pure magic — no arrow, no shaft. Each variant has its own shape
// so the player can read mage casts at a glance even mid-fight.

const FIREBALL_CORE_GEOM = new THREE.SphereGeometry(0.35, 14, 14);
const FIREBALL_OUTER_GEOM = new THREE.SphereGeometry(0.55, 14, 14);
const FIREBALL_HALO_GEOM = new THREE.SphereGeometry(0.78, 14, 14);
const FIREBALL_TAIL_GEOM = new THREE.ConeGeometry(0.32, 0.9, 10);
const FIREBALL_CORE_MAT = new THREE.MeshLambertMaterial({
  color: 0xffe27a,
  emissive: 0xffaa3a,
  emissiveIntensity: 2.4,
});
const FIREBALL_OUTER_MAT = new THREE.MeshLambertMaterial({
  color: 0xff7d2a,
  emissive: 0xff4310,
  emissiveIntensity: 1.6,
  transparent: true,
  opacity: 0.85,
});
const FIREBALL_HALO_MAT = new THREE.MeshBasicMaterial({
  color: 0xff5a18,
  transparent: true,
  opacity: 0.45,
  depthWrite: false,
});
const FIREBALL_TAIL_MAT = new THREE.MeshLambertMaterial({
  color: 0xffb55a,
  emissive: 0xff5818,
  emissiveIntensity: 1.2,
  transparent: true,
  opacity: 0.7,
});

/** Pure flaming sphere — used for mage Q (FIREBALL). */
function createFireballProjectile(): THREE.Object3D {
  const g = new THREE.Group();
  const halo = new THREE.Mesh(FIREBALL_HALO_GEOM, FIREBALL_HALO_MAT);
  g.add(halo);
  const outer = new THREE.Mesh(FIREBALL_OUTER_GEOM, FIREBALL_OUTER_MAT);
  g.add(outer);
  const core = new THREE.Mesh(FIREBALL_CORE_GEOM, FIREBALL_CORE_MAT);
  g.add(core);
  // Trailing flame cone behind the orb so it reads as motion.
  const tail = new THREE.Mesh(FIREBALL_TAIL_GEOM, FIREBALL_TAIL_MAT);
  tail.rotation.x = -Math.PI / 2;
  tail.position.z = -0.55;
  g.add(tail);
  return g;
}

const FLAMEWAVE_RING_GEOM = new THREE.TorusGeometry(0.7, 0.18, 10, 24);
const FLAMEWAVE_INNER_GEOM = new THREE.TorusGeometry(0.45, 0.1, 8, 18);
const FLAMEWAVE_CORE_GEOM = new THREE.SphereGeometry(0.28, 12, 12);
const FLAMEWAVE_RING_MAT = new THREE.MeshLambertMaterial({
  color: 0xff9a3a,
  emissive: 0xff5518,
  emissiveIntensity: 1.8,
  transparent: true,
  opacity: 0.95,
});
const FLAMEWAVE_INNER_MAT = new THREE.MeshLambertMaterial({
  color: 0xffd86a,
  emissive: 0xffb83a,
  emissiveIntensity: 2.0,
  transparent: true,
  opacity: 0.9,
});
const FLAMEWAVE_CORE_MAT = new THREE.MeshLambertMaterial({
  color: 0xffe6a0,
  emissive: 0xffc24a,
  emissiveIntensity: 2.4,
});

/** Flat ring of flame — used for mage E (FLAME WAVE). */
function createFlamewaveProjectile(): THREE.Object3D {
  const g = new THREE.Group();
  // Outer torus laid flat in the XY plane; rotated so it travels "edge-on"
  // along +Z and reads as a wide arc when viewed from the tactical camera.
  const ring = new THREE.Mesh(FLAMEWAVE_RING_GEOM, FLAMEWAVE_RING_MAT);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const inner = new THREE.Mesh(FLAMEWAVE_INNER_GEOM, FLAMEWAVE_INNER_MAT);
  inner.rotation.x = Math.PI / 2;
  inner.position.z = 0.05;
  g.add(inner);
  const core = new THREE.Mesh(FLAMEWAVE_CORE_GEOM, FLAMEWAVE_CORE_MAT);
  g.add(core);
  return g;
}

const FIREBOLT_CORE_GEOM = new THREE.SphereGeometry(0.18, 10, 10);
const FIREBOLT_HALO_GEOM = new THREE.SphereGeometry(0.34, 10, 10);
const FIREBOLT_CORE_MAT = new THREE.MeshLambertMaterial({
  color: 0xffd078,
  emissive: 0xff7a1f,
  emissiveIntensity: 2.2,
});
const FIREBOLT_HALO_MAT = new THREE.MeshBasicMaterial({
  color: 0xff6a18,
  transparent: true,
  opacity: 0.5,
  depthWrite: false,
});

/** Small ember sphere — mage's auto-attack. */
function createFireboltProjectile(): THREE.Object3D {
  const g = new THREE.Group();
  const halo = new THREE.Mesh(FIREBOLT_HALO_GEOM, FIREBOLT_HALO_MAT);
  g.add(halo);
  const core = new THREE.Mesh(FIREBOLT_CORE_GEOM, FIREBOLT_CORE_MAT);
  g.add(core);
  return g;
}
