import * as THREE from 'three';
import {
  type HeroKind,
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
  SKILL_C_COOLDOWN_MS,
  SKILL_C_DAMAGE,
  SKILL_C_RANGE,
  SKILL_C_STUN_DURATION_MS,
  SKILL_E_COOLDOWN_MS,
  SKILL_E_DAMAGE,
  SKILL_E_RANGE,
  SKILL_E_SLOW_DURATION_MS,
  SKILL_E_SLOW_FACTOR,
  SKILL_Q_COOLDOWN_MS,
  SKILL_Q_DAMAGE,
  SKILL_Q_RANGE,
} from '../constants.js';
import type { Unit, Team } from '../combat/Unit.js';
import { HealthBar } from '../combat/HealthBar.js';
import type { ProjectileKind } from './ProjectileManager.js';

/**
 * Per-skill loadout. Lets `Game` cast Q/E/C uniformly without branching on
 * the hero kind — the hero packages its own ranges, cooldowns, projectile
 * kind and on-hit effect.
 */
export interface SkillConfig {
  /** Damage at the hero's current level. Read fresh per cast. */
  damage: number;
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
    if (heroKind === 'mage') this.buildMage();
    else this.buildMia();
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
    const base = this.heroKind === 'mage' ? MAGE_MAX_HP : PLAYER_MAX_HP;
    return base + (this.level - 1) * HERO_HP_PER_LEVEL;
  }

  get attackDamage(): number {
    const base = this.heroKind === 'mage' ? MAGE_ATTACK_DAMAGE : PLAYER_ATTACK_DAMAGE;
    return base + (this.level - 1) * HERO_DAMAGE_PER_LEVEL;
  }

  get attackRange(): number {
    return this.heroKind === 'mage' ? MAGE_ATTACK_RANGE : PLAYER_ATTACK_RANGE;
  }

  get attackCooldownMs(): number {
    return this.heroKind === 'mage' ? MAGE_ATTACK_COOLDOWN_MS : PLAYER_ATTACK_COOLDOWN_MS;
  }

  get speed3D(): number {
    return this.heroKind === 'mage' ? MAGE_SPEED_3D : PLAYER_SPEED_3D;
  }

  /** Auto-attack projectile cosmetic. Ranger: arrow, mage: small fire bolt. */
  get autoAttackKind(): ProjectileKind {
    return this.heroKind === 'mage' ? 'fire' : 'basic';
  }

  /** Q skill loadout — fresh per cast (damage scales with level). */
  get skillQ(): SkillConfig {
    if (this.heroKind === 'mage') {
      return {
        damage: MAGE_Q_DAMAGE + (this.level - 1) * HERO_DAMAGE_PER_LEVEL * 1.5,
        cooldownMs: MAGE_Q_COOLDOWN_MS,
        range: MAGE_Q_RANGE,
        projectileKind: 'fire',
      };
    }
    return {
      damage: SKILL_Q_DAMAGE + (this.level - 1) * HERO_DAMAGE_PER_LEVEL * 1.5,
      cooldownMs: SKILL_Q_COOLDOWN_MS,
      range: SKILL_Q_RANGE,
      projectileKind: 'heavy',
    };
  }

  get skillE(): SkillConfig {
    if (this.heroKind === 'mage') {
      return {
        damage: MAGE_E_DAMAGE + (this.level - 1) * Math.round(HERO_DAMAGE_PER_LEVEL * 0.6),
        cooldownMs: MAGE_E_COOLDOWN_MS,
        range: MAGE_E_RANGE,
        projectileKind: 'fire',
        effect: { slow: { factor: MAGE_E_SLOW_FACTOR, durationMs: MAGE_E_SLOW_DURATION_MS } },
      };
    }
    return {
      damage: SKILL_E_DAMAGE + (this.level - 1) * Math.round(HERO_DAMAGE_PER_LEVEL * 0.6),
      cooldownMs: SKILL_E_COOLDOWN_MS,
      range: SKILL_E_RANGE,
      projectileKind: 'slow',
      effect: { slow: { factor: SKILL_E_SLOW_FACTOR, durationMs: SKILL_E_SLOW_DURATION_MS } },
    };
  }

  get skillC(): SkillConfig {
    if (this.heroKind === 'mage') {
      // Meteor — chunky direct hit + AoE shockwave to other enemies.
      return {
        damage: MAGE_C_DAMAGE + (this.level - 1) * Math.round(HERO_DAMAGE_PER_LEVEL * 0.6),
        cooldownMs: MAGE_C_COOLDOWN_MS,
        range: MAGE_C_RANGE,
        projectileKind: 'meteor',
        aoeRadius: MAGE_C_AOE_RADIUS,
        aoeDamage: MAGE_C_AOE_DAMAGE + (this.level - 1) * Math.round(HERO_DAMAGE_PER_LEVEL * 0.4),
      };
    }
    return {
      damage: SKILL_C_DAMAGE + (this.level - 1) * Math.round(HERO_DAMAGE_PER_LEVEL * 0.4),
      cooldownMs: SKILL_C_COOLDOWN_MS,
      range: SKILL_C_RANGE,
      projectileKind: 'control',
      effect: { stun: { durationMs: SKILL_C_STUN_DURATION_MS } },
    };
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

  /** Multiply outgoing damage (autos + skills) by this at fire-time. */
  outgoingDamageMultiplier(now = performance.now()): number {
    return 1 + this.getTowerFocusStacks(now) * PLAYER_TOWER_FOCUS_STACK_BONUS;
  }

  update(input: { x: number; z: number }, deltaSec: number, now: number): void {
    if (!this.alive) {
      this.tickDeath(now);
      return;
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

  private animateGait(speed: number, deltaSec: number, now: number): void {
    const drawing = now < this.attackLockUntil;
    const k = Math.min(1, deltaSec * 14);
    const lerp = (a: number, b: number) => a + (b - a) * k;
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
    this.hp = Math.max(0, this.hp - amount);
    this.healthBar.setRatio(this.hp / this.maxHp);
    this.healthBar.setHp(this.hp, this.maxHp);
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
