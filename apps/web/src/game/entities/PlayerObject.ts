import * as THREE from 'three';
import { PLAYER_ATTACK_RANGE, PLAYER_MAX_HP, PLAYER_RADIUS, PLAYER_SPEED_3D } from '../constants.js';
import type { Unit, Team } from '../combat/Unit.js';
import { HealthBar } from '../combat/HealthBar.js';

/**
 * Layla — markswoman. Built so that her gun points along the local +Z axis,
 * which matches the rotation formula in update(): atan2(input.x, input.z).
 */
export class PlayerObject implements Unit {
  readonly group = new THREE.Group();
  readonly facing = new THREE.Vector3(0, 0, 1);
  readonly team: Team = 'blue';
  readonly radius = PLAYER_RADIUS;
  readonly maxHp = PLAYER_MAX_HP;
  hp = PLAYER_MAX_HP;
  alive = true;
  slowUntil = 0;

  private velocity = new THREE.Vector3();
  private readonly spawn: THREE.Vector3;
  private readonly healthBar = new HealthBar(2.4, 0.22, 0x44ff66);
  private readonly rangeRing: THREE.Mesh;

  constructor(spawn: THREE.Vector3) {
    this.spawn = spawn.clone();
    this.buildLayla();
    this.group.position.copy(spawn);
    this.healthBar.group.position.set(0, 3, 0);
    this.group.add(this.healthBar.group);

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

  billboardHealthBar(camera: THREE.Camera): void {
    // The bar is centered above the character in the rotated-phone
    // landscape view; local +Y is unaffected by player yaw.
    this.healthBar.group.position.set(0, 3, 0);
    this.healthBar.billboard(camera);
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  update(input: { x: number; z: number }, deltaSec: number, now: number): void {
    if (!this.alive) return;
    const speed = this.slowUntil > now ? PLAYER_SPEED_3D * 0.5 : PLAYER_SPEED_3D;
    const len = Math.hypot(input.x, input.z);
    if (len > 0) {
      const nx = input.x / len;
      const nz = input.z / len;
      this.velocity.set(nx * speed, 0, nz * speed);
      this.group.rotation.y = Math.atan2(nx, nz);
      this.facing.set(nx, 0, nz);
    } else {
      this.velocity.set(0, 0, 0);
    }
    this.group.position.x += this.velocity.x * deltaSec;
    this.group.position.z += this.velocity.z * deltaSec;
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

  private die(): void {
    this.alive = false;
    this.group.visible = false;
  }

  respawn(): void {
    this.hp = this.maxHp;
    this.alive = true;
    this.slowUntil = 0;
    this.group.position.copy(this.spawn);
    this.group.visible = true;
    this.velocity.set(0, 0, 0);
    this.healthBar.setRatio(1);
  }

  private buildLayla(): void {
    const skin = new THREE.MeshStandardMaterial({ color: 0xf3c8a4, roughness: 0.7 });
    const cloak = new THREE.MeshStandardMaterial({ color: 0x4a2a78, roughness: 0.6 });
    const cloakLight = new THREE.MeshStandardMaterial({ color: 0x6c3fa8, roughness: 0.6 });
    const trim = new THREE.MeshStandardMaterial({
      color: 0xf2cf5a,
      roughness: 0.4,
      metalness: 0.4,
    });
    const hair = new THREE.MeshStandardMaterial({ color: 0xf6e3a8, roughness: 0.7 });
    const gunMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a36,
      roughness: 0.4,
      metalness: 0.7,
    });
    const gunAccent = new THREE.MeshStandardMaterial({
      color: 0xd6a93a,
      roughness: 0.4,
      metalness: 0.6,
    });

    const legGeom = new THREE.CylinderGeometry(0.18, 0.18, 0.9, 12);
    for (const x of [-0.2, 0.2]) {
      const leg = new THREE.Mesh(legGeom, cloak);
      leg.position.set(x, 0.45, 0);
      leg.castShadow = true;
      this.group.add(leg);
    }

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

    const armGeom = new THREE.CylinderGeometry(0.12, 0.12, 0.7, 10);
    const leftArm = new THREE.Mesh(armGeom, cloakLight);
    leftArm.position.set(-0.5, 1.55, 0);
    leftArm.rotation.z = Math.PI / 12;
    leftArm.castShadow = true;
    this.group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeom, cloakLight);
    rightArm.position.set(0.45, 1.4, 0.25);
    rightArm.rotation.x = -Math.PI / 3;
    rightArm.castShadow = true;
    this.group.add(rightArm);

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

    const gun = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.95), gunMat);
    barrel.position.z = 0.4;
    gun.add(barrel);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.18), gunMat);
    grip.position.set(0, -0.18, 0);
    gun.add(grip);
    const accent = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.4), gunAccent);
    accent.position.set(0, 0.12, 0.55);
    gun.add(accent);
    gun.position.set(0.45, 1.25, 0.55);
    gun.castShadow = true;
    this.group.add(gun);
  }
}
