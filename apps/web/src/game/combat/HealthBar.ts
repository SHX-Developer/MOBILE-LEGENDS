import * as THREE from 'three';

const _camQuat = new THREE.Quaternion();
const _parentInv = new THREE.Quaternion();

/**
 * Floating health bar — a billboard quad whose long axis reads horizontally
 * in the player's rotated-phone game view. The DOM canvas is rotated 90° CW
 * for Telegram's portrait shell, but players turn the phone while playing,
 * so the bar should stay horizontal in the underlying landscape canvas.
 * Call billboard(camera) once per frame.
 *
 * Two flat planes are stacked: a tight black backing and a colored fill that
 * shrinks toward phone-left as HP drops (drains from the right).
 */
export class HealthBar {
  readonly group = new THREE.Group();
  private readonly fg: THREE.Mesh;

  constructor(longAxis: number, shortAxis: number, color: number) {
    const padding = 0.05;

    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(longAxis + padding * 2, shortAxis + padding * 2),
      new THREE.MeshBasicMaterial({
        color: 0x1a0c0c,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    bg.renderOrder = 9999;
    this.group.add(bg);

    // Anchor fg on its -X edge: vertices live in [0, longAxis], then the
    // mesh is shifted by -longAxis/2 to centre the bar in the group. With
    // that, fg.scale.x in [0,1] keeps the left edge fixed and shrinks the
    // right edge toward it.
    const fgGeom = new THREE.PlaneGeometry(longAxis, shortAxis);
    fgGeom.translate(longAxis / 2, 0, 0);
    this.fg = new THREE.Mesh(
      fgGeom,
      new THREE.MeshBasicMaterial({
        color,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.fg.position.x = -longAxis / 2;
    this.fg.renderOrder = 10000;
    this.group.add(this.fg);
  }

  setRatio(r: number): void {
    const ratio = r < 0 ? 0 : r > 1 ? 1 : r;
    this.fg.scale.x = Math.max(ratio, 0.0001);
  }

  /**
   * Orient the bar to face the camera with its long axis on landscape-screen
   * horizontal. A plain camera quaternion keeps local +X on camera-right.
   * The parent inverse keeps it correct even when the parent group rotates
   * (e.g. PlayerObject yaws on movement).
   */
  billboard(camera: THREE.Camera): void {
    camera.getWorldQuaternion(_camQuat);
    const parent = this.group.parent;
    if (parent) {
      parent.getWorldQuaternion(_parentInv).invert();
      _camQuat.premultiply(_parentInv);
    }
    this.group.quaternion.copy(_camQuat);
  }
}
