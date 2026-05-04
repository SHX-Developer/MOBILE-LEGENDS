import * as THREE from 'three';

export type Team = 'blue' | 'red';
export type UnitKind = 'hero' | 'minion' | 'structure';
/** Damage flavour used for armour reduction. `true` damage ignores both
 *  resistances — reserved for execute / fixed-damage edge cases. */
export type DamageType = 'physical' | 'magic' | 'true';

/**
 * Anything that can take damage and be targeted by auto-aim. Position is
 * read on the XZ plane only — the Y component is ignored by combat queries.
 *
 * `slowUntil` is a `performance.now()` timestamp; the unit is slowed while
 * `now < slowUntil`. Stationary units (towers, bases) ignore it.
 */
export interface Unit {
  readonly kind: UnitKind;
  readonly team: Team;
  readonly position: THREE.Vector3;
  readonly radius: number;
  readonly maxHp: number;
  readonly xpReward: number;
  hp: number;
  alive: boolean;
  slowUntil: number;
  stunnedUntil: number;
  /** Optional invisibility deadline — units with `now < invisibleUntil` are
   *  skipped by enemy auto-target logic. Currently set only by PlayerObject
   *  (Shadowblade's invisibility); other implementors may leave it `0`. */
  invisibleUntil?: number;
  /** Fraction of physical damage absorbed (0..1). Defaults to 0 if absent. */
  physicalDef?: number;
  /** Fraction of magic damage absorbed (0..1). Defaults to 0 if absent. */
  magicalDef?: number;
  takeDamage(amount: number, type?: DamageType): void;
  grantXp?(amount: number): void;
}
