import * as THREE from 'three';
import {
  type HeroKind,
  ASSASSIN_ATTACK_COOLDOWN_MS,
  ASSASSIN_ATTACK_DAMAGE,
  ASSASSIN_ATTACK_RANGE,
  ASSASSIN_C_COOLDOWN_MS,
  ASSASSIN_C_DAMAGE,
  ASSASSIN_C_EXECUTE_BONUS,
  ASSASSIN_C_EXECUTE_HP_PCT,
  ASSASSIN_C_RANGE,
  ASSASSIN_E_AOE_DAMAGE,
  ASSASSIN_E_AOE_RADIUS,
  ASSASSIN_E_COOLDOWN_MS,
  ASSASSIN_E_DAMAGE,
  ASSASSIN_E_RANGE,
  ASSASSIN_MAX_HP,
  ASSASSIN_Q_COOLDOWN_MS,
  ASSASSIN_Q_DAMAGE,
  ASSASSIN_Q_RANGE,
  ASSASSIN_SPEED_3D,
  BOT_RADIUS,
  BOT_REGEN_PER_SEC,
  BOT_RESPAWN_MS,
  BOT_RETREAT_HP_FRACTION,
  BOT_VISION_RANGE,
  BASE_BLUE_X,
  BASE_BLUE_Z,
  BASE_RED_X,
  BASE_RED_Z,
  FIGHTER_ATTACK_COOLDOWN_MS,
  FIGHTER_ATTACK_DAMAGE,
  FIGHTER_ATTACK_RANGE,
  FIGHTER_MAX_HP,
  FIGHTER_SPEED_3D,
  FIGHTER_C_AOE_DAMAGE,
  FIGHTER_C_AOE_RADIUS,
  FIGHTER_C_COOLDOWN_MS,
  FIGHTER_C_STUN_DURATION_MS,
  FIGHTER_Q_COOLDOWN_MS,
  FIGHTER_Q_DAMAGE,
  FIGHTER_Q_RANGE,
  FIGHTER_Q_SLOW_DURATION_MS,
  FIGHTER_Q_SLOW_FACTOR,
  HERO_BASE_XP_TO_LEVEL,
  HERO_DAMAGE_PER_LEVEL,
  HERO_HP_PER_LEVEL,
  HERO_KILL_XP_REWARD,
  HERO_MAX_LEVEL,
  HERO_XP_LEVEL_GROWTH,
  LANE_PATHS,
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
  PLAYER_SPEED_3D,
  RECALL_CHANNEL_MS,
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
  TANK_ATTACK_COOLDOWN_MS,
  TANK_ATTACK_DAMAGE,
  TANK_ATTACK_RANGE,
  TANK_C_AOE_DAMAGE,
  TANK_C_AOE_RADIUS,
  TANK_C_COOLDOWN_MS,
  TANK_C_STUN_DURATION_MS,
  TANK_E_COOLDOWN_MS,
  TANK_MAX_HP,
  TANK_Q_COOLDOWN_MS,
  TANK_Q_DAMAGE,
  TANK_Q_RANGE,
  TANK_Q_STUN_DURATION_MS,
  TANK_SPEED_3D,
} from '../constants.js';
import type { Unit, Team } from '../combat/Unit.js';
import type { UnitRegistry } from '../combat/UnitRegistry.js';
import type { Colliders } from '../world/Colliders.js';
import { HealthBar } from '../combat/HealthBar.js';
import type { ProjectileKind, ProjectileManager } from './ProjectileManager.js';

const TMP_TARGET = new THREE.Vector3();

/**
 * AI hero. Originally just the red-team archer; now generalised to support
 * either kind (ranger / mage) on either team. The state machine is the same
 * regardless of kind — what differs is the projectile cosmetics and the
 * skill numbers (range / cooldown / damage / on-hit effect).
 *
 * Naive FSM:
 *   • low HP → retreat to spawn, regen
 *   • enemy in vision and out of attack range → pursue
 *   • enemy in attack range → stop, fire on cooldown
 *   • no enemy in vision → walk toward enemy base
 */
/** Lane assignment for AI bots — drives the idle "where do I walk?" path.
 *  • top/mid/bot — fixed lane, follows LANE_PATHS for that lane.
 *  • roam — cycles between all three lanes (tank archetype).
 *  • jungle — assassin path, mostly mid with detours through camps. */
export type BotLane = 'top' | 'mid' | 'bot' | 'roam' | 'jungle';

export class BotObject implements Unit {
  readonly kind = 'hero';
  readonly heroKind: HeroKind;
  readonly group = new THREE.Group();
  team: Team;
  readonly radius = BOT_RADIUS;
  readonly xpReward = HERO_KILL_XP_REWARD;
  hp = PLAYER_MAX_HP;
  alive = true;
  slowUntil = 0;
  stunnedUntil = 0;
  level = 1;
  xp = 0;
  respawnDelayMs = BOT_RESPAWN_MS;
  /** Lane the bot pushes through when there's no enemy in vision. Set
   *  per-archetype by Game on spawn (fighter→top, ranger→bot, mage→mid,
   *  tank→roam, assassin→jungle). */
  lane: BotLane = 'mid';
  /** Current lane waypoint path. Refreshed when the bot exhausts its
   *  current path (roamer cycles to a new lane). */
  private path: ReadonlyArray<readonly [number, number]> = [];
  private pathIdx = 0;

  private readonly spawn: THREE.Vector3;
  private readonly healthBar: HealthBar;
  private respawnAt = 0;
  private lastAttackAt = -Infinity;
  private lastQAt = -Infinity;
  private lastEAt = -Infinity;
  private lastCAt = -Infinity;
  private recallStartedAt = 0;
  private deathStartedAt = 0;
  private avoidSide: 1 | -1 = 1;
  private lastProgress = 0;
  private armorMat!: THREE.MeshLambertMaterial;
  private armorDarkMat!: THREE.MeshLambertMaterial;

  constructor(
    spawn: THREE.Vector3,
    heroKind: HeroKind = 'ranger',
    team: Team = 'red',
    lane: BotLane = 'mid',
  ) {
    this.heroKind = heroKind;
    this.team = team;
    this.spawn = spawn.clone();
    this.lane = lane;
    this.refreshLanePath();
    // Bar colour: pick the team's signature so the player can tell ally
    // bots from enemy bots at a glance even before the armour palette
    // takes effect.
    const barColor = team === 'blue' ? 0x44ff66 : 0xff5050;
    this.healthBar = new HealthBar(2.4, 0.22, barColor, true, true);
    switch (heroKind) {
      case 'mage': this.buildMageVisual(); break;
      case 'fighter': this.buildFighterVisual(); break;
      case 'assassin': this.buildAssassinVisual(); break;
      case 'tank': this.buildTankVisual(); break;
      default: this.buildArcherVisual();
    }
    this.group.position.copy(spawn);
    this.healthBar.group.position.set(0, 3, 0);
    this.group.add(this.healthBar.group);
    this.refreshLevelBadge();
    this.healthBar.setHp(this.hp, this.maxHp);
    // Auto-attack range mirrors the player-side range for the same role —
    // see botAttackRangeFor. Cached on construction so the AI loop doesn't
    // re-switch on heroKind every tick.
    this.botAttackRange = botAttackRangeFor(heroKind);
  }

  /** Cached attack range — see constructor. */
  private botAttackRange: number;

  /** Refresh the lane waypoint list from the bot's current `lane` and team. */
  private refreshLanePath(): void {
    const baseLane: 'top' | 'mid' | 'bot' = (
      this.lane === 'roam' || this.lane === 'jungle' ? 'mid' : this.lane
    );
    this.path = LANE_PATHS[baseLane][this.team];
    this.pathIdx = 0;
  }

  /** Roamer rotation — pick the next lane in a stable cycle so the tank
   *  visits all three over the course of a match. */
  private rotateRoamLane(): void {
    const cycle: Array<'top' | 'mid' | 'bot'> = ['top', 'mid', 'bot'];
    // Pull current lane from path identity (cheap stand-in).
    const current = (
      this.path === LANE_PATHS.top[this.team] ? 'top'
        : this.path === LANE_PATHS.bot[this.team] ? 'bot'
          : 'mid'
    );
    const idx = cycle.indexOf(current);
    const next = cycle[(idx + 1) % cycle.length];
    this.path = LANE_PATHS[next][this.team];
    this.pathIdx = 0;
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  get maxHp(): number {
    // Bot HP per role mirrors the player-side stats exactly so a bot
    // ranger fights a player ranger on equal footing — no more sandbagged
    // multipliers. Level scaling stays the same.
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
    // Same role-parity rule as maxHp.
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

  /** Auto-attack visual per archetype — distinct projectile keeps the
   *  bot's role legible at a glance. */
  private get autoAttackKind(): ProjectileKind {
    switch (this.heroKind) {
      case 'mage': return 'firebolt';
      case 'fighter': return 'blade';
      case 'assassin': return 'dagger';
      case 'tank': return 'hammer';
      default: return 'basic';
    }
  }

  /** Per-role movement speed — same value the player-side hero would use. */
  private get botSpeed(): number {
    switch (this.heroKind) {
      case 'mage': return MAGE_SPEED_3D;
      case 'fighter': return FIGHTER_SPEED_3D;
      case 'assassin': return ASSASSIN_SPEED_3D;
      case 'tank': return TANK_SPEED_3D;
      default: return PLAYER_SPEED_3D;
    }
  }

  /** Per-role auto-attack cooldown — same value the player-side hero uses. */
  private get botAttackCooldown(): number {
    switch (this.heroKind) {
      case 'mage': return MAGE_ATTACK_COOLDOWN_MS;
      case 'fighter': return FIGHTER_ATTACK_COOLDOWN_MS;
      case 'assassin': return ASSASSIN_ATTACK_COOLDOWN_MS;
      case 'tank': return TANK_ATTACK_COOLDOWN_MS;
      default: return PLAYER_ATTACK_COOLDOWN_MS;
    }
  }

  billboardHealthBar(camera: THREE.Camera): void {
    // See PlayerObject.billboardHealthBar — centered above the bot in the
    // rotated-phone landscape view.
    this.healthBar.group.position.set(0, 3, 0);
    this.healthBar.billboard(camera);
  }

  /** Recolor the bot's armor for its server-assigned team. */
  setTeam(team: Team): void {
    this.team = team;
    const palette = team === 'red'
      ? { armor: 0xc73c3c, armorDark: 0x6a1717 }
      : { armor: 0x2a4f8a, armorDark: 0x172846 };
    this.armorMat.color.setHex(palette.armor);
    this.armorDarkMat.color.setHex(palette.armorDark);
  }

  update(
    deltaSec: number,
    now: number,
    registry: UnitRegistry,
    projectiles: ProjectileManager,
    colliders: Colliders,
  ): void {
    if (!this.alive) {
      // Lay the corpse down with an ease-in fall, like the player.
      if (this.deathStartedAt) {
        const t = Math.min(1, (now - this.deathStartedAt) / 700);
        const eased = t * t;
        this.group.rotation.x = -Math.PI / 2 * eased;
        this.group.position.y = -0.4 * eased;
        this.healthBar.group.visible = t < 0.85;
      }
      if (now >= this.respawnAt) this.respawn();
      return;
    }
    if (this.stunnedUntil > now) return;

    const slowed = this.slowUntil > now;
    const speed = slowed ? this.botSpeed * 0.5 : this.botSpeed;
    const lowHp = this.hp / this.maxHp <= BOT_RETREAT_HP_FRACTION;

    // Channeling recall: stand still, teleport on success.
    if (this.recallStartedAt) {
      if (now - this.recallStartedAt >= RECALL_CHANNEL_MS) {
        this.position.copy(this.spawn);
        this.hp = this.maxHp;
        this.healthBar.setRatio(1);
        this.healthBar.setHp(this.hp, this.maxHp);
        this.recallStartedAt = 0;
      }
      return;
    }

    if (lowHp) {
      // Start a recall channel if safe (out of immediate danger).
      const threat = registry.findNearestEnemy(this.team, this.position, this.botAttackRange + 2);
      if (!threat) {
        this.recallStartedAt = now;
        return;
      }
      this.moveToward(this.spawn, deltaSec, speed, colliders);
      const sdx = this.spawn.x - this.position.x;
      const sdz = this.spawn.z - this.position.z;
      if (sdx * sdx + sdz * sdz < 9) {
        this.hp = Math.min(this.maxHp, this.hp + BOT_REGEN_PER_SEC * deltaSec);
        this.healthBar.setRatio(this.hp / this.maxHp);
        this.healthBar.setHp(this.hp, this.maxHp);
      }
      colliders.resolve(this.position, this.radius);
      return;
    }

    // Pick the nearest enemy of ANY kind — no hero priority. The bot will
    // chew on minions when minions are closer, only locking onto the hero
    // when the hero is the nearest threat. This stops the AI from running
    // straight past minions at the player.
    const enemy = registry.findNearestEnemy(this.team, this.position, BOT_VISION_RANGE);
    if (!enemy) {
      // No vision — walk along the assigned lane toward enemy structures.
      this.walkLane(deltaSec, speed, colliders);
      return;
    }

    const dx = enemy.position.x - this.position.x;
    const dz = enemy.position.z - this.position.z;
    const dist = Math.hypot(dx, dz);

    if (dist > this.botAttackRange) {
      this.moveToward(enemy.position, deltaSec, speed, colliders);
      // Try a long-range Q to harass while approaching.
      this.tryCastSkill(enemy, dist, now, projectiles);
    } else {
      this.group.rotation.y = Math.atan2(dx, dz);
      // In melee range — prefer skills first, fall back to auto-attack.
      const cast = this.tryCastSkill(enemy, dist, now, projectiles);
      if (!cast && now - this.lastAttackAt >= this.botAttackCooldown) {
        projectiles.spawn(this.position, enemy.position, now, {
          team: this.team,
          damage: this.attackDamage,
          kind: this.autoAttackKind,
          target: enemy,
          owner: this,
        });
        this.lastAttackAt = now;
      }
    }
  }

  /**
   * Lane-pathing fallback when nothing is in vision. The bot walks from
   * waypoint to waypoint along the path picked at construction (or after
   * a roam rotation). Once the path is exhausted it heads to the enemy
   * base directly. The roamer (`tank`) cycles to a new lane when its
   * path runs out, so it visits all three lanes in turn.
   */
  private walkLane(deltaSec: number, speed: number, colliders: Colliders): void {
    if (this.pathIdx < this.path.length) {
      const [wx, wz] = this.path[this.pathIdx];
      TMP_TARGET.set(wx, 0, wz);
      this.moveToward(TMP_TARGET, deltaSec, speed, colliders);
      const dx = wx - this.position.x;
      const dz = wz - this.position.z;
      if (dx * dx + dz * dz < 9) this.pathIdx += 1;
      return;
    }
    if (this.lane === 'roam') {
      // Tanks rotate to the next lane and start over so they keep
      // visiting top/mid/bot in a steady cycle.
      this.rotateRoamLane();
      return;
    }
    // Path exhausted — push the enemy base.
    const ex = this.team === 'red' ? BASE_BLUE_X : BASE_RED_X;
    const ez = this.team === 'red' ? BASE_BLUE_Z : BASE_RED_Z;
    TMP_TARGET.set(ex, 0, ez);
    this.moveToward(TMP_TARGET, deltaSec, speed, colliders);
  }

  /** Pick the longest-range skill currently available and fire toward `enemy`.
   *  Returns true if a skill was cast (so the caller can skip the auto-attack).
   *  Branches by heroKind so the mage bot uses fireballs and meteors instead
   *  of the ranger's heavy/slow/stun loadout. */
  private tryCastSkill(
    enemy: { position: THREE.Vector3 } & Partial<Unit>,
    dist: number,
    now: number,
    projectiles: ProjectileManager,
  ): boolean {
    const dx = enemy.position.x - this.position.x;
    const dz = enemy.position.z - this.position.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-3) return false;
    switch (this.heroKind) {
      case 'mage': return this.tryCastMageSkill(enemy, dist, now, projectiles);
      case 'fighter': return this.tryCastFighterSkill(enemy, dist, now, projectiles);
      case 'assassin': return this.tryCastAssassinSkill(enemy, dist, now, projectiles);
      case 'tank': return this.tryCastTankSkill(enemy, dist, now, projectiles);
      default: return this.tryCastRangerSkill(enemy, dist, now, projectiles);
    }
  }

  private tryCastFighterSkill(
    enemy: { position: THREE.Vector3 } & Partial<Unit>,
    dist: number,
    now: number,
    projectiles: ProjectileManager,
  ): boolean {
    // ВИХРЬ — self-cast AoE stun when surrounded. Kicks in even at melee.
    if (dist <= 4 && now - this.lastCAt >= FIGHTER_C_COOLDOWN_MS) {
      projectiles.spawn(this.position, this.position, now, {
        team: this.team,
        damage: 0,
        kind: 'vortex',
        owner: this,
        selfCast: true,
        selfCastDurationMs: 700,
        aoeRadius: FIGHTER_C_AOE_RADIUS,
        aoeDamage: FIGHTER_C_AOE_DAMAGE + (this.level - 1) * Math.round(HERO_DAMAGE_PER_LEVEL * 0.5),
        effect: { stun: { durationMs: FIGHTER_C_STUN_DURATION_MS } },
      });
      this.lastCAt = now;
      return true;
    }
    // Warlord E "Rage Mode" is a self-buff — bot AI doesn't currently
    // model offensive self-buffs (it can't time them against a real
    // teamfight), so we skip it. Q + C still cover the rotation.
    // Power Strike — primary single-target hit + small slow.
    if (dist <= FIGHTER_Q_RANGE && now - this.lastQAt >= FIGHTER_Q_COOLDOWN_MS) {
      projectiles.spawn(this.position, enemy.position, now, {
        team: this.team,
        damage: FIGHTER_Q_DAMAGE + (this.level - 1) * HERO_DAMAGE_PER_LEVEL * 1.4,
        kind: 'blade',
        owner: this,
        maxDistance: FIGHTER_Q_RANGE,
        target: enemy as never,
        effect: { slow: { factor: FIGHTER_Q_SLOW_FACTOR, durationMs: FIGHTER_Q_SLOW_DURATION_MS } },
      });
      this.lastQAt = now;
      return true;
    }
    return false;
  }

  private tryCastAssassinSkill(
    enemy: { position: THREE.Vector3 } & Partial<Unit>,
    dist: number,
    now: number,
    projectiles: ProjectileManager,
  ): boolean {
    // КАЗНЬ — execute the wounded with the C finisher.
    const enemyHpFrac = enemy.maxHp && enemy.hp ? enemy.hp / enemy.maxHp : 1;
    if (
      dist <= ASSASSIN_C_RANGE &&
      now - this.lastCAt >= ASSASSIN_C_COOLDOWN_MS &&
      enemyHpFrac <= 0.6
    ) {
      projectiles.spawn(this.position, enemy.position, now, {
        team: this.team,
        damage: ASSASSIN_C_DAMAGE + (this.level - 1) * HERO_DAMAGE_PER_LEVEL * 1.2,
        kind: 'shadow',
        owner: this,
        maxDistance: ASSASSIN_C_RANGE,
        target: enemy as never,
        executeHpThreshold: ASSASSIN_C_EXECUTE_HP_PCT,
        executeBonus: ASSASSIN_C_EXECUTE_BONUS,
      });
      this.lastCAt = now;
      return true;
    }
    // ЛЕЗВИЯ — main single-target burst.
    if (dist <= ASSASSIN_Q_RANGE && now - this.lastQAt >= ASSASSIN_Q_COOLDOWN_MS) {
      projectiles.spawn(this.position, enemy.position, now, {
        team: this.team,
        damage: ASSASSIN_Q_DAMAGE + (this.level - 1) * HERO_DAMAGE_PER_LEVEL * 1.6,
        kind: 'dagger',
        owner: this,
        maxDistance: ASSASSIN_Q_RANGE,
        target: enemy as never,
      });
      this.lastQAt = now;
      return true;
    }
    // ТЕНЬ — dark wave with splash.
    if (dist <= ASSASSIN_E_RANGE && now - this.lastEAt >= ASSASSIN_E_COOLDOWN_MS) {
      projectiles.spawn(this.position, enemy.position, now, {
        team: this.team,
        damage: ASSASSIN_E_DAMAGE + (this.level - 1) * HERO_DAMAGE_PER_LEVEL,
        kind: 'shadow',
        owner: this,
        maxDistance: ASSASSIN_E_RANGE,
        target: enemy as never,
        aoeRadius: ASSASSIN_E_AOE_RADIUS,
        aoeDamage: ASSASSIN_E_AOE_DAMAGE + (this.level - 1) * Math.round(HERO_DAMAGE_PER_LEVEL * 0.3),
      });
      this.lastEAt = now;
      return true;
    }
    return false;
  }

  private tryCastTankSkill(
    enemy: { position: THREE.Vector3 } & Partial<Unit>,
    dist: number,
    now: number,
    projectiles: ProjectileManager,
  ): boolean {
    // Iron Wall is a player-only mechanic (real shield-absorb math sits
    // on PlayerObject). For the bot tank we approximate it with a flat
    // self-heal whenever HP dips — same intent (stay alive longer) with
    // far less plumbing.
    if (now - this.lastEAt >= TANK_E_COOLDOWN_MS && this.hp <= this.maxHp * 0.65) {
      this.heal(280 + (this.level - 1) * 30);
      this.lastEAt = now;
      return true;
    }
    // ЗЕМЛЕТРЯС — self-cast big AoE stun when in a fight.
    if (dist <= 5 && now - this.lastCAt >= TANK_C_COOLDOWN_MS) {
      projectiles.spawn(this.position, this.position, now, {
        team: this.team,
        damage: 0,
        kind: 'quake',
        owner: this,
        selfCast: true,
        selfCastDurationMs: 800,
        aoeRadius: TANK_C_AOE_RADIUS,
        aoeDamage: TANK_C_AOE_DAMAGE + (this.level - 1) * Math.round(HERO_DAMAGE_PER_LEVEL * 0.4),
        effect: { stun: { durationMs: TANK_C_STUN_DURATION_MS } },
      });
      this.lastCAt = now;
      return true;
    }
    // УДАР — single-target hammer + 1s stun.
    if (dist <= TANK_Q_RANGE && now - this.lastQAt >= TANK_Q_COOLDOWN_MS) {
      projectiles.spawn(this.position, enemy.position, now, {
        team: this.team,
        damage: TANK_Q_DAMAGE + (this.level - 1) * HERO_DAMAGE_PER_LEVEL,
        kind: 'hammer',
        owner: this,
        maxDistance: TANK_Q_RANGE,
        target: enemy as never,
        effect: { stun: { durationMs: TANK_Q_STUN_DURATION_MS } },
      });
      this.lastQAt = now;
      return true;
    }
    return false;
  }

  private tryCastRangerSkill(
    enemy: { position: THREE.Vector3 },
    dist: number,
    now: number,
    projectiles: ProjectileManager,
  ): boolean {
    if (dist <= SKILL_Q_RANGE && now - this.lastQAt >= SKILL_Q_COOLDOWN_MS) {
      const damage = SKILL_Q_DAMAGE + (this.level - 1) * HERO_DAMAGE_PER_LEVEL * 1.5;
      projectiles.spawn(this.position, enemy.position, now, {
        team: this.team,
        damage,
        kind: 'heavy',
        owner: this,
        maxDistance: SKILL_Q_RANGE,
        target: enemy as never,
      });
      this.lastQAt = now;
      return true;
    }
    if (dist <= SKILL_C_RANGE && now - this.lastCAt >= SKILL_C_COOLDOWN_MS) {
      projectiles.spawn(this.position, enemy.position, now, {
        team: this.team,
        damage: SKILL_C_DAMAGE,
        kind: 'control',
        effect: { stun: { durationMs: SKILL_C_STUN_DURATION_MS } },
        owner: this,
        maxDistance: SKILL_C_RANGE,
        target: enemy as never,
      });
      this.lastCAt = now;
      return true;
    }
    if (dist <= SKILL_E_RANGE && now - this.lastEAt >= SKILL_E_COOLDOWN_MS) {
      projectiles.spawn(this.position, enemy.position, now, {
        team: this.team,
        damage: SKILL_E_DAMAGE,
        kind: 'slow',
        effect: { slow: { factor: SKILL_E_SLOW_FACTOR, durationMs: SKILL_E_SLOW_DURATION_MS } },
        owner: this,
        maxDistance: SKILL_E_RANGE,
        target: enemy as never,
      });
      this.lastEAt = now;
      return true;
    }
    return false;
  }

  private tryCastMageSkill(
    enemy: { position: THREE.Vector3 },
    dist: number,
    now: number,
    projectiles: ProjectileManager,
  ): boolean {
    // Meteor first — biggest threat. Direct hit + 2s stun + AoE
    // shockwave; same loadout the player-side mage uses.
    if (dist <= MAGE_C_RANGE && now - this.lastCAt >= MAGE_C_COOLDOWN_MS) {
      const damage = MAGE_C_DAMAGE + (this.level - 1) * Math.round(HERO_DAMAGE_PER_LEVEL * 0.6);
      const aoeDamage = MAGE_C_AOE_DAMAGE + (this.level - 1) * Math.round(HERO_DAMAGE_PER_LEVEL * 0.4);
      projectiles.spawn(this.position, enemy.position, now, {
        team: this.team,
        damage,
        kind: 'meteor',
        effect: { stun: { durationMs: MAGE_C_STUN_DURATION_MS } },
        owner: this,
        maxDistance: MAGE_C_RANGE,
        target: enemy as never,
        aoeRadius: MAGE_C_AOE_RADIUS,
        aoeDamage,
      });
      this.lastCAt = now;
      return true;
    }
    // Q fireball — sharp burst with a small AoE splash.
    if (dist <= MAGE_Q_RANGE && now - this.lastQAt >= MAGE_Q_COOLDOWN_MS) {
      const damage = MAGE_Q_DAMAGE + (this.level - 1) * HERO_DAMAGE_PER_LEVEL * 1.5;
      const splash = 35 + (this.level - 1) * Math.round(HERO_DAMAGE_PER_LEVEL * 0.4);
      projectiles.spawn(this.position, enemy.position, now, {
        team: this.team,
        damage,
        kind: 'fireball',
        owner: this,
        maxDistance: MAGE_Q_RANGE,
        target: enemy as never,
        aoeRadius: 1.8,
        aoeDamage: splash,
      });
      this.lastQAt = now;
      return true;
    }
    // Flame wave — slow + medium AoE.
    if (dist <= MAGE_E_RANGE && now - this.lastEAt >= MAGE_E_COOLDOWN_MS) {
      const damage = MAGE_E_DAMAGE + (this.level - 1) * Math.round(HERO_DAMAGE_PER_LEVEL * 0.6);
      const splash = 28 + (this.level - 1) * Math.round(HERO_DAMAGE_PER_LEVEL * 0.4);
      projectiles.spawn(this.position, enemy.position, now, {
        team: this.team,
        damage,
        kind: 'flamewave',
        effect: { slow: { factor: MAGE_E_SLOW_FACTOR, durationMs: MAGE_E_SLOW_DURATION_MS } },
        owner: this,
        maxDistance: MAGE_E_RANGE,
        target: enemy as never,
        aoeRadius: 2.6,
        aoeDamage: splash,
      });
      this.lastEAt = now;
      return true;
    }
    return false;
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
      this.hp = Math.min(this.maxHp, this.hp + (this.maxHp - oldMaxHp));
      this.healthBar.setRatio(this.hp / this.maxHp);
      this.healthBar.setHp(this.hp, this.maxHp);
    }
    if (this.level >= HERO_MAX_LEVEL) this.xp = 0;
    this.refreshLevelBadge();
  }

  private die(): void {
    this.alive = false;
    this.deathStartedAt = performance.now();
    this.respawnAt = this.deathStartedAt + this.respawnDelayMs;
  }

  private respawn(): void {
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

  private moveToward(target: THREE.Vector3, dt: number, speed: number, colliders: Colliders): void {
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.01) return;
    const nx = dx / d;
    const nz = dz / d;
    const step = speed * dt;
    const dir = this.pickMoveDirection(nx, nz, target, step, colliders);
    this.position.x += dir.x * step;
    this.position.z += dir.z * step;
    colliders.resolve(this.position, this.radius);
    this.group.rotation.y = Math.atan2(dir.x, dir.z);
  }

  private pickMoveDirection(
    nx: number,
    nz: number,
    target: THREE.Vector3,
    step: number,
    colliders: Colliders,
  ): { x: number; z: number } {
    const before = distTo(this.position.x, this.position.z, target.x, target.z);
    const angles = [0, 0.32, -0.32, 0.65, -0.65, 1.0, -1.0, 1.45, -1.45, 2.0, -2.0];
    let best: { x: number; z: number } | null = null;
    let bestScore = -Infinity;

    for (const rawAngle of angles) {
      const angle = rawAngle === 0 ? 0 : Math.abs(rawAngle) * this.avoidSide * Math.sign(rawAngle);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const x = nx * cos - nz * sin;
      const z = nx * sin + nz * cos;
      const next = { x: this.position.x + x * step, z: this.position.z + z * step };
      if (colliders.collides(next, this.radius)) continue;
      const after = distTo(next.x, next.z, target.x, target.z);
      const progress = before - after;
      const score = progress - Math.abs(angle) * 0.07;
      if (score > bestScore) {
        bestScore = score;
        best = { x, z };
      }
    }

    if (!best) {
      this.avoidSide *= -1;
      return { x: -nz * this.avoidSide, z: nx * this.avoidSide };
    }
    if (bestScore < this.lastProgress * 0.25) this.avoidSide *= -1;
    this.lastProgress = bestScore;
    return best;
  }

  private buildArcherVisual(): void {
    const skin = new THREE.MeshLambertMaterial({ color: 0xe6c5a0 });
    // Team-coloured "armor" for the AI archer. Blue ally bots get a navy
    // palette so the player can read the team at a glance.
    const isBlue = this.team === 'blue';
    const armor = new THREE.MeshLambertMaterial({ color: isBlue ? 0x2a4f8a : 0xc73c3c });
    const armorDark = new THREE.MeshLambertMaterial({ color: isBlue ? 0x172846 : 0x6a1717 });
    this.armorMat = armor;
    this.armorDarkMat = armorDark;
    const accent = new THREE.MeshLambertMaterial({
      color: 0xf2c14e,
    });
    const bowDark = new THREE.MeshLambertMaterial({
      color: 0x331414,
    });
    const stringMat = new THREE.MeshLambertMaterial({ color: 0xf1dac2 });

    const legGeom = new THREE.CylinderGeometry(0.2, 0.2, 0.9, 12);
    for (const x of [-0.22, 0.22]) {
      const leg = new THREE.Mesh(legGeom, armorDark);
      leg.position.set(x, 0.45, 0);
      leg.castShadow = false;
      this.group.add(leg);
    }

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.6, 6, 12), armor);
    torso.position.y = 1.55;
    torso.castShadow = false;
    this.group.add(torso);

    const beltAccent = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 8, 24), accent);
    beltAccent.rotation.x = Math.PI / 2;
    beltAccent.position.y = 1.3;
    this.group.add(beltAccent);

    const armGeom = new THREE.CylinderGeometry(0.13, 0.13, 0.7, 10);
    for (const x of [-0.55, 0.55]) {
      const arm = new THREE.Mesh(armGeom, armor);
      arm.position.set(x, 1.55, 0);
      arm.castShadow = false;
      this.group.add(arm);
    }

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 14), skin);
    head.position.y = 2.18;
    head.castShadow = false;
    this.group.add(head);

    const helm = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.5, 16), armor);
    helm.position.y = 2.5;
    helm.castShadow = false;
    this.group.add(helm);

    const helmTip = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), accent);
    helmTip.position.y = 2.78;
    this.group.add(helmTip);

    const bow = buildBow(bowDark, accent, stringMat);
    bow.position.set(0.58, 1.42, 0.38);
    bow.rotation.z = -Math.PI / 18;
    this.group.add(bow);
  }

  /**
   * Mage AI build — distinct silhouette so the player can read the threat
   * (robe + hood + ember staff). Team palette decides the robe colour.
   */
  private buildMageVisual(): void {
    const skin = new THREE.MeshLambertMaterial({ color: 0xeec7a8 });
    const isBlue = this.team === 'blue';
    // For the mage, use the same armorMat fields to drive setTeam() — they
    // map to the robe primary / dark colours rather than to literal armor.
    const robe = new THREE.MeshLambertMaterial({ color: isBlue ? 0x2c3a78 : 0x4a1727 });
    const robeDark = new THREE.MeshLambertMaterial({ color: isBlue ? 0x141a3a : 0x230910 });
    this.armorMat = robe;
    this.armorDarkMat = robeDark;
    const trim = new THREE.MeshLambertMaterial({ color: 0xf3b75a });
    const hoodMat = new THREE.MeshLambertMaterial({ color: 0x150a18 });
    const staffMat = new THREE.MeshLambertMaterial({ color: 0x2a1d18 });
    const emberMat = new THREE.MeshLambertMaterial({
      color: 0xffb240,
      emissive: 0xff5520,
      emissiveIntensity: 1.6,
    });
    const emberGlow = new THREE.MeshBasicMaterial({
      color: 0xff7a2a,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });

    // Legs hidden under a long robe — only the boots peek out.
    const legGeom = new THREE.CylinderGeometry(0.18, 0.18, 0.5, 10);
    for (const x of [-0.22, 0.22]) {
      const leg = new THREE.Mesh(legGeom, robeDark);
      leg.position.set(x, 0.25, 0);
      this.group.add(leg);
    }

    // Long robe — wide cone covering the legs.
    const robeMesh = new THREE.Mesh(new THREE.ConeGeometry(0.65, 1.4, 16), robe);
    robeMesh.position.y = 0.7;
    this.group.add(robeMesh);
    // Hem trim.
    const hem = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.04, 8, 28), trim);
    hem.rotation.x = Math.PI / 2;
    hem.position.y = 0.05;
    this.group.add(hem);

    // Cloaked torso.
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.46, 0.55, 6, 12), robe);
    torso.position.y = 1.6;
    this.group.add(torso);

    // Belt with buckle.
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.06, 8, 22), trim);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 1.32;
    this.group.add(belt);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.07), trim);
    buckle.position.set(0, 1.32, 0.42);
    this.group.add(buckle);

    // Wide-sleeved arms.
    const sleeveGeom = new THREE.CylinderGeometry(0.16, 0.18, 0.7, 10);
    for (const x of [-0.55, 0.55]) {
      const sleeve = new THREE.Mesh(sleeveGeom, robe);
      sleeve.position.set(x, 1.55, 0);
      this.group.add(sleeve);
      const sleeveTrim = new THREE.Mesh(
        new THREE.TorusGeometry(0.18, 0.02, 6, 16),
        trim,
      );
      sleeveTrim.rotation.x = Math.PI / 2;
      sleeveTrim.position.set(x, 1.22, 0);
      this.group.add(sleeveTrim);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), skin);
      hand.position.set(x, 1.12, 0);
      this.group.add(hand);
    }

    // Head + hood.
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 14), skin);
    head.position.y = 2.18;
    this.group.add(head);
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.85, 14), hoodMat);
    hood.position.set(0, 2.4, -0.08);
    hood.rotation.x = -0.18;
    this.group.add(hood);
    const hoodRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.32, 0.024, 6, 18),
      trim,
    );
    hoodRim.rotation.x = Math.PI / 2;
    hoodRim.position.set(0, 2.18, 0.18);
    this.group.add(hoodRim);
    // Sinister glowing eyes — reads as a mage from far away.
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff8a3a });
    for (const ex of [-0.1, 0.1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), eyeMat);
      eye.position.set(ex, 2.18, 0.27);
      this.group.add(eye);
    }

    // Staff with ember orb.
    const staff = new THREE.Group();
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.07, 2.2, 8),
      staffMat,
    );
    shaft.position.y = 0.4;
    staff.add(shaft);
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.18, 8),
      trim,
    );
    grip.position.y = 0.85;
    staff.add(grip);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 14), emberMat);
    orb.position.y = 1.65;
    staff.add(orb);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 14), emberGlow);
    halo.position.y = 1.65;
    staff.add(halo);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const claw = new THREE.Mesh(
        new THREE.ConeGeometry(0.05, 0.32, 6),
        staffMat,
      );
      claw.position.set(Math.cos(a) * 0.2, 1.5, Math.sin(a) * 0.2);
      claw.rotation.z = -Math.cos(a) * 0.4;
      claw.rotation.x = Math.sin(a) * 0.4;
      staff.add(claw);
    }
    staff.position.set(0.65, 0.5, 0.2);
    staff.rotation.z = -0.18;
    this.group.add(staff);
  }

  /**
   * Compact humanoid silhouette shared by fighter / assassin / tank bots.
   * Capsule torso + skirt-cone + helmeted head + cylindrical limbs. The
   * three callers tint and accessorize this base.
   */
  private buildSimpleHumanoid(opts: {
    primary: THREE.MeshLambertMaterial;
    dark: THREE.MeshLambertMaterial;
    accent: THREE.MeshLambertMaterial;
    skin: THREE.MeshLambertMaterial;
    helmShape?: 'cone' | 'box';
    bulk?: number;
  }): void {
    this.armorMat = opts.primary;
    this.armorDarkMat = opts.dark;
    const bulk = opts.bulk ?? 1;

    // Legs.
    const legGeom = new THREE.CylinderGeometry(0.21 * bulk, 0.21 * bulk, 0.9, 10);
    for (const x of [-0.24, 0.24]) {
      const leg = new THREE.Mesh(legGeom, opts.dark);
      leg.position.set(x * bulk, 0.45, 0);
      this.group.add(leg);
    }

    // Torso.
    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.5 * bulk, 0.6, 6, 12),
      opts.primary,
    );
    torso.position.y = 1.55;
    this.group.add(torso);

    // Belt accent.
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.55 * bulk, 0.07, 8, 24), opts.accent);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 1.3;
    this.group.add(belt);

    // Arms.
    const armGeom = new THREE.CylinderGeometry(0.13 * bulk, 0.13 * bulk, 0.7, 10);
    for (const x of [-0.55, 0.55]) {
      const arm = new THREE.Mesh(armGeom, opts.primary);
      arm.position.set(x * bulk, 1.55, 0);
      this.group.add(arm);
    }

    // Head + helm.
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34 * bulk, 14, 14), opts.skin);
    head.position.y = 2.18;
    this.group.add(head);
    if (opts.helmShape === 'box') {
      const helm = new THREE.Mesh(
        new THREE.BoxGeometry(0.7 * bulk, 0.4, 0.5),
        opts.dark,
      );
      helm.position.y = 2.5;
      this.group.add(helm);
      const visor = new THREE.Mesh(
        new THREE.BoxGeometry(0.5 * bulk, 0.08, 0.06),
        opts.accent,
      );
      visor.position.set(0, 2.43, 0.27 * bulk);
      this.group.add(visor);
    } else {
      const helm = new THREE.Mesh(
        new THREE.ConeGeometry(0.4 * bulk, 0.5, 16),
        opts.dark,
      );
      helm.position.y = 2.5;
      this.group.add(helm);
      const helmTip = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), opts.accent);
      helmTip.position.y = 2.78;
      this.group.add(helmTip);
    }
  }

  /** Боец — red/gold armour with a sword in hand. */
  private buildFighterVisual(): void {
    const skin = new THREE.MeshLambertMaterial({ color: 0xeec4a4 });
    const isBlue = this.team === 'blue';
    const primary = new THREE.MeshLambertMaterial({ color: isBlue ? 0x2a4f8a : 0x8a3a2a });
    const dark = new THREE.MeshLambertMaterial({ color: isBlue ? 0x141a36 : 0x4a1f15 });
    const accent = new THREE.MeshLambertMaterial({ color: 0xf3b75a });
    this.buildSimpleHumanoid({ primary, dark, accent, skin });

    // Sword on the right side.
    const sword = new THREE.Group();
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.06, 1.2),
      new THREE.MeshLambertMaterial({
        color: 0xcfd6e0,
        emissive: 0x6a86a8,
        emissiveIntensity: 0.3,
      }),
    );
    blade.position.z = 0.55;
    sword.add(blade);
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 0.28, 6),
      new THREE.MeshLambertMaterial({ color: 0xeef2f8 }),
    );
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 1.2;
    sword.add(tip);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 0.1), accent);
    guard.position.z = -0.05;
    sword.add(guard);
    sword.position.set(0.65, 1.5, 0.25);
    sword.rotation.z = -Math.PI / 16;
    sword.rotation.x = -0.2;
    this.group.add(sword);
  }

  /** Убийца — black/purple silhouette with a hood and a single dagger. */
  private buildAssassinVisual(): void {
    const skin = new THREE.MeshLambertMaterial({ color: 0xe2bd9c });
    const isBlue = this.team === 'blue';
    const primary = new THREE.MeshLambertMaterial({ color: isBlue ? 0x1c2a4a : 0x1f1530 });
    const dark = new THREE.MeshLambertMaterial({ color: isBlue ? 0x0c1224 : 0x09080d });
    const accent = new THREE.MeshLambertMaterial({
      color: 0xa470ff,
      emissive: 0x6a2fc8,
      emissiveIntensity: 0.5,
    });
    this.buildSimpleHumanoid({ primary, dark, accent, skin });
    // Hood — replaces the helm so the silhouette reads as a robe-and-cowl.
    const hood = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 0.7, 12),
      dark,
    );
    hood.position.set(0, 2.4, -0.06);
    hood.rotation.x = -0.18;
    this.group.add(hood);

    // Dagger on the right side.
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
    blade.position.z = 0.3;
    dagger.add(blade);
    const hilt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.18, 6),
      dark,
    );
    hilt.rotation.x = Math.PI / 2;
    hilt.position.z = -0.05;
    dagger.add(hilt);
    dagger.position.set(0.6, 1.4, 0.25);
    dagger.rotation.z = -0.18;
    dagger.rotation.x = -0.18;
    this.group.add(dagger);
  }

  /** Танк — heavy plate, boxy helm, two-handed war hammer. */
  private buildTankVisual(): void {
    const skin = new THREE.MeshLambertMaterial({ color: 0xd9a677 });
    const isBlue = this.team === 'blue';
    const primary = new THREE.MeshLambertMaterial({ color: isBlue ? 0x3a5a86 : 0x6c7480 });
    const dark = new THREE.MeshLambertMaterial({ color: isBlue ? 0x1a2440 : 0x3a4048 });
    const accent = new THREE.MeshLambertMaterial({
      color: 0xc99650,
      emissive: 0x6e4e1a,
      emissiveIntensity: 0.4,
    });
    this.buildSimpleHumanoid({ primary, dark, accent, skin, helmShape: 'box', bulk: 1.25 });
    // Big rounded pauldrons.
    for (const side of [-1, 1]) {
      const pauldron = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 10, 10),
        primary,
      );
      pauldron.position.set(0.78 * side, 2.0, 0);
      this.group.add(pauldron);
    }
    // Hammer with chunky head.
    const hammer = new THREE.Group();
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.4), dark);
    head.position.z = 0.6;
    hammer.add(head);
    const headTrim = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.42), accent);
    headTrim.position.set(0, 0.25, 0.6);
    hammer.add(headTrim);
    const haft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.85, 8),
      new THREE.MeshLambertMaterial({ color: 0x4a2d1c }),
    );
    haft.rotation.x = Math.PI / 2;
    haft.position.z = -0.05;
    hammer.add(haft);
    hammer.position.set(0.85, 1.4, 0.2);
    hammer.rotation.z = -Math.PI / 14;
    hammer.rotation.x = -0.4;
    this.group.add(hammer);
  }
}

function distTo(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(bx - ax, bz - az);
}

/** Auto-attack range matching the player-side hero of the same role. */
function botAttackRangeFor(kind: HeroKind): number {
  switch (kind) {
    case 'mage': return MAGE_ATTACK_RANGE;
    case 'fighter': return FIGHTER_ATTACK_RANGE;
    case 'assassin': return ASSASSIN_ATTACK_RANGE;
    case 'tank': return TANK_ATTACK_RANGE;
    default: return PLAYER_ATTACK_RANGE;
  }
}

function buildBow(
  bowMat: THREE.Material,
  arrowMat: THREE.Material,
  stringMat: THREE.Material,
): THREE.Group {
  const bow = new THREE.Group();
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.035, 8, 28), bowMat);
  arc.scale.set(0.55, 1.25, 1);
  arc.castShadow = false;
  bow.add(arc);

  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.1, 6), stringMat);
  string.position.z = -0.08;
  bow.add(string);

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.78, 6), arrowMat);
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = 0.25;
  bow.add(shaft);

  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 8), arrowMat);
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 0.7;
  bow.add(tip);
  return bow;
}
