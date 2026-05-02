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
  private drag: {
    pointerId: number;
    startX: number;
    startY: number;
    cumX: number;
    cumZ: number;
    engaged: boolean;
  } | null = null;
  private onCameraPan?: (worldDx: number, worldDz: number) => void;
  private onCameraPanRelease?: () => void;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.Camera,
  ) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
  }

  setCameraPanHandlers(
    pan: (worldDx: number, worldDz: number) => void,
    release: () => void,
  ): void {
    this.onCameraPan = pan;
    this.onCameraPanRelease = release;
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
    if (this.drag) return;
    this.canvas.setPointerCapture(e.pointerId);
    this.drag = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      cumX: 0,
      cumZ: 0,
      engaged: false,
    };
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.drag || this.drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - this.drag.startX;
    const dy = e.clientY - this.drag.startY;
    if (!this.drag.engaged) {
      // Slightly lower threshold than before — players want the camera to
      // start tracking quickly when they sweep to scout. Still high enough
      // that micro-jitter near skill/joystick zones doesn't trigger a pan.
      if (Math.hypot(dx, dy) < 16) return;
      this.drag.engaged = true;
    }
    // Map screen delta → world delta. The CSS rotation in portrait swaps
    // the axes; sign chosen so the camera follows the finger (drag-the-camera).
    const portrait = window.innerHeight > window.innerWidth;
    const screenX = portrait ? dy : dx;
    const screenZ = portrait ? -dx : dy;
    // Bumped from 0.06 → 0.11: about 80% more world-units per pixel of finger
    // travel, so a half-screen swipe now actually scrolls to the next lane
    // instead of barely peeking past the player.
    const scale = 0.11;
    this.drag.cumX = screenX * scale;
    this.drag.cumZ = screenZ * scale;
    // Clamp so the player can't pan halfway across the world.
    const maxOffset = 24;
    if (this.drag.cumX > maxOffset) this.drag.cumX = maxOffset;
    else if (this.drag.cumX < -maxOffset) this.drag.cumX = -maxOffset;
    if (this.drag.cumZ > maxOffset) this.drag.cumZ = maxOffset;
    else if (this.drag.cumZ < -maxOffset) this.drag.cumZ = -maxOffset;
    this.onCameraPan?.(this.drag.cumX, this.drag.cumZ);
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.drag || this.drag.pointerId !== e.pointerId) return;
    const wasDrag = this.drag.engaged;
    try { this.canvas.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
    this.drag = null;
    if (wasDrag) {
      this.onCameraPanRelease?.();
      return;
    }
    // Treat a quick tap as a click-to-attack (mostly desktop convenience —
    // mobile users have the FIRE button).
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
