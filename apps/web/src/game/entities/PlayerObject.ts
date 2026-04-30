import * as THREE from 'three';
import {
  HERO_BASE_XP_TO_LEVEL,
  HERO_DAMAGE_PER_LEVEL,
  HERO_HP_PER_LEVEL,
  HERO_KILL_XP_REWARD,
  HERO_MAX_LEVEL,
  HERO_XP_LEVEL_GROWTH,
  PLAYER_ATTACK_DAMAGE,
  PLAYER_ATTACK_RANGE,
  PLAYER_MAX_HP,
  PLAYER_RADIUS,
  PLAYER_SPEED_3D,
  SKILL_E_DAMAGE,
  SKILL_C_DAMAGE,
  SKILL_Q_DAMAGE,
} from '../constants.js';
import type { Unit, Team } from '../combat/Unit.js';
import { HealthBar } from '../combat/HealthBar.js';

/**
 * Layla — markswoman. Built so that her bow points along the local +Z axis,
 * which matches the rotation formula in update(): atan2(input.x, input.z).
 */
export class PlayerObject implements Unit {
  readonly kind = 'hero';
  readonly group = new THREE.Group();
  readonly facing = new THREE.Vector3(0, 0, 1);
  team: Team = 'blue';
  readonly radius = PLAYER_RADIUS;
  readonly xpReward = HERO_KILL_XP_REWARD;
  hp = PLAYER_MAX_HP;
  alive = true;
  slowUntil = 0;
  stunnedUntil = 0;
  level = 1;
  xp = 0;

  private velocity = new THREE.Vector3();
  private readonly spawn: THREE.Vector3;
  private readonly healthBar = new HealthBar(2.4, 0.22, 0x44ff66, true);
  private readonly rangeRing: THREE.Mesh;
  private cloakMat!: THREE.MeshStandardMaterial;
  private cloakLightMat!: THREE.MeshStandardMaterial;
  /** While now < attackLockUntil the hero stops moving (stand-still on shoot). */
  attackLockUntil = 0;
  private gaitPhase = 0;
  private leftLeg?: THREE.Object3D;
  private rightLeg?: THREE.Object3D;
  private leftArm?: THREE.Object3D;
  private rightArm?: THREE.Object3D;
  private bowGroup?: THREE.Object3D;

  constructor(spawn: THREE.Vector3) {
    this.spawn = spawn.clone();
    this.buildLayla();
    this.group.position.copy(spawn);
    this.healthBar.group.position.set(0, 3, 0);
    this.group.add(this.healthBar.group);
    this.refreshLevelBadge();

    this.rangeRing = new THREE.Mesh(
      new THREE.RingGeometry(PLAYER_ATTACK_RANGE - 0.35, PLAYER_ATTACK_RANGE, 64),
      new THREE.MeshBasicMaterial({
        color: 0x9fd8ff,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.rangeRing.rotation.x = -Math.PI / 2;
    this.rangeRing.position.y = 0.04;
    this.rangeRing.visible = false;
    this.group.add(this.rangeRing);
  }

  setRangeVisible(visible: boolean): void {
    this.rangeRing.visible = visible && this.alive;
  }

  /** Swap the hero's team allegiance and recolor the cloak to match. */
  setTeam(team: Team): void {
    this.team = team;
    const palette = team === 'blue'
      ? { cloak: 0x1f4c8a, cloakLight: 0x3d7bc4 }
      : { cloak: 0x8a1f1f, cloakLight: 0xc44a4a };
    this.cloakMat.color.setHex(palette.cloak);
    this.cloakLightMat.color.setHex(palette.cloakLight);
  }

  billboardHealthBar(camera: THREE.Camera): void {
    // The bar is centered above the character in the rotated-phone
    // landscape view; local +Y is unaffected by player yaw.
    this.healthBar.group.position.set(0, 3, 0);
    this.healthBar.billboard(camera);
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  get maxHp(): number {
    return PLAYER_MAX_HP + (this.level - 1) * HERO_HP_PER_LEVEL;
  }

  get attackDamage(): number {
    return PLAYER_ATTACK_DAMAGE + (this.level - 1) * HERO_DAMAGE_PER_LEVEL;
  }

  get skillQDamage(): number {
    return SKILL_Q_DAMAGE + (this.level - 1) * HERO_DAMAGE_PER_LEVEL * 1.5;
  }

  get skillEDamage(): number {
    return SKILL_E_DAMAGE + (this.level - 1) * Math.round(HERO_DAMAGE_PER_LEVEL * 0.6);
  }

  get skillCDamage(): number {
    return SKILL_C_DAMAGE + (this.level - 1) * Math.round(HERO_DAMAGE_PER_LEVEL * 0.4);
  }

  update(input: { x: number; z: number }, deltaSec: number, now: number): void {
    if (!this.alive) return;
    if (this.stunnedUntil > now) {
      this.velocity.set(0, 0, 0);
      this.animateGait(0, deltaSec, now);
      return;
    }
    // Lock movement during the attack windup so the shot reads as committed.
    const attacking = now < this.attackLockUntil;
    const speed = this.slowUntil > now ? PLAYER_SPEED_3D * 0.5 : PLAYER_SPEED_3D;
    const len = Math.hypot(input.x, input.z);
    let targetVx = 0;
    let targetVz = 0;
    if (!attacking && len > 0) {
      const nx = input.x / len;
      const nz = input.z / len;
      targetVx = nx * speed;
      targetVz = nz * speed;
      this.group.rotation.y = Math.atan2(nx, nz);
      this.facing.set(nx, 0, nz);
    }
    // Smooth velocity ramp — accel ~24 u/s² gives a snappy but non-jittery feel.
    const accel = attacking ? 40 : 22;
    const k = Math.min(1, deltaSec * accel * 0.25);
    this.velocity.x += (targetVx - this.velocity.x) * k;
    this.velocity.z += (targetVz - this.velocity.z) * k;
    this.group.position.x += this.velocity.x * deltaSec;
    this.group.position.z += this.velocity.z * deltaSec;
    const moveSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.animateGait(moveSpeed, deltaSec, now);
  }

  /** Triggered by Game when the player fires. Locks movement for a moment and
   *  yanks the bow into a draw pose for that window. */
  triggerAttackPose(now: number): void {
    this.attackLockUntil = now + 220;
  }

  private animateGait(speed: number, deltaSec: number, now: number): void {
    const drawing = now < this.attackLockUntil;
    if (drawing) {
      // Hold limbs nearly still, pull the bow back slightly.
      const k = Math.min(1, deltaSec * 14);
      const lerp = (a: number, b: number) => a + (b - a) * k;
      if (this.leftLeg) this.leftLeg.rotation.x = lerp(this.leftLeg.rotation.x, 0);
      if (this.rightLeg) this.rightLeg.rotation.x = lerp(this.rightLeg.rotation.x, 0);
      if (this.leftArm) this.leftArm.rotation.x = lerp(this.leftArm.rotation.x, -0.55);
      if (this.rightArm) this.rightArm.rotation.x = lerp(this.rightArm.rotation.x, -0.95);
      if (this.bowGroup) this.bowGroup.scale.x = lerp(this.bowGroup.scale.x, 1.1);
      return;
    }
    if (this.bowGroup) this.bowGroup.scale.x = 1;
    if (speed > 0.3) {
      this.gaitPhase += deltaSec * (5 + speed * 0.4);
      const swing = Math.sin(this.gaitPhase) * 0.7;
      if (this.leftLeg) this.leftLeg.rotation.x = swing;
      if (this.rightLeg) this.rightLeg.rotation.x = -swing;
      if (this.leftArm) this.leftArm.rotation.x = -swing * 0.6;
      if (this.rightArm) this.rightArm.rotation.x = swing * 0.6;
    } else {
      const k = Math.min(1, deltaSec * 8);
      const lerp = (a: number, b: number) => a + (b - a) * k;
      if (this.leftLeg) this.leftLeg.rotation.x = lerp(this.leftLeg.rotation.x, 0);
      if (this.rightLeg) this.rightLeg.rotation.x = lerp(this.rightLeg.rotation.x, 0);
      if (this.leftArm) this.leftArm.rotation.x = lerp(this.leftArm.rotation.x, 0);
      if (this.rightArm) this.rightArm.rotation.x = lerp(this.rightArm.rotation.x, 0);
    }
  }

  faceTarget(target: THREE.Vector3): void {
    const dx = target.x - this.group.position.x;
    const dz = target.z - this.group.position.z;
    if (dx === 0 && dz === 0) return;
    this.group.rotation.y = Math.atan2(dx, dz);
    const len = Math.hypot(dx, dz);
    this.facing.set(dx / len, 0, dz / len);
  }

  faceDirection(dirX: number, dirZ: number): void {
    const len = Math.hypot(dirX, dirZ);
    if (len < 1e-4) return;
    const nx = dirX / len;
    const nz = dirZ / len;
    this.group.rotation.y = Math.atan2(nx, nz);
    this.facing.set(nx, 0, nz);
  }

  takeDamage(amount: number): void {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - amount);
    this.healthBar.setRatio(this.hp / this.maxHp);
    if (this.hp <= 0) this.die();
  }

  heal(amount: number): void {
    if (!this.alive || amount <= 0 || this.hp >= this.maxHp) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.healthBar.setRatio(this.hp / this.maxHp);
  }

  grantXp(amount: number): void {
    if (this.level >= HERO_MAX_LEVEL || amount <= 0) return;
    this.xp += amount;
    while (this.level < HERO_MAX_LEVEL && this.xp >= this.xpToNext()) {
      this.xp -= this.xpToNext();
      const oldMaxHp = this.maxHp;
      this.level += 1;
      const hpGain = this.maxHp - oldMaxHp;
      this.hp = Math.min(this.maxHp, this.hp + hpGain);
      this.healthBar.setRatio(this.hp / this.maxHp);
    }
    if (this.level >= HERO_MAX_LEVEL) this.xp = 0;
    this.refreshLevelBadge();
  }

  private die(): void {
    this.alive = false;
    this.group.visible = false;
  }

  respawn(): void {
    this.hp = this.maxHp;
    this.alive = true;
    this.slowUntil = 0;
    this.stunnedUntil = 0;
    this.group.position.copy(this.spawn);
    this.group.visible = true;
    this.velocity.set(0, 0, 0);
    this.healthBar.setRatio(1);
  }

  applyServerState(state: {
    x: number;
    z: number;
    facingX: number;
    facingZ: number;
    hp: number;
    maxHp: number;
    level: number;
    xp: number;
    xpToNext: number;
    alive: boolean;
  }): void {
    this.group.position.set(state.x, 0, state.z);
    this.hp = state.hp;
    this.level = state.level;
    this.xp = state.xp;
    this.alive = state.alive;
    this.group.visible = state.alive;
    if (Math.hypot(state.facingX, state.facingZ) > 0.01) {
      this.group.rotation.y = Math.atan2(state.facingX, state.facingZ);
      this.facing.set(state.facingX, 0, state.facingZ);
    }
    this.healthBar.setRatio(state.maxHp > 0 ? state.hp / state.maxHp : 0);
    this.healthBar.setLevel(state.level, state.xpToNext > 0 ? state.xp / state.xpToNext : 1);
  }

  private xpToNext(): number {
    return Math.round(HERO_BASE_XP_TO_LEVEL * HERO_XP_LEVEL_GROWTH ** (this.level - 1));
  }

  private refreshLevelBadge(): void {
    const progress = this.level >= HERO_MAX_LEVEL ? 1 : this.xp / this.xpToNext();
    this.healthBar.setLevel(this.level, progress);
  }

  private buildLayla(): void {
    const skin = new THREE.MeshStandardMaterial({ color: 0xf3c8a4, roughness: 0.7 });
    const cloak = new THREE.MeshStandardMaterial({ color: 0x1f4c8a, roughness: 0.6 });
    const cloakLight = new THREE.MeshStandardMaterial({ color: 0x3d7bc4, roughness: 0.6 });
    this.cloakMat = cloak;
    this.cloakLightMat = cloakLight;
    const trim = new THREE.MeshStandardMaterial({
      color: 0xf2cf5a,
      roughness: 0.4,
      metalness: 0.4,
    });
    const hair = new THREE.MeshStandardMaterial({ color: 0xf6e3a8, roughness: 0.7 });
    const bowMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a36,
      roughness: 0.4,
      metalness: 0.7,
    });
    const bowAccent = new THREE.MeshStandardMaterial({
      color: 0xd6a93a,
      roughness: 0.4,
      metalness: 0.6,
    });
    const stringMat = new THREE.MeshStandardMaterial({ color: 0xf4ead5, roughness: 0.5 });

    // Pivoted legs — rotation happens at the hip, not the centre.
    const legGeom = new THREE.CylinderGeometry(0.18, 0.18, 0.9, 12);
    legGeom.translate(0, -0.45, 0);
    const leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.2, 0.9, 0);
    const leftLegMesh = new THREE.Mesh(legGeom, cloak);
    leftLegMesh.castShadow = true;
    leftLegPivot.add(leftLegMesh);
    this.group.add(leftLegPivot);
    this.leftLeg = leftLegPivot;
    const rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(0.2, 0.9, 0);
    const rightLegMesh = new THREE.Mesh(legGeom, cloak);
    rightLegMesh.castShadow = true;
    rightLegPivot.add(rightLegMesh);
    this.group.add(rightLegPivot);
    this.rightLeg = rightLegPivot;

    const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.65, 0.7, 16), cloak);
    skirt.position.y = 1.05;
    skirt.castShadow = true;
    this.group.add(skirt);

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.55, 6, 12), cloakLight);
    torso.position.y = 1.55;
    torso.castShadow = true;
    this.group.add(torso);

    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 24), trim);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 1.32;
    this.group.add(belt);

    // Pivoted arms — rotation at the shoulder.
    const armGeom = new THREE.CylinderGeometry(0.12, 0.12, 0.7, 10);
    armGeom.translate(0, -0.35, 0);
    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-0.5, 1.85, 0);
    const leftArmMesh = new THREE.Mesh(armGeom, cloakLight);
    leftArmMesh.castShadow = true;
    leftArmPivot.add(leftArmMesh);
    this.group.add(leftArmPivot);
    this.leftArm = leftArmPivot;
    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(0.45, 1.75, 0);
    const rightArmMesh = new THREE.Mesh(armGeom, cloakLight);
    rightArmMesh.castShadow = true;
    rightArmPivot.add(rightArmMesh);
    this.group.add(rightArmPivot);
    this.rightArm = rightArmPivot;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 14), skin);
    head.position.y = 2.15;
    head.castShadow = true;
    this.group.add(head);

    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 14), hair);
    hairCap.position.y = 2.22;
    hairCap.scale.set(1, 0.85, 1);
    hairCap.castShadow = true;
    this.group.add(hairCap);

    const tailGeom = new THREE.CylinderGeometry(0.1, 0.05, 0.8, 8);
    for (const x of [-0.3, 0.3]) {
      const tail = new THREE.Mesh(tailGeom, hair);
      tail.position.set(x, 1.85, -0.05);
      tail.castShadow = true;
      this.group.add(tail);
    }

    const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.1, 0.15), cloak);
    ribbon.position.y = 2.5;
    this.group.add(ribbon);

    const bow = buildBow(bowMat, bowAccent, stringMat);
    bow.position.set(0.45, 1.42, 0.42);
    bow.rotation.z = -Math.PI / 18;
    this.group.add(bow);
    this.bowGroup = bow;
  }
}

function buildBow(
  bowMat: THREE.Material,
  arrowMat: THREE.Material,
  stringMat: THREE.Material,
): THREE.Group {
  const bow = new THREE.Group();
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.035, 8, 28), bowMat);
  arc.scale.set(0.55, 1.25, 1);
  arc.castShadow = true;
  bow.add(arc);

  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.14, 6), stringMat);
  string.position.z = -0.08;
  bow.add(string);

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.85, 6), arrowMat);
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = 0.28;
  bow.add(shaft);

  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 8), arrowMat);
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 0.78;
  bow.add(tip);
  return bow;
}
