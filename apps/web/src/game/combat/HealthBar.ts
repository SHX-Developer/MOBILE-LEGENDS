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
  /**
   * Set once on game boot from `renderer.capabilities.getMaxAnisotropy()`.
   * Applied to the level/HP canvas textures so the labels stay readable
   * when the camera zooms out and the bars shrink to a few screen pixels.
   */
  static maxAnisotropy = 1;

  readonly group = new THREE.Group();
  private readonly fg: THREE.Mesh;
  private readonly levelTexture?: THREE.CanvasTexture;
  private readonly levelCanvas?: HTMLCanvasElement;
  private readonly levelCtx?: CanvasRenderingContext2D;
  private readonly hpTexture?: THREE.CanvasTexture;
  private readonly hpCanvas?: HTMLCanvasElement;
  private readonly hpCtx?: CanvasRenderingContext2D;
  private lastHpText = '';

  constructor(
    longAxis: number,
    shortAxis: number,
    color: number,
    showLevel = false,
    showHp = false,
    /**
     * Multiplier for the HP-number plate dimensions. Heroes share size with
     * the bar (default 1.0). Minions pass >1 so their digits read large
     * relative to the tiny minion bar — otherwise they're a smear at distance.
     */
    hpScale = 1,
  ) {
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
      // Power-of-two size required for trilinear mipmapping on WebGL1.
      this.levelCanvas.width = 512;
      this.levelCanvas.height = 512;
      const ctx = this.levelCanvas.getContext('2d');
      if (!ctx) throw new Error('2D canvas is required for health bar level labels');
      this.levelCtx = ctx;
      this.levelTexture = new THREE.CanvasTexture(this.levelCanvas);
      // Mipmaps + anisotropy keep the level digit and ring crisp at any
      // zoom level instead of shimmering when downscaled.
      this.levelTexture.generateMipmaps = true;
      this.levelTexture.minFilter = THREE.LinearMipmapLinearFilter;
      this.levelTexture.magFilter = THREE.LinearFilter;
      this.levelTexture.anisotropy = HealthBar.maxAnisotropy;
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

    if (showHp) {
      this.hpCanvas = document.createElement('canvas');
      // Power-of-two for mipmaps. 4:1 aspect keeps the existing layout but
      // doubles the source resolution so the HP digits survive downscale
      // when the camera is far.
      this.hpCanvas.width = 512;
      this.hpCanvas.height = 128;
      const ctx = this.hpCanvas.getContext('2d');
      if (!ctx) throw new Error('2D canvas is required for health bar HP labels');
      this.hpCtx = ctx;
      this.hpTexture = new THREE.CanvasTexture(this.hpCanvas);
      this.hpTexture.generateMipmaps = true;
      this.hpTexture.minFilter = THREE.LinearMipmapLinearFilter;
      this.hpTexture.magFilter = THREE.LinearFilter;
      this.hpTexture.anisotropy = HealthBar.maxAnisotropy;
      // Bigger HP plate — extends a little past the bar's edges so the
      // digits read clearly even at the closer tactical zoom. `hpScale`
      // lets entities with skinny bars (minions) push the plate even larger.
      const hpW = longAxis * 1.25 * hpScale;
      const hpH = hpW * (this.hpCanvas.height / this.hpCanvas.width) * 1.2;
      const hpPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(hpW, hpH),
        new THREE.MeshBasicMaterial({
          map: this.hpTexture,
          transparent: true,
          depthTest: false,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      hpPlane.position.set(0, shortAxis / 2 + hpH / 2 + 0.05, 0.02);
      hpPlane.renderOrder = 10001;
      this.group.add(hpPlane);
      this.setHp(1, 1);
    }
  }

  setRatio(r: number): void {
    const ratio = r < 0 ? 0 : r > 1 ? 1 : r;
    this.fg.scale.x = Math.max(ratio, 0.0001);
  }

  setHp(current: number, max: number): void {
    if (!this.hpCtx || !this.hpCanvas || !this.hpTexture) return;
    const cur = Math.max(0, Math.ceil(current));
    const mx = Math.max(1, Math.ceil(max));
    const text = `${cur}/${mx}`;
    if (text === this.lastHpText) return;
    this.lastHpText = text;
    const ctx = this.hpCtx;
    const w = this.hpCanvas.width;
    const h = this.hpCanvas.height;
    ctx.clearRect(0, 0, w, h);
    // Sizes are derived from canvas height so they stay correct if we ever
    // change the source resolution again.
    const fontPx = Math.round(h * 0.7);
    const stroke = Math.round(h * 0.125);
    ctx.font = `900 ${fontPx}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = stroke;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)';
    ctx.strokeText(text, w / 2, h / 2 + 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, w / 2, h / 2 + 2);
    this.hpTexture.needsUpdate = true;
  }

  private lastLevel = -1;
  private lastProgress = -1;
  setLevel(level: number, progress = 0): void {
    if (!this.levelCtx || !this.levelCanvas || !this.levelTexture) return;
    // The level badge canvas is a power-of-two square with arc/text strokes
    // — redrawing it every frame and re-uploading to the GPU was the
    // dominant cost in online play. Skip when neither value changed
    // meaningfully.
    if (level === this.lastLevel && Math.abs(progress - this.lastProgress) < 0.01) return;
    this.lastLevel = level;
    this.lastProgress = progress;
    const ctx = this.levelCtx;
    const size = this.levelCanvas.width;
    ctx.clearRect(0, 0, size, size);

    // All sizes are expressed as fractions of the canvas dimension so the
    // badge keeps the same proportions if the source resolution changes.
    const cx = size / 2;
    const cy = size / 2;
    const radius = size * 0.30;
    const ringRadius = radius + size * 0.07;
    ctx.fillStyle = 'rgba(7, 10, 16, 0.98)';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = size * 0.051;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
    ctx.stroke();

    const pct = Math.max(0, Math.min(progress, 1));
    if (pct > 0) {
      ctx.strokeStyle = '#ffd852';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, cy, ringRadius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }

    ctx.lineWidth = size * 0.031;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';

    ctx.fillStyle = '#ffffff';
    const fontPx = Math.round(size * (level >= 10 ? 0.422 : 0.516));
    ctx.font = `900 ${fontPx}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(String(level), cx, cy + size * 0.016);
    ctx.fillText(String(level), cx, cy + size * 0.016);
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
