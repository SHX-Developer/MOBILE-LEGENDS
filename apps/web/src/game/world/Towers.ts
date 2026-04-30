import * as THREE from 'three';
import {
  TOWER_RADIUS,
  TOWER_HEIGHT,
  TOWER_BLUE_X,
  TOWER_BLUE_Z,
  TOWER_RED_X,
  TOWER_RED_Z,
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
    this.group = new THREE.Group();

    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(TOWER_RADIUS * 1.4, TOWER_RADIUS * 1.6, 1, 16),
      mat,
    );
    base.position.set(x, 0.5, z);
    this.group.add(base);

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(TOWER_RADIUS, TOWER_RADIUS * 1.2, TOWER_HEIGHT, 16),
      mat,
    );
    shaft.position.set(x, 1 + TOWER_HEIGHT / 2, z);
    shaft.castShadow = true;
    this.group.add(shaft);

    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(TOWER_RADIUS * 1.3, 1.6, 16),
      mat,
    );
    cap.position.set(x, 1 + TOWER_HEIGHT + 0.8, z);
    cap.castShadow = true;
    this.group.add(cap);

    scene.add(this.group);
    this.collider = colliders.addCircle(x, z, this.radius);

    this.rangeRing = buildRangeRing(TOWER_ATTACK_RANGE, color, 0.32);
    this.rangeRing.position.set(x, 0.04, z);
    scene.add(this.rangeRing);

    this.healthBar = new HealthBar(3.5, 0.32, color);
    // Offset in world camera-left (−X) + up (+Y) projects to phone-up after
    // the CSS 90° CW canvas rotation, placing the bar above the tower
    // on the phone screen. Tower top is around y=10, so the +Y component
    // positions the bar near the top in screen space.
    this.healthBar.group.position.set(x - 1.5, 10, z);
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

  billboardHealthBar(camera: THREE.Camera): void {
    if (this.alive) this.healthBar.billboard(camera);
  }

  private die(): void {
    this.alive = false;
    this.group.visible = false;
    this.rangeRing.visible = false;
    this.healthBar.group.visible = false;
    this.colliders.removeCircle(this.collider);
    this.onDestroyed?.();
  }
}

function buildRangeRing(range: number, color: number, opacity: number): THREE.Mesh {
  const inner = range - 0.4;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(inner, range, 64),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  return ring;
}

export function buildTowers(scene: THREE.Scene, colliders: Colliders): Tower[] {
  return [
    new Tower(scene, TOWER_BLUE_X, TOWER_BLUE_Z, 'blue', COLOR_TOWER_BLUE, colliders),
    new Tower(scene, TOWER_RED_X, TOWER_RED_Z, 'red', COLOR_TOWER_RED, colliders),
  ];
}
