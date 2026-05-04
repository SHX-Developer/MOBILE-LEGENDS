import * as THREE from 'three';
import type { Team, Unit } from '../combat/Unit.js';
import type { UnitRegistry } from '../combat/UnitRegistry.js';
import type { ProjectileManager } from './ProjectileManager.js';
import { HealthBar } from '../combat/HealthBar.js';

/**
 * Stationary neutral creep that lives at a jungle camp. Doesn't move; if
 * an enemy walks into its small attack range, it whacks them with a
 * physical melee swing. Goes down for 60 seconds on death and pops back
 * with full HP.
 *
 * Treated as a minion-kind unit so all the existing damage / XP plumbing
 * (ProjectileManager AoE, grantKillXp assist range, minimap dots,
 * findNearestEnemy filters) just works without further surgery.
 */
const RESPAWN_MS = 60_000;
const ATTACK_RANGE = 5.5;
const ATTACK_COOLDOWN_MS = 1200;
const VISION_RANGE = 7;
const ATTACK_DAMAGE = 38;
const MAX_HP = 700;
const XP_REWARD = 90;

export class JungleCreep implements Unit {
  readonly kind = 'minion';
  readonly team: Team;
  readonly group = new THREE.Group();
  readonly radius = 0.95;
  readonly maxHp = MAX_HP;
  readonly xpReward = XP_REWARD;
  hp = MAX_HP;
  alive = true;
  slowUntil = 0;
  stunnedUntil = 0;
  physicalDef = 0.15;
  magicalDef = 0.15;
  // Reference to the static crystal mesh so we can hide/show it on
  // death/respawn without fighting Three's group-visibility quirks.
  private readonly visual: THREE.Group;
  private readonly healthBar: HealthBar;
  private readonly spawnPos: THREE.Vector3;
  private lastAttackAt = -Infinity;
  private respawnAt = 0;
  private deadAt = 0;

  constructor(
    private readonly scene: THREE.Scene,
    spawn: THREE.Vector3,
    team: Team,
    color = 0xa86bff,
  ) {
    this.team = team;
    this.spawnPos = spawn.clone();
    this.group.position.copy(spawn);

    const body = new THREE.Group();
    this.visual = body;
    this.group.add(body);

    // Stocky stone base — flat octagonal disc.
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 1.05, 0.55, 10),
      new THREE.MeshLambertMaterial({ color: 0x4f4938, flatShading: true }),
    );
    base.position.y = 0.28;
    body.add(base);

    // Crystal cluster — taller core with two side shards. The colour is
    // picked per camp so the player learns to read camps from afar.
    const crystalMat = new THREE.MeshLambertMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.7,
      flatShading: true,
    });
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.55, 0),
      crystalMat,
    );
    core.scale.set(0.85, 1.4, 0.85);
    core.position.y = 1.25;
    body.add(core);
    for (const side of [-1, 1] as const) {
      const shard = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.32, 0),
        crystalMat,
      );
      shard.scale.set(0.7, 1.2, 0.7);
      shard.position.set(side * 0.42, 0.95, 0);
      shard.rotation.z = side * 0.3;
      body.add(shard);
    }
    // Glow halo behind the cluster.
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 14, 14),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      }),
    );
    halo.position.y = 1.25;
    body.add(halo);

    // HP bar above the crystal.
    this.healthBar = new HealthBar(2, 0.18, 0xc0a8ff, false, true, 1.4);
    this.healthBar.group.position.set(0, 2.4, 0);
    this.group.add(this.healthBar.group);
    this.healthBar.setHp(this.hp, this.maxHp);

    scene.add(this.group);
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  update(
    now: number,
    registry: UnitRegistry,
    projectiles: ProjectileManager,
  ): void {
    if (!this.alive) {
      // Quietly waiting — fade animation handled in animateDeath.
      this.animateDeath(now);
      if (now >= this.respawnAt) this.respawn();
      return;
    }
    if (this.stunnedUntil > now) return;

    // Slow ambient rotation on the crystal so the camp reads as alive.
    this.visual.rotation.y += 0.003;

    const enemy = registry.findNearestEnemy(this.team, this.position, VISION_RANGE);
    if (!enemy) return;
    const dx = enemy.position.x - this.position.x;
    const dz = enemy.position.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > ATTACK_RANGE) return;
    if (now - this.lastAttackAt < ATTACK_COOLDOWN_MS) return;
    this.lastAttackAt = now;
    projectiles.spawn(this.position, enemy.position, now, {
      team: this.team,
      damage: ATTACK_DAMAGE,
      damageType: 'physical',
      kind: 'meteor',
      target: enemy,
    });
  }

  billboardHealthBar(camera: THREE.Camera): void {
    if (!this.alive) return;
    this.healthBar.billboard(camera);
  }

  takeDamage(amount: number): void {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - amount);
    this.healthBar.setRatio(this.hp / this.maxHp);
    this.healthBar.setHp(this.hp, this.maxHp);
    if (this.hp <= 0) this.die();
  }

  private die(): void {
    this.alive = false;
    this.deadAt = performance.now();
    this.respawnAt = this.deadAt + RESPAWN_MS;
    this.healthBar.group.visible = false;
  }

  private respawn(): void {
    this.alive = true;
    this.deadAt = 0;
    this.respawnAt = 0;
    this.hp = this.maxHp;
    this.group.position.copy(this.spawnPos);
    this.group.rotation.x = 0;
    this.group.position.y = 0;
    this.visual.scale.setScalar(1);
    this.visual.visible = true;
    this.healthBar.group.visible = true;
    this.healthBar.setRatio(1);
    this.healthBar.setHp(this.hp, this.maxHp);
  }

  /** Subtle "the crystal sinks into the ground" tween on death so it
   *  doesn't just blink out. After ~600ms the visual is hidden until
   *  respawn. */
  private animateDeath(now: number): void {
    if (!this.deadAt) return;
    const t = Math.min(1, (now - this.deadAt) / 600);
    const eased = t * t;
    this.visual.scale.setScalar(Math.max(0.05, 1 - eased * 0.95));
    this.visual.position.y = -0.4 * eased;
    if (t >= 1) {
      this.visual.visible = false;
    }
  }

  dispose(): void {
    this.scene.remove(this.group);
  }
}
