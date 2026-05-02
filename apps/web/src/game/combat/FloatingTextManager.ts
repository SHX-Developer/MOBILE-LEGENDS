import * as THREE from 'three';
import type { Team } from './Unit.js';

interface FloatingText {
  mesh: THREE.Sprite;
  bornAt: number;
  duration: number;
  startY: number;
}

export class FloatingTextManager {
  /**
   * Set once on game boot from `renderer.capabilities.getMaxAnisotropy()`.
   * Without this the damage numbers turn into a smeary blur whenever the
   * camera pulls back, because each sprite shrinks well below its source
   * texture size.
   */
  static maxAnisotropy = 1;

  private readonly items: FloatingText[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  spawnDamage(position: THREE.Vector3, amount: number, targetTeam: Team, ownerTeam?: Team): void {
    const color = ownerTeam === 'blue' ? '#ffe066' : targetTeam === 'blue' ? '#ff6868' : '#ffffff';
    const texture = makeTextTexture(`-${Math.round(amount)}`, color);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(
      position.x + (Math.random() - 0.5) * 0.8,
      3.2,
      position.z + (Math.random() - 0.5) * 0.8,
    );
    sprite.scale.set(2.3, 1.15, 1);
    sprite.renderOrder = 20000;
    this.scene.add(sprite);
    this.items.push({
      mesh: sprite,
      bornAt: performance.now(),
      duration: 850,
      startY: sprite.position.y,
    });
  }

  update(now: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      const t = (now - item.bornAt) / item.duration;
      if (t >= 1) {
        this.scene.remove(item.mesh);
        item.mesh.material.map?.dispose();
        item.mesh.material.dispose();
        this.items.splice(i, 1);
        continue;
      }
      item.mesh.position.y = item.startY + t * 1.5;
      item.mesh.material.opacity = 1 - t;
    }
  }

  dispose(): void {
    for (const item of this.items) {
      this.scene.remove(item.mesh);
      item.mesh.material.map?.dispose();
      item.mesh.material.dispose();
    }
    this.items.length = 0;
  }
}

function makeTextTexture(text: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  // Power-of-two and 2:1 aspect — matches the sprite scale (2.3 × 1.15) and
  // gives mipmaps a clean source. The previous 192×96 was non-PoT so WebGL1
  // silently disabled mipmaps, which is what made distant numbers ugly.
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is required for floating damage text');

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  ctx.font = '900 128px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.lineWidth = 22;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.strokeText(text, cx, cy);
  ctx.fillStyle = color;
  ctx.fillText(text, cx, cy);

  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = FloatingTextManager.maxAnisotropy;
  return texture;
}
