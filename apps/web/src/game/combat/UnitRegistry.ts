import * as THREE from 'three';
import type { Unit, Team, UnitKind } from './Unit.js';

export class UnitRegistry {
  private readonly units: Unit[] = [];

  add(u: Unit): void {
    this.units.push(u);
  }

  remove(u: Unit): void {
    const i = this.units.indexOf(u);
    if (i >= 0) this.units.splice(i, 1);
  }

  /** Read-only view of every registered unit (alive or otherwise). */
  allUnits(): readonly Unit[] {
    return this.units;
  }

  /** Closest alive enemy of `team` within `maxRange` of `pos`, or null. */
  findNearestEnemy(
    team: Team,
    pos: THREE.Vector3,
    maxRange: number,
    kinds?: UnitKind[],
  ): Unit | null {
    if (kinds) return this.findNearestEnemyByPriority(team, pos, maxRange, kinds);

    const now = performance.now();
    let best: Unit | null = null;
    let bestDist = maxRange;
    for (const u of this.units) {
      if (!u.alive || u.team === team) continue;
      // Skip invisible units (Shadowblade's C). The invis breaks the
      // moment they take damage, so AI can re-acquire after the player
      // commits to an attack.
      if (u.invisibleUntil !== undefined && u.invisibleUntil > now) continue;
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

  /**
   * Finds the closest enemy in the first priority bucket that has any match.
   * Example: ['minion', 'hero', 'structure'] means minions soak shots first.
   */
  findNearestEnemyByPriority(
    team: Team,
    pos: THREE.Vector3,
    maxRange: number,
    priority: UnitKind[],
  ): Unit | null {
    const now = performance.now();
    for (const kind of priority) {
      let best: Unit | null = null;
      let bestDist = maxRange;
      for (const u of this.units) {
        if (!u.alive || u.team === team || u.kind !== kind) continue;
        if (u.invisibleUntil !== undefined && u.invisibleUntil > now) continue;
        const dx = u.position.x - pos.x;
        const dz = u.position.z - pos.z;
        const d = Math.hypot(dx, dz);
        if (d < bestDist) {
          bestDist = d;
          best = u;
        }
      }
      if (best) return best;
    }
    return null;
  }

  /**
   * Magnetic aim helper for skillshots. Picks the enemy whose direction from
   * `pos` falls inside a cone of half-angle `coneCos` (cosine form: 1.0 =
   * exact, lower = wider) around the requested (dirX,dirZ), preferring the
   * earliest matching kind in `priority`. Among same-priority candidates,
   * the one closest to the cone centre wins. Returns null if nothing inside
   * the cone within `maxRange`. Inputs (dirX,dirZ) must be normalized.
   *
   * The point: the player's finger drag picks an *approximate* direction —
   * snapping to a nearby unit's exact direction makes skill-shots actually
   * connect instead of grazing past.
   */
  findAimAssist(
    team: Team,
    pos: THREE.Vector3,
    dirX: number,
    dirZ: number,
    maxRange: number,
    coneCos: number,
    priority: UnitKind[] = ['hero', 'minion', 'structure'],
  ): Unit | null {
    let best: Unit | null = null;
    let bestKindIdx = priority.length;
    let bestCos = coneCos;
    for (const u of this.units) {
      if (!u.alive || u.team === team) continue;
      const ki = priority.indexOf(u.kind);
      if (ki < 0 || ki > bestKindIdx) continue;
      const dx = u.position.x - pos.x;
      const dz = u.position.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d > maxRange || d < 1e-3) continue;
      const cos = (dx * dirX + dz * dirZ) / d;
      if (cos < coneCos) continue;
      if (ki < bestKindIdx || cos > bestCos) {
        best = u;
        bestKindIdx = ki;
        bestCos = cos;
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
