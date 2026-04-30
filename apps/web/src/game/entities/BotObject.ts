import * as THREE from 'three';
import {
  BOT_ATTACK_COOLDOWN_MS,
  BOT_ATTACK_RANGE,
  BOT_DAMAGE,
  BOT_MAX_HP,
  BOT_RADIUS,
  BOT_REGEN_PER_SEC,
  BOT_RESPAWN_MS,
  BOT_RETREAT_HP_FRACTION,
  BOT_SPEED_3D,
  BOT_VISION_RANGE,
  HERO_BASE_XP_TO_LEVEL,
  HERO_DAMAGE_PER_LEVEL,
  HERO_HP_PER_LEVEL,
  HERO_KILL_XP_REWARD,
  HERO_MAX_LEVEL,
  HERO_XP_LEVEL_GROWTH,
} from '../constants.js';
import type { Unit, Team } from '../combat/Unit.js';
import type { UnitRegistry } from '../combat/UnitRegistry.js';
import type { Colliders } from '../world/Colliders.js';
import { HealthBar } from '../combat/HealthBar.js';
import type { ProjectileManager } from './ProjectileManager.js';

/**
 * Red-team bot opponent. Naive FSM:
 *   • low HP → retreat to spawn, regen
 *   • enemy in vision and out of attack range → pursue
 *   • enemy in attack range → stop, fire on cooldown
 *   • no enemy in vision → walk toward map centre
 */
export class BotObject implements Unit {
  readonly kind = 'hero';
  readonly group = new THREE.Group();
  team: Team = 'red';
  readonly radius = BOT_RADIUS;
  readonly xpReward = HERO_KILL_XP_REWARD;
  hp = BOT_MAX_HP;
  alive = true;
  slowUntil = 0;
  stunnedUntil = 0;
  level = 1;
  xp = 0;
  respawnDelayMs = BOT_RESPAWN_MS;

  private readonly spawn: THREE.Vector3;
  private readonly healthBar = new HealthBar(2.4, 0.22, 0xff5050, true);
  private respawnAt = 0;
  private lastAttackAt = -Infinity;
  private armorMat!: THREE.MeshStandardMaterial;
  private armorDarkMat!: THREE.MeshStandardMaterial;

  constructor(spawn: THREE.Vector3) {
    this.spawn = spawn.clone();
    this.buildVisual();
    this.group.position.copy(spawn);
    this.healthBar.group.position.set(0, 3, 0);
    this.group.add(this.healthBar.group);
    this.refreshLevelBadge();
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  get maxHp(): number {
    return BOT_MAX_HP + (this.level - 1) * HERO_HP_PER_LEVEL;
  }

  get attackDamage(): number {
    return BOT_DAMAGE + (this.level - 1) * HERO_DAMAGE_PER_LEVEL;
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
      if (now >= this.respawnAt) this.respawn();
      return;
    }
    if (this.stunnedUntil > now) return;

    const slowed = this.slowUntil > now;
    const speed = slowed ? BOT_SPEED_3D * 0.5 : BOT_SPEED_3D;
    const lowHp = this.hp / this.maxHp <= BOT_RETREAT_HP_FRACTION;

    if (lowHp) {
      this.moveToward(this.spawn, deltaSec, speed);
      const dx = this.spawn.x - this.position.x;
      const dz = this.spawn.z - this.position.z;
      if (dx * dx + dz * dz < 9) {
        this.hp = Math.min(this.maxHp, this.hp + BOT_REGEN_PER_SEC * deltaSec);
        this.healthBar.setRatio(this.hp / this.maxHp);
      }
      colliders.resolve(this.position, this.radius);
      return;
    }

    const enemy = registry.findNearestEnemy(this.team, this.position, BOT_VISION_RANGE);
    if (!enemy) {
      this.moveToward(new THREE.Vector3(0, 0, 0), deltaSec, speed);
      colliders.resolve(this.position, this.radius);
      return;
    }

    const dx = enemy.position.x - this.position.x;
    const dz = enemy.position.z - this.position.z;
    const dist = Math.hypot(dx, dz);

    if (dist > BOT_ATTACK_RANGE) {
      const nx = dx / dist;
      const nz = dz / dist;
      this.position.x += nx * speed * deltaSec;
      this.position.z += nz * speed * deltaSec;
      this.group.rotation.y = Math.atan2(nx, nz);
      colliders.resolve(this.position, this.radius);
    } else {
      this.group.rotation.y = Math.atan2(dx, dz);
      if (now - this.lastAttackAt >= BOT_ATTACK_COOLDOWN_MS) {
        projectiles.spawn(this.position, enemy.position, now, {
          team: this.team,
          damage: this.attackDamage,
          target: enemy,
          owner: this,
        });
        this.lastAttackAt = now;
      }
    }
  }

  takeDamage(amount: number): void {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - amount);
    this.healthBar.setRatio(this.hp / this.maxHp);
    if (this.hp <= 0) this.die();
  }

  heal(amount: number): void {
    if (!this.alive || amount <= 0 || this.hp >= this.maxHp) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.healthBar.setRatio(this.hp / this.maxHp);
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
    }
    if (this.level >= HERO_MAX_LEVEL) this.xp = 0;
    this.refreshLevelBadge();
  }

  private die(): void {
    this.alive = false;
    this.group.visible = false;
    this.respawnAt = performance.now() + this.respawnDelayMs;
  }

  private respawn(): void {
    this.hp = this.maxHp;
    this.alive = true;
    this.slowUntil = 0;
    this.stunnedUntil = 0;
    this.group.position.copy(this.spawn);
    this.group.visible = true;
    this.healthBar.setRatio(1);
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
    this.healthBar.setLevel(state.level, state.xpToNext > 0 ? state.xp / state.xpToNext : 1);
  }

  private xpToNext(): number {
    return Math.round(HERO_BASE_XP_TO_LEVEL * HERO_XP_LEVEL_GROWTH ** (this.level - 1));
  }

  private refreshLevelBadge(): void {
    const progress = this.level >= HERO_MAX_LEVEL ? 1 : this.xp / this.xpToNext();
    this.healthBar.setLevel(this.level, progress);
  }

  private moveToward(target: THREE.Vector3, dt: number, speed: number): void {
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.01) return;
    const nx = dx / d;
    const nz = dz / d;
    this.position.x += nx * speed * dt;
    this.position.z += nz * speed * dt;
    this.group.rotation.y = Math.atan2(nx, nz);
  }

  private buildVisual(): void {
    const skin = new THREE.MeshStandardMaterial({ color: 0xe6c5a0, roughness: 0.7 });
    const armor = new THREE.MeshStandardMaterial({ color: 0xc73c3c, roughness: 0.6 });
    const armorDark = new THREE.MeshStandardMaterial({ color: 0x6a1717, roughness: 0.5 });
    this.armorMat = armor;
    this.armorDarkMat = armorDark;
    const accent = new THREE.MeshStandardMaterial({
      color: 0xf2c14e,
      roughness: 0.4,
      metalness: 0.4,
    });
    const bowDark = new THREE.MeshStandardMaterial({
      color: 0x331414,
      roughness: 0.45,
      metalness: 0.5,
    });
    const stringMat = new THREE.MeshStandardMaterial({ color: 0xf1dac2, roughness: 0.5 });

    const legGeom = new THREE.CylinderGeometry(0.2, 0.2, 0.9, 12);
    for (const x of [-0.22, 0.22]) {
      const leg = new THREE.Mesh(legGeom, armorDark);
      leg.position.set(x, 0.45, 0);
      leg.castShadow = true;
      this.group.add(leg);
    }

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.6, 6, 12), armor);
    torso.position.y = 1.55;
    torso.castShadow = true;
    this.group.add(torso);

    const beltAccent = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 8, 24), accent);
    beltAccent.rotation.x = Math.PI / 2;
    beltAccent.position.y = 1.3;
    this.group.add(beltAccent);

    const armGeom = new THREE.CylinderGeometry(0.13, 0.13, 0.7, 10);
    for (const x of [-0.55, 0.55]) {
      const arm = new THREE.Mesh(armGeom, armor);
      arm.position.set(x, 1.55, 0);
      arm.castShadow = true;
      this.group.add(arm);
    }

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 14), skin);
    head.position.y = 2.18;
    head.castShadow = true;
    this.group.add(head);

    const helm = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.5, 16), armor);
    helm.position.y = 2.5;
    helm.castShadow = true;
    this.group.add(helm);

    const helmTip = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), accent);
    helmTip.position.y = 2.78;
    this.group.add(helmTip);

    const bow = buildBow(bowDark, accent, stringMat);
    bow.position.set(0.58, 1.42, 0.38);
    bow.rotation.z = -Math.PI / 18;
    this.group.add(bow);
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
  arc.castShadow = true;
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
