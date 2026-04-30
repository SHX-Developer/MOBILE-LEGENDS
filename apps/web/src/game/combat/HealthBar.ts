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
      this.levelCanvas.width = 256;
      this.levelCanvas.height = 256;
      const ctx = this.levelCanvas.getContext('2d');
      if (!ctx) throw new Error('2D canvas is required for health bar level labels');
      this.levelCtx = ctx;
      this.levelTexture = new THREE.CanvasTexture(this.levelCanvas);
      this.levelTexture.generateMipmaps = false;
      this.levelTexture.minFilter = THREE.LinearFilter;
      this.levelTexture.magFilter = THREE.LinearFilter;
      const level = new THREE.Mesh(
        new THREE.PlaneGeometry(1.18, 1.18),
        new THREE.MeshBasicMaterial({
          map: this.levelTexture,
          transparent: true,
          depthTest: false,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      level.position.set(-longAxis / 2 - 0.85, 0, 0.02);
      level.renderOrder = 10001;
      this.group.add(level);
      this.setLevel(1, 0);
    }
  }

  setRatio(r: number): void {
    const ratio = r < 0 ? 0 : r > 1 ? 1 : r;
    this.fg.scale.x = Math.max(ratio, 0.0001);
  }

  setLevel(level: number, progress = 0): void {
    if (!this.levelCtx || !this.levelCanvas || !this.levelTexture) return;
    const ctx = this.levelCtx;
    ctx.clearRect(0, 0, this.levelCanvas.width, this.levelCanvas.height);

    const cx = 128;
    const cy = 128;
    const radius = 77;
    ctx.fillStyle = 'rgba(7, 10, 16, 0.98)';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = 13;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 18, 0, Math.PI * 2);
    ctx.stroke();

    const pct = Math.max(0, Math.min(progress, 1));
    if (pct > 0) {
      ctx.strokeStyle = '#ffd852';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }

    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';

    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${level >= 10 ? 108 : 132}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(String(level), cx, cy + 4);
    ctx.fillText(String(level), cx, cy + 4);
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
