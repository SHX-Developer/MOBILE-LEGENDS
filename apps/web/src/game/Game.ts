import * as THREE from 'three';
import type { MatchCombatEvent, MatchPlayerSnapshot, MatchSnapshot } from '@ml/shared';
import {
  PLAYER_ATTACK_COOLDOWN_MS,
  PLAYER_ATTACK_RANGE,
  PLAYER_RADIUS,
  PLAYER_RESPAWN_MS,
  BASE_BLUE_X,
  BASE_BLUE_Z,
  BASE_RED_X,
  BASE_RED_Z,
  BASE_REGEN_RADIUS,
  HERO_BASE_REGEN_PER_SEC,
  RESPAWN_LEVEL_PENALTY_MS,
  RESPAWN_MATCH_MINUTE_PENALTY_MS,
  RESPAWN_MAX_MS,
  HEAL_AMOUNT,
  HEAL_COOLDOWN_MS,
  RECALL_CHANNEL_MS,
  RECALL_COOLDOWN_MS,
  MINION_WAVE_INTERVAL_MS,
  SKILL_E_COOLDOWN_MS,
  SKILL_E_RANGE,
  SKILL_E_SLOW_DURATION_MS,
  SKILL_E_SLOW_FACTOR,
  SKILL_C_COOLDOWN_MS,
  SKILL_C_RANGE,
  SKILL_C_STUN_DURATION_MS,
  SKILL_Q_COOLDOWN_MS,
  SKILL_Q_RANGE,
  SPAWN_BLUE_X,
  SPAWN_BLUE_Z,
  SPAWN_RED_X,
  SPAWN_RED_Z,
  LANE_PATHS,
} from './constants.js';
import { buildMap } from './world/MapBuilder.js';
import type { Colliders } from './world/Colliders.js';
import type { Tower } from './world/Towers.js';
import type { Base } from './world/Bases.js';
import { PlayerObject } from './entities/PlayerObject.js';
import { BotObject } from './entities/BotObject.js';
import { MinionObject, MINION_CONFIGS, type MinionVariant } from './entities/MinionObject.js';
import { ProjectileManager } from './entities/ProjectileManager.js';
import { CameraRig } from './CameraRig.js';
import { InputController } from './InputController.js';
import { UnitRegistry } from './combat/UnitRegistry.js';
import { FloatingTextManager } from './combat/FloatingTextManager.js';
import type { Team, Unit } from './combat/Unit.js';
import { Haptics } from './haptics.js';
import { Sounds } from './Sounds.js';
import { OnlineClient } from './OnlineClient.js';

export type SkillId = 'q' | 'e' | 'c';
export type GameMode = 'online' | 'offline';

export interface GameOptions {
  mode: GameMode;
}

interface AimState {
  active: boolean;
  dirX: number;
  dirZ: number;
  range: number;
}

export class Game {
  /** Called once when one base falls. `winner` is the team whose base survived. */
  onMatchEnd?: (winner: Team) => void;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private rig: CameraRig;
  private input: InputController;
  private player: PlayerObject;
  private bot: BotObject;
  private minions: MinionObject[] = [];
  private projectiles: ProjectileManager;
  private floatingText: FloatingTextManager;
  private online = new OnlineClient();
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
  private lastCAt = -Infinity;
  private lastHealAt = -Infinity;
  private lastRecallAt = -Infinity;
  /** Time recall channel started; 0 when not channeling. */
  private recallStartedAt = 0;
  private recallSpawnX = 0;
  private recallSpawnZ = 0;
  private recallRing?: THREE.Mesh;
  private playerHpBeforeChannel = 0;
  private respawnAt = 0;
  private readonly matchStartedAt = performance.now();
  private playerWasAlive = true;
  private gameOver = false;
  private lastPlayerHp = 0;
  private lastMinionWaveAt = -Infinity;

  private aimIndicator: THREE.Mesh;
  private aim: Record<SkillId, AimState> = {
    q: { active: false, dirX: 0, dirZ: 1, range: SKILL_Q_RANGE },
    e: { active: false, dirX: 0, dirZ: 1, range: SKILL_E_RANGE },
    c: { active: false, dirX: 0, dirZ: 1, range: SKILL_C_RANGE },
  };

  private readonly mode: GameMode;

  constructor(private readonly container: HTMLElement, opts: GameOptions = { mode: 'offline' }) {
    this.mode = opts.mode;
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
    for (const b of this.bases) this.registry.add(b);

    // Match end via base destruction is offline-only. Online uses
    // server-driven kill score so client base sims can drift cosmetically
    // without falsely declaring a winner.
    if (this.mode === 'offline') {
      this.bases[0].onDestroyed = () => this.endMatch('red');
      this.bases[1].onDestroyed = () => this.endMatch('blue');
    }

    this.projectiles = new ProjectileManager(this.scene);
    this.projectiles.onPlayerHit = () => {
      Haptics.hitEnemy();
      Sounds.hit();
    };
    this.floatingText = new FloatingTextManager(this.scene);
    this.projectiles.onDamage = (target, amount, owner) => {
      this.floatingText.spawnDamage(target.position, amount, target.team, owner?.team);
    };
    this.lastPlayerHp = this.player.hp;
    this.online.onMatchEnd = (winner) => {
      this.endMatch(winner === this.online.getTeam() ? 'blue' : 'red');
    };
    if (this.mode === 'online') this.online.connect();

    this.aimIndicator = this.buildAimIndicator();
    this.scene.add(this.aimIndicator);

    this.rig = new CameraRig(clientWidth / clientHeight);
    this.rig.follow(this.player.position);

    this.input = new InputController(this.renderer.domElement, this.rig.camera);
    this.input.setCameraPanHandlers(
      (dx, dz) => this.rig.setLookOffset(dx, dz),
      () => this.rig.setLookOffset(0, 0),
    );

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    this.spawnMinionWave(performance.now());
    this.loop();
  }

  setJoystickAxis(x: number, z: number): void {
    this.input.setJoystick(x, z);
  }

  fire(): void { this.input.requestAttack(); }
  setFireHold(active: boolean): void { this.player.setRangeVisible(active); }

  /** Consumable heal — small instant top-up on cooldown. */
  tryHeal(): void {
    const now = performance.now();
    if (!this.player.alive) return;
    if (now - this.lastHealAt < HEAL_COOLDOWN_MS) return;
    this.lastHealAt = now;
    this.player.heal(HEAL_AMOUNT);
    Sounds.skill('e');
    this.spawnHealRing(this.player.position);
  }

  /** Begin a 5s channel that returns the hero to spawn. Cancelled by death. */
  startRecall(): void {
    const now = performance.now();
    if (!this.player.alive) return;
    if (this.recallStartedAt) return;
    if (now - this.lastRecallAt < RECALL_COOLDOWN_MS) return;
    this.recallStartedAt = now;
    this.recallSpawnX = SPAWN_BLUE_X;
    this.recallSpawnZ = SPAWN_BLUE_Z;
    this.playerHpBeforeChannel = this.player.hp;
    this.recallRing = this.spawnRecallRing(this.player.position, '#9fd8ff');
    Sounds.skill('c');
  }

  /** UI helpers for cooldown badges on the new buttons. */
  getHealCooldownLeft(now = performance.now()): number {
    return Math.max(0, HEAL_COOLDOWN_MS - (now - this.lastHealAt));
  }
  getRecallCooldownLeft(now = performance.now()): number {
    return Math.max(0, RECALL_COOLDOWN_MS - (now - this.lastRecallAt));
  }
  getRecallChannelLeft(now = performance.now()): number {
    if (!this.recallStartedAt) return 0;
    return Math.max(0, RECALL_CHANNEL_MS - (now - this.recallStartedAt));
  }

  /**
   * Begin manual aim for a skill. Initial direction snaps to the nearest
   * enemy (within ~1.5× range so off-screen targets aren't missed); falls
   * back to the player's current facing if no enemy is around.
   */
  startAim(skill: SkillId): void {
    const a = this.aim[skill];
    a.active = true;
    a.range = skill === 'q' ? SKILL_Q_RANGE : skill === 'e' ? SKILL_E_RANGE : SKILL_C_RANGE;

    const enemy = this.registry.findNearestEnemy(
      this.player.team,
      this.player.position,
      a.range * 1.6,
    );
    if (enemy) {
      const dx = enemy.position.x - this.player.position.x;
      const dz = enemy.position.z - this.player.position.z;
      const len = Math.hypot(dx, dz);
      if (len > 1e-3) {
        a.dirX = dx / len;
        a.dirZ = dz / len;
        this.refreshAimIndicator();
        return;
      }
    }
    a.dirX = this.player.facing.x || 0;
    a.dirZ = this.player.facing.z || 1;
    this.refreshAimIndicator();
  }

  /** Update aim direction. (dirX, dirZ) is in world space; non-zero. */
  updateAim(skill: SkillId, dirX: number, dirZ: number): void {
    const a = this.aim[skill];
    if (!a.active) return;
    const len = Math.hypot(dirX, dirZ);
    if (len < 0.001) return;
    a.dirX = dirX / len;
    a.dirZ = dirZ / len;
    this.refreshAimIndicator();
  }

  /** Release aim and trigger the skill in the locked direction. */
  releaseAim(skill: SkillId): void {
    const a = this.aim[skill];
    if (!a.active) return;
    a.active = false;
    this.aimIndicator.visible = false;
    this.input.requestSkill(skill, a.dirX, a.dirZ);
  }

  private spawnHealRing(at: THREE.Vector3): void {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 1.6, 32),
      new THREE.MeshBasicMaterial({
        color: 0x6cff8a,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(at.x, 0.06, at.z);
    this.scene.add(ring);
    const startedAt = performance.now();
    const tick = () => {
      const t = (performance.now() - startedAt) / 600;
      if (t >= 1) {
        this.scene.remove(ring);
        ring.geometry.dispose();
        (ring.material as THREE.Material).dispose();
        return;
      }
      ring.scale.setScalar(1 + t * 1.4);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - t);
      requestAnimationFrame(tick);
    };
    tick();
  }

  private spawnRecallRing(at: THREE.Vector3, color: string): THREE.Mesh {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 1.55, 48),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(at.x, 0.07, at.z);
    this.scene.add(ring);
    return ring;
  }

  private tickRecall(now: number): void {
    if (!this.recallStartedAt) return;
    if (!this.player.alive) {
      this.cancelRecall();
      return;
    }
    const elapsed = now - this.recallStartedAt;
    if (this.recallRing) {
      // Pulse the ring on the ground beneath the channeling hero.
      this.recallRing.position.set(this.player.position.x, 0.07, this.player.position.z);
      const pulse = 1 + Math.sin(elapsed / 110) * 0.18;
      this.recallRing.scale.setScalar(pulse);
      const mat = this.recallRing.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.5 + Math.sin(elapsed / 90) * 0.3;
    }
    if (elapsed >= RECALL_CHANNEL_MS) {
      // Teleport home, full heal as a treat.
      this.player.position.x = this.recallSpawnX;
      this.player.position.z = this.recallSpawnZ;
      this.player.heal(this.player.maxHp);
      this.lastRecallAt = now;
      this.cancelRecall();
      this.spawnHealRing(this.player.position);
    }
  }

  private cancelRecall(): void {
    this.recallStartedAt = 0;
    if (this.recallRing) {
      this.scene.remove(this.recallRing);
      this.recallRing.geometry.dispose();
      (this.recallRing.material as THREE.Material).dispose();
      this.recallRing = undefined;
    }
  }

  /** Plain tap on a skill button — auto-aim to nearest enemy in skill range
   *  and cast immediately, no aim UI. */
  castAuto(skill: SkillId): void {
    const range = skill === 'q' ? SKILL_Q_RANGE : skill === 'e' ? SKILL_E_RANGE : SKILL_C_RANGE;
    let dirX = this.player.facing.x || 0;
    let dirZ = this.player.facing.z || 1;
    const enemy = this.registry.findNearestEnemy(
      this.player.team,
      this.player.position,
      range,
      ['hero', 'minion', 'structure'],
    );
    if (enemy) {
      const dx = enemy.position.x - this.player.position.x;
      const dz = enemy.position.z - this.player.position.z;
      const len = Math.hypot(dx, dz);
      if (len > 1e-3) {
        dirX = dx / len;
        dirZ = dz / len;
      }
    }
    const now = performance.now();
    if (this.mode === 'online') {
      const ready =
        skill === 'q'
          ? now - this.lastQAt >= SKILL_Q_COOLDOWN_MS
          : skill === 'e'
            ? now - this.lastEAt >= SKILL_E_COOLDOWN_MS
            : now - this.lastCAt >= SKILL_C_COOLDOWN_MS;
      if (!ready) return;
      this.online.skill(skill, dirX, dirZ);
      if (skill === 'q') this.lastQAt = now;
      else if (skill === 'e') this.lastEAt = now;
      else this.lastCAt = now;
      return;
    }
    if (skill === 'q') this.tryUseQ(now, dirX, dirZ);
    else if (skill === 'e') this.tryUseE(now, dirX, dirZ);
    else this.tryUseC(now, dirX, dirZ);
  }

  /** Cancel aim without firing (e.g. pointer cancel). */
  cancelAim(skill: SkillId): void {
    const a = this.aim[skill];
    a.active = false;
    if (!this.aim.q.active && !this.aim.e.active && !this.aim.c.active) {
      this.aimIndicator.visible = false;
    }
  }

  getAttackCooldownLeft(now = performance.now()): number {
    return Math.max(0, PLAYER_ATTACK_COOLDOWN_MS - (now - this.lastAttackAt));
  }
  getQCooldownLeft(now = performance.now()): number {
    return Math.max(0, SKILL_Q_COOLDOWN_MS - (now - this.lastQAt));
  }
  getECooldownLeft(now = performance.now()): number {
    return Math.max(0, SKILL_E_COOLDOWN_MS - (now - this.lastEAt));
  }
  getCCooldownLeft(now = performance.now()): number {
    return Math.max(0, SKILL_C_COOLDOWN_MS - (now - this.lastCAt));
  }
  getMatchElapsedMs(now = performance.now()): number {
    return Math.max(0, now - this.matchStartedAt);
  }
  getPlayerRespawnLeft(now = performance.now()): number {
    if (this.online.getStatus() === 'playing' || this.online.getStatus() === 'ended') {
      const own = this.getOnlineOwnSnapshot();
      if (own && !own.alive) return own.respawnInMs;
    }
    return this.player.alive ? 0 : Math.max(0, this.respawnAt - now);
  }
  getOnlineStatus(): string {
    return this.online.getStatus();
  }

  destroy(): void {
    cancelAnimationFrame(this.rafId);
    this.resizeObserver.disconnect();
    this.input.dispose();
    this.online.dispose();
    this.floatingText.dispose();
    for (const m of this.minions) m.dispose();
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

  private aimMat!: THREE.MeshBasicMaterial;
  private aimTip!: THREE.Mesh;
  private aimTipMat!: THREE.MeshBasicMaterial;

  private buildAimIndicator(): THREE.Mesh {
    // Bar anchored at +y edge. After rotation.x = -PI/2 the bar lies on the
    // ground extending in world +z; rotation.z then yaws it to (dirX, dirZ).
    const geom = new THREE.PlaneGeometry(1.4, 1);
    geom.translate(0, -0.5, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff7a3d,
      transparent: true,
      opacity: 0.62,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.aimMat = mat;
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;

    // Bright arrowhead at the far end so the player can see range cleanly.
    const tipGeom = new THREE.PlaneGeometry(2.4, 1.2);
    const tipMat = new THREE.MeshBasicMaterial({
      color: 0xff7a3d,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.aimTipMat = tipMat;
    const tip = new THREE.Mesh(tipGeom, tipMat);
    tip.position.set(0, -1.0, 0.02);
    mesh.add(tip);
    this.aimTip = tip;

    return mesh;
  }

  private skillAccent(id: SkillId): number {
    return id === 'q' ? 0xff7a3d : id === 'e' ? 0x4ec9ff : 0xb56cff;
  }

  private refreshAimIndicator(): void {
    let activeId: SkillId | null = null;
    let active: AimState | null = null;
    if (this.aim.q.active) { activeId = 'q'; active = this.aim.q; }
    else if (this.aim.e.active) { activeId = 'e'; active = this.aim.e; }
    else if (this.aim.c.active) { activeId = 'c'; active = this.aim.c; }
    if (!active || !activeId) {
      this.aimIndicator.visible = false;
      return;
    }
    const accent = this.skillAccent(activeId);
    this.aimMat.color.setHex(accent);
    this.aimTipMat.color.setHex(accent);
    const p = this.player.position;
    this.aimIndicator.position.set(p.x, 0.05, p.z);
    const angle = Math.atan2(active.dirX, active.dirZ);
    this.aimIndicator.rotation.set(-Math.PI / 2, 0, angle);
    this.aimIndicator.scale.set(1, active.range, 1);
    // Tip stays the same world size — undo parent y-scale.
    this.aimTip.scale.set(1, 1 / Math.max(active.range, 0.01), 1);
    this.aimIndicator.visible = true;
  }

  private loop = (): void => {
    this.rafId = requestAnimationFrame(this.loop);
    const delta = this.clock.getDelta();
    const now = performance.now();

    if (this.gameOver) {
      this.rig.follow(this.player.position, delta);
      this.renderer.render(this.scene, this.rig.camera);
      return;
    }

    const wantsAttack = this.input.consumeAttackRequest();
    const skillReq = this.input.consumeSkillRequest();
    const movement = this.input.getMovement();

    if (this.mode === 'online') {
      this.online.sendInput(movement.x, movement.z, now);
      const status = this.online.getStatus();
      if (status !== 'playing' && status !== 'ended') {
        // Queued / connecting: render an empty scene so the queue overlay
        // sits over a quiet backdrop, no offline simulation kicks in.
        this.rig.follow(this.player.position, delta);
        this.renderer.render(this.scene, this.rig.camera);
        return;
      }
      this.runOnlineFrame(delta, now, wantsAttack, skillReq);
      return;
    }

    if (now - this.lastMinionWaveAt >= MINION_WAVE_INTERVAL_MS) {
      this.spawnMinionWave(now);
    }

    // Always tick the player so the death-fall animation runs while dead.
    this.player.update(movement, delta, now);
    if (this.player.alive) {
      this.colliders.resolve(this.player.position, PLAYER_RADIUS);
      const canAct = this.player.stunnedUntil <= now;
      if (canAct && wantsAttack) this.tryAutoAttack(now);
      if (canAct && skillReq) {
        let dx = skillReq.dirX;
        let dz = skillReq.dirZ;
        if (Math.hypot(dx, dz) < 1e-3) {
          dx = this.player.facing.x;
          dz = this.player.facing.z;
        }
        if (skillReq.id === 'q') this.tryUseQ(now, dx, dz);
        else if (skillReq.id === 'e') this.tryUseE(now, dx, dz);
        else this.tryUseC(now, dx, dz);
      }
    } else if (!this.playerWasAlive && now >= this.respawnAt) {
      this.player.respawn();
    }

    this.bot.respawnDelayMs = this.getRespawnDelayMs(this.bot.level, now);
    this.bot.update(delta, now, this.registry, this.projectiles, this.colliders);
    this.healHeroesAtBase(delta);
    this.updateMinions(delta, now);

    for (const t of this.towers) t.update(now, this.registry, this.projectiles);
    for (const b of this.bases) b.update(now, this.registry, this.projectiles);

    this.projectiles.update(delta, now, this.registry);
    this.projectiles.updateFx(delta, now);
    if (!this.player.alive && this.playerWasAlive) {
      this.respawnAt = now + this.getRespawnDelayMs(this.player.level, now);
    }
    this.playerWasAlive = this.player.alive;

    this.cleanupMinions(now);
    this.floatingText.update(now);

    // Haptic + thump on damage taken (covers bot, tower and base attacks alike).
    if (this.player.alive && this.player.hp < this.lastPlayerHp) {
      Haptics.takeDamage();
      Sounds.takeDamage();
      // Damage breaks the recall channel.
      if (this.recallStartedAt && this.player.hp < this.playerHpBeforeChannel) {
        this.cancelRecall();
      }
    }
    this.tickRecall(now);
    this.lastPlayerHp = this.player.hp;
    this.spinCrystals(delta);

    if (this.aimIndicator.visible) this.refreshAimIndicator();

    this.rig.follow(this.player.position, delta);

    const cam = this.rig.camera;
    this.player.billboardHealthBar(cam);
    this.bot.billboardHealthBar(cam);
    for (const m of this.minions) m.billboardHealthBar(cam);
    for (const t of this.towers) t.billboardHealthBar(cam);
    for (const b of this.bases) b.billboardHealthBar(cam);

    this.renderer.render(this.scene, this.rig.camera);
  };

  private tryAutoAttack(now: number): void {
    this.fireAtNearest(now, ['minion', 'hero', 'structure']);
  }

  /** Public — invoked by the right-side BAШНЯ button. Locks aim onto towers/bases. */
  attackTower(): void {
    this.fireAtNearest(performance.now(), ['structure']);
  }
  /** Public — invoked by the МИНЬОН button. Locks aim onto minions. */
  attackMinion(): void {
    this.fireAtNearest(performance.now(), ['minion']);
  }

  private fireAtNearest(now: number, kinds: Array<'minion' | 'hero' | 'structure'>): void {
    if (!this.player.alive) return;
    if (now - this.lastAttackAt < PLAYER_ATTACK_COOLDOWN_MS) return;
    const target = this.registry.findNearestEnemy(
      this.player.team,
      this.player.position,
      PLAYER_ATTACK_RANGE,
      kinds,
    );
    if (!target) return;
    this.player.faceTarget(target.position);
    this.player.triggerAttackPose(now);
    this.projectiles.spawnMuzzleFlash(this.player.position, this.player.facing);
    Sounds.attack();
    this.projectiles.spawn(this.player.position, target.position, now, {
      team: this.player.team,
      damage: this.player.attackDamage,
      target,
      owner: this.player,
      fromPlayer: true,
    });
    this.lastAttackAt = now;
  }

  private runOnlineFrame(
    delta: number,
    now: number,
    wantsAttack: boolean,
    skillReq: { id: SkillId; dirX: number; dirZ: number } | null,
  ): void {
    this.applyOnlineTeamColorsOnce();
    // Drive cooldown UI on the client; the server enforces too.
    if (wantsAttack && now - this.lastAttackAt >= PLAYER_ATTACK_COOLDOWN_MS) {
      this.online.attack();
      this.player.triggerAttackPose(now);
      this.lastAttackAt = now;
    }
    if (skillReq) {
      let dx = skillReq.dirX;
      let dz = skillReq.dirZ;
      if (Math.hypot(dx, dz) < 1e-3) {
        dx = this.player.facing.x;
        dz = this.player.facing.z;
      }
      const ready =
        skillReq.id === 'q'
          ? now - this.lastQAt >= SKILL_Q_COOLDOWN_MS
          : skillReq.id === 'e'
            ? now - this.lastEAt >= SKILL_E_COOLDOWN_MS
            : now - this.lastCAt >= SKILL_C_COOLDOWN_MS;
      if (ready) {
        this.online.skill(skillReq.id, dx, dz);
        if (skillReq.id === 'q') this.lastQAt = now;
        else if (skillReq.id === 'e') this.lastEAt = now;
        else this.lastCAt = now;
      }
    }

    // Online is currently a 1v1 hero deathmatch — server only simulates the
    // two heroes. Towers/bases stay in the scene as decoration but receive
    // no AI; minions are removed because there is no server source of truth
    // for them yet. Full server-authoritative MOBA simulation is a separate
    // refactor (see Game.ts history).
    this.clearLocalMinions();

    this.applyOnlineSnapshot();
    this.renderOnlineCombatEvents(this.online.drainCombatEvents(), now);
    this.projectiles.update(delta, now, this.registry);
    this.projectiles.updateFx(delta, now);
    this.floatingText.update(now);
    this.spinCrystals(delta);

    if (this.aimIndicator.visible) this.refreshAimIndicator();

    this.rig.follow(this.player.position, delta);

    const cam = this.rig.camera;
    this.player.billboardHealthBar(cam);
    this.bot.billboardHealthBar(cam);
    for (const t of this.towers) t.billboardHealthBar(cam);
    for (const b of this.bases) b.billboardHealthBar(cam);

    this.renderer.render(this.scene, this.rig.camera);
  }

  private appliedOnlineTeam = false;
  private applyOnlineTeamColorsOnce(): void {
    if (this.appliedOnlineTeam) return;
    const myTeam = this.online.getTeam();
    if (!myTeam) return;
    const enemyTeam: Team = myTeam === 'blue' ? 'red' : 'blue';
    this.player.setTeam(myTeam);
    this.bot.setTeam(enemyTeam);
    this.appliedOnlineTeam = true;
  }

  private clearLocalMinions(): void {
    if (this.minions.length === 0) return;
    for (const minion of this.minions) {
      this.registry.remove(minion);
      minion.dispose();
    }
    this.minions.length = 0;
  }

  private lastAppliedSnapshot: MatchSnapshot | null = null;
  private applyOnlineSnapshot(): void {
    const snapshot = this.online.getSnapshot();
    const playerId = this.online.getPlayerId();
    if (!snapshot || !playerId) return;
    if (snapshot === this.lastAppliedSnapshot) return;
    this.lastAppliedSnapshot = snapshot;
    const own = snapshot.players.find((p) => p.id === playerId);
    const enemy = snapshot.players.find((p) => p.id !== playerId);
    if (own) {
      this.player.applyServerState(own);
      this.lastPlayerHp = own.hp;
    }
    if (enemy) this.bot.applyServerState(enemy);
  }

  private getOnlineOwnSnapshot(): MatchPlayerSnapshot | null {
    const snapshot = this.online.getSnapshot();
    const playerId = this.online.getPlayerId();
    if (!snapshot || !playerId) return null;
    return snapshot.players.find((p) => p.id === playerId) ?? null;
  }

  private renderOnlineCombatEvents(events: MatchCombatEvent[], now: number): void {
    const ownId = this.online.getPlayerId();
    for (const event of events) {
      const target = this.onlineUnitFor(event.targetId);
      const owner = this.onlineUnitFor(event.attackerId) ?? undefined;
      const isHit = event.hit;
      const damage = event.damage;
      const attackerIsMe = event.attackerId === ownId;
      const targetIsMe = event.targetId === ownId;
      // Defer the damage number / haptic until the visual projectile lands,
      // so the impact reads as the bullet arriving rather than the click.
      this.spawnOnlineCombatFx(event, owner, target, now, () => {
        if (isHit && damage > 0 && target) {
          this.floatingText.spawnDamage(target.position, damage, target.team, owner?.team);
        }
        if (isHit && attackerIsMe) Haptics.hitEnemy();
        if (isHit && targetIsMe) Haptics.takeDamage();
      });
    }
  }

  private onlineUnitFor(playerId: string): Unit | null {
    const ownId = this.online.getPlayerId();
    if (playerId === ownId) return this.player;
    const snapshot = this.online.getSnapshot();
    if (snapshot?.players.some((p) => p.id === playerId)) return this.bot;
    return null;
  }

  private spawnOnlineCombatFx(
    event: MatchCombatEvent,
    owner: Unit | null | undefined,
    targetUnit: Unit | null,
    now: number,
    onArrive: () => void,
  ): void {
    const origin = new THREE.Vector3(event.startX, 0, event.startZ);
    const aimPoint = new THREE.Vector3(event.endX, 0, event.endZ);
    const maxDistance = Math.max(1, origin.distanceTo(aimPoint));
    const kind =
      event.kind === 'attack'
        ? 'basic'
        : event.skillId === 'q'
          ? 'heavy'
          : event.skillId === 'e'
            ? 'slow'
            : 'control';
    // For hits, lock onto the target unit so the projectile lands precisely
    // on it even if it moves between server tick and client render.
    const trackTarget = event.hit && targetUnit?.alive ? targetUnit : undefined;
    this.projectiles.spawn(origin, aimPoint, now, {
      team: owner?.team ?? 'blue',
      damage: 0,
      kind,
      maxDistance,
      visualOnly: true,
      target: trackTarget,
      onArrive,
    });
  }

  private tryUseQ(now: number, dirX: number, dirZ: number): void {
    if (now - this.lastQAt < SKILL_Q_COOLDOWN_MS) return;
    this.player.faceDirection(dirX, dirZ);
    const origin = this.player.position;
    const target = new THREE.Vector3(
      origin.x + dirX * SKILL_Q_RANGE,
      origin.y,
      origin.z + dirZ * SKILL_Q_RANGE,
    );
    this.projectiles.spawn(origin, target, now, {
      team: this.player.team,
      damage: this.player.skillQDamage,
      kind: 'heavy',
      owner: this.player,
      maxDistance: SKILL_Q_RANGE,
      fromPlayer: true,
    });
    Sounds.skill('q');
    this.lastQAt = now;
  }

  private tryUseE(now: number, dirX: number, dirZ: number): void {
    if (now - this.lastEAt < SKILL_E_COOLDOWN_MS) return;
    this.player.faceDirection(dirX, dirZ);
    const origin = this.player.position;
    const target = new THREE.Vector3(
      origin.x + dirX * SKILL_E_RANGE,
      origin.y,
      origin.z + dirZ * SKILL_E_RANGE,
    );
    this.projectiles.spawn(origin, target, now, {
      team: this.player.team,
      damage: this.player.skillEDamage,
      kind: 'slow',
      effect: { slow: { factor: SKILL_E_SLOW_FACTOR, durationMs: SKILL_E_SLOW_DURATION_MS } },
      owner: this.player,
      maxDistance: SKILL_E_RANGE,
      fromPlayer: true,
    });
    Sounds.skill('e');
    this.lastEAt = now;
  }

  private tryUseC(now: number, dirX: number, dirZ: number): void {
    if (now - this.lastCAt < SKILL_C_COOLDOWN_MS) return;
    this.player.faceDirection(dirX, dirZ);
    const origin = this.player.position;
    const target = new THREE.Vector3(
      origin.x + dirX * SKILL_C_RANGE,
      origin.y,
      origin.z + dirZ * SKILL_C_RANGE,
    );
    this.projectiles.spawn(origin, target, now, {
      team: this.player.team,
      damage: this.player.skillCDamage,
      kind: 'control',
      effect: { stun: { durationMs: SKILL_C_STUN_DURATION_MS } },
      owner: this.player,
      maxDistance: SKILL_C_RANGE,
      fromPlayer: true,
    });
    Sounds.skill('c');
    this.lastCAt = now;
  }

  private spinCrystals(delta: number): void {
    const crystals = this.scene.userData.crystals as THREE.Mesh[] | undefined;
    if (!crystals) return;
    for (const c of crystals) c.rotation.y += delta * 0.8;
  }

  private spawnMinionWave(now: number): void {
    this.lastMinionWaveAt = now;
    const variants: MinionVariant[] = ['melee', 'ranged', 'tank'];
    const blueBaseSpawn = new THREE.Vector3(SPAWN_BLUE_X, 0, SPAWN_BLUE_Z);
    const redBaseSpawn = new THREE.Vector3(SPAWN_RED_X, 0, SPAWN_RED_Z);
    const lanes: Array<keyof typeof LANE_PATHS> = ['top', 'mid', 'bot'];
    for (const lane of lanes) {
      const bluePath = LANE_PATHS[lane].blue;
      const redPath = LANE_PATHS[lane].red;
      for (let i = 0; i < variants.length; i++) {
        const config = MINION_CONFIGS[variants[i]];
        const blue = new MinionObject(this.scene, 'blue', blueBaseSpawn, i, config, bluePath);
        const red = new MinionObject(this.scene, 'red', redBaseSpawn, i, config, redPath);
        this.minions.push(blue, red);
        this.registry.add(blue);
        this.registry.add(red);
      }
    }
  }

  private updateMinions(delta: number, now: number): void {
    for (const minion of this.minions) {
      const objective = this.getMinionObjective(minion.team);
      minion.update(delta, now, this.registry, this.projectiles, this.colliders, objective);
    }
  }

  private getMinionObjective(team: Team): Unit | null {
    // Final objective is always the enemy base — towers in between get
    // engaged automatically by findNearestEnemy as the minion walks past.
    return team === 'blue' ? this.bases[1] : this.bases[0];
  }

  private cleanupMinions(now: number): void {
    for (let i = this.minions.length - 1; i >= 0; i--) {
      const minion = this.minions[i];
      if (minion.alive || now - minion.deadAt < 1000) continue;
      this.registry.remove(minion);
      minion.dispose();
      this.minions.splice(i, 1);
    }
  }

  private healHeroesAtBase(delta: number): void {
    const heal = HERO_BASE_REGEN_PER_SEC * delta;
    if (isNear(this.player.position, BASE_BLUE_X, BASE_BLUE_Z, BASE_REGEN_RADIUS)) {
      this.player.heal(heal);
    }
    if (isNear(this.bot.position, BASE_RED_X, BASE_RED_Z, BASE_REGEN_RADIUS)) {
      this.bot.heal(heal);
    }
  }

  private getRespawnDelayMs(level: number, now: number): number {
    const matchMinutes = Math.floor(this.getMatchElapsedMs(now) / 60000);
    const delay =
      PLAYER_RESPAWN_MS +
      (level - 1) * RESPAWN_LEVEL_PENALTY_MS +
      matchMinutes * RESPAWN_MATCH_MINUTE_PENALTY_MS;
    return Math.min(RESPAWN_MAX_MS, delay);
  }
}

function isNear(pos: THREE.Vector3, x: number, z: number, radius: number): boolean {
  const dx = pos.x - x;
  const dz = pos.z - z;
  return dx * dx + dz * dz <= radius * radius;
}
