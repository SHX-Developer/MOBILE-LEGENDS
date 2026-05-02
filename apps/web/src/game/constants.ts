// Map: roughly square arena. Strategic coordinates are scaled up so there is
// more room between towers without making units themselves larger.
export const MAP_SCALE = 1.3;
const S = (value: number) => Number((value * MAP_SCALE).toFixed(2));
export const MAP_W = S(120);
export const MAP_H = S(120);
export const HALF_W = MAP_W / 2;
export const HALF_H = MAP_H / 2;

export const LANE_WIDTH = 16;
// Lane runs from (+x,+z) corner to (-x,-z) corner. The plane is rotated
// 45° around Y so its long axis lies on that diagonal.
export const LANE_ANGLE_RAD = Math.PI / 4;
export const LANE_LENGTH = Math.SQRT2 * (MAP_W - 24);

// Player (the ranger archetype). Faster auto-attack than the mage —
// pumping out arrows is her thing.
export const PLAYER_RADIUS = 1;
export const PLAYER_HEIGHT = 2.4;
export const PLAYER_SPEED_3D = 6.4;

// Projectiles
export const PROJECTILE_SPEED_3D = 28;
export const BASIC_PROJECTILE_SPEED_3D = 44;
export const TOWER_PROJECTILE_SPEED_3D = 20;
export const PROJECTILE_LIFETIME_MS = 1500;
export const PROJECTILE_RADIUS = 0.4;

// Player combat
// Ranger: standard HP pool, snappy auto-attack rhythm. The fast cooldown is
// a big part of her identity vs. the mage.
export const PLAYER_MAX_HP = 520;
export const PLAYER_ATTACK_DAMAGE = 50;
export const PLAYER_ATTACK_RANGE = 10;
export const PLAYER_ATTACK_COOLDOWN_MS = 360;
export const PLAYER_RESPAWN_MS = 6000;
export const RESPAWN_LEVEL_PENALTY_MS = 900;
export const RESPAWN_MATCH_MINUTE_PENALTY_MS = 700;
export const RESPAWN_MAX_MS = 32000;
export const HERO_MAX_LEVEL = 10;
export const HERO_HP_PER_LEVEL = 70;
export const HERO_DAMAGE_PER_LEVEL = 10;
export const HERO_BASE_XP_TO_LEVEL = 90;
export const HERO_XP_LEVEL_GROWTH = 1.45;
export const HERO_BASE_REGEN_PER_SEC = 85;

// Towers — 3 per lane per team, like Mobile Legends: inner near base,
// middle around the lane centre, outer near the first lane clash.
export const TOWER_RADIUS = 1.6;
export const TOWER_HEIGHT = 5;
export type TowerTeam = 'blue' | 'red';
export type TowerLaneId = 'top' | 'mid' | 'bot';
export type TowerTier = 'inner' | 'middle' | 'outer';
export interface TowerSpec {
  team: TowerTeam;
  lane: TowerLaneId;
  tier: TowerTier;
  x: number;
  z: number;
}
export const TOWER_LAYOUT: readonly TowerSpec[] = [
  { team: 'blue', lane: 'top', tier: 'inner', x: S(-48), z: S(34) },
  { team: 'blue', lane: 'top', tier: 'middle', x: S(-48), z: S(12) },
  { team: 'blue', lane: 'top', tier: 'outer', x: S(-48), z: S(-16) },
  { team: 'blue', lane: 'mid', tier: 'inner', x: S(-34), z: S(34) },
  { team: 'blue', lane: 'mid', tier: 'middle', x: S(-22), z: S(22) },
  { team: 'blue', lane: 'mid', tier: 'outer', x: S(-10), z: S(10) },
  { team: 'blue', lane: 'bot', tier: 'inner', x: S(-34), z: S(48) },
  { team: 'blue', lane: 'bot', tier: 'middle', x: S(-12), z: S(48) },
  { team: 'blue', lane: 'bot', tier: 'outer', x: S(16), z: S(48) },
  { team: 'red', lane: 'top', tier: 'outer', x: S(-16), z: S(-48) },
  { team: 'red', lane: 'top', tier: 'middle', x: S(12), z: S(-48) },
  { team: 'red', lane: 'top', tier: 'inner', x: S(34), z: S(-48) },
  { team: 'red', lane: 'mid', tier: 'outer', x: S(10), z: S(-10) },
  { team: 'red', lane: 'mid', tier: 'middle', x: S(22), z: S(-22) },
  { team: 'red', lane: 'mid', tier: 'inner', x: S(34), z: S(-34) },
  { team: 'red', lane: 'bot', tier: 'outer', x: S(48), z: S(16) },
  { team: 'red', lane: 'bot', tier: 'middle', x: S(48), z: S(-12) },
  { team: 'red', lane: 'bot', tier: 'inner', x: S(48), z: S(-34) },
];
export const TOWER_BLUE_TOP_X = S(-48);
export const TOWER_BLUE_TOP_Z = S(12);
export const TOWER_BLUE_MID_X = S(-22);
export const TOWER_BLUE_MID_Z = S(22);
export const TOWER_BLUE_BOT_X = S(-12);
export const TOWER_BLUE_BOT_Z = S(48);
export const TOWER_RED_TOP_X = S(12);
export const TOWER_RED_TOP_Z = S(-48);
export const TOWER_RED_MID_X = S(22);
export const TOWER_RED_MID_Z = S(-22);
export const TOWER_RED_BOT_X = S(48);
export const TOWER_RED_BOT_Z = S(-12);
export const TOWER_MAX_HP = 1000;
export const TOWER_DAMAGE = 65;
export const TOWER_ATTACK_RANGE = 11;
export const TOWER_ATTACK_COOLDOWN_MS = 1100;
/** Tower escalation: each consecutive shot at the SAME hero adds this much
 *  bonus damage (multiplicative). Stacks reset the moment the hero leaves
 *  range or the tower picks a different target. */
export const TOWER_HERO_FOCUS_STACK_BONUS = 0.35;
export const TOWER_HERO_FOCUS_STACK_CAP = 5;
/** Hero auto-attacks against towers without an allied minion nearby are
 *  reduced to this fraction (anti-dive). */
export const HERO_TOWER_NO_MINION_DAMAGE_FACTOR = 0.25;
/** Distance from the tower within which an allied minion shields the hero
 *  from the no-minion damage penalty. */
export const HERO_TOWER_MINION_AGGRO_RADIUS = 9;
/** Counter-aggro: every tower hit on the local player adds this much to the
 *  player's outgoing damage multiplier (auto-attacks AND skills). Stacks
 *  accumulate up to {@link PLAYER_TOWER_FOCUS_STACK_CAP} and reset
 *  {@link PLAYER_TOWER_FOCUS_DECAY_MS} after the last tower hit. The point:
 *  diving in punishes you, but if you survive each hit, you fight back
 *  harder — the tower is helping you kill it. */
export const PLAYER_TOWER_FOCUS_STACK_BONUS = 0.12;
export const PLAYER_TOWER_FOCUS_STACK_CAP = 5;
export const PLAYER_TOWER_FOCUS_DECAY_MS = 6000;

// Backwards-compat single-tower aliases (kept while older code paths
// reference TOWER_BLUE_X / TOWER_RED_X — point them at the mid towers).
export const TOWER_BLUE_X = TOWER_BLUE_MID_X;
export const TOWER_BLUE_Z = TOWER_BLUE_MID_Z;
export const TOWER_RED_X = TOWER_RED_MID_X;
export const TOWER_RED_Z = TOWER_RED_MID_Z;

// Lane waypoints — a minion spawned for `team` walks the path[team] in
// order, attacking anything in range as it goes. Last waypoint is the
// enemy base. Coordinates are 3-tuples [x, z] in world space.
export type LaneId = 'top' | 'mid' | 'bot';
type LanePath = ReadonlyArray<readonly [number, number]>;
export const LANE_PATHS: Record<LaneId, { blue: LanePath; red: LanePath }> = {
  top: {
    blue: [
      [S(-48), S(30)],
      [S(-48), S(-30)],
      [S(-30), S(-48)],
      [S(30), S(-48)],
    ],
    red: [
      [S(30), S(-48)],
      [S(-30), S(-48)],
      [S(-48), S(-30)],
      [S(-48), S(30)],
    ],
  },
  mid: {
    blue: [[S(-26), S(26)], [S(-8), S(8)], [S(8), S(-8)], [S(26), S(-26)]],
    red: [[S(26), S(-26)], [S(8), S(-8)], [S(-8), S(8)], [S(-26), S(26)]],
  },
  bot: {
    blue: [
      [S(-30), S(48)],
      [S(30), S(48)],
      [S(48), S(30)],
      [S(48), S(-30)],
    ],
    red: [
      [S(48), S(-30)],
      [S(48), S(30)],
      [S(30), S(48)],
      [S(-30), S(48)],
    ],
  },
};

// Bases — opposite corners of the map. Lane runs along the (+x,−z) ↔ (−x,+z)
// anti-diagonal; player (blue) base sits at the (−x,+z) corner so it shows
// up at "phone bottom-left" in landscape view.
export const BASE_RADIUS = 5;
export const BASE_BLUE_X = S(-46);
export const BASE_BLUE_Z = S(46);
export const BASE_RED_X = S(46);
export const BASE_RED_Z = S(-46);
export const BASE_MAX_HP = 1500;
export const BASE_HIT_RADIUS = 5;
export const BASE_REGEN_RADIUS = 12;
// Base attacks like a tower — slightly stronger and longer-ranged.
export const BASE_DAMAGE = 55;
export const BASE_ATTACK_RANGE = 16;
export const BASE_ATTACK_COOLDOWN_MS = 800;

// Spawn points — just in front of each base, on the lane diagonal.
const SPAWN_OFFSET = S(6);
const DIAG = Math.SQRT1_2; // 1/sqrt(2)
export const SPAWN_BLUE_X = BASE_BLUE_X + SPAWN_OFFSET * DIAG;
export const SPAWN_BLUE_Z = BASE_BLUE_Z - SPAWN_OFFSET * DIAG;
export const SPAWN_RED_X = BASE_RED_X - SPAWN_OFFSET * DIAG;
export const SPAWN_RED_Z = BASE_RED_Z + SPAWN_OFFSET * DIAG;
export const SPAWN_ZONE_RADIUS = 6.5;

// Skills
export const SKILL_Q_DAMAGE = 130;
export const SKILL_Q_COOLDOWN_MS = 10000;
export const SKILL_Q_RANGE = 16;
export const SKILL_E_DAMAGE = 30;
export const SKILL_E_COOLDOWN_MS = 3000;
export const SKILL_E_RANGE = 14;
export const SKILL_E_SLOW_FACTOR = 0.5;
export const SKILL_E_SLOW_DURATION_MS = 2000;
export const SKILL_C_DAMAGE = 20;
export const SKILL_C_COOLDOWN_MS = 5000;
export const SKILL_C_RANGE = 13;
export const SKILL_C_STUN_DURATION_MS = 1000;

// Minions
export const MINION_WAVE_INTERVAL_MS = 14000;
export const MINION_WAVE_SIZE = 3;
export const MINION_SPAWN_SPACING = 2.2;
export const MINION_MAX_HP = 170;
export const MINION_RADIUS = 0.75;
export const MINION_SPEED_3D = 3.2;
export const MINION_DAMAGE = 22;
export const MINION_ATTACK_RANGE = 9.5;
export const MINION_ATTACK_COOLDOWN_MS = 950;
export const MINION_XP_REWARD = 38;

// Hero utility skills
export const HEAL_AMOUNT = 180;
export const HEAL_DURATION_MS = 3000;
export const HEAL_COOLDOWN_MS = 22000;
export const RECALL_CHANNEL_MS = 5000;
export const RECALL_COOLDOWN_MS = 30000;

// --- Heroes ---------------------------------------------------------------
// The game now ships two heroes; the player picks one in offline mode and
// the other rounds out the team.
export type HeroKind = 'ranger' | 'mage';

// Mage — fire archetype. Glass cannon: noticeably squishier than the
// ranger, slow auto-attack, but huge burst on his skills. Player should
// feel like he kills hard if he lands his spells, dies fast if he doesn't.
export const MAGE_MAX_HP = 380;
export const MAGE_ATTACK_DAMAGE = 34;
export const MAGE_ATTACK_RANGE = 8.5;
export const MAGE_ATTACK_COOLDOWN_MS = 880;
export const MAGE_SPEED_3D = 5.4;

// Mage skills (огненная школа). Numbers are bigger than the ranger's
// equivalents — the trade-off for low HP and slow autos is that every
// spell hurts.
// Q — fireball: heavy single-target damage with a small AoE splash.
export const MAGE_Q_DAMAGE = 170;
export const MAGE_Q_COOLDOWN_MS = 7000;
export const MAGE_Q_RANGE = 14;

// E — fire wall: a slowing flame disc that splashes nearby enemies.
export const MAGE_E_DAMAGE = 90;
export const MAGE_E_SLOW_FACTOR = 0.5;
export const MAGE_E_SLOW_DURATION_MS = 2500;
export const MAGE_E_COOLDOWN_MS = 8000;
export const MAGE_E_RANGE = 12;

// C — meteor: the ult. Slow-falling chunk that crushes a primary target,
// shockwaves the rest, AND stuns whatever it hits for 2 seconds. AoE
// damage is dealt to every enemy unit other than the primary target
// within MAGE_C_AOE_RADIUS of the impact.
export const MAGE_C_DAMAGE = 240;
export const MAGE_C_AOE_RADIUS = 4.8;
export const MAGE_C_AOE_DAMAGE = 140;
export const MAGE_C_STUN_DURATION_MS = 2000;
export const MAGE_C_COOLDOWN_MS = 12000;
export const MAGE_C_RANGE = 14;

// Bot — tuned slightly weaker than the player so 1v1 feels fair.
export const BOT_MAX_HP = 420;
export const BOT_RADIUS = 1;
export const BOT_SPEED_3D = 4.6;
export const BOT_DAMAGE = 32;
export const BOT_ATTACK_RANGE = 9.5;
export const BOT_ATTACK_COOLDOWN_MS = 720;
export const BOT_VISION_RANGE = 28;
export const BOT_RESPAWN_MS = 6000;
export const BOT_RETREAT_HP_FRACTION = 0.25;
export const BOT_REGEN_PER_SEC = 50;
export const HERO_KILL_XP_REWARD = 130;

// Colours
export const COLOR_GROUND = 0x6ea24f;
export const COLOR_LANE = 0xddbe7a;
export const COLOR_BASE_BLUE = 0x4684e6;
export const COLOR_BASE_RED = 0xe85656;
export const COLOR_TOWER_BLUE = 0x6aa6f0;
export const COLOR_TOWER_RED = 0xf07474;
export const COLOR_WALL = 0x97826a;
export const COLOR_TREE_TRUNK = 0x6b4423;
export const COLOR_TREE_LEAVES = 0x3f8f3a;
export const COLOR_ROCK = 0x8a8a90;
export const COLOR_FLOWER = 0xf5e15a;
