import * as THREE from 'three';
import {
  PLAYER_ATTACK_COOLDOWN_MS,
  PLAYER_ATTACK_DAMAGE,
  PLAYER_ATTACK_RANGE,
  PLAYER_RADIUS,
  PLAYER_RESPAWN_MS,
  SKILL_E_COOLDOWN_MS,
  SKILL_E_DAMAGE,
  SKILL_E_RANGE,
  SKILL_E_SLOW_DURATION_MS,
  SKILL_E_SLOW_FACTOR,
  SKILL_Q_COOLDOWN_MS,
  SKILL_Q_DAMAGE,
  SKILL_Q_RANGE,
  SPAWN_BLUE_X,
  SPAWN_BLUE_Z,
  SPAWN_RED_X,
  SPAWN_RED_Z,
} from './constants.js';
import { buildMap } from './world/MapBuilder.js';
import type { Colliders } from './world/Colliders.js';
import type { Tower } from './world/Towers.js';
import type { Base } from './world/Bases.js';
import { PlayerObject } from './entities/PlayerObject.js';
import { BotObject } from './entities/BotObject.js';
import { ProjectileManager } from './entities/ProjectileManager.js';
import { CameraRig } from './CameraRig.js';
import { InputController } from './InputController.js';
import { UnitRegistry } from './combat/UnitRegistry.js';
import type { Team } from './combat/Unit.js';

export class Game {
  /** Called once when one base falls. `winner` is the team whose base survived. */
  onMatchEnd?: (winner: Team) => void;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private rig: CameraRig;
  private input: InputController;
  private player: PlayerObject;
  private bot: BotObject;
  private projectiles: ProjectileManager;
  private colliders: Colliders;
  private towers: Tower[];
  private bases: Base[];
  private registry = new UnitRegistry();
  private clock = new THREE.Clock();
  private rafId = 0;
  private resizeObserver: ResizeObserver;

  private lastAttackAt = -Infinity;
  private lastQAt = -Infinity;
  private lastEAt = -Infinity;
  private respawnAt = 0;
  private playerWasAlive = true;
  private gameOver = false;

  constructor(private readonly container: HTMLElement) {
    const { clientWidth, clientHeight } = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(clientWidth, clientHeight);
    this.renderer.shadowMap.enabled = false;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x223044);
    this.scene.fog = new THREE.Fog(0x223044, 120, 220);

    this.setupLights();

    const map = buildMap(this.scene);
    this.colliders = map.colliders;
    this.towers = map.towers;
    this.bases = map.bases;

    this.player = new PlayerObject(new THREE.Vector3(SPAWN_BLUE_X, 0, SPAWN_BLUE_Z));
    this.scene.add(this.player.group);

    this.bot = new BotObject(new THREE.Vector3(SPAWN_RED_X, 0, SPAWN_RED_Z));
    this.scene.add(this.bot.group);

    this.registry.add(this.player);
    this.registry.add(this.bot);
    for (const t of this.towers) this.registry.add(t);

    // Bases are shielded by their tower: only join the registry (and become
    // hittable) once the matching same-side tower falls.
    this.towers[0].onDestroyed = () => this.registry.add(this.bases[0]);
    this.towers[1].onDestroyed = () => this.registry.add(this.bases[1]);

    // Match end: blue base falls → red wins; red base falls → blue wins.
    this.bases[0].onDestroyed = () => this.endMatch('red');
    this.bases[1].onDestroyed = () => this.endMatch('blue');

    this.projectiles = new ProjectileManager(this.scene);

    this.rig = new CameraRig(clientWidth / clientHeight);
    this.rig.follow(this.player.position);

    this.input = new InputController(this.renderer.domElement, this.rig.camera);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    this.loop();
  }

  setJoystickAxis(x: number, z: number): void {
    this.input.setJoystick(x, z);
  }

  fire(): void { this.input.requestAttack(); }
  useQ(): void { this.input.requestQ(); }
  useE(): void { this.input.requestE(); }

  getAttackCooldownLeft(now = performance.now()): number {
    return Math.max(0, PLAYER_ATTACK_COOLDOWN_MS - (now - this.lastAttackAt));
  }
  getQCooldownLeft(now = performance.now()): number {
    return Math.max(0, SKILL_Q_COOLDOWN_MS - (now - this.lastQAt));
  }
  getECooldownLeft(now = performance.now()): number {
    return Math.max(0, SKILL_E_COOLDOWN_MS - (now - this.lastEAt));
  }

  destroy(): void {
    cancelAnimationFrame(this.rafId);
    this.resizeObserver.disconnect();
    this.input.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private setupLights(): void {
    const hemi = new THREE.HemisphereLight(0xd4e6ff, 0x506a3a, 1.0);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2cc, 1.6);
    sun.position.set(40, 60, 30);
    sun.castShadow = true;
    sun.shadow.camera.left = -90;
    sun.shadow.camera.right = 90;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 200;
    sun.shadow.mapSize.set(1024, 1024);
    this.scene.add(sun);
  }

  private handleResize(): void {
    const { clientWidth, clientHeight } = this.container;
    this.renderer.setSize(clientWidth, clientHeight);
    this.rig.resize(clientWidth / clientHeight);
  }

  private endMatch(winner: Team): void {
    if (this.gameOver) return;
    this.gameOver = true;
    this.onMatchEnd?.(winner);
  }

  private loop = (): void => {
    this.rafId = requestAnimationFrame(this.loop);
    const delta = this.clock.getDelta();
    const now = performance.now();

    if (this.gameOver) {
      this.rig.follow(this.player.position);
      this.renderer.render(this.scene, this.rig.camera);
      return;
    }

    const wantsAttack = this.input.consumeAttackRequest();
    const wantsQ = this.input.consumeQRequest();
    const wantsE = this.input.consumeERequest();

    if (this.player.alive) {
      this.player.update(this.input.getMovement(), delta, now);
      this.colliders.resolve(this.player.position, PLAYER_RADIUS);
      if (wantsAttack) this.tryAutoAttack(now);
      if (wantsQ) this.tryUseQ(now);
      if (wantsE) this.tryUseE(now);
    } else if (now >= this.respawnAt) {
      this.player.respawn();
    }

    if (!this.player.alive && this.playerWasAlive) {
      this.respawnAt = now + PLAYER_RESPAWN_MS;
    }
    this.playerWasAlive = this.player.alive;

    this.bot.update(delta, now, this.registry, this.projectiles, this.colliders);

    for (const t of this.towers) t.update(now, this.registry, this.projectiles);

    this.projectiles.update(delta, now, this.registry);
    this.spinCrystals(delta);

    this.rig.follow(this.player.position);
    this.renderer.render(this.scene, this.rig.camera);
  };

  private tryAutoAttack(now: number): void {
    if (now - this.lastAttackAt < PLAYER_ATTACK_COOLDOWN_MS) return;
    const target = this.registry.findNearestEnemy(
      this.player.team,
      this.player.position,
      PLAYER_ATTACK_RANGE,
    );
    if (!target) return;
    this.player.faceTarget(target.position);
    this.projectiles.spawn(this.player.position, target.position, now, {
      team: this.player.team,
      damage: PLAYER_ATTACK_DAMAGE,
    });
    this.lastAttackAt = now;
  }

  private tryUseQ(now: number): void {
    if (now - this.lastQAt < SKILL_Q_COOLDOWN_MS) return;
    const dir = this.player.facing;
    const origin = this.player.position;
    const target = new THREE.Vector3(
      origin.x + dir.x * SKILL_Q_RANGE,
      origin.y,
      origin.z + dir.z * SKILL_Q_RANGE,
    );
    this.projectiles.spawn(origin, target, now, {
      team: this.player.team,
      damage: SKILL_Q_DAMAGE,
      kind: 'heavy',
    });
    this.lastQAt = now;
  }

  private tryUseE(now: number): void {
    if (now - this.lastEAt < SKILL_E_COOLDOWN_MS) return;
    const dir = this.player.facing;
    const origin = this.player.position;
    const target = new THREE.Vector3(
      origin.x + dir.x * SKILL_E_RANGE,
      origin.y,
      origin.z + dir.z * SKILL_E_RANGE,
    );
    this.projectiles.spawn(origin, target, now, {
      team: this.player.team,
      damage: SKILL_E_DAMAGE,
      kind: 'slow',
      effect: { slow: { factor: SKILL_E_SLOW_FACTOR, durationMs: SKILL_E_SLOW_DURATION_MS } },
    });
    this.lastEAt = now;
  }

  private spinCrystals(delta: number): void {
    const crystals = this.scene.userData.crystals as THREE.Mesh[] | undefined;
    if (!crystals) return;
    for (const c of crystals) c.rotation.y += delta * 0.8;
  }
}
