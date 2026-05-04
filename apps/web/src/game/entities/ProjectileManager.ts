import * as THREE from 'three';
import {
  BASIC_PROJECTILE_SPEED_3D,
  PROJECTILE_LIFETIME_MS,
  PROJECTILE_RADIUS,
  PROJECTILE_SPEED_3D,
} from '../constants.js';
import type { DamageType, Team, Unit } from '../combat/Unit.js';
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
  | 'firebolt'
  /** Sword slash arc. Fighter Q — wide forward swing. */
  | 'blade'
  /** Spinning blade-vortex. Fighter C self-cast AoE FX. */
  | 'vortex'
  /** Slim spinning dagger. Assassin Q. */
  | 'dagger'
  /** Dark wave with purple energy. Assassin E. */
  | 'shadow'
  /** Heavy mace bolt. Tank Q. */
  | 'hammer'
  /** Ground shockwave AoE FX. Tank C self-cast. */
  | 'quake';

export interface ProjectileSpec {
  team: Team;
  damage: number;
  /** Physical / magic / true. Defaults to physical when omitted. */
  damageType?: DamageType;
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
  /**
   * Self-cast AoE — no travel, no primary target. The projectile spawns at
   * the caster, immediately detonates within `aoeRadius`, and lingers for
   * a brief visual. Used for fighter's vortex and tank's earthquake. When
   * set, `effect` (slow/stun) is applied to every caught unit, not just
   * a primary target.
   */
  selfCast?: boolean;
  /** Visual lifetime for self-cast skills, ms. Defaults to 600ms. */
  selfCastDurationMs?: number;
  /**
   * Execute bonus — if the primary target's HP fraction is at or below
   * `executeHpThreshold`, the dealt damage is multiplied by
   * `(1 + executeBonus)`. Used for the assassin's finisher. Applied
   * inside ProjectileManager.hitUnit, so the bonus also boosts XP
   * rewards if the strike kills.
   */
  executeHpThreshold?: number;
  executeBonus?: number;
  /**
   * Piercing flag — when true, the projectile keeps travelling after
   * hitting a unit instead of despawning, dealing its damage to every
   * enemy on its path until it expires by maxDistance/lifetime. The
   * manager tracks a per-projectile "already hit" set so a single
   * shot can't damage the same unit twice. Used by the arcshooter's
   * Piercing Arrow.
   */
  pierces?: boolean;
  /**
   * Self-cast Taunt — every enemy caught in the AoE has its AI forced
   * to target the projectile's owner for the duration. Set on the
   * bulwark's C skill spec.
   */
  tauntDurationMs?: number;
}

interface Projectile {
  mesh: THREE.Object3D;
  velocity: THREE.Vector3;
  spawnedAt: number;
  team: Team;
  damage: number;
  damageType: DamageType;
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
  selfCast?: boolean;
  selfCastDurationMs?: number;
  executeHpThreshold?: number;
  executeBonus?: number;
  pierces?: boolean;
  /** Set of units already damaged by this piercing projectile, so a
   *  single shot doesn't re-hit a target on subsequent ticks. */
  pierceHits?: Set<Unit>;
  /** Forces every enemy caught by a self-cast AoE to target `owner` for
   *  the given duration. Used by the bulwark's Taunt. */
  tauntDurationMs?: number;
  /** Throttle for the trail-particle stream — last emission timestamp. */
  lastTrailAt?: number;
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
      blade: {
        // BLADE — wide steel slash arc, fighter's bread-and-butter.
        create: createBladeProjectile,
      },
      vortex: {
        // VORTEX — spinning blade ring planted at the fighter's feet.
        create: createVortexProjectile,
      },
      dagger: {
        // DAGGER — slim spinning knife for the assassin's Q.
        create: createDaggerProjectile,
      },
      shadow: {
        // SHADOW — dark purple wave, assassin's E.
        create: createShadowProjectile,
      },
      hammer: {
        // HAMMER — chunky stone-and-steel mace, tank's Q.
        create: createHammerProjectile,
      },
      quake: {
        // QUAKE — ground shockwave at the tank's feet.
        create: createQuakeProjectile,
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
      damageType: spec.damageType ?? 'physical',
      effect: spec.effect,
      target: spec.target,
      owner: spec.owner,
      // Self-cast skills don't travel — they detonate at the caster the
      // first update tick after spawn. We force maxDistance=0 so the
      // expiry path triggers the AoE detonation immediately, and clear
      // velocity so the visual stays put.
      maxDistance: spec.selfCast ? 0 : spec.maxDistance,
      distanceTravelled: 0,
      speed: spec.selfCast ? 0 : speed,
      fromPlayer: spec.fromPlayer === true,
      visualOnly: spec.visualOnly === true,
      onArrive: spec.onArrive,
      arrived: false,
      aoeRadius: spec.aoeRadius,
      aoeDamage: spec.aoeDamage,
      selfCast: spec.selfCast,
      selfCastDurationMs: spec.selfCastDurationMs,
      executeHpThreshold: spec.executeHpThreshold,
      executeBonus: spec.executeBonus,
      pierces: spec.pierces,
      pierceHits: spec.pierces ? new Set<Unit>() : undefined,
      tauntDurationMs: spec.tauntDurationMs,
    });
    if (spec.selfCast) {
      // Zero out velocity so the spinning visual stays planted at the
      // caster's feet — `update()` would otherwise apply one tick of
      // movement before the expiry check fires.
      this.projectiles[this.projectiles.length - 1].velocity.set(0, 0, 0);
    }
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

      // Trail particle throttle — drop a fading dot every ~80ms behind the
      // projectile so the eye reads motion. Cheap (single sphere mesh,
      // 200ms lifetime) and capped by the global FX_BUDGET.
      if (!p.lastTrailAt || now - p.lastTrailAt > 80) {
        p.lastTrailAt = now;
        if (this.fx.length <= FX_BUDGET) {
          this.spawnTrailParticle(p.mesh.position, p.team);
        }
      }

      if (!p.visualOnly) {
        const hit = registry.findHit(p.mesh.position, PROJECTILE_RADIUS, p.team);
        if (hit) {
          if (p.pierces) {
            // Piercing projectile — damage the unit if we haven't yet, but
            // KEEP the projectile flying so it can hit more enemies along
            // its line. The pierceHits set guarantees one hit per unit.
            if (!p.pierceHits!.has(hit)) {
              p.pierceHits!.add(hit);
              this.hitUnit(p, hit, now, registry);
            }
          } else {
            this.hitUnit(p, hit, now, registry);
            this.removeAt(i);
            continue;
          }
        }
      }

      const exceededRange = p.maxDistance !== undefined && p.distanceTravelled >= p.maxDistance;
      const lifetimeOver = now - p.spawnedAt > PROJECTILE_LIFETIME_MS;
      if (exceededRange || lifetimeOver) {
        if (p.visualOnly) this.fireOnArrive(p);
        else if (p.selfCast && p.aoeRadius && p.aoeDamage) {
          // Self-cast detonation. Splash everyone in radius and apply the
          // skill's effect to each caught unit (different from the
          // primary-target AoE path, which only damages secondaries).
          this.detonateSelfCast(p, now, registry);
          // Keep the spinning/quake mesh visible for the configured tail
          // window so the player sees the AoE landing. We do this by
          // postponing removal — but since we're inside the loop, just
          // leave the mesh in scene and remove it on the next tick by
          // marking arrived=true and zeroing the AoE so we don't re-hit.
          p.arrived = true;
          p.aoeDamage = 0;
          p.aoeRadius = 0;
          p.spawnedAt = now - PROJECTILE_LIFETIME_MS + (p.selfCastDurationMs ?? 600);
          continue;
        }
        this.removeAt(i);
      }
    }
  }

  /**
   * Self-cast AoE detonation. Damages and applies effect to every alive
   * enemy within radius of the caster's spawn position. Mirrors the
   * primary-target AoE branch in hitUnit but treats every unit equally —
   * there's no "primary target" for self-cast skills.
   */
  private detonateSelfCast(p: Projectile, now: number, registry: UnitRegistry): void {
    if (!p.aoeRadius || !p.aoeDamage) return;
    const r2 = p.aoeRadius * p.aoeRadius;
    const cx = p.mesh.position.x;
    const cz = p.mesh.position.z;
    for (const other of registry.allUnits()) {
      if (!other.alive || other.team === p.team) continue;
      const dx = other.position.x - cx;
      const dz = other.position.z - cz;
      if (dx * dx + dz * dz > r2) continue;
      const wasAlive = other.alive;
      const reduced = applyDef(p.aoeDamage, p.damageType, other);
      const damage = Math.min(other.hp, reduced);
      other.takeDamage(reduced, p.damageType);
      if (damage > 0) this.onDamage?.(other, damage, p.owner);
      // Apply on-cast effect (slow / stun) to every caught unit — that's
      // the whole point of vortex/quake.
      if (p.effect?.slow) {
        const until = now + p.effect.slow.durationMs;
        if (until > other.slowUntil) other.slowUntil = until;
      }
      if (p.effect?.stun) {
        const until = now + p.effect.stun.durationMs;
        if (until > other.stunnedUntil) other.stunnedUntil = until;
      }
      // Taunt — force the caught unit's AI to target the bulwark for the
      // duration. Player-controlled units ignore this; only bot AI
      // honours `tauntedBy`.
      if (p.tauntDurationMs && p.owner) {
        const tUntil = now + p.tauntDurationMs;
        if (!other.tauntedUntil || tUntil > other.tauntedUntil) {
          other.tauntedBy = p.owner;
          other.tauntedUntil = tUntil;
        }
      }
      if (wasAlive && !other.alive) {
        this.grantKillXp(other, p.owner, registry);
      }
      this.spawnHitBurst(other.position, p.team);
    }
    if (p.fromPlayer) this.onPlayerHit?.();
  }

  private fireOnArrive(p: Projectile): void {
    if (p.arrived) return;
    p.arrived = true;
    this.spawnHitBurst(p.mesh.position, p.team);
    p.onArrive?.();
  }

  /**
   * Radius around a dying unit within which every alive enemy hero gets
   * its xpReward. The killer is always credited too (even if they're at
   * the far end of an arrow shot), so out-of-radius long-range last-hits
   * still get rewarded.
   */
  private static readonly XP_ASSIST_RADIUS = 9;

  /**
   * Award XP to every hero who deserves it for `dead`'s death:
   * the killer (if a hero) plus every alive enemy hero within
   * XP_ASSIST_RADIUS of the corpse. Mirrors MOBA assist rules — being
   * "in the fight" is enough, you don't need the last hit.
   */
  private grantKillXp(dead: Unit, killer: Unit | undefined, registry: UnitRegistry): void {
    if (dead.xpReward <= 0) return;
    const r2 = ProjectileManager.XP_ASSIST_RADIUS * ProjectileManager.XP_ASSIST_RADIUS;
    const granted = new Set<Unit>();
    if (killer && killer.kind === 'hero' && killer.alive && killer.team !== dead.team) {
      killer.grantXp?.(dead.xpReward);
      granted.add(killer);
    }
    for (const u of registry.allUnits()) {
      if (granted.has(u)) continue;
      if (u.kind !== 'hero' || !u.alive || u.team === dead.team) continue;
      const dx = u.position.x - dead.position.x;
      const dz = u.position.z - dead.position.z;
      if (dx * dx + dz * dz > r2) continue;
      u.grantXp?.(dead.xpReward);
      granted.add(u);
    }
  }

  private hitUnit(p: Projectile, unit: Unit, now: number, registry: UnitRegistry): void {
    const wasAlive = unit.alive;
    // Execute bonus — when the assassin's finisher lands on a wounded
    // target, multiply the damage. The threshold/bonus are per-projectile
    // so future heroes can have their own "execute" rules.
    let baseDamage = p.damage;
    if (p.executeHpThreshold !== undefined && p.executeBonus !== undefined) {
      const hpFrac = unit.maxHp > 0 ? unit.hp / unit.maxHp : 1;
      if (hpFrac <= p.executeHpThreshold) baseDamage = p.damage * (1 + p.executeBonus);
    }
    // Armour reduction. `true` damage skips this step entirely.
    const reduced = applyDef(baseDamage, p.damageType, unit);
    const damage = Math.min(unit.hp, reduced);
    unit.takeDamage(reduced, p.damageType);
    if (damage > 0) this.onDamage?.(unit, damage, p.owner);
    if (p.effect?.slow) {
      const until = now + p.effect.slow.durationMs;
      if (until > unit.slowUntil) unit.slowUntil = until;
    }
    if (p.effect?.stun) {
      const until = now + p.effect.stun.durationMs;
      if (until > unit.stunnedUntil) unit.stunnedUntil = until;
    }
    if (wasAlive && !unit.alive) {
      this.grantKillXp(unit, p.owner, registry);
    }
    if (p.fromPlayer) this.onPlayerHit?.();
    this.spawnHitBurst(unit.position, p.team);

    // AoE shockwave — damage every other enemy of `p.team` within radius.
    // Skips the primary target (already took the full hit) and stationary
    // structures stay vulnerable too. XP from AoE kills also flows to
    // every nearby hero so meteor wipeouts feed the whole frontline.
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
        const aoeReduced = applyDef(p.aoeDamage, p.damageType, other);
        const otherDamage = Math.min(other.hp, aoeReduced);
        other.takeDamage(aoeReduced, p.damageType);
        if (otherDamage > 0) this.onDamage?.(other, otherDamage, p.owner);
        if (wasOtherAlive && !other.alive) {
          this.grantKillXp(other, p.owner, registry);
        }
        this.spawnHitBurst(other.position, p.team);
      }
    }
  }

  private removeAt(index: number): void {
    this.scene.remove(this.projectiles[index].mesh);
    this.projectiles.splice(index, 1);
  }

  /** Punchy impact flash — central white core, expanding team-coloured
   *  ring, and a fan of speck shrapnel. Skipped when the FX budget is
   *  saturated to keep frame rate stable. */
  spawnHitBurst(at: THREE.Vector3, team: Team): void {
    if (this.fx.length > FX_BUDGET) return;
    const color = team === 'blue' ? 0x9fd8ff : 0xffb37a;
    const now = performance.now();

    // Central white flash — sells the hit instantly, before the ring
    // even starts expanding.
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
    const flash = new THREE.Mesh(HIT_FLASH_GEOM, flashMat);
    flash.position.set(at.x, 1.1, at.z);
    this.scene.add(flash);
    this.fx.push({ mesh: flash, spawnedAt: now, kind: 'flash', durationMs: 160 });

    // Expanding team-coloured ring on the ground.
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
    this.fx.push({ mesh: ring, spawnedAt: now, kind: 'ring', durationMs: 320 });

    // Shrapnel — bumped from 6 to 10 pieces with more spread for a
    // beefier impact read.
    for (let i = 0; i < 10; i++) {
      const speckMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
        depthWrite: false,
      });
      const speck = new THREE.Mesh(HIT_SPECK_GEOM, speckMat);
      speck.position.set(at.x, 1.2, at.z);
      const a = (Math.PI * 2 * i) / 10 + Math.random() * 0.3;
      const speed = 5 + Math.random() * 3;
      const v = new THREE.Vector3(Math.cos(a) * speed, 2.5 + Math.random() * 2.5, Math.sin(a) * speed);
      this.scene.add(speck);
      this.fx.push({
        mesh: speck,
        spawnedAt: now,
        kind: 'speck',
        durationMs: 420,
        velocity: v,
      });
    }
  }

  /** Tiny fading dot dropped behind a moving projectile. Team-coloured. */
  private spawnTrailParticle(at: THREE.Vector3, team: Team): void {
    const color = team === 'blue' ? 0x9fd8ff : 0xffb37a;
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    const dot = new THREE.Mesh(TRAIL_GEOM, mat);
    dot.position.set(at.x, at.y, at.z);
    this.scene.add(dot);
    this.fx.push({
      mesh: dot,
      spawnedAt: performance.now(),
      kind: 'trail',
      durationMs: 220,
    });
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
      } else if (f.kind === 'trail') {
        // Stays put, shrinks slightly while fading. Cheap motion-blur.
        const s = 1 - t * 0.4;
        f.mesh.scale.set(s, s, s);
        mat.opacity = (1 - t) * 0.65;
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
  kind: 'ring' | 'speck' | 'flash' | 'trail';
  durationMs: number;
  velocity?: THREE.Vector3;
}

/**
 * Reduce `raw` damage by the unit's matching defence. `true` damage
 * bypasses defences entirely. Defences default to 0 if the unit doesn't
 * expose a value (minions/structures stay raw-damage-takers).
 */
function applyDef(raw: number, type: DamageType, unit: Unit): number {
  if (type === 'true') return raw;
  const def = type === 'magic' ? (unit.magicalDef ?? 0) : (unit.physicalDef ?? 0);
  if (def <= 0) return raw;
  // Clamp to avoid heroes ever hitting 100% reduction by accident.
  return raw * Math.max(0.1, 1 - Math.min(0.85, def));
}

// FX cap — beyond this many concurrent sprites we drop new bursts entirely.
// Bumped after adding bullet trails since trail dots are the chattiest
// emitter; budget cap throttles automatically when it fills up.
const FX_BUDGET = 140;
const HIT_RING_GEOM = new THREE.RingGeometry(0.1, 0.55, 18);
const HIT_SPECK_GEOM = new THREE.SphereGeometry(0.13, 6, 6);
const MUZZLE_FLASH_GEOM = new THREE.SphereGeometry(0.28, 8, 8);
const TRAIL_GEOM = new THREE.SphereGeometry(0.18, 6, 6);
const HIT_FLASH_GEOM = new THREE.SphereGeometry(0.42, 10, 10);

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

// --- Fighter projectiles --------------------------------------------------
const BLADE_GEOM = new THREE.BoxGeometry(0.18, 0.06, 1.4);
const BLADE_GUARD_GEOM = new THREE.BoxGeometry(0.42, 0.06, 0.12);
const BLADE_TIP_GEOM = new THREE.ConeGeometry(0.14, 0.32, 6);
const BLADE_MAT = new THREE.MeshLambertMaterial({
  color: 0xcfd6e0,
  emissive: 0x88a0c0,
  emissiveIntensity: 0.6,
});
const BLADE_GUARD_MAT = new THREE.MeshLambertMaterial({
  color: 0xb78a3a,
  emissive: 0x000000,
});

/** Wide steel slash — fighter Q. Sword-shaped projectile with gold guard. */
function createBladeProjectile(): THREE.Object3D {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(BLADE_GEOM, BLADE_MAT);
  g.add(blade);
  const tip = new THREE.Mesh(BLADE_TIP_GEOM, BLADE_MAT);
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 0.85;
  g.add(tip);
  const guard = new THREE.Mesh(BLADE_GUARD_GEOM, BLADE_GUARD_MAT);
  guard.position.z = -0.55;
  g.add(guard);
  return g;
}

const VORTEX_RING_GEOM = new THREE.TorusGeometry(1.6, 0.12, 8, 30);
const VORTEX_BLADE_GEOM = new THREE.BoxGeometry(0.7, 0.08, 0.12);
const VORTEX_RING_MAT = new THREE.MeshLambertMaterial({
  color: 0xc9d3e0,
  emissive: 0x6e89b0,
  emissiveIntensity: 1.0,
  transparent: true,
  opacity: 0.85,
});
const VORTEX_BLADE_MAT = new THREE.MeshLambertMaterial({
  color: 0xe0e6f2,
  emissive: 0x88a0c0,
  emissiveIntensity: 0.7,
});

/** Spinning blade ring at the fighter's feet — fighter C self-cast. */
function createVortexProjectile(): THREE.Object3D {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(VORTEX_RING_GEOM, VORTEX_RING_MAT);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  // Three blades flaring out from the centre — visual only, no extra hits.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const blade = new THREE.Mesh(VORTEX_BLADE_GEOM, VORTEX_BLADE_MAT);
    blade.position.set(Math.cos(a) * 0.85, 0.12, Math.sin(a) * 0.85);
    blade.rotation.y = a;
    g.add(blade);
  }
  return g;
}

// --- Assassin projectiles -------------------------------------------------
const DAGGER_BLADE_GEOM = new THREE.ConeGeometry(0.07, 0.7, 6);
const DAGGER_HILT_GEOM = new THREE.CylinderGeometry(0.05, 0.05, 0.18, 6);
const DAGGER_BLADE_MAT = new THREE.MeshLambertMaterial({
  color: 0xd8dde6,
  emissive: 0x4a4d72,
  emissiveIntensity: 0.5,
});
const DAGGER_HILT_MAT = new THREE.MeshLambertMaterial({ color: 0x1f1c30 });

/** Slim spinning knife — assassin Q. */
function createDaggerProjectile(): THREE.Object3D {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(DAGGER_BLADE_GEOM, DAGGER_BLADE_MAT);
  blade.rotation.x = Math.PI / 2;
  blade.position.z = 0.2;
  g.add(blade);
  const hilt = new THREE.Mesh(DAGGER_HILT_GEOM, DAGGER_HILT_MAT);
  hilt.rotation.x = Math.PI / 2;
  hilt.position.z = -0.3;
  g.add(hilt);
  return g;
}

const SHADOW_CORE_GEOM = new THREE.SphereGeometry(0.36, 12, 12);
const SHADOW_OUTER_GEOM = new THREE.SphereGeometry(0.62, 12, 12);
const SHADOW_HALO_GEOM = new THREE.TorusGeometry(0.6, 0.1, 8, 22);
const SHADOW_CORE_MAT = new THREE.MeshLambertMaterial({
  color: 0x6a45c8,
  emissive: 0x9b6cff,
  emissiveIntensity: 1.6,
});
const SHADOW_OUTER_MAT = new THREE.MeshLambertMaterial({
  color: 0x3a1f70,
  emissive: 0x4a2a90,
  emissiveIntensity: 0.9,
  transparent: true,
  opacity: 0.78,
});
const SHADOW_HALO_MAT = new THREE.MeshBasicMaterial({
  color: 0x4a2a90,
  transparent: true,
  opacity: 0.5,
  depthWrite: false,
});

/** Dark purple wave — assassin E. */
function createShadowProjectile(): THREE.Object3D {
  const g = new THREE.Group();
  const halo = new THREE.Mesh(SHADOW_HALO_GEOM, SHADOW_HALO_MAT);
  halo.rotation.x = Math.PI / 2;
  g.add(halo);
  const outer = new THREE.Mesh(SHADOW_OUTER_GEOM, SHADOW_OUTER_MAT);
  g.add(outer);
  const core = new THREE.Mesh(SHADOW_CORE_GEOM, SHADOW_CORE_MAT);
  g.add(core);
  return g;
}

// --- Tank projectiles -----------------------------------------------------
const HAMMER_HEAD_GEOM = new THREE.BoxGeometry(0.7, 0.6, 0.45);
const HAMMER_SHAFT_GEOM = new THREE.CylinderGeometry(0.08, 0.08, 0.9, 8);
const HAMMER_BAND_GEOM = new THREE.BoxGeometry(0.74, 0.08, 0.49);
const HAMMER_HEAD_MAT = new THREE.MeshLambertMaterial({
  color: 0x6c6e72,
  emissive: 0x202428,
});
const HAMMER_SHAFT_MAT = new THREE.MeshLambertMaterial({ color: 0x4d2f1c });
const HAMMER_BAND_MAT = new THREE.MeshLambertMaterial({
  color: 0xd0a050,
  emissive: 0x7a5520,
  emissiveIntensity: 0.6,
});

/** Heavy mace — tank Q. */
function createHammerProjectile(): THREE.Object3D {
  const g = new THREE.Group();
  const head = new THREE.Mesh(HAMMER_HEAD_GEOM, HAMMER_HEAD_MAT);
  head.position.z = 0.45;
  g.add(head);
  const bandTop = new THREE.Mesh(HAMMER_BAND_GEOM, HAMMER_BAND_MAT);
  bandTop.position.set(0, 0.34, 0.45);
  g.add(bandTop);
  const bandBot = new THREE.Mesh(HAMMER_BAND_GEOM, HAMMER_BAND_MAT);
  bandBot.position.set(0, -0.34, 0.45);
  g.add(bandBot);
  const shaft = new THREE.Mesh(HAMMER_SHAFT_GEOM, HAMMER_SHAFT_MAT);
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = -0.35;
  g.add(shaft);
  return g;
}

const QUAKE_RING_GEOM = new THREE.TorusGeometry(2.0, 0.16, 8, 28);
const QUAKE_INNER_GEOM = new THREE.TorusGeometry(1.2, 0.12, 8, 24);
const QUAKE_DUST_GEOM = new THREE.CylinderGeometry(0.18, 0.05, 0.55, 6);
const QUAKE_RING_MAT = new THREE.MeshLambertMaterial({
  color: 0xb8985a,
  emissive: 0x7a5a1f,
  emissiveIntensity: 0.8,
  transparent: true,
  opacity: 0.9,
});
const QUAKE_INNER_MAT = new THREE.MeshLambertMaterial({
  color: 0xe7c878,
  emissive: 0xa68440,
  emissiveIntensity: 0.6,
  transparent: true,
  opacity: 0.7,
});
const QUAKE_DUST_MAT = new THREE.MeshLambertMaterial({
  color: 0x9c7c52,
  transparent: true,
  opacity: 0.6,
});

/** Ground shockwave at the tank's feet — tank C self-cast. */
function createQuakeProjectile(): THREE.Object3D {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(QUAKE_RING_GEOM, QUAKE_RING_MAT);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const inner = new THREE.Mesh(QUAKE_INNER_GEOM, QUAKE_INNER_MAT);
  inner.rotation.x = Math.PI / 2;
  inner.position.y = 0.05;
  g.add(inner);
  // Dust plumes around the rim.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const dust = new THREE.Mesh(QUAKE_DUST_GEOM, QUAKE_DUST_MAT);
    dust.position.set(Math.cos(a) * 1.5, 0.25, Math.sin(a) * 1.5);
    g.add(dust);
  }
  return g;
}
