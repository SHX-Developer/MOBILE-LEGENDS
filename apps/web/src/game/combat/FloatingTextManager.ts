import * as THREE from 'three';
import type { Team } from './Unit.js';

interface FloatingText {
  mesh: THREE.Sprite;
  bornAt: number;
  duration: number;
  startY: number;
}

export class FloatingTextManager {
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
  canvas.width = 192;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is required for floating damage text');

  ctx.font = '900 48px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.strokeText(text, 96, 48);
  ctx.fillStyle = color;
  ctx.fillText(text, 96, 48);

  return new THREE.CanvasTexture(canvas);
}
