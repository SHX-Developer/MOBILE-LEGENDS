import * as THREE from 'three';

export type Team = 'blue' | 'red';

/**
 * Anything that can take damage and be targeted by auto-aim. Position is
 * read on the XZ plane only — the Y component is ignored by combat queries.
 *
 * `slowUntil` is a `performance.now()` timestamp; the unit is slowed while
 * `now < slowUntil`. Stationary units (towers, bases) ignore it.
 */
export interface Unit {
  readonly team: Team;
  readonly position: THREE.Vector3;
  readonly radius: number;
  readonly maxHp: number;
  hp: number;
  alive: boolean;
  slowUntil: number;
  takeDamage(amount: number): void;
}
