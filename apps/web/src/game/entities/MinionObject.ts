import * as THREE from 'three';
import {
  MINION_RADIUS,
} from '../constants.js';
import type { Unit, Team } from '../combat/Unit.js';
import type { UnitRegistry } from '../combat/UnitRegistry.js';
import type { Colliders } from '../world/Colliders.js';
import { HealthBar } from '../combat/HealthBar.js';
import type { ProjectileManager } from './ProjectileManager.js';

export type MinionVariant = 'melee' | 'ranged' | 'tank';

export interface MinionConfig {
  variant: MinionVariant;
  maxHp: number;
  damage: number;
  attackRange: number;
  attackCooldownMs: number;
  speed: number;
  radius: number;
  scale: number;
  /** XP awarded to the killing hero, scaled with HP. */
  xpReward: number;
  /** Ranged minions launch a projectile; melee/tank deal instant damage in melee range. */
  rangedProjectile: boolean;
}

export const MINION_CONFIGS: Record<MinionVariant, MinionConfig> = {
  melee: {
    variant: 'melee',
    maxHp: 220,
    damage: 26,
    attackRange: 2.4,
    attackCooldownMs: 900,
    speed: 3.4,
    radius: 0.75,
    scale: 1.0,
    xpReward: 52,
    rangedProjectile: false,
  },
  ranged: {
    variant: 'ranged',
    maxHp: 110,
    damage: 14,
    attackRange: 7.5,
    attackCooldownMs: 1100,
    speed: 3.6,
    radius: 0.55,
    scale: 0.85,
    xpReward: 32,
    rangedProjectile: true,
  },
  tank: {
    variant: 'tank',
    maxHp: 520,
    damage: 38,
    attackRange: 2.6,
    attackCooldownMs: 1300,
    speed: 2.6,
    radius: 0.95,
    scale: 1.3,
    xpReward: 118,
    rangedProjectile: false,
  },
};

export class MinionObject implements Unit {
  readonly kind = 'minion';
  readonly group = new THREE.Group();
  radius = MINION_RADIUS;
  maxHp: number;
  xpReward: number;
  hp: number;
  alive = true;
  slowUntil = 0;
  stunnedUntil = 0;
  deadAt = 0;

  readonly variant: MinionVariant;
  private readonly config: MinionConfig;
  private readonly healthBar: HealthBar;
  private lastAttackAt = -Infinity;
  private avoidSide: 1 | -1 = 1;
  private lastProgress = 0;
  private gaitPhase = 0;
  private leftLeg?: THREE.Object3D;
  private rightLeg?: THREE.Object3D;
  private leftArm?: THREE.Object3D;
  private rightArm?: THREE.Object3D;

  /** Lane waypoints for the minion to follow. The path is consumed in
   *  order; once exhausted the caller-provided objective takes over (so
   *  the minion finishes by chewing on the enemy base). */
  private path: ReadonlyArray<readonly [number, number]> = [];
  private pathIdx = 0;

  constructor(
    private readonly scene: THREE.Scene,
    readonly team: Team,
    spawn: THREE.Vector3,
    index: number,
    config: MinionConfig,
    path: ReadonlyArray<readonly [number, number]> = [],
  ) {
    this.config = config;
    this.variant = config.variant;
    this.maxHp = config.maxHp;
    this.hp = config.maxHp;
    this.xpReward = config.xpReward;
    this.radius = config.radius;
    this.path = path;
    this.group.position.copy(spawn);
    // Start each lane wave a few steps away from the base collider, then
    // stagger siblings across the lane so the first frame is never crowded.
    const firstWaypoint = path[0];
    if (firstWaypoint) {
      const dx = firstWaypoint[0] - spawn.x;
      const dz = firstWaypoint[1] - spawn.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.01) {
        const nx = dx / len;
        const nz = dz / len;
        const lateral = (index - 1) * 1.45;
        const forward = 4.2 + index * 0.8;
        this.group.position.x += nx * forward - nz * lateral;
        this.group.position.z += nz * forward + nx * lateral;
      }
    } else {
      const lateral = (index - 1) * 1.4;
      this.group.position.x += lateral;
    }
    // Minion bar is short — pass hpScale > 1 so the digits sit on a noticeably
    // wider/taller plate than the bar itself, otherwise they're hard to read
    // at the tactical zoom.
    this.healthBar = new HealthBar(
      1.45,
      0.16,
      team === 'blue' ? 0x64d8ff : 0xff7171,
      false,
      true,
      2.0,
    );
    this.healthBar.group.position.set(0, 1.9 * config.scale + 0.4, 0);
    this.group.add(this.healthBar.group);
    this.healthBar.setHp(this.hp, this.maxHp);
    this.buildVisual(team === 'blue' ? 0x4f9dff : 0xff5f5f);
    scene.add(this.group);
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  update(
    deltaSec: number,
    now: number,
    registry: UnitRegistry,
    projectiles: ProjectileManager,
    colliders: Colliders,
    objective: Unit | null,
  ): void {
    if (!this.alive) {
      this.animateDeath(now);
      return;
    }
    if (this.stunnedUntil > now) return;

    const target = registry.findNearestEnemy(this.team, this.position, this.config.attackRange, [
      'minion',
      'hero',
      'structure',
    ]);

    if (target) {
      this.face(target.position);
      if (now - this.lastAttackAt >= this.config.attackCooldownMs) {
        if (this.config.rangedProjectile) {
          projectiles.spawn(this.position, target.position, now, {
            team: this.team,
            damage: this.config.damage,
            target,
            owner: this,
          });
        } else {
          // Melee swing — instant hit, no projectile travel.
          target.takeDamage(this.config.damage);
        }
        this.lastAttackAt = now;
      }
      this.animateGait(0, deltaSec);
      return;
    }

    // Walk the waypoint path first; once exhausted, fall back to chewing
    // whatever objective the caller picked (usually the enemy base).
    const waypoint = this.currentWaypoint();
    if (waypoint) {
      const [wx, wz] = waypoint;
      const wpVec = TMP_VEC.set(wx, 0, wz);
      this.moveToward(wpVec, deltaSec, colliders);
      this.animateGait(this.config.speed, deltaSec);
      const dx = wx - this.position.x;
      const dz = wz - this.position.z;
      if (dx * dx + dz * dz < 9) this.pathIdx += 1;
      return;
    }
    if (objective?.alive) {
      this.moveToward(objective.position, deltaSec, colliders);
      this.animateGait(this.config.speed, deltaSec);
    } else {
      this.animateGait(0, deltaSec);
    }
  }

  billboardHealthBar(camera: THREE.Camera): void {
    if (!this.alive) return;
    this.healthBar.billboard(camera);
  }

  private currentWaypoint(): readonly [number, number] | null {
    return this.pathIdx < this.path.length ? this.path[this.pathIdx] : null;
  }

  takeDamage(amount: number): void {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - amount);
    this.healthBar.setRatio(this.hp / this.maxHp);
    this.healthBar.setHp(this.hp, this.maxHp);
    if (this.hp <= 0) this.die();
  }

  dispose(): void {
    this.scene.remove(this.group);
  }

  private die(): void {
    this.alive = false;
    this.deadAt = performance.now();
    this.healthBar.group.visible = false;
    this.lastAttackAt = Infinity;
  }

  private animateDeath(now: number): void {
    if (!this.deadAt) return;
    const t = Math.min(1, (now - this.deadAt) / 2000);
    const eased = 1 - (1 - t) * (1 - t);
    this.group.rotation.x = -Math.PI / 2 * Math.min(1, eased * 1.2);
    this.group.position.y = -0.45 * eased;
    const scale = Math.max(0.72, 1 - eased * 0.28);
    this.group.scale.setScalar(scale);
  }

  private animateGait(speed: number, deltaSec: number): void {
    if (speed > 0.1) {
      this.gaitPhase += deltaSec * (4 + speed * 0.6);
      const swing = Math.sin(this.gaitPhase) * 0.55;
      if (this.leftLeg) this.leftLeg.rotation.x = swing;
      if (this.rightLeg) this.rightLeg.rotation.x = -swing;
      if (this.leftArm) this.leftArm.rotation.x = -swing * 0.6;
      if (this.rightArm) this.rightArm.rotation.x = swing * 0.6;
    } else {
      // Ease back to neutral pose.
      const k = Math.min(1, deltaSec * 8);
      const lerp = (a: number, b: number) => a + (b - a) * k;
      if (this.leftLeg) this.leftLeg.rotation.x = lerp(this.leftLeg.rotation.x, 0);
      if (this.rightLeg) this.rightLeg.rotation.x = lerp(this.rightLeg.rotation.x, 0);
      if (this.leftArm) this.leftArm.rotation.x = lerp(this.leftArm.rotation.x, 0);
      if (this.rightArm) this.rightArm.rotation.x = lerp(this.rightArm.rotation.x, 0);
    }
  }

  private moveToward(target: THREE.Vector3, deltaSec: number, colliders: Colliders): void {
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return;
    const nx = dx / dist;
    const nz = dz / dist;
    const step = this.config.speed * deltaSec;
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
    const angles = [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.55, -1.55, 2.1, -2.1];
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
      const score = progress - Math.abs(angle) * 0.08;
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

  private face(target: THREE.Vector3): void {
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    if (Math.abs(dx) + Math.abs(dz) < 0.001) return;
    this.group.rotation.y = Math.atan2(dx, dz);
  }

  private buildVisual(color: number): void {
    const root = new THREE.Group();
    root.scale.setScalar(this.config.scale);
    this.group.add(root);

    const bodyMat = new THREE.MeshLambertMaterial({ color });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x303442 });
    const glowMat = new THREE.MeshLambertMaterial({
      color: 0xffdf7a,
      emissive: 0xffc35a,
      emissiveIntensity: 0.5,
    });

    // Body — bulkier for tank, slimmer for ranged.
    const torsoR = this.variant === 'tank' ? 0.46 : this.variant === 'ranged' ? 0.28 : 0.36;
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(torsoR, 0.5, 5, 10), bodyMat);
    torso.position.y = 0.95;
    torso.castShadow = false;
    root.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 12), bodyMat);
    head.position.y = 1.45;
    head.castShadow = false;
    root.add(head);

    // Legs — separate pivots for the gait swing.
    const legGeom = new THREE.CylinderGeometry(0.1, 0.1, 0.55, 8);
    legGeom.translate(0, -0.275, 0);
    const legMat = bodyMat;
    const leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.15, 0.55, 0);
    const leftLegMesh = new THREE.Mesh(legGeom, legMat);
    leftLegMesh.castShadow = false;
    leftLegPivot.add(leftLegMesh);
    root.add(leftLegPivot);
    this.leftLeg = leftLegPivot;

    const rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(0.15, 0.55, 0);
    const rightLegMesh = new THREE.Mesh(legGeom, legMat);
    rightLegMesh.castShadow = false;
    rightLegPivot.add(rightLegMesh);
    root.add(rightLegPivot);
    this.rightLeg = rightLegPivot;

    // Arms.
    const armGeom = new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8);
    armGeom.translate(0, -0.25, 0);
    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-(torsoR + 0.08), 1.18, 0);
    const leftArmMesh = new THREE.Mesh(armGeom, legMat);
    leftArmMesh.castShadow = false;
    leftArmPivot.add(leftArmMesh);
    root.add(leftArmPivot);
    this.leftArm = leftArmPivot;

    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(torsoR + 0.08, 1.18, 0);
    const rightArmMesh = new THREE.Mesh(armGeom, legMat);
    rightArmMesh.castShadow = false;
    rightArmPivot.add(rightArmMesh);
    root.add(rightArmPivot);
    this.rightArm = rightArmPivot;

    // Per-variant accessory.
    if (this.variant === 'ranged') {
      const bow = new THREE.Mesh(
        new THREE.TorusGeometry(0.32, 0.04, 6, 12, Math.PI),
        darkMat,
      );
      bow.rotation.z = Math.PI / 2;
      bow.position.set(0.32, 1.2, 0.3);
      root.add(bow);
    } else if (this.variant === 'melee') {
      const sword = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.08), glowMat);
      sword.position.set(0.32, 1.35, 0.4);
      sword.rotation.x = -Math.PI / 4;
      root.add(sword);
    } else {
      // Tank: shield + heavy spike.
      const shield = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.08), darkMat);
      shield.position.set(-0.42, 1.1, 0.3);
      root.add(shield);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.4, 8), glowMat);
      spike.position.set(0, 1.85, 0);
      root.add(spike);
    }
  }
}

function distTo(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(bx - ax, bz - az);
}

const TMP_VEC = new THREE.Vector3();
