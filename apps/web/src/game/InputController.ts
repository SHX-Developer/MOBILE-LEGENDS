import * as THREE from 'three';

export class InputController {
  private keys = new Set<string>();
  private joystick = { x: 0, z: 0 };
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private pendingTarget: THREE.Vector3 | null = null;

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

  /** Returns and clears any pending click target on the ground plane. */
  consumeAttackTarget(): THREE.Vector3 | null {
    const t = this.pendingTarget;
    this.pendingTarget = null;
    return t;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keys.add(e.key.toLowerCase());
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
      this.pendingTarget = hit;
    }
  };
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
