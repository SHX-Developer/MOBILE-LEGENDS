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
  private readonly levelTexture?: THREE.CanvasTexture;
  private readonly levelCanvas?: HTMLCanvasElement;
  private readonly levelCtx?: CanvasRenderingContext2D;

  constructor(longAxis: number, shortAxis: number, color: number, showLevel = false) {
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

    if (showLevel) {
      this.levelCanvas = document.createElement('canvas');
      this.levelCanvas.width = 160;
      this.levelCanvas.height = 112;
      const ctx = this.levelCanvas.getContext('2d');
      if (!ctx) throw new Error('2D canvas is required for health bar level labels');
      this.levelCtx = ctx;
      this.levelTexture = new THREE.CanvasTexture(this.levelCanvas);
      const level = new THREE.Mesh(
        new THREE.PlaneGeometry(0.95, 0.66),
        new THREE.MeshBasicMaterial({
          map: this.levelTexture,
          transparent: true,
          depthTest: false,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      level.position.set(-longAxis / 2 - 0.68, 0, 0.02);
      level.renderOrder = 10001;
      this.group.add(level);
      this.setLevel(1);
    }
  }

  setRatio(r: number): void {
    const ratio = r < 0 ? 0 : r > 1 ? 1 : r;
    this.fg.scale.x = Math.max(ratio, 0.0001);
  }

  setLevel(level: number): void {
    if (!this.levelCtx || !this.levelCanvas || !this.levelTexture) return;
    const ctx = this.levelCtx;
    ctx.clearRect(0, 0, this.levelCanvas.width, this.levelCanvas.height);
    ctx.fillStyle = 'rgba(8, 12, 18, 0.96)';
    ctx.strokeStyle = 'rgba(255, 216, 82, 1)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    roundedRect(ctx, 10, 8, 140, 96, 28);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffd852';
    ctx.font = '900 24px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LV', 44, 56);

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 58px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(level), 100, 57);
    this.levelTexture.needsUpdate = true;
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

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
}
