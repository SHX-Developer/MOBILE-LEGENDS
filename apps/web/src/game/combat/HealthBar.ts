import * as THREE from 'three';

/**
 * Floating health bar — two stacked sprites that always face the camera.
 *
 * The canvas is rotated 90° CW for landscape display, so a sprite's screen-X
 * axis becomes the phone-Y axis. To make the bar read horizontally in the
 * user's landscape view, we put the bar's long axis on sprite-Y (which is
 * screen-vertical → phone-horizontal after rotation).
 */
export class HealthBar {
  readonly group = new THREE.Group();
  private readonly fg: THREE.Sprite;
  private readonly maxLength: number;

  constructor(longAxis: number, shortAxis: number, color: number) {
    this.maxLength = longAxis;

    const bg = new THREE.Sprite(
      new THREE.SpriteMaterial({ color: 0x1a0c0c, depthTest: false }),
    );
    bg.scale.set(shortAxis + 0.15, longAxis + 0.15, 1);
    this.group.add(bg);

    this.fg = new THREE.Sprite(
      new THREE.SpriteMaterial({ color, depthTest: false }),
    );
    this.fg.scale.set(shortAxis, longAxis, 1);
    this.group.add(this.fg);

    this.group.renderOrder = 999;
  }

  setRatio(r: number): void {
    const ratio = r < 0 ? 0 : r > 1 ? 1 : r;
    const w = ratio * this.maxLength;
    this.fg.scale.y = Math.max(w, 0.0001);
    // Anchor on -Y end (after CSS rotation: phone-left), shrink toward +Y
    // (phone-right). Standard "drains from the right" HP behavior.
    this.fg.position.y = -(this.maxLength - w) / 2;
  }
}
