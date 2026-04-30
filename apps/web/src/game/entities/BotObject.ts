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
  readonly group = new THREE.Group();
  readonly team: Team = 'red';
  readonly radius = BOT_RADIUS;
  readonly maxHp = BOT_MAX_HP;
  hp = BOT_MAX_HP;
  alive = true;
  slowUntil = 0;

  private readonly spawn: THREE.Vector3;
  private readonly healthBar = new HealthBar(2.4, 0.22, 0xff5050);
  private respawnAt = 0;
  private lastAttackAt = -Infinity;

  constructor(spawn: THREE.Vector3) {
    this.spawn = spawn.clone();
    this.buildVisual();
    this.group.position.copy(spawn);
    this.healthBar.group.position.set(-1, 2.5, 0);
    this.group.add(this.healthBar.group);
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  billboardHealthBar(camera: THREE.Camera): void {
    // See PlayerObject.billboardHealthBar — same world camera-left offset
    // with yaw compensation so the bar floats above the bot on phone.
    const yaw = this.group.rotation.y;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    this.healthBar.group.position.set(-1 * cos, 2.5, -1 * sin);
    this.healthBar.billboard(camera);
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
          damage: BOT_DAMAGE,
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

  private die(): void {
    this.alive = false;
    this.group.visible = false;
    this.respawnAt = performance.now() + BOT_RESPAWN_MS;
  }

  private respawn(): void {
    this.hp = this.maxHp;
    this.alive = true;
    this.slowUntil = 0;
    this.group.position.copy(this.spawn);
    this.group.visible = true;
    this.healthBar.setRatio(1);
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
    const accent = new THREE.MeshStandardMaterial({
      color: 0xf2c14e,
      roughness: 0.4,
      metalness: 0.4,
    });

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
  }
}
