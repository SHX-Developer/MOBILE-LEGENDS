import * as THREE from 'three';
import {
  BASE_BLUE_X,
  BASE_RED_X,
  BASE_RADIUS,
  BASE_HIT_RADIUS,
  BASE_MAX_HP,
  COLOR_BASE_BLUE,
  COLOR_BASE_RED,
} from '../constants.js';
import { Colliders, CircleCollider } from './Colliders.js';
import type { Unit, Team } from '../combat/Unit.js';
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
  private readonly collider: CircleCollider;
  private readonly colliders: Colliders;

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

    this.platform = new THREE.Mesh(
      new THREE.CylinderGeometry(BASE_RADIUS + 1, BASE_RADIUS + 2, 0.6, 32),
      new THREE.MeshStandardMaterial({ color, roughness: 0.6 }),
    );
    this.platform.position.set(x, 0.3, 0);
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
    this.crystal.position.set(x, 4, 0);
    this.crystal.castShadow = true;
    scene.add(this.crystal);
    this.collider = colliders.addCircle(x, 0, BASE_RADIUS);

    scene.userData.crystals = scene.userData.crystals ?? [];
    (scene.userData.crystals as THREE.Mesh[]).push(this.crystal);

    this.healthBar = new HealthBar(4, 0.36, color);
    this.healthBar.group.position.set(x, 9.5, 0);
    scene.add(this.healthBar.group);
  }

  takeDamage(amount: number): void {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - amount);
    this.healthBar.setRatio(this.hp / this.maxHp);
    if (this.hp <= 0) this.die();
  }

  private die(): void {
    this.alive = false;
    this.crystal.visible = false;
    this.platform.visible = false;
    this.healthBar.group.visible = false;
    this.colliders.removeCircle(this.collider);
    this.onDestroyed?.();
  }
}

export function buildBases(scene: THREE.Scene, colliders: Colliders): Base[] {
  return [
    new Base(scene, BASE_BLUE_X, 'blue', COLOR_BASE_BLUE, colliders),
    new Base(scene, BASE_RED_X, 'red', COLOR_BASE_RED, colliders),
  ];
}
