import * as THREE from 'three';

export type SkillId = 'q' | 'e' | 'c';

export interface SkillRequest {
  id: SkillId;
  dirX: number;
  dirZ: number;
}

export class InputController {
  private keys = new Set<string>();
  private joystick = { x: 0, z: 0 };
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private pendingAttack = false;
  private pendingSkill: SkillRequest | null = null;
  private lastClickTarget: THREE.Vector3 | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.Camera,
  ) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    canvas.addEventListener('pointerdown', this.onPointerDown);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
  }

  setJoystick(x: number, z: number): void {
    this.joystick.x = x;
    this.joystick.z = z;
  }

  /** Per-frame movement axis on the ground plane: x = east, z = south. */
  getMovement(): { x: number; z: number } {
    let x = 0;
    let z = 0;
    if (this.keys.has('a')) x -= 1;
    if (this.keys.has('d')) x += 1;
    if (this.keys.has('w')) z -= 1;
    if (this.keys.has('s')) z += 1;
    x += this.joystick.x;
    z += this.joystick.z;
    return { x: clamp(x, -1, 1), z: clamp(z, -1, 1) };
  }

  /** External callers (e.g. mobile FIRE button) use these to request actions. */
  requestAttack(): void { this.pendingAttack = true; }
  requestSkill(id: SkillId, dirX: number, dirZ: number): void {
    this.pendingSkill = { id, dirX, dirZ };
  }

  consumeAttackRequest(): boolean {
    const r = this.pendingAttack;
    this.pendingAttack = false;
    return r;
  }

  consumeSkillRequest(): SkillRequest | null {
    const r = this.pendingSkill;
    this.pendingSkill = null;
    return r;
  }

  getLastClickTarget(): THREE.Vector3 | null {
    return this.lastClickTarget;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const key = e.key.toLowerCase();
    this.keys.add(key);
    // Keyboard skills fire instantly along the player's current facing.
    // (The mobile UI uses requestSkill with a manually-aimed direction.)
    if (key === 'q' || key === 'e' || key === 'c') {
      this.pendingSkill = { id: key as SkillId, dirX: 0, dirZ: 0 };
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
  };

  private onPointerDown = (e: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, hit)) {
      this.lastClickTarget = hit;
    }
    this.pendingAttack = true;
  };
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
