import * as THREE from 'three';
import {
  TOWER_RADIUS,
  TOWER_HEIGHT,
  TOWER_BLUE_TOP_X,
  TOWER_BLUE_TOP_Z,
  TOWER_BLUE_MID_X,
  TOWER_BLUE_MID_Z,
  TOWER_BLUE_BOT_X,
  TOWER_BLUE_BOT_Z,
  TOWER_RED_TOP_X,
  TOWER_RED_TOP_Z,
  TOWER_RED_MID_X,
  TOWER_RED_MID_Z,
  TOWER_RED_BOT_X,
  TOWER_RED_BOT_Z,
  TOWER_MAX_HP,
  TOWER_DAMAGE,
  TOWER_ATTACK_RANGE,
  TOWER_ATTACK_COOLDOWN_MS,
  TOWER_PROJECTILE_SPEED_3D,
  COLOR_TOWER_BLUE,
  COLOR_TOWER_RED,
} from '../constants.js';
import { Colliders, CircleCollider } from './Colliders.js';
import type { Unit, Team } from '../combat/Unit.js';
import type { UnitRegistry } from '../combat/UnitRegistry.js';
import { HealthBar } from '../combat/HealthBar.js';
import type { ProjectileManager } from '../entities/ProjectileManager.js';

export class Tower implements Unit {
  readonly kind = 'structure';
  readonly team: Team;
  readonly radius = TOWER_RADIUS * 1.6;
  readonly maxHp = TOWER_MAX_HP;
  readonly xpReward = 0;
  hp = TOWER_MAX_HP;
  alive = true;
  slowUntil = 0;
  stunnedUntil = 0;
  readonly position: THREE.Vector3;

  onDestroyed?: () => void;

  private readonly group: THREE.Group;
  private readonly healthBar: HealthBar;
  private readonly rangeRing: THREE.Mesh;
  private readonly collider: CircleCollider;
  private readonly colliders: Colliders;
  private readonly scene: THREE.Scene;
  private readonly tipY: number;
  private readonly color: number;
  private lastAttackAt = -Infinity;
  private dyingAt = 0;
  private debris: Array<{ mesh: THREE.Mesh; vx: number; vy: number; vz: number; spawnedAt: number }> = [];

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
    this.scene = scene;
    this.color = color;
    this.tipY = 1 + TOWER_HEIGHT + 1.6;
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
    // Centered over the tower in the rotated-phone landscape view.
    this.healthBar.group.position.set(x, 10, z);
    scene.add(this.healthBar.group);
  }

  update(now: number, registry: UnitRegistry, projectiles: ProjectileManager): void {
    if (this.dyingAt) {
      this.tickDeath(now);
      return;
    }
    if (!this.alive) return;
    if (this.stunnedUntil > now) return;
    if (now - this.lastAttackAt < TOWER_ATTACK_COOLDOWN_MS) return;
    const target = registry.findNearestEnemy(this.team, this.position, TOWER_ATTACK_RANGE, [
      'minion',
      'hero',
      'structure',
    ]);
    if (!target) return;
    // Muzzle flash from the tip of the tower so the shot reads as fired.
    projectiles.spawnMuzzleFlash(
      new THREE.Vector3(this.position.x, this.tipY - 1, this.position.z),
      new THREE.Vector3(0, 0, 0),
    );
    projectiles.spawn(this.position, target.position, now, {
      team: this.team,
      damage: TOWER_DAMAGE,
      kind: 'meteor',
      speed: TOWER_PROJECTILE_SPEED_3D,
      target,
      owner: this,
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
    this.dyingAt = performance.now();
    // Hide UI bits but keep the tower mesh visible — it animates a collapse.
    this.rangeRing.visible = false;
    this.healthBar.group.visible = false;
    this.colliders.removeCircle(this.collider);
    this.spawnDebris();
    this.onDestroyed?.();
  }

  /** Wobble + sink the tower over ~1500ms then hide it entirely. Debris
   *  pieces spawned in spawnDebris() are advected by gravity in parallel. */
  private tickDeath(now: number): void {
    const elapsed = now - this.dyingAt;
    const t = Math.min(1, elapsed / 1500);
    // Wobble for the first half, then tip backwards as it collapses.
    const wobble = elapsed < 500 ? Math.sin(elapsed / 30) * 0.08 * (1 - elapsed / 500) : 0;
    const tilt = Math.max(0, (t - 0.4) / 0.6) * 0.9;
    this.group.rotation.set(tilt, wobble, wobble * 0.5);
    this.group.position.y = -2.5 * t * t;
    if (t >= 1) this.group.visible = false;

    // Update debris.
    const dt = 1 / 60;
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      const age = now - d.spawnedAt;
      if (age > 1400) {
        this.scene.remove(d.mesh);
        d.mesh.geometry.dispose();
        (d.mesh.material as THREE.Material).dispose();
        this.debris.splice(i, 1);
        continue;
      }
      d.mesh.position.x += d.vx * dt;
      d.mesh.position.y += d.vy * dt;
      d.mesh.position.z += d.vz * dt;
      d.vy -= 18 * dt;
      d.mesh.rotation.x += dt * 4;
      d.mesh.rotation.y += dt * 6;
    }
  }

  private spawnDebris(): void {
    const mat = new THREE.MeshStandardMaterial({ color: this.color, roughness: 0.85, flatShading: true });
    for (let i = 0; i < 14; i++) {
      const chunk = new THREE.Mesh(
        new THREE.BoxGeometry(0.5 + Math.random() * 0.4, 0.5 + Math.random() * 0.4, 0.5 + Math.random() * 0.4),
        mat,
      );
      chunk.position.set(this.position.x, 1 + Math.random() * 5, this.position.z);
      const a = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 5;
      this.debris.push({
        mesh: chunk,
        vx: Math.cos(a) * speed,
        vy: 6 + Math.random() * 4,
        vz: Math.sin(a) * speed,
        spawnedAt: performance.now(),
      });
      this.scene.add(chunk);
    }
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

export type TowerLane = 'top' | 'mid' | 'bot';
export interface LaneTower { tower: Tower; lane: TowerLane }

/**
 * Build six towers — one per lane per team. Returned in a flat array
 * ordered [blueTop, blueMid, blueBot, redTop, redMid, redBot]. Use the
 * matching `buildTowersByLane` helper if you want them keyed.
 */
export function buildTowers(scene: THREE.Scene, colliders: Colliders): Tower[] {
  return [
    new Tower(scene, TOWER_BLUE_TOP_X, TOWER_BLUE_TOP_Z, 'blue', COLOR_TOWER_BLUE, colliders),
    new Tower(scene, TOWER_BLUE_MID_X, TOWER_BLUE_MID_Z, 'blue', COLOR_TOWER_BLUE, colliders),
    new Tower(scene, TOWER_BLUE_BOT_X, TOWER_BLUE_BOT_Z, 'blue', COLOR_TOWER_BLUE, colliders),
    new Tower(scene, TOWER_RED_TOP_X, TOWER_RED_TOP_Z, 'red', COLOR_TOWER_RED, colliders),
    new Tower(scene, TOWER_RED_MID_X, TOWER_RED_MID_Z, 'red', COLOR_TOWER_RED, colliders),
    new Tower(scene, TOWER_RED_BOT_X, TOWER_RED_BOT_Z, 'red', COLOR_TOWER_RED, colliders),
  ];
}
