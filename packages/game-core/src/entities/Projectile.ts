import { PROJECTILE_SPEED, PROJECTILE_LIFETIME_MS, PROJECTILE_DAMAGE } from '../constants.js';
import type { Vec2 } from './Player.js';

export interface ProjectileState {
  id: string;
  ownerId: string;
  position: Vec2;
  velocity: Vec2;
  damage: number;
  spawnedAt: number;
  alive: boolean;
}

export function createProjectile(
  id: string,
  ownerId: string,
  origin: Vec2,
  target: Vec2,
  now: number,
): ProjectileState {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const len = Math.hypot(dx, dy) || 1;

  return {
    id,
    ownerId,
    position: { ...origin },
    velocity: {
      x: (dx / len) * PROJECTILE_SPEED,
      y: (dy / len) * PROJECTILE_SPEED,
    },
    damage: PROJECTILE_DAMAGE,
    spawnedAt: now,
    alive: true,
  };
}

export function tickProjectile(p: ProjectileState, deltaSec: number, now: number): void {
  if (!p.alive) return;
  p.position.x += p.velocity.x * deltaSec;
  p.position.y += p.velocity.y * deltaSec;
  if (now - p.spawnedAt > PROJECTILE_LIFETIME_MS) {
    p.alive = false;
  }
}
