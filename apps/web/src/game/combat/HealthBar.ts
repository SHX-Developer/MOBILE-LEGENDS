import * as THREE from 'three';

/**
 * Floating health bar — two stacked sprites that always face the camera.
 * Foreground shrinks left-to-right as ratio decreases.
 */
export class HealthBar {
  readonly group = new THREE.Group();
  private readonly fg: THREE.Sprite;
  private readonly maxWidth: number;

  constructor(width: number, height: number, color: number) {
    this.maxWidth = width;

    const bg = new THREE.Sprite(
      new THREE.SpriteMaterial({ color: 0x1a0c0c, depthTest: false }),
    );
    bg.scale.set(width + 0.15, height + 0.15, 1);
    this.group.add(bg);

    this.fg = new THREE.Sprite(
      new THREE.SpriteMaterial({ color, depthTest: false }),
    );
    this.fg.scale.set(width, height, 1);
    this.group.add(this.fg);

    this.group.renderOrder = 999;
  }

  setRatio(r: number): void {
    const ratio = r < 0 ? 0 : r > 1 ? 1 : r;
    const w = ratio * this.maxWidth;
    this.fg.scale.x = Math.max(w, 0.0001);
    this.fg.position.x = -(this.maxWidth - w) / 2;
  }
}
