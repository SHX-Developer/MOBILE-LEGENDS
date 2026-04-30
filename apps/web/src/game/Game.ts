import * as THREE from 'three';
import type { MatchCombatEvent, MatchPlayerSnapshot } from '@ml/shared';
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
  MINION_WAVE_INTERVAL_MS,
  MINION_WAVE_SIZE,
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
} from './constants.js';
import { buildMap } from './world/MapBuilder.js';
import type { Colliders } from './world/Colliders.js';
import type { Tower } from './world/Towers.js';
import type { Base } from './world/Bases.js';
import { PlayerObject } from './entities/PlayerObject.js';
import { BotObject } from './entities/BotObject.js';
import { MinionObject } from './entities/MinionObject.js';
import { ProjectileManager } from './entities/ProjectileManager.js';
import { CameraRig } from './CameraRig.js';
import { InputController } from './InputController.js';
import { UnitRegistry } from './combat/UnitRegistry.js';
import { FloatingTextManager } from './combat/FloatingTextManager.js';
import type { Team, Unit } from './combat/Unit.js';
import { Haptics } from './haptics.js';
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

    // Bases are shielded by their tower: only join the registry (and become
    // hittable) once the matching same-side tower falls.
    this.towers[0].onDestroyed = () => this.registry.add(this.bases[0]);
    this.towers[1].onDestroyed = () => this.registry.add(this.bases[1]);

    // Match end via base destruction is offline-only. Online uses
    // server-driven kill score so client base sims can drift cosmetically
    // without falsely declaring a winner.
    if (this.mode === 'offline') {
      this.bases[0].onDestroyed = () => this.endMatch('red');
      this.bases[1].onDestroyed = () => this.endMatch('blue');
    }

    this.projectiles = new ProjectileManager(this.scene);
    this.projectiles.onPlayerHit = () => Haptics.hitEnemy();
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

  private buildAimIndicator(): THREE.Mesh {
    // Bar anchored at +y edge. After rotation.x = -PI/2 the bar lies on the
    // ground extending in world +z; rotation.z then yaws it to (dirX, dirZ).
    const geom = new THREE.PlaneGeometry(1.4, 1);
    geom.translate(0, -0.5, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffe28a,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    return mesh;
  }

  private refreshAimIndicator(): void {
    const active = this.aim.q.active ? this.aim.q : this.aim.e.active ? this.aim.e : this.aim.c.active ? this.aim.c : null;
    if (!active) {
      this.aimIndicator.visible = false;
      return;
    }
    const p = this.player.position;
    this.aimIndicator.position.set(p.x, 0.05, p.z);
    const angle = Math.atan2(active.dirX, active.dirZ);
    this.aimIndicator.rotation.set(-Math.PI / 2, 0, angle);
    this.aimIndicator.scale.set(1, active.range, 1);
    this.aimIndicator.visible = true;
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
    const skillReq = this.input.consumeSkillRequest();
    const movement = this.input.getMovement();

    if (this.mode === 'online') {
      this.online.sendInput(movement.x, movement.z, now);
      const status = this.online.getStatus();
      if (status !== 'playing' && status !== 'ended') {
        // Queued / connecting: render an empty scene so the queue overlay
        // sits over a quiet backdrop, no offline simulation kicks in.
        this.rig.follow(this.player.position);
        this.renderer.render(this.scene, this.rig.camera);
        return;
      }
      this.runOnlineFrame(delta, now, wantsAttack, skillReq);
      return;
    }

    if (now - this.lastMinionWaveAt >= MINION_WAVE_INTERVAL_MS) {
      this.spawnMinionWave(now);
    }

    if (this.player.alive) {
      this.player.update(movement, delta, now);
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
    if (!this.player.alive && this.playerWasAlive) {
      this.respawnAt = now + this.getRespawnDelayMs(this.player.level, now);
    }
    this.playerWasAlive = this.player.alive;

    this.cleanupMinions(now);
    this.floatingText.update(now);

    // Haptic on damage taken (covers bot, tower and base attacks alike).
    if (this.player.alive && this.player.hp < this.lastPlayerHp) {
      Haptics.takeDamage();
    }
    this.lastPlayerHp = this.player.hp;
    this.spinCrystals(delta);

    if (this.aimIndicator.visible) this.refreshAimIndicator();

    this.rig.follow(this.player.position);

    const cam = this.rig.camera;
    this.player.billboardHealthBar(cam);
    this.bot.billboardHealthBar(cam);
    for (const m of this.minions) m.billboardHealthBar(cam);
    for (const t of this.towers) t.billboardHealthBar(cam);
    for (const b of this.bases) b.billboardHealthBar(cam);

    this.renderer.render(this.scene, this.rig.camera);
  };

  private tryAutoAttack(now: number): void {
    if (now - this.lastAttackAt < PLAYER_ATTACK_COOLDOWN_MS) return;
    const target = this.registry.findNearestEnemy(
      this.player.team,
      this.player.position,
      PLAYER_ATTACK_RANGE,
      ['minion', 'hero', 'structure'],
    );
    if (!target) return;
    this.player.faceTarget(target.position);
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
    if (wantsAttack) this.online.attack();
    if (skillReq) {
      let dx = skillReq.dirX;
      let dz = skillReq.dirZ;
      if (Math.hypot(dx, dz) < 1e-3) {
        dx = this.player.facing.x;
        dz = this.player.facing.z;
      }
      this.online.skill(skillReq.id, dx, dz);
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
    this.floatingText.update(now);
    this.spinCrystals(delta);

    if (this.aimIndicator.visible) this.refreshAimIndicator();

    this.rig.follow(this.player.position);

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

  private applyOnlineSnapshot(): void {
    const snapshot = this.online.getSnapshot();
    const playerId = this.online.getPlayerId();
    if (!snapshot || !playerId) return;
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
      this.spawnOnlineCombatFx(event, owner, now);
      if (event.hit && event.damage > 0 && target) {
        this.floatingText.spawnDamage(target.position, event.damage, target.team, owner?.team);
      }
      if (event.hit && event.attackerId === ownId) Haptics.hitEnemy();
      if (event.hit && event.targetId === ownId) Haptics.takeDamage();
    }
  }

  private onlineUnitFor(playerId: string): Unit | null {
    const ownId = this.online.getPlayerId();
    if (playerId === ownId) return this.player;
    const snapshot = this.online.getSnapshot();
    if (snapshot?.players.some((p) => p.id === playerId)) return this.bot;
    return null;
  }

  private spawnOnlineCombatFx(event: MatchCombatEvent, owner: Unit | null | undefined, now: number): void {
    const origin = new THREE.Vector3(event.startX, 0, event.startZ);
    const target = new THREE.Vector3(event.endX, 0, event.endZ);
    const maxDistance = Math.max(1, origin.distanceTo(target));
    const kind =
      event.kind === 'attack'
        ? 'basic'
        : event.skillId === 'q'
          ? 'heavy'
          : event.skillId === 'e'
            ? 'slow'
            : 'control';
    this.projectiles.spawn(origin, target, now, {
      team: owner?.team ?? 'blue',
      damage: 0,
      kind,
      maxDistance,
      visualOnly: true,
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
    this.lastCAt = now;
  }

  private spinCrystals(delta: number): void {
    const crystals = this.scene.userData.crystals as THREE.Mesh[] | undefined;
    if (!crystals) return;
    for (const c of crystals) c.rotation.y += delta * 0.8;
  }

  private spawnMinionWave(now: number): void {
    this.lastMinionWaveAt = now;
    const blueSpawn = new THREE.Vector3(SPAWN_BLUE_X - 2.2, 0, SPAWN_BLUE_Z + 2.2);
    const redSpawn = new THREE.Vector3(SPAWN_RED_X + 2.2, 0, SPAWN_RED_Z - 2.2);
    for (let i = 0; i < MINION_WAVE_SIZE; i++) {
      const blue = new MinionObject(this.scene, 'blue', blueSpawn, i);
      const red = new MinionObject(this.scene, 'red', redSpawn, i);
      this.minions.push(blue, red);
      this.registry.add(blue);
      this.registry.add(red);
    }
  }

  private updateMinions(delta: number, now: number): void {
    for (const minion of this.minions) {
      const objective = this.getMinionObjective(minion.team);
      minion.update(delta, now, this.registry, this.projectiles, this.colliders, objective);
    }
  }

  private getMinionObjective(team: Team): Unit | null {
    if (team === 'blue') return this.towers[1].alive ? this.towers[1] : this.bases[1];
    return this.towers[0].alive ? this.towers[0] : this.bases[0];
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
