import * as THREE from 'three';
import {
  type HeroKind,
  ASSASSIN_ATTACK_COOLDOWN_MS,
  ASSASSIN_ATTACK_DAMAGE,
  ASSASSIN_ATTACK_RANGE,
  ASSASSIN_C_COOLDOWN_MS,
  ASSASSIN_C_INVIS_MS,
  ASSASSIN_E_COOLDOWN_MS,
  ASSASSIN_E_DAMAGE,
  ASSASSIN_E_RANGE,
  ASSASSIN_MAX_HP,
  ASSASSIN_Q_AOE_RADIUS,
  ASSASSIN_Q_COOLDOWN_MS,
  ASSASSIN_Q_DAMAGE,
  ASSASSIN_Q_RANGE,
  ASSASSIN_SPEED_3D,
  FIGHTER_ATTACK_COOLDOWN_MS,
  FIGHTER_ATTACK_DAMAGE,
  FIGHTER_ATTACK_RANGE,
  FIGHTER_C_AOE_DAMAGE,
  FIGHTER_C_AOE_RADIUS,
  FIGHTER_C_COOLDOWN_MS,
  FIGHTER_C_STUN_DURATION_MS,
  FIGHTER_E_BUFF_DURATION_MS,
  FIGHTER_E_COOLDOWN_MS,
  FIGHTER_E_DAMAGE_BONUS,
  FIGHTER_MAX_HP,
  FIGHTER_Q_COOLDOWN_MS,
  FIGHTER_Q_DAMAGE,
  FIGHTER_Q_RANGE,
  FIGHTER_Q_SLOW_DURATION_MS,
  FIGHTER_Q_SLOW_FACTOR,
  FIGHTER_SPEED_3D,
  HERO_BASE_XP_TO_LEVEL,
  HERO_DAMAGE_PER_LEVEL,
  HERO_HP_PER_LEVEL,
  HERO_KILL_XP_REWARD,
  HERO_MAX_LEVEL,
  HERO_XP_LEVEL_GROWTH,
  MAGE_ATTACK_COOLDOWN_MS,
  MAGE_ATTACK_DAMAGE,
  MAGE_ATTACK_RANGE,
  MAGE_C_AOE_DAMAGE,
  MAGE_C_AOE_RADIUS,
  MAGE_C_COOLDOWN_MS,
  MAGE_C_DAMAGE,
  MAGE_C_RANGE,
  MAGE_C_STUN_DURATION_MS,
  MAGE_E_COOLDOWN_MS,
  MAGE_E_DAMAGE,
  MAGE_E_RANGE,
  MAGE_E_SLOW_DURATION_MS,
  MAGE_E_SLOW_FACTOR,
  MAGE_MAX_HP,
  MAGE_Q_COOLDOWN_MS,
  MAGE_Q_DAMAGE,
  MAGE_Q_RANGE,
  MAGE_SPEED_3D,
  PLAYER_ATTACK_COOLDOWN_MS,
  PLAYER_ATTACK_DAMAGE,
  PLAYER_ATTACK_RANGE,
  PLAYER_MAX_HP,
  PLAYER_RADIUS,
  PLAYER_SPEED_3D,
  PLAYER_TOWER_FOCUS_DECAY_MS,
  PLAYER_TOWER_FOCUS_STACK_BONUS,
  PLAYER_TOWER_FOCUS_STACK_CAP,
  SKILL_C_ATTACK_SPEED_DURATION_MS,
  SKILL_C_ATTACK_SPEED_FACTOR,
  SKILL_C_COOLDOWN_MS,
  SKILL_E_COOLDOWN_MS,
  SKILL_E_DAMAGE,
  SKILL_E_RANGE,
  SKILL_Q_COOLDOWN_MS,
  SKILL_Q_DAMAGE,
  SKILL_Q_RANGE,
  TANK_ATTACK_COOLDOWN_MS,
  TANK_ATTACK_DAMAGE,
  TANK_ATTACK_RANGE,
  TANK_C_AOE_DAMAGE,
  TANK_C_AOE_RADIUS,
  TANK_C_COOLDOWN_MS,
  TANK_C_STUN_DURATION_MS,
  TANK_E_COOLDOWN_MS,
  TANK_E_SHIELD,
  TANK_E_SHIELD_DURATION_MS,
  TANK_MAX_HP,
  TANK_Q_COOLDOWN_MS,
  TANK_Q_DAMAGE,
  TANK_Q_RANGE,
  TANK_Q_STUN_DURATION_MS,
  TANK_SPEED_3D,
} from '../constants.js';
import type { Unit, Team } from '../combat/Unit.js';
import { HealthBar } from '../combat/HealthBar.js';
import type { ProjectileKind } from './ProjectileManager.js';

/** How long after taking damage out-of-combat regeneration kicks in. */
const OOC_REGEN_DELAY_MS = 4000;

/**
 * Per-skill loadout. Lets `Game` cast Q/E/C uniformly without branching on
 * the hero kind — the hero packages its own ranges, cooldowns, projectile
 * kind and on-hit effect.
 */
export interface SkillConfig {
  /** Damage at the hero's current level. Read fresh per cast. */
  damage: number;
  /** Phys/magic/true. Defaults to physical if absent. */
  damageType?: import('../combat/Unit.js').DamageType;
  cooldownMs: number;
  range: number;
  projectileKind: ProjectileKind;
  effect?: {
    slow?: { factor: number; durationMs: number };
    stun?: { durationMs: number };
  };
  /** Optional explosion radius around the impact point. */
  aoeRadius?: number;
  /** Damage dealt to other enemies inside the AoE radius. */
  aoeDamage?: number;
  /** Self-cast skills detonate at the caster's feet — used by fighter
   *  vortex and tank earthquake. */
  selfCast?: boolean;
  /** Visual lifetime for self-cast effects. */
  selfCastDurationMs?: number;
  /** Execute mechanic — bonus damage when target is below the threshold. */
  executeHpThreshold?: number;
  executeBonus?: number;
  /** Piercing flag — projectile keeps flying through hits (Piercing Arrow). */
  pierces?: boolean;
  /** Taunt — forces enemies in the self-cast AoE to retarget the caster. */
  tauntDurationMs?: number;
  /**
   * Self-only buff bundle — used by the various buff/utility skills.
   * No projectile is fired when this is set; Game.tryUseSkill calls
   * PlayerObject.applySelfBuff and the player's stat getters pick up
   * the active buffs from there.
   */
  selfBuff?: {
    /** Instant heal applied on cast. */
    heal?: number;
    /** Movement speed multiplier (>1 to speed up) for `speedDurationMs`. */
    speedFactor?: number;
    speedDurationMs?: number;
    /** Auto-attack speed multiplier (>1 to fire faster) for the duration. */
    attackSpeedFactor?: number;
    attackSpeedDurationMs?: number;
    /** Outgoing damage multiplier (>1 to deal more) for the duration. */
    damageFactor?: number;
    damageDurationMs?: number;
    /** Hit-points of absorbing shield to add. Damages eat the shield first. */
    shieldHp?: number;
    shieldDurationMs?: number;
    /** Become invisible for the duration — enemies can't auto-target. */
    invisibilityMs?: number;
  };
  /**
   * Skill teleports the caster `range` units in the aimed direction and
   * deals AoE damage at the landing point. Used for the Shadowblade's
   * Shadow Dash. No projectile is fired; Game.tryUseSkill moves the
   * player and applies the AoE on arrival.
   */
  teleport?: boolean;
}

/**
 * Hero entity for the local player. Two archetypes ship today: the ranger
 * (Layla — bow + skillshots) and the mage (fireball + meteor AoE). The
 * archetype is fixed at construction; visual, stats, and skill loadout
 * branch on `heroKind` from there.
 *
 * The body is built so the weapon points along the local +Z axis, which
 * matches the rotation formula in update(): atan2(input.x, input.z).
 */
export class PlayerObject implements Unit {
  readonly kind = 'hero';
  readonly heroKind: HeroKind;
  readonly group = new THREE.Group();
  readonly facing = new THREE.Vector3(0, 0, 1);
  team: Team = 'blue';
  readonly radius = PLAYER_RADIUS;
  readonly xpReward = HERO_KILL_XP_REWARD;
  hp: number;
  alive = true;
  slowUntil = 0;
  stunnedUntil = 0;
  level = 1;
  xp = 0;

  private velocity = new THREE.Vector3();
  private readonly spawn: THREE.Vector3;
  private readonly healthBar = new HealthBar(2.4, 0.22, 0x44ff66, true, true);
  private readonly rangeRing: THREE.Mesh;
  // Outfit recolour points — set by setTeam() at runtime. Both heroes
  // expose the same two materials so the team-swap path stays generic.
  private cloakMat!: THREE.MeshLambertMaterial;
  private cloakLightMat!: THREE.MeshLambertMaterial;
  /** While now < attackLockUntil the hero stops moving (stand-still on shoot). */
  attackLockUntil = 0;
  private gaitPhase = 0;
  private leftLeg?: THREE.Object3D;
  private rightLeg?: THREE.Object3D;
  private leftArm?: THREE.Object3D;
  private rightArm?: THREE.Object3D;
  private bowGroup?: THREE.Object3D;
  private bodyRoot?: THREE.Object3D;
  private deathStartedAt = 0;

  // Counter-aggro stacks: every tower hit on the player adds one stack, up
  // to the cap. The bonus decays back to zero {@link PLAYER_TOWER_FOCUS_DECAY_MS}
  // ms after the most recent hit (all-or-nothing, not per-stack — once the
  // player escapes the tower for that long, the buff drops).
  private towerFocusStacks = 0;
  private towerFocusLastHitAt = 0;

  constructor(spawn: THREE.Vector3, heroKind: HeroKind = 'ranger') {
    this.heroKind = heroKind;
    this.spawn = spawn.clone();
    switch (heroKind) {
      case 'mage': this.buildMage(); break;
      case 'fighter': this.buildFighter(); break;
      case 'assassin': this.buildAssassin(); break;
      case 'tank': this.buildTank(); break;
      default: this.buildMia();
    }
    this.hp = this.maxHp;
    this.group.position.copy(spawn);
    this.healthBar.group.position.set(0, 3, 0);
    this.group.add(this.healthBar.group);
    this.refreshLevelBadge();
    this.healthBar.setHp(this.hp, this.maxHp);

    const range = this.attackRange;
    this.rangeRing = new THREE.Mesh(
      new THREE.RingGeometry(range - 0.35, range, 64),
      new THREE.MeshBasicMaterial({
        color: 0x9fd8ff,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.rangeRing.rotation.x = -Math.PI / 2;
    this.rangeRing.position.y = 0.04;
    this.rangeRing.visible = false;
    this.group.add(this.rangeRing);
  }

  setRangeVisible(visible: boolean): void {
    this.rangeRing.visible = visible && this.alive;
  }

  /** Swap the hero's team allegiance and recolor the cloak to match. */
  setTeam(team: Team): void {
    this.team = team;
    const palette = team === 'blue'
      ? { cloak: 0x1f4c8a, cloakLight: 0x3d7bc4 }
      : { cloak: 0x8a1f1f, cloakLight: 0xc44a4a };
    this.cloakMat.color.setHex(palette.cloak);
    this.cloakLightMat.color.setHex(palette.cloakLight);
  }

  billboardHealthBar(camera: THREE.Camera): void {
    // The bar is centered above the character in the rotated-phone
    // landscape view; local +Y is unaffected by player yaw.
    this.healthBar.group.position.set(0, 3, 0);
    this.healthBar.billboard(camera);
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  get maxHp(): number {
    let base: number;
    switch (this.heroKind) {
      case 'mage': base = MAGE_MAX_HP; break;
      case 'fighter': base = FIGHTER_MAX_HP; break;
      case 'assassin': base = ASSASSIN_MAX_HP; break;
      case 'tank': base = TANK_MAX_HP; break;
      default: base = PLAYER_MAX_HP;
    }
    return base + (this.level - 1) * HERO_HP_PER_LEVEL;
  }

  get attackDamage(): number {
    let base: number;
    switch (this.heroKind) {
      case 'mage': base = MAGE_ATTACK_DAMAGE; break;
      case 'fighter': base = FIGHTER_ATTACK_DAMAGE; break;
      case 'assassin': base = ASSASSIN_ATTACK_DAMAGE; break;
      case 'tank': base = TANK_ATTACK_DAMAGE; break;
      default: base = PLAYER_ATTACK_DAMAGE;
    }
    return base + (this.level - 1) * HERO_DAMAGE_PER_LEVEL;
  }

  get attackRange(): number {
    switch (this.heroKind) {
      case 'mage': return MAGE_ATTACK_RANGE;
      case 'fighter': return FIGHTER_ATTACK_RANGE;
      case 'assassin': return ASSASSIN_ATTACK_RANGE;
      case 'tank': return TANK_ATTACK_RANGE;
      default: return PLAYER_ATTACK_RANGE;
    }
  }

  get attackCooldownMs(): number {
    let base: number;
    switch (this.heroKind) {
      case 'mage': base = MAGE_ATTACK_COOLDOWN_MS; break;
      case 'fighter': base = FIGHTER_ATTACK_COOLDOWN_MS; break;
      case 'assassin': base = ASSASSIN_ATTACK_COOLDOWN_MS; break;
      case 'tank': base = TANK_ATTACK_COOLDOWN_MS; break;
      default: base = PLAYER_ATTACK_COOLDOWN_MS;
    }
    if (performance.now() < this.attackSpeedBuffUntil) {
      // Higher factor = faster autos = lower cooldown.
      return base / this.attackSpeedBuffFactor;
    }
    return base;
  }

  /** Move-speed buff timestamp + multiplier. */
  speedBuffUntil = 0;
  speedBuffFactor = 1;
  /** Auto-attack speed buff (Focus Mode). */
  attackSpeedBuffUntil = 0;
  attackSpeedBuffFactor = 1;
  /** Outgoing-damage buff (Rage Mode). Stacks on top of the tower-focus
   *  multiplier so a chain-dive into a Rage cast hits like a truck. */
  damageBuffUntil = 0;
  damageBuffFactor = 1;
  /** Absorbing shield (Iron Wall). Eaten before HP. */
  shieldHp = 0;
  shieldUntil = 0;
  /** Invisibility window (Shadowblade's C). Used by AI to skip targeting. */
  invisibleUntil = 0;
  /** Last time the hero took damage. Drives the out-of-combat HP regen
   *  window — when more than {@link OOC_REGEN_DELAY_MS} has passed since
   *  the last hit, HP refills passively. */
  private lastHurtAt = 0;

  get speed3D(): number {
    let base: number;
    switch (this.heroKind) {
      case 'mage': base = MAGE_SPEED_3D; break;
      case 'fighter': base = FIGHTER_SPEED_3D; break;
      case 'assassin': base = ASSASSIN_SPEED_3D; break;
      case 'tank': base = TANK_SPEED_3D; break;
      default: base = PLAYER_SPEED_3D;
    }
    if (performance.now() < this.speedBuffUntil) return base * this.speedBuffFactor;
    return base;
  }

  /** Physical damage reduction (0..1). Tanks/fighters take noticeably less
   *  physical hits than squishies. */
  get physicalDef(): number {
    switch (this.heroKind) {
      case 'tank': return 0.4;
      case 'fighter': return 0.2;
      case 'ranger':
      case 'assassin':
        return 0.1;
      default: return 0.05;
    }
  }

  /** Magic damage reduction (0..1). The mage shrugs spells off; the tank
   *  is still pretty resistant; physical-class heroes mostly just eat them. */
  get magicalDef(): number {
    switch (this.heroKind) {
      case 'tank': return 0.3;
      case 'fighter': return 0.15;
      case 'mage': return 0.1;
      default: return 0.05;
    }
  }

  /** Auto-attack damage type. Arcanist hits with magic, the rest physical. */
  get autoAttackDamageType(): import('../combat/Unit.js').DamageType {
    return this.heroKind === 'mage' ? 'magic' : 'physical';
  }

  /** Auto-attack projectile cosmetic per archetype. */
  get autoAttackKind(): ProjectileKind {
    switch (this.heroKind) {
      case 'mage': return 'firebolt';
      case 'fighter': return 'blade';
      case 'assassin': return 'dagger';
      case 'tank': return 'hammer';
      default: return 'basic';
    }
  }

  /**
   * Apply a self-buff bundle (subset of fields used per skill). Each field
   * is independent — Iron Wall sets shieldHp, Focus Mode sets attackSpeed,
   * Rage Mode sets damage, Invisibility sets invisibleUntil. All durations
   * are absolute deadlines stored on the player so getters can cheaply
   * check `now < <field>Until`.
   */
  applySelfBuff(buff: NonNullable<SkillConfig['selfBuff']>, now: number): void {
    if (buff.heal && buff.heal > 0) this.heal(buff.heal);
    if (buff.speedFactor && buff.speedFactor > 1 && buff.speedDurationMs) {
      this.speedBuffFactor = buff.speedFactor;
      this.speedBuffUntil = now + buff.speedDurationMs;
    }
    if (buff.attackSpeedFactor && buff.attackSpeedFactor > 1 && buff.attackSpeedDurationMs) {
      this.attackSpeedBuffFactor = buff.attackSpeedFactor;
      this.attackSpeedBuffUntil = now + buff.attackSpeedDurationMs;
    }
    if (buff.damageFactor && buff.damageFactor > 1 && buff.damageDurationMs) {
      this.damageBuffFactor = buff.damageFactor;
      this.damageBuffUntil = now + buff.damageDurationMs;
    }
    if (buff.shieldHp && buff.shieldHp > 0) {
      // Iron Wall stacks — recasting adds to current shield up to a hard
      // cap so spam doesn't make the bulwark unkillable.
      const cap = buff.shieldHp * 2;
      this.shieldHp = Math.min(cap, this.shieldHp + buff.shieldHp);
      this.shieldUntil = now + (buff.shieldDurationMs ?? 6000);
    }
    if (buff.invisibilityMs && buff.invisibilityMs > 0) {
      this.invisibleUntil = now + buff.invisibilityMs;
      // Visual: dim the body group while invisible. takeDamage breaks
      // invis early but leaves the dim until next frame paints.
      this.group.visible = false;
    }
  }

  /** Q skill loadout — fresh per cast (damage scales with level). */
  get skillQ(): SkillConfig {
    const lvl = this.level - 1;
    switch (this.heroKind) {
      case 'mage':
        // Arcanist — Arcane Burst (300 + AoE on impact). Magic damage.
        return {
          damage: MAGE_Q_DAMAGE + lvl * HERO_DAMAGE_PER_LEVEL * 1.5,
          damageType: 'magic',
          cooldownMs: MAGE_Q_COOLDOWN_MS,
          range: MAGE_Q_RANGE,
          projectileKind: 'fireball',
          aoeRadius: 2.4,
          aoeDamage: 120 + lvl * Math.round(HERO_DAMAGE_PER_LEVEL * 0.5),
        };
      case 'fighter':
        // Warlord — Power Strike (220, single target, light slow).
        return {
          damage: FIGHTER_Q_DAMAGE + lvl * HERO_DAMAGE_PER_LEVEL * 1.4,
          cooldownMs: FIGHTER_Q_COOLDOWN_MS,
          range: FIGHTER_Q_RANGE,
          projectileKind: 'blade',
          effect: { slow: { factor: FIGHTER_Q_SLOW_FACTOR, durationMs: FIGHTER_Q_SLOW_DURATION_MS } },
        };
      case 'assassin':
        // Shadowblade — Shadow Dash. Teleport in the aim direction +
        // landing AoE. Implemented in Game.tryUseSkill via the teleport
        // flag; the projectileKind is just the cosmetic for the burst.
        return {
          damage: ASSASSIN_Q_DAMAGE + lvl * HERO_DAMAGE_PER_LEVEL * 1.4,
          cooldownMs: ASSASSIN_Q_COOLDOWN_MS,
          range: ASSASSIN_Q_RANGE,
          projectileKind: 'shadow',
          teleport: true,
          aoeRadius: ASSASSIN_Q_AOE_RADIUS,
          aoeDamage: 100 + lvl * Math.round(HERO_DAMAGE_PER_LEVEL * 0.4),
        };
      case 'tank':
        // Bulwark — Shield Slam: stuns AND slows the target for 2.5s
        // after the stun wears off. Pillar of the bulwark's "stick on
        // the carry" identity.
        return {
          damage: TANK_Q_DAMAGE + lvl * HERO_DAMAGE_PER_LEVEL,
          cooldownMs: TANK_Q_COOLDOWN_MS,
          range: TANK_Q_RANGE,
          projectileKind: 'hammer',
          effect: {
            stun: { durationMs: TANK_Q_STUN_DURATION_MS },
            slow: { factor: 0.6, durationMs: 2500 },
          },
        };
      default:
        // Arcshooter — Rapid Fire (single fat 360-damage burst that
        // represents the 3×120 lore-shot).
        return {
          damage: SKILL_Q_DAMAGE + lvl * HERO_DAMAGE_PER_LEVEL * 1.6,
          cooldownMs: SKILL_Q_COOLDOWN_MS,
          range: SKILL_Q_RANGE,
          projectileKind: 'heavy',
        };
    }
  }

  get skillE(): SkillConfig {
    const lvl = this.level - 1;
    switch (this.heroKind) {
      case 'mage':
        // Arcanist — Magic Trap (slow + small AoE). Magic damage.
        return {
          damage: MAGE_E_DAMAGE + lvl * Math.round(HERO_DAMAGE_PER_LEVEL * 0.6),
          damageType: 'magic',
          cooldownMs: MAGE_E_COOLDOWN_MS,
          range: MAGE_E_RANGE,
          projectileKind: 'flamewave',
          effect: { slow: { factor: MAGE_E_SLOW_FACTOR, durationMs: MAGE_E_SLOW_DURATION_MS } },
          aoeRadius: 2.8,
          aoeDamage: 80 + lvl * Math.round(HERO_DAMAGE_PER_LEVEL * 0.3),
        };
      case 'fighter':
        // Warlord — Rage Mode (self-buff: +30% outgoing damage 5s).
        return {
          damage: 0,
          cooldownMs: FIGHTER_E_COOLDOWN_MS,
          range: 0,
          projectileKind: 'basic',
          selfBuff: {
            damageFactor: 1 + FIGHTER_E_DAMAGE_BONUS,
            damageDurationMs: FIGHTER_E_BUFF_DURATION_MS,
          },
        };
      case 'assassin':
        // Shadowblade — Backstab (heavy single target).
        return {
          damage: ASSASSIN_E_DAMAGE + lvl * HERO_DAMAGE_PER_LEVEL * 1.5,
          cooldownMs: ASSASSIN_E_COOLDOWN_MS,
          range: ASSASSIN_E_RANGE,
          projectileKind: 'dagger',
        };
      case 'tank':
        // Bulwark — Iron Wall (600 HP shield, 6s).
        return {
          damage: 0,
          cooldownMs: TANK_E_COOLDOWN_MS,
          range: 0,
          projectileKind: 'basic',
          selfBuff: {
            shieldHp: TANK_E_SHIELD + lvl * 60,
            shieldDurationMs: TANK_E_SHIELD_DURATION_MS,
          },
        };
      default:
        // Arcshooter — Piercing Arrow. Long-range arrow that passes
        // through every enemy on its path.
        return {
          damage: SKILL_E_DAMAGE + lvl * HERO_DAMAGE_PER_LEVEL * 1.2,
          cooldownMs: SKILL_E_COOLDOWN_MS,
          range: SKILL_E_RANGE,
          projectileKind: 'heavy',
          pierces: true,
        };
    }
  }

  get skillC(): SkillConfig {
    const lvl = this.level - 1;
    switch (this.heroKind) {
      case 'mage':
        // Arcanist — Meteor Call (huge ult). Magic damage.
        return {
          damage: MAGE_C_DAMAGE + lvl * HERO_DAMAGE_PER_LEVEL * 1.5,
          damageType: 'magic',
          cooldownMs: MAGE_C_COOLDOWN_MS,
          range: MAGE_C_RANGE,
          projectileKind: 'meteor',
          effect: { stun: { durationMs: MAGE_C_STUN_DURATION_MS } },
          aoeRadius: MAGE_C_AOE_RADIUS,
          aoeDamage: MAGE_C_AOE_DAMAGE + lvl * HERO_DAMAGE_PER_LEVEL,
        };
      case 'fighter':
        // Warlord — Spin Attack (vortex AoE).
        return {
          damage: 0,
          cooldownMs: FIGHTER_C_COOLDOWN_MS,
          range: 0,
          projectileKind: 'vortex',
          selfCast: true,
          selfCastDurationMs: 700,
          aoeRadius: FIGHTER_C_AOE_RADIUS,
          aoeDamage: FIGHTER_C_AOE_DAMAGE + lvl * HERO_DAMAGE_PER_LEVEL,
          effect: { stun: { durationMs: FIGHTER_C_STUN_DURATION_MS } },
        };
      case 'assassin':
        // Shadowblade — Invisibility (utility, no damage).
        return {
          damage: 0,
          cooldownMs: ASSASSIN_C_COOLDOWN_MS,
          range: 0,
          projectileKind: 'basic',
          selfBuff: { invisibilityMs: ASSASSIN_C_INVIS_MS },
        };
      case 'tank':
        // Bulwark — Taunt: real aggro pull. Caught enemies are stunned
        // briefly AND forced to retarget the bulwark for the next 3s
        // via ProjectileManager.detonateSelfCast. Damage is small, the
        // value is the pull.
        return {
          damage: 0,
          cooldownMs: TANK_C_COOLDOWN_MS,
          range: 0,
          projectileKind: 'quake',
          selfCast: true,
          selfCastDurationMs: 800,
          aoeRadius: TANK_C_AOE_RADIUS,
          aoeDamage: TANK_C_AOE_DAMAGE + lvl * Math.round(HERO_DAMAGE_PER_LEVEL * 0.4),
          effect: { stun: { durationMs: TANK_C_STUN_DURATION_MS } },
          tauntDurationMs: 3000,
        };
      default:
        // Arcshooter — Focus Mode (self-buff: attack speed +40% 4s).
        return {
          damage: 0,
          cooldownMs: SKILL_C_COOLDOWN_MS,
          range: 0,
          projectileKind: 'basic',
          selfBuff: {
            attackSpeedFactor: SKILL_C_ATTACK_SPEED_FACTOR,
            attackSpeedDurationMs: SKILL_C_ATTACK_SPEED_DURATION_MS,
          },
        };
    }
  }

  /** Called by Game whenever a tower projectile lands on the player. */
  notifyTowerHit(now: number): void {
    if (now - this.towerFocusLastHitAt > PLAYER_TOWER_FOCUS_DECAY_MS) {
      this.towerFocusStacks = 0;
    }
    this.towerFocusStacks = Math.min(PLAYER_TOWER_FOCUS_STACK_CAP, this.towerFocusStacks + 1);
    this.towerFocusLastHitAt = now;
  }

  /** Active stack count after applying the decay window. */
  getTowerFocusStacks(now = performance.now()): number {
    if (now - this.towerFocusLastHitAt > PLAYER_TOWER_FOCUS_DECAY_MS) return 0;
    return this.towerFocusStacks;
  }

  /** Multiply outgoing damage (autos + skills) by this at fire-time.
   *  Tower-focus stacks AND any active Rage damage buff both compose. */
  outgoingDamageMultiplier(now = performance.now()): number {
    let mult = 1 + this.getTowerFocusStacks(now) * PLAYER_TOWER_FOCUS_STACK_BONUS;
    if (now < this.damageBuffUntil) mult *= this.damageBuffFactor;
    return mult;
  }

  update(input: { x: number; z: number }, deltaSec: number, now: number): void {
    if (!this.alive) {
      this.tickDeath(now);
      return;
    }
    // Restore visibility when the invis buff expires.
    if (this.invisibleUntil !== 0 && now >= this.invisibleUntil) {
      this.invisibleUntil = 0;
      this.group.visible = true;
    }
    // Drop the shield value once the buff window closes.
    if (this.shieldHp > 0 && now >= this.shieldUntil) this.shieldHp = 0;

    // Out-of-combat HP regeneration. Once the hero has gone
    // OOC_REGEN_DELAY_MS without taking damage, regen ~3.5% max HP per
    // second (4.5% for tanks who naturally trade DPS for sustain).
    if (this.hp < this.maxHp && now - this.lastHurtAt >= OOC_REGEN_DELAY_MS) {
      const fracPerSec = this.heroKind === 'tank' ? 0.045 : 0.035;
      this.heal(this.maxHp * fracPerSec * deltaSec);
    }
    if (this.stunnedUntil > now) {
      this.velocity.set(0, 0, 0);
      this.animateGait(0, deltaSec, now);
      return;
    }
    // Lock movement during the attack windup so the shot reads as committed.
    const attacking = now < this.attackLockUntil;
    const baseSpeed = this.speed3D;
    const speed = this.slowUntil > now ? baseSpeed * 0.5 : baseSpeed;
    const len = Math.hypot(input.x, input.z);
    let targetVx = 0;
    let targetVz = 0;
    if (!attacking && len > 0) {
      const nx = input.x / len;
      const nz = input.z / len;
      targetVx = nx * speed;
      targetVz = nz * speed;
      this.group.rotation.y = Math.atan2(nx, nz);
      this.facing.set(nx, 0, nz);
    }
    // Smooth velocity ramp — accel ~24 u/s² gives a snappy but non-jittery feel.
    const accel = attacking ? 40 : 22;
    const k = Math.min(1, deltaSec * accel * 0.25);
    this.velocity.x += (targetVx - this.velocity.x) * k;
    this.velocity.z += (targetVz - this.velocity.z) * k;
    this.group.position.x += this.velocity.x * deltaSec;
    this.group.position.z += this.velocity.z * deltaSec;
    const moveSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.animateGait(moveSpeed, deltaSec, now);
  }

  /** Triggered by Game when the player fires. Locks movement for a moment and
   *  yanks the bow into a draw pose for that window. */
  triggerAttackPose(now: number): void {
    this.attackLockUntil = now + 220;
  }

  private idlePhase = 0;
  private animateGait(speed: number, deltaSec: number, now: number): void {
    const drawing = now < this.attackLockUntil;
    const k = Math.min(1, deltaSec * 14);
    const lerp = (a: number, b: number) => a + (b - a) * k;
    // Idle bob — small vertical wobble when not moving / casting.
    // Reset when running so it doesn't stack with the gait animation.
    if (!drawing && speed < 0.3) {
      this.idlePhase += deltaSec * 2.4;
      if (this.bodyRoot) this.bodyRoot.position.y = Math.sin(this.idlePhase) * 0.05;
    } else if (this.bodyRoot) {
      this.bodyRoot.position.y = lerp(this.bodyRoot.position.y, 0);
    }
    if (drawing) {
      // Time within the 220ms windup, normalised 0..1.
      const t = 1 - (this.attackLockUntil - now) / 220;
      // Bow draw: front arm forward (raises bow), back arm pulls string back.
      const drawAmount = Math.sin(Math.min(1, t) * Math.PI); // 0→1→0
      if (this.leftArm) this.leftArm.rotation.x = lerp(this.leftArm.rotation.x, -0.7 - drawAmount * 0.25);
      if (this.rightArm) this.rightArm.rotation.x = lerp(this.rightArm.rotation.x, -0.4 - drawAmount * 0.7);
      if (this.leftLeg) this.leftLeg.rotation.x = lerp(this.leftLeg.rotation.x, -0.18);
      if (this.rightLeg) this.rightLeg.rotation.x = lerp(this.rightLeg.rotation.x, 0.18);
      // Forward lean of the torso/head while drawing the string.
      if (this.bodyRoot) this.bodyRoot.rotation.x = lerp(this.bodyRoot.rotation.x, 0.18);
      if (this.bowGroup) this.bowGroup.scale.x = lerp(this.bowGroup.scale.x, 1.05 + drawAmount * 0.15);
      return;
    }
    if (this.bodyRoot) this.bodyRoot.rotation.x = lerp(this.bodyRoot.rotation.x, 0);
    if (this.bowGroup) this.bowGroup.scale.x = lerp(this.bowGroup.scale.x, 1);
    if (speed > 0.3) {
      this.gaitPhase += deltaSec * (5 + speed * 0.4);
      const swing = Math.sin(this.gaitPhase) * 0.7;
      if (this.leftLeg) this.leftLeg.rotation.x = swing;
      if (this.rightLeg) this.rightLeg.rotation.x = -swing;
      if (this.leftArm) this.leftArm.rotation.x = -swing * 0.6;
      if (this.rightArm) this.rightArm.rotation.x = swing * 0.6;
    } else {
      if (this.leftLeg) this.leftLeg.rotation.x = lerp(this.leftLeg.rotation.x, 0);
      if (this.rightLeg) this.rightLeg.rotation.x = lerp(this.rightLeg.rotation.x, 0);
      if (this.leftArm) this.leftArm.rotation.x = lerp(this.leftArm.rotation.x, 0);
      if (this.rightArm) this.rightArm.rotation.x = lerp(this.rightArm.rotation.x, 0);
    }
  }

  faceTarget(target: THREE.Vector3): void {
    const dx = target.x - this.group.position.x;
    const dz = target.z - this.group.position.z;
    if (dx === 0 && dz === 0) return;
    this.group.rotation.y = Math.atan2(dx, dz);
    const len = Math.hypot(dx, dz);
    this.facing.set(dx / len, 0, dz / len);
  }

  faceDirection(dirX: number, dirZ: number): void {
    const len = Math.hypot(dirX, dirZ);
    if (len < 1e-4) return;
    const nx = dirX / len;
    const nz = dirZ / len;
    this.group.rotation.y = Math.atan2(nx, nz);
    this.facing.set(nx, 0, nz);
  }

  takeDamage(amount: number): void {
    if (!this.alive) return;
    let remaining = amount;
    // Shield (Iron Wall) absorbs first. The shield expires by timer too —
    // checking inline keeps the cleanup cheap.
    const now = performance.now();
    this.lastHurtAt = now;
    if (this.shieldHp > 0 && now < this.shieldUntil) {
      const absorbed = Math.min(this.shieldHp, remaining);
      this.shieldHp -= absorbed;
      remaining -= absorbed;
    } else if (this.shieldHp > 0) {
      // Expired — drop the shield value.
      this.shieldHp = 0;
    }
    if (remaining > 0) this.hp = Math.max(0, this.hp - remaining);
    this.healthBar.setRatio(this.hp / this.maxHp);
    this.healthBar.setHp(this.hp, this.maxHp);
    // Taking damage breaks invisibility — same convention as MOBA invis.
    if (this.invisibleUntil > now) {
      this.invisibleUntil = 0;
      this.group.visible = true;
    }
    if (this.hp <= 0) this.die();
  }

  heal(amount: number): void {
    if (!this.alive || amount <= 0 || this.hp >= this.maxHp) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.healthBar.setRatio(this.hp / this.maxHp);
    this.healthBar.setHp(this.hp, this.maxHp);
  }

  grantXp(amount: number): void {
    if (this.level >= HERO_MAX_LEVEL || amount <= 0) return;
    this.xp += amount;
    while (this.level < HERO_MAX_LEVEL && this.xp >= this.xpToNext()) {
      this.xp -= this.xpToNext();
      const oldMaxHp = this.maxHp;
      this.level += 1;
      const hpGain = this.maxHp - oldMaxHp;
      this.hp = Math.min(this.maxHp, this.hp + hpGain);
      this.healthBar.setRatio(this.hp / this.maxHp);
      this.healthBar.setHp(this.hp, this.maxHp);
    }
    if (this.level >= HERO_MAX_LEVEL) this.xp = 0;
    this.refreshLevelBadge();
  }

  private die(): void {
    this.alive = false;
    this.deathStartedAt = performance.now();
    // Body falls but stays visible — respawn() resets the pose.
  }

  /** Animate the corpse: slump backward over ~700ms and stay flat on the ground. */
  private tickDeath(now: number): void {
    if (!this.deathStartedAt) {
      this.group.rotation.x = -Math.PI / 2;
      this.group.position.y = 0;
      return;
    }
    const t = Math.min(1, (now - this.deathStartedAt) / 700);
    // Ease-in fall.
    const eased = t * t;
    this.group.rotation.x = -Math.PI / 2 * eased;
    this.group.position.y = -0.4 * eased;
    // Hide healthbar after the body has dropped.
    this.healthBar.group.visible = t < 0.85;
  }

  respawn(): void {
    this.hp = this.maxHp;
    this.alive = true;
    this.slowUntil = 0;
    this.stunnedUntil = 0;
    this.deathStartedAt = 0;
    this.group.position.copy(this.spawn);
    this.group.position.y = 0;
    this.group.rotation.x = 0;
    this.group.visible = true;
    this.healthBar.group.visible = true;
    this.velocity.set(0, 0, 0);
    this.healthBar.setRatio(1);
    this.healthBar.setHp(this.hp, this.maxHp);
  }

  applyServerState(state: {
    x: number;
    z: number;
    facingX: number;
    facingZ: number;
    hp: number;
    maxHp: number;
    level: number;
    xp: number;
    xpToNext: number;
    alive: boolean;
  }): void {
    this.group.position.set(state.x, 0, state.z);
    this.hp = state.hp;
    this.level = state.level;
    this.xp = state.xp;
    this.alive = state.alive;
    this.group.visible = state.alive;
    if (Math.hypot(state.facingX, state.facingZ) > 0.01) {
      this.group.rotation.y = Math.atan2(state.facingX, state.facingZ);
      this.facing.set(state.facingX, 0, state.facingZ);
    }
    this.healthBar.setRatio(state.maxHp > 0 ? state.hp / state.maxHp : 0);
    this.healthBar.setHp(state.hp, state.maxHp);
    this.healthBar.setLevel(state.level, state.xpToNext > 0 ? state.xp / state.xpToNext : 1);
  }

  private xpToNext(): number {
    return Math.round(HERO_BASE_XP_TO_LEVEL * HERO_XP_LEVEL_GROWTH ** (this.level - 1));
  }

  private refreshLevelBadge(): void {
    const progress = this.level >= HERO_MAX_LEVEL ? 1 : this.xp / this.xpToNext();
    this.healthBar.setLevel(this.level, progress);
  }

  /**
   * Mia-inspired archer build. The mesh is a stack of primitives, but the
   * proportions are deliberate: short narrow torso, slim limbs, fitted top
   * and short skirt, long ponytail, ornate recurve bow held at the side.
   *
   * Materials live in field properties (cloakMat / cloakLightMat) so setTeam()
   * can recolour the outfit at runtime for the red side.
   */
  private buildMia(): void {
    // Palette — soft pale skin + dark navy outfit + silver-blonde hair.
    const skin = new THREE.MeshLambertMaterial({ color: 0xfadcc1 });
    const cloak = new THREE.MeshLambertMaterial({ color: 0x1f4c8a });
    const cloakLight = new THREE.MeshLambertMaterial({ color: 0x3d7bc4 });
    this.cloakMat = cloak;
    this.cloakLightMat = cloakLight;
    const tights = new THREE.MeshLambertMaterial({ color: 0x141927 });
    const trim = new THREE.MeshLambertMaterial({
      color: 0xf2cf5a,
    });
    const hair = new THREE.MeshLambertMaterial({ color: 0xeef2f7 });
    const hairAccent = new THREE.MeshLambertMaterial({ color: 0xc7d4e6 });
    const bootMat = new THREE.MeshLambertMaterial({ color: 0x281b14 });
    const bowMat = new THREE.MeshLambertMaterial({
      color: 0x2a2a36,
    });
    const bowAccent = new THREE.MeshLambertMaterial({
      color: 0xe6b450,
    });
    const stringMat = new THREE.MeshLambertMaterial({ color: 0xf4ead5 });

    // Body root — the parent of everything except the healthbar. Death animation
    // tilts the WHOLE Player group, so building under a body root keeps the
    // pivot for the camera and FX consistent.
    const body = new THREE.Group();
    this.group.add(body);
    this.bodyRoot = body;

    // Slim legs (tights), hip pivots so the gait swing reads.
    const thighGeom = new THREE.CylinderGeometry(0.13, 0.12, 0.65, 10);
    thighGeom.translate(0, -0.32, 0);
    const calfGeom = new THREE.CylinderGeometry(0.11, 0.09, 0.55, 10);
    calfGeom.translate(0, -0.28, 0);
    for (const side of [-1, 1] as const) {
      const hip = new THREE.Group();
      hip.position.set(0.16 * side, 0.95, 0);
      const thigh = new THREE.Mesh(thighGeom, tights);
      thigh.castShadow = false;
      hip.add(thigh);
      const calf = new THREE.Mesh(calfGeom, tights);
      calf.position.y = -0.62;
      calf.castShadow = false;
      hip.add(calf);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.34), bootMat);
      boot.position.set(0, -1.12, 0.05);
      boot.castShadow = false;
      hip.add(boot);
      body.add(hip);
      if (side < 0) this.leftLeg = hip;
      else this.rightLeg = hip;
    }

    // Skirt — short tiered piece sitting on the hips.
    const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.34, 18), cloak);
    skirt.position.y = 1.05;
    skirt.castShadow = false;
    body.add(skirt);
    const skirtTrim = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.025, 8, 24), trim);
    skirtTrim.rotation.x = Math.PI / 2;
    skirtTrim.position.y = 0.92;
    body.add(skirtTrim);

    // Belt — gold ring at waist.
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 8, 22), trim);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 1.28;
    body.add(belt);

    // Slim torso (narrow at waist, slightly wider at chest).
    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.32, 0.42, 6, 12),
      cloakLight,
    );
    torso.position.y = 1.58;
    torso.castShadow = false;
    body.add(torso);

    // Decorative chest strap (cross-belt) — narrow gold band.
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.025, 6, 18), trim);
    strap.rotation.set(Math.PI / 2, 0, Math.PI / 5);
    strap.position.set(0, 1.7, 0.02);
    body.add(strap);

    // Arms — slim, pivot at shoulder. Right hand will hold the bow.
    const upperArmGeom = new THREE.CylinderGeometry(0.085, 0.075, 0.45, 10);
    upperArmGeom.translate(0, -0.22, 0);
    const forearmGeom = new THREE.CylinderGeometry(0.075, 0.065, 0.42, 10);
    forearmGeom.translate(0, -0.21, 0);
    for (const side of [-1, 1] as const) {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.36 * side, 1.78, 0);
      const upper = new THREE.Mesh(upperArmGeom, skin);
      upper.castShadow = false;
      shoulder.add(upper);
      const forearm = new THREE.Mesh(forearmGeom, skin);
      forearm.position.y = -0.42;
      forearm.castShadow = false;
      shoulder.add(forearm);
      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), tights);
      glove.position.y = -0.78;
      shoulder.add(glove);
      body.add(shoulder);
      if (side < 0) this.leftArm = shoulder;
      else this.rightArm = shoulder;
    }

    // Head + face hint.
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 16), skin);
    head.position.y = 2.12;
    head.castShadow = false;
    body.add(head);
    // Simple eye dots — a tiny touch but reads as a face from far away.
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x202434 });
    for (const ex of [-0.08, 0.08]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.024, 6, 6), eyeMat);
      eye.position.set(ex, 2.13, 0.24);
      body.add(eye);
    }

    // Hood/skull cap on top of head.
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.29, 16, 16), hair);
    cap.position.y = 2.16;
    cap.scale.set(1, 0.9, 1);
    cap.castShadow = false;
    body.add(cap);

    // Side bangs — two small wedges in front of the ears.
    const bangGeom = new THREE.ConeGeometry(0.09, 0.32, 6);
    for (const side of [-1, 1]) {
      const bang = new THREE.Mesh(bangGeom, hair);
      bang.position.set(0.18 * side, 2.0, 0.12);
      bang.rotation.z = side * 0.3;
      body.add(bang);
    }

    // Long flowing ponytail behind the head — chain of cones from cap to waist.
    const tailRoot = new THREE.Group();
    tailRoot.position.set(0, 2.05, -0.18);
    tailRoot.rotation.x = 0.35;
    const tailLayers = [
      { y: 0, r: 0.16, h: 0.42, mat: hair },
      { y: -0.32, r: 0.13, h: 0.45, mat: hair },
      { y: -0.66, r: 0.10, h: 0.45, mat: hair },
      { y: -0.95, r: 0.07, h: 0.4, mat: hairAccent },
    ];
    for (const layer of tailLayers) {
      const seg = new THREE.Mesh(
        new THREE.ConeGeometry(layer.r, layer.h, 8),
        layer.mat,
      );
      seg.position.y = layer.y;
      seg.rotation.x = Math.PI;
      seg.castShadow = false;
      tailRoot.add(seg);
    }
    body.add(tailRoot);

    // Bow — bigger and more recurve than the previous one.
    const bow = buildRecurveBow(bowMat, bowAccent, stringMat);
    bow.position.set(0.5, 1.5, 0.34);
    bow.rotation.z = -Math.PI / 14;
    body.add(bow);
    this.bowGroup = bow;
  }

  /**
   * Fire mage build. Hooded robe, glowing staff with an ember orb. Same
   * skeleton as the ranger so the existing gait/draw animations keep working
   * — only the silhouette and the held weapon differ. Materials cloakMat /
   * cloakLightMat are still the recolour points used by setTeam().
   */
  private buildMage(): void {
    // Palette — pale skin, deep crimson robe with ember-gold trim, dark
    // hood. Setting cloak/cloakLight here keeps setTeam() universal.
    const skin = new THREE.MeshLambertMaterial({ color: 0xf2d3b3 });
    const cloak = new THREE.MeshLambertMaterial({ color: 0x4a1727 });
    const cloakLight = new THREE.MeshLambertMaterial({ color: 0x7a2535 });
    this.cloakMat = cloak;
    this.cloakLightMat = cloakLight;
    const robeUnder = new THREE.MeshLambertMaterial({ color: 0x1a1224 });
    const trim = new THREE.MeshLambertMaterial({ color: 0xf3b75a });
    const hood = new THREE.MeshLambertMaterial({ color: 0x230910 });
    const bootMat = new THREE.MeshLambertMaterial({ color: 0x261410 });
    const staffMat = new THREE.MeshLambertMaterial({ color: 0x2a1d18 });
    const emberMat = new THREE.MeshLambertMaterial({
      color: 0xffb240,
      emissive: 0xff5520,
      emissiveIntensity: 1.6,
    });
    const emberGlow = new THREE.MeshBasicMaterial({
      color: 0xff7a2a,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });

    const body = new THREE.Group();
    this.group.add(body);
    this.bodyRoot = body;

    // Legs — robe-covered, slightly chunkier than ranger so the silhouette
    // reads as "robed mage" not "archer in tights".
    const thighGeom = new THREE.CylinderGeometry(0.15, 0.14, 0.62, 10);
    thighGeom.translate(0, -0.31, 0);
    const calfGeom = new THREE.CylinderGeometry(0.13, 0.11, 0.55, 10);
    calfGeom.translate(0, -0.28, 0);
    for (const side of [-1, 1] as const) {
      const hip = new THREE.Group();
      hip.position.set(0.17 * side, 0.95, 0);
      const thigh = new THREE.Mesh(thighGeom, robeUnder);
      hip.add(thigh);
      const calf = new THREE.Mesh(calfGeom, robeUnder);
      calf.position.y = -0.62;
      hip.add(calf);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.36), bootMat);
      boot.position.set(0, -1.12, 0.05);
      hip.add(boot);
      body.add(hip);
      if (side < 0) this.leftLeg = hip;
      else this.rightLeg = hip;
    }

    // Long robe skirt — taller and wider than the archer's short skirt.
    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.95, 18), cloak);
    robe.position.y = 0.85;
    body.add(robe);
    // Lower hem trim — gold ring at the bottom of the robe.
    const hem = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.03, 8, 28), trim);
    hem.rotation.x = Math.PI / 2;
    hem.position.y = 0.42;
    body.add(hem);
    // Belt with gold buckle.
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.06, 8, 22), trim);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 1.32;
    body.add(belt);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.06), trim);
    buckle.position.set(0, 1.32, 0.36);
    body.add(buckle);

    // Torso — capsule, draped in cloak.
    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.36, 0.46, 6, 12),
      cloakLight,
    );
    torso.position.y = 1.62;
    body.add(torso);
    // Inner robe strip (front) — accent so the cloak reads as layered.
    const accentStrip = new THREE.Mesh(
      new THREE.PlaneGeometry(0.18, 0.6),
      trim,
    );
    accentStrip.position.set(0, 1.55, 0.37);
    body.add(accentStrip);

    // Arms with wide robe sleeves.
    const upperArmGeom = new THREE.CylinderGeometry(0.11, 0.13, 0.5, 10);
    upperArmGeom.translate(0, -0.25, 0);
    const forearmGeom = new THREE.CylinderGeometry(0.09, 0.075, 0.42, 10);
    forearmGeom.translate(0, -0.21, 0);
    for (const side of [-1, 1] as const) {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.4 * side, 1.85, 0);
      const upper = new THREE.Mesh(upperArmGeom, cloak);
      shoulder.add(upper);
      const sleeveTrim = new THREE.Mesh(
        new THREE.TorusGeometry(0.13, 0.018, 6, 16),
        trim,
      );
      sleeveTrim.rotation.x = Math.PI / 2;
      sleeveTrim.position.y = -0.5;
      shoulder.add(sleeveTrim);
      const forearm = new THREE.Mesh(forearmGeom, skin);
      forearm.position.y = -0.5;
      shoulder.add(forearm);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), skin);
      hand.position.y = -0.92;
      shoulder.add(hand);
      body.add(shoulder);
      if (side < 0) this.leftArm = shoulder;
      else this.rightArm = shoulder;
    }

    // Head — partly hidden by hood.
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 16), skin);
    head.position.y = 2.18;
    body.add(head);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff8a3a });
    for (const ex of [-0.08, 0.08]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.026, 6, 6), eyeMat);
      eye.position.set(ex, 2.18, 0.24);
      body.add(eye);
    }

    // Hood — large cone over and behind the head.
    const hoodMesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 0.72, 14),
      hood,
    );
    hoodMesh.position.set(0, 2.36, -0.06);
    hoodMesh.rotation.x = -0.18;
    body.add(hoodMesh);
    // Hood inner trim — visible rim around the face opening.
    const hoodRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.27, 0.02, 6, 18),
      trim,
    );
    hoodRim.rotation.x = Math.PI / 2;
    hoodRim.position.set(0, 2.18, 0.18);
    body.add(hoodRim);

    // Staff held in the right hand. Long shaft with an ember orb floating
    // at the top, wrapped by a translucent glow halo. The staff is parented
    // directly to the body (not the arm) so the ranger's draw animation
    // doesn't mangle it — magic casting doesn't need an arm windup.
    const staff = new THREE.Group();
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.06, 1.95, 8),
      staffMat,
    );
    shaft.position.y = 0.4;
    staff.add(shaft);
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.18, 8),
      trim,
    );
    grip.position.y = 0.85;
    staff.add(grip);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 14), emberMat);
    orb.position.y = 1.55;
    staff.add(orb);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 14), emberGlow);
    halo.position.y = 1.55;
    staff.add(halo);
    // Three jagged claws cradling the orb.
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const claw = new THREE.Mesh(
        new THREE.ConeGeometry(0.05, 0.32, 6),
        staffMat,
      );
      claw.position.set(Math.cos(a) * 0.18, 1.42, Math.sin(a) * 0.18);
      claw.rotation.z = -Math.cos(a) * 0.4;
      claw.rotation.x = Math.sin(a) * 0.4;
      staff.add(claw);
    }
    staff.position.set(0.55, 0.55, 0.18);
    staff.rotation.z = -0.18;
    body.add(staff);
    // Reuse bowGroup as the "weapon group" so the existing windup squash
    // (scale.x lerp on the bow) animates the staff harmlessly without any
    // extra bookkeeping. Visually it just adds a subtle pulse on cast.
    this.bowGroup = staff;
  }

  /**
   * Reusable humanoid skeleton — legs, torso, head, arms — used by the
   * three "simple" hero builds (fighter, assassin, tank). The visual
   * differentiation between them then lives in the colour palette and
   * the held weapon, not in the body proportions.
   *
   * Returns the body group plus references to limb pivots so death and
   * gait animations can drive them just like the ranger/mage builds.
   */
  private buildHumanoid(opts: {
    primary: THREE.MeshLambertMaterial;
    secondary: THREE.MeshLambertMaterial;
    skin: THREE.MeshLambertMaterial;
    boot: THREE.MeshLambertMaterial;
    helm?: THREE.MeshLambertMaterial;
    /** Bigger characters (tank) push the silhouette out — the rest stay 1.0. */
    bulk?: number;
  }): { body: THREE.Group; rightHand: THREE.Group } {
    const bulk = opts.bulk ?? 1;
    const body = new THREE.Group();
    this.group.add(body);
    this.bodyRoot = body;
    this.cloakMat = opts.primary;
    this.cloakLightMat = opts.secondary;

    // Legs.
    const thighGeom = new THREE.CylinderGeometry(0.16 * bulk, 0.14 * bulk, 0.65, 10);
    thighGeom.translate(0, -0.32, 0);
    const calfGeom = new THREE.CylinderGeometry(0.13 * bulk, 0.11 * bulk, 0.55, 10);
    calfGeom.translate(0, -0.28, 0);
    for (const side of [-1, 1] as const) {
      const hip = new THREE.Group();
      hip.position.set(0.18 * bulk * side, 0.95, 0);
      const thigh = new THREE.Mesh(thighGeom, opts.secondary);
      hip.add(thigh);
      const calf = new THREE.Mesh(calfGeom, opts.secondary);
      calf.position.y = -0.62;
      hip.add(calf);
      const boot = new THREE.Mesh(
        new THREE.BoxGeometry(0.26 * bulk, 0.18, 0.4),
        opts.boot,
      );
      boot.position.set(0, -1.12, 0.05);
      hip.add(boot);
      body.add(hip);
      if (side < 0) this.leftLeg = hip;
      else this.rightLeg = hip;
    }

    // Torso.
    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.4 * bulk, 0.55, 6, 12),
      opts.primary,
    );
    torso.position.y = 1.6;
    body.add(torso);

    // Belt.
    const belt = new THREE.Mesh(
      new THREE.TorusGeometry(0.38 * bulk, 0.06, 8, 22),
      opts.boot,
    );
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 1.3;
    body.add(belt);

    // Arms — simple cylinders. Right hand returned as a group so callers
    // can attach a weapon to it.
    const upperArmGeom = new THREE.CylinderGeometry(0.1 * bulk, 0.09 * bulk, 0.45, 10);
    upperArmGeom.translate(0, -0.22, 0);
    const forearmGeom = new THREE.CylinderGeometry(0.08 * bulk, 0.075 * bulk, 0.42, 10);
    forearmGeom.translate(0, -0.21, 0);
    const armMat = opts.skin;
    let rightHand = new THREE.Group();
    for (const side of [-1, 1] as const) {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.42 * bulk * side, 1.82, 0);
      const upper = new THREE.Mesh(upperArmGeom, armMat);
      shoulder.add(upper);
      const forearm = new THREE.Mesh(forearmGeom, armMat);
      forearm.position.y = -0.42;
      shoulder.add(forearm);
      const hand = new THREE.Group();
      hand.position.y = -0.82;
      const handMesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), armMat);
      hand.add(handMesh);
      shoulder.add(hand);
      body.add(shoulder);
      if (side < 0) this.leftArm = shoulder;
      else {
        this.rightArm = shoulder;
        rightHand = hand;
      }
    }

    // Head.
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3 * bulk, 14, 14), opts.skin);
    head.position.y = 2.18;
    body.add(head);
    // Eye dots so faces read at distance.
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x202434 });
    for (const ex of [-0.08, 0.08]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.026, 6, 6), eyeMat);
      eye.position.set(ex, 2.2, 0.24);
      body.add(eye);
    }

    if (opts.helm) {
      const helm = new THREE.Mesh(new THREE.ConeGeometry(0.34 * bulk, 0.55, 14), opts.helm);
      helm.position.y = 2.5;
      body.add(helm);
      const helmTip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), opts.helm);
      helmTip.position.y = 2.85;
      body.add(helmTip);
    }

    return { body, rightHand };
  }

  /** Боец — warrior with a long sword and ember-trim armour. */
  private buildFighter(): void {
    const skin = new THREE.MeshLambertMaterial({ color: 0xeec4a4 });
    const armor = new THREE.MeshLambertMaterial({ color: 0x8a3a2a });
    const armorDark = new THREE.MeshLambertMaterial({ color: 0x4a1f15 });
    const trim = new THREE.MeshLambertMaterial({
      color: 0xf3b75a,
      emissive: 0xb6730a,
      emissiveIntensity: 0.4,
    });
    const boot = new THREE.MeshLambertMaterial({ color: 0x1f1410 });
    const { body, rightHand } = this.buildHumanoid({
      primary: armor,
      secondary: armorDark,
      skin,
      boot,
      helm: trim,
    });
    // Pauldrons — boxy shoulder pads to bulk the silhouette.
    for (const side of [-1, 1]) {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.3), armorDark);
      pad.position.set(0.5 * side, 1.95, 0);
      body.add(pad);
    }
    // Cross-belt accent.
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.06), trim);
    strap.position.set(-0.05, 1.55, 0.4);
    strap.rotation.z = 0.4;
    body.add(strap);

    // Long sword in the right hand. Pommel + guard + blade.
    const sword = new THREE.Group();
    const swordBlade = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.06, 1.4),
      new THREE.MeshLambertMaterial({
        color: 0xcfd6e0,
        emissive: 0x8aa0c0,
        emissiveIntensity: 0.3,
      }),
    );
    swordBlade.position.z = 0.65;
    sword.add(swordBlade);
    const swordTip = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 0.28, 6),
      new THREE.MeshLambertMaterial({ color: 0xeef2f8 }),
    );
    swordTip.rotation.x = Math.PI / 2;
    swordTip.position.z = 1.4;
    sword.add(swordTip);
    const swordGuard = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.06, 0.1),
      trim,
    );
    swordGuard.position.z = -0.05;
    sword.add(swordGuard);
    const swordGrip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.26, 6),
      armorDark,
    );
    swordGrip.rotation.x = Math.PI / 2;
    swordGrip.position.z = -0.2;
    sword.add(swordGrip);
    sword.rotation.x = -0.4;
    sword.position.set(0, 0, 0.05);
    rightHand.add(sword);
    this.bowGroup = sword;
  }

  /** Убийца — slim assassin with hood and twin daggers. */
  private buildAssassin(): void {
    const skin = new THREE.MeshLambertMaterial({ color: 0xe6c0a0 });
    const cloth = new THREE.MeshLambertMaterial({ color: 0x1a1722 });
    const clothLight = new THREE.MeshLambertMaterial({ color: 0x2a2640 });
    const trim = new THREE.MeshLambertMaterial({
      color: 0xa470ff,
      emissive: 0x6a2fc8,
      emissiveIntensity: 0.6,
    });
    const boot = new THREE.MeshLambertMaterial({ color: 0x09080d });
    const { body, rightHand } = this.buildHumanoid({
      primary: cloth,
      secondary: clothLight,
      skin,
      boot,
    });
    // Hood — covers the top of the head.
    const hood = new THREE.Mesh(
      new THREE.ConeGeometry(0.4, 0.65, 12),
      cloth,
    );
    hood.position.set(0, 2.32, -0.05);
    hood.rotation.x = -0.18;
    body.add(hood);
    // Sash + belt accent.
    const sash = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.06), trim);
    sash.position.set(0, 1.32, 0.4);
    body.add(sash);
    // Dagger in the right hand.
    const dagger = new THREE.Group();
    const blade = new THREE.Mesh(
      new THREE.ConeGeometry(0.07, 0.55, 6),
      new THREE.MeshLambertMaterial({
        color: 0xd8dde6,
        emissive: 0x6c4ec8,
        emissiveIntensity: 0.5,
      }),
    );
    blade.rotation.x = Math.PI / 2;
    blade.position.z = 0.32;
    dagger.add(blade);
    const hilt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.18, 6),
      cloth,
    );
    hilt.rotation.x = Math.PI / 2;
    hilt.position.z = -0.05;
    dagger.add(hilt);
    dagger.rotation.x = -0.2;
    rightHand.add(dagger);
    this.bowGroup = dagger;
  }

  /** Танк — heavy plate armour with a war hammer. */
  private buildTank(): void {
    const skin = new THREE.MeshLambertMaterial({ color: 0xd9a677 });
    const plate = new THREE.MeshLambertMaterial({ color: 0x6c7480 });
    const plateDark = new THREE.MeshLambertMaterial({ color: 0x3a4048 });
    const trim = new THREE.MeshLambertMaterial({
      color: 0xc99650,
      emissive: 0x6e4e1a,
      emissiveIntensity: 0.4,
    });
    const boot = new THREE.MeshLambertMaterial({ color: 0x1a1714 });
    const { body, rightHand } = this.buildHumanoid({
      primary: plate,
      secondary: plateDark,
      skin,
      boot,
      helm: plate,
      bulk: 1.25,
    });
    // Beefy pauldrons + chest plate.
    for (const side of [-1, 1]) {
      const pauldron = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 10, 10),
        plate,
      );
      pauldron.position.set(0.62 * side, 2.0, 0);
      body.add(pauldron);
    }
    const chest = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.5, 0.16),
      plateDark,
    );
    chest.position.set(0, 1.6, 0.36);
    body.add(chest);
    const chestTrim = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.08, 0.04),
      trim,
    );
    chestTrim.position.set(0, 1.4, 0.45);
    body.add(chestTrim);
    // Visor — narrow band across helm.
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.12), plateDark);
    visor.position.set(0, 2.2, 0.27);
    body.add(visor);
    // Massive war hammer in the right hand.
    const hammer = new THREE.Group();
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.4), plateDark);
    head.position.z = 0.7;
    hammer.add(head);
    const headTrim = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.42), trim);
    headTrim.position.set(0, 0.25, 0.7);
    hammer.add(headTrim);
    const headTrim2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.42), trim);
    headTrim2.position.set(0, -0.25, 0.7);
    hammer.add(headTrim2);
    const haft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.85, 8),
      new THREE.MeshLambertMaterial({ color: 0x4a2d1c }),
    );
    haft.rotation.x = Math.PI / 2;
    haft.position.z = 0.05;
    hammer.add(haft);
    hammer.rotation.x = -0.5;
    hammer.position.set(0, 0, 0);
    rightHand.add(hammer);
    this.bowGroup = hammer;
  }
}

/**
 * Recurve bow — two opposed arcs (split torus halves) form the elegant
 * Mia-style silhouette, with a gold grip in the middle and a notched arrow
 * already on the string.
 */
function buildRecurveBow(
  bowMat: THREE.Material,
  arrowMat: THREE.Material,
  stringMat: THREE.Material,
): THREE.Group {
  const bow = new THREE.Group();

  // Upper limb — half-torus that arcs up.
  const upperLimb = new THREE.Mesh(
    new THREE.TorusGeometry(0.4, 0.04, 6, 18, Math.PI),
    bowMat,
  );
  upperLimb.rotation.z = Math.PI / 2;
  upperLimb.position.y = 0.1;
  upperLimb.scale.set(0.8, 1, 1);
  upperLimb.castShadow = false;
  bow.add(upperLimb);
  // Lower limb — mirror.
  const lowerLimb = new THREE.Mesh(
    new THREE.TorusGeometry(0.4, 0.04, 6, 18, Math.PI),
    bowMat,
  );
  lowerLimb.rotation.z = -Math.PI / 2;
  lowerLimb.position.y = -0.1;
  lowerLimb.scale.set(0.8, 1, 1);
  lowerLimb.castShadow = false;
  bow.add(lowerLimb);

  // Centre grip — gold.
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 8), arrowMat);
  bow.add(grip);

  // Bowstring — taut between the limb tips.
  const string = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 1.0, 6),
    stringMat,
  );
  string.position.z = -0.08;
  bow.add(string);

  // Arrow — already nocked, pointing forward.
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, 0.9, 6),
    arrowMat,
  );
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = 0.32;
  bow.add(shaft);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 8), arrowMat);
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 0.85;
  bow.add(tip);
  // Fletching — three small wedges at the back of the shaft.
  const fletchMat = new THREE.MeshLambertMaterial({ color: 0xc44a4a });
  for (let i = 0; i < 3; i++) {
    const fl = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.18), fletchMat);
    const a = (i / 3) * Math.PI * 2;
    fl.position.set(Math.cos(a) * 0.045, Math.sin(a) * 0.045, -0.08);
    fl.rotation.z = a;
    bow.add(fl);
  }

  return bow;
}
