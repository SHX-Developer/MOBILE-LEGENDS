import * as THREE from 'three';
import {
  MINION_ATTACK_COOLDOWN_MS,
  MINION_ATTACK_RANGE,
  MINION_DAMAGE,
  MINION_MAX_HP,
  MINION_RADIUS,
  MINION_SPEED_3D,
  MINION_XP_REWARD,
} from '../constants.js';
import type { Unit, Team } from '../combat/Unit.js';
import type { UnitRegistry } from '../combat/UnitRegistry.js';
import type { Colliders } from '../world/Colliders.js';
import { HealthBar } from '../combat/HealthBar.js';
import type { ProjectileManager } from './ProjectileManager.js';

export class MinionObject implements Unit {
  readonly kind = 'minion';
  readonly group = new THREE.Group();
  readonly radius = MINION_RADIUS;
  readonly maxHp = MINION_MAX_HP;
  readonly xpReward = MINION_XP_REWARD;
  hp = MINION_MAX_HP;
  alive = true;
  slowUntil = 0;
  stunnedUntil = 0;
  deadAt = 0;

  private readonly healthBar: HealthBar;
  private lastAttackAt = -Infinity;
  private avoidSide: 1 | -1 = 1;
  private lastProgress = 0;

  constructor(
    private readonly scene: THREE.Scene,
    readonly team: Team,
    spawn: THREE.Vector3,
    index: number,
  ) {
    this.group.position.copy(spawn);
    this.group.position.x += (index - 1) * 1.4;
    this.healthBar = new HealthBar(1.45, 0.16, team === 'blue' ? 0x64d8ff : 0xff7171);
    this.healthBar.group.position.set(0, 1.9, 0);
    this.group.add(this.healthBar.group);
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
    if (!this.alive) return;
    if (this.stunnedUntil > now) return;

    const target = registry.findNearestEnemy(this.team, this.position, MINION_ATTACK_RANGE, [
      'minion',
      'hero',
      'structure',
    ]);

    if (target) {
      this.face(target.position);
      if (now - this.lastAttackAt >= MINION_ATTACK_COOLDOWN_MS) {
        projectiles.spawn(this.position, target.position, now, {
          team: this.team,
          damage: MINION_DAMAGE,
          target,
          owner: this,
        });
        this.lastAttackAt = now;
      }
      return;
    }

    if (objective?.alive) {
      this.moveToward(objective.position, deltaSec, colliders);
    }
  }

  billboardHealthBar(camera: THREE.Camera): void {
    if (!this.alive) return;
    this.healthBar.group.position.set(0, 1.9, 0);
    this.healthBar.billboard(camera);
  }

  takeDamage(amount: number): void {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - amount);
    this.healthBar.setRatio(this.hp / this.maxHp);
    if (this.hp <= 0) this.die();
  }

  dispose(): void {
    this.scene.remove(this.group);
  }

  private die(): void {
    this.alive = false;
    this.deadAt = performance.now();
    this.group.visible = false;
  }

  private moveToward(target: THREE.Vector3, deltaSec: number, colliders: Colliders): void {
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return;
    const nx = dx / dist;
    const nz = dz / dist;
    const step = MINION_SPEED_3D * deltaSec;
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
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x303442, roughness: 0.75 });
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0xffdf7a,
      emissive: 0xffc35a,
      emissiveIntensity: 0.5,
      roughness: 0.4,
    });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.55, 5, 10), bodyMat);
    body.position.y = 0.9;
    body.castShadow = true;
    this.group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), bodyMat);
    head.position.y = 1.42;
    head.castShadow = true;
    this.group.add(head);

    const cannon = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.8), darkMat);
    cannon.position.set(0, 1.02, 0.48);
    cannon.castShadow = true;
    this.group.add(cannon);

    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), glowMat);
    muzzle.position.set(0, 1.02, 0.9);
    this.group.add(muzzle);
  }
}

function distTo(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(bx - ax, bz - az);
}
