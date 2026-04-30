import * as THREE from 'three';
import {
  BASE_ATTACK_COOLDOWN_MS,
  BASE_ATTACK_RANGE,
  BASE_BLUE_X,
  BASE_BLUE_Z,
  BASE_DAMAGE,
  BASE_HIT_RADIUS,
  BASE_MAX_HP,
  BASE_RADIUS,
  BASE_RED_X,
  BASE_RED_Z,
  COLOR_BASE_BLUE,
  COLOR_BASE_RED,
} from '../constants.js';
import { Colliders, CircleCollider } from './Colliders.js';
import type { Unit, Team } from '../combat/Unit.js';
import type { UnitRegistry } from '../combat/UnitRegistry.js';
import type { ProjectileManager } from '../entities/ProjectileManager.js';
import { HealthBar } from '../combat/HealthBar.js';

export class Base implements Unit {
  readonly team: Team;
  readonly radius = BASE_HIT_RADIUS;
  readonly maxHp = BASE_MAX_HP;
  hp = BASE_MAX_HP;
  alive = true;
  slowUntil = 0;
  readonly position: THREE.Vector3;

  onDestroyed?: () => void;

  private readonly platform: THREE.Mesh;
  private readonly crystal: THREE.Mesh;
  private readonly healthBar: HealthBar;
  private readonly rangeRing: THREE.Mesh;
  private readonly collider: CircleCollider;
  private readonly colliders: Colliders;
  private lastAttackAt = -Infinity;

  constructor(
    scene: THREE.Scene,
    x: number,
    z: number,
    team: Team,
    color: number,
    colliders: Colliders,
  ) {
    this.team = team;
    this.position = new THREE.Vector3(x, 0, z);
    this.colliders = colliders;

    this.platform = new THREE.Mesh(
      new THREE.CylinderGeometry(BASE_RADIUS + 1, BASE_RADIUS + 2, 0.6, 32),
      new THREE.MeshStandardMaterial({ color, roughness: 0.6 }),
    );
    this.platform.position.set(x, 0.3, z);
    scene.add(this.platform);

    this.crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(2.6, 0),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.6,
        roughness: 0.2,
        metalness: 0.7,
      }),
    );
    this.crystal.position.set(x, 4, z);
    this.crystal.castShadow = true;
    scene.add(this.crystal);
    this.collider = colliders.addCircle(x, z, BASE_RADIUS);

    scene.userData.crystals = scene.userData.crystals ?? [];
    (scene.userData.crystals as THREE.Mesh[]).push(this.crystal);

    this.rangeRing = new THREE.Mesh(
      new THREE.RingGeometry(BASE_ATTACK_RANGE - 0.4, BASE_ATTACK_RANGE, 64),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.rangeRing.rotation.x = -Math.PI / 2;
    this.rangeRing.position.set(x, 0.04, z);
    scene.add(this.rangeRing);

    this.healthBar = new HealthBar(4, 0.36, color);
    this.healthBar.group.position.set(x, 9.5, z);
    scene.add(this.healthBar.group);
  }

  update(now: number, registry: UnitRegistry, projectiles: ProjectileManager): void {
    if (!this.alive) return;
    if (now - this.lastAttackAt < BASE_ATTACK_COOLDOWN_MS) return;
    const target = registry.findNearestEnemy(this.team, this.position, BASE_ATTACK_RANGE);
    if (!target) return;
    projectiles.spawn(this.position, target.position, now, {
      team: this.team,
      damage: BASE_DAMAGE,
      kind: 'heavy',
    });
    this.lastAttackAt = now;
  }

  takeDamage(amount: number): void {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - amount);
    this.healthBar.setRatio(this.hp / this.maxHp);
    if (this.hp <= 0) this.die();
  }

  billboardHealthBar(camera: THREE.Camera): void {
    if (this.alive) this.healthBar.billboard(camera);
  }

  private die(): void {
    this.alive = false;
    this.crystal.visible = false;
    this.platform.visible = false;
    this.rangeRing.visible = false;
    this.healthBar.group.visible = false;
    this.colliders.removeCircle(this.collider);
    this.onDestroyed?.();
  }
}

export function buildBases(scene: THREE.Scene, colliders: Colliders): Base[] {
  return [
    new Base(scene, BASE_BLUE_X, BASE_BLUE_Z, 'blue', COLOR_BASE_BLUE, colliders),
    new Base(scene, BASE_RED_X, BASE_RED_Z, 'red', COLOR_BASE_RED, colliders),
  ];
}
