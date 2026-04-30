import * as THREE from 'three';
import {
  TOWER_RADIUS,
  TOWER_HEIGHT,
  TOWER_BLUE_X,
  TOWER_RED_X,
  TOWER_MAX_HP,
  TOWER_DAMAGE,
  TOWER_ATTACK_RANGE,
  TOWER_ATTACK_COOLDOWN_MS,
  COLOR_TOWER_BLUE,
  COLOR_TOWER_RED,
} from '../constants.js';
import { Colliders, CircleCollider } from './Colliders.js';
import type { Unit, Team } from '../combat/Unit.js';
import type { UnitRegistry } from '../combat/UnitRegistry.js';
import { HealthBar } from '../combat/HealthBar.js';
import type { ProjectileManager } from '../entities/ProjectileManager.js';

export class Tower implements Unit {
  readonly team: Team;
  readonly radius = TOWER_RADIUS * 1.6;
  readonly maxHp = TOWER_MAX_HP;
  hp = TOWER_MAX_HP;
  alive = true;
  slowUntil = 0;
  readonly position: THREE.Vector3;

  onDestroyed?: () => void;

  private readonly group: THREE.Group;
  private readonly healthBar: HealthBar;
  private readonly collider: CircleCollider;
  private readonly colliders: Colliders;
  private lastAttackAt = -Infinity;

  constructor(
    scene: THREE.Scene,
    x: number,
    team: Team,
    color: number,
    colliders: Colliders,
  ) {
    this.team = team;
    this.position = new THREE.Vector3(x, 0, 0);
    this.colliders = colliders;
    this.group = new THREE.Group();

    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(TOWER_RADIUS * 1.4, TOWER_RADIUS * 1.6, 1, 16),
      mat,
    );
    base.position.set(x, 0.5, 0);
    this.group.add(base);

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(TOWER_RADIUS, TOWER_RADIUS * 1.2, TOWER_HEIGHT, 16),
      mat,
    );
    shaft.position.set(x, 1 + TOWER_HEIGHT / 2, 0);
    shaft.castShadow = true;
    this.group.add(shaft);

    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(TOWER_RADIUS * 1.3, 1.6, 16),
      mat,
    );
    cap.position.set(x, 1 + TOWER_HEIGHT + 0.8, 0);
    cap.castShadow = true;
    this.group.add(cap);

    scene.add(this.group);
    this.collider = colliders.addCircle(x, 0, this.radius);

    this.healthBar = new HealthBar(3.5, 0.32, color);
    this.healthBar.group.position.set(x, 8.5, 0);
    scene.add(this.healthBar.group);
  }

  update(now: number, registry: UnitRegistry, projectiles: ProjectileManager): void {
    if (!this.alive) return;
    if (now - this.lastAttackAt < TOWER_ATTACK_COOLDOWN_MS) return;
    const target = registry.findNearestEnemy(this.team, this.position, TOWER_ATTACK_RANGE);
    if (!target) return;
    projectiles.spawn(this.position, target.position, now, {
      team: this.team,
      damage: TOWER_DAMAGE,
    });
    this.lastAttackAt = now;
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
    this.healthBar.group.visible = false;
    this.colliders.removeCircle(this.collider);
    this.onDestroyed?.();
  }
}

export function buildTowers(scene: THREE.Scene, colliders: Colliders): Tower[] {
  return [
    new Tower(scene, TOWER_BLUE_X, 'blue', COLOR_TOWER_BLUE, colliders),
    new Tower(scene, TOWER_RED_X, 'red', COLOR_TOWER_RED, colliders),
  ];
}
