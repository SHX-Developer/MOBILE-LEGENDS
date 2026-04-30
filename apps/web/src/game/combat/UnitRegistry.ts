import * as THREE from 'three';
import type { Unit, Team } from './Unit.js';

export class UnitRegistry {
  private readonly units: Unit[] = [];

  add(u: Unit): void {
    this.units.push(u);
  }

  remove(u: Unit): void {
    const i = this.units.indexOf(u);
    if (i >= 0) this.units.splice(i, 1);
  }

  /** Closest alive enemy of `team` within `maxRange` of `pos`, or null. */
  findNearestEnemy(team: Team, pos: THREE.Vector3, maxRange: number): Unit | null {
    let best: Unit | null = null;
    let bestDist = maxRange;
    for (const u of this.units) {
      if (!u.alive || u.team === team) continue;
      const dx = u.position.x - pos.x;
      const dz = u.position.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d < bestDist) {
        bestDist = d;
        best = u;
      }
    }
    return best;
  }

  /** First alive enemy unit overlapping the projectile point, or null. */
  findHit(pos: THREE.Vector3, projectileRadius: number, ownerTeam: Team): Unit | null {
    for (const u of this.units) {
      if (!u.alive || u.team === ownerTeam) continue;
      const dx = u.position.x - pos.x;
      const dz = u.position.z - pos.z;
      const r = u.radius + projectileRadius;
      if (dx * dx + dz * dz <= r * r) return u;
    }
    return null;
  }
}
