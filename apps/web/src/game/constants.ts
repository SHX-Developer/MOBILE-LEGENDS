// Map: roughly square arena. The single lane runs diagonally from the blue
// corner (bottom-left in landscape view) to the red corner (top-right).
export const MAP_W = 120;
export const MAP_H = 120;
export const HALF_W = MAP_W / 2;
export const HALF_H = MAP_H / 2;

export const LANE_WIDTH = 16;
// Lane runs from (+x,+z) corner to (-x,-z) corner. The plane is rotated
// 45° around Y so its long axis lies on that diagonal.
export const LANE_ANGLE_RAD = Math.PI / 4;
export const LANE_LENGTH = Math.SQRT2 * (MAP_W - 24);

// Player
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
export const PLAYER_MAX_HP = 500;
export const PLAYER_ATTACK_DAMAGE = 50;
export const PLAYER_ATTACK_RANGE = 12;
export const PLAYER_ATTACK_COOLDOWN_MS = 480;
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

// Towers — 1 per lane per team. Coordinates follow the Mobile Legends-style
// three-lane island: blue bottom-left, red top-right, top along left/top,
// bot along bottom/right, mid through the river.
export const TOWER_RADIUS = 1.6;
export const TOWER_HEIGHT = 5;
export const TOWER_BLUE_MID_X = -24;
export const TOWER_BLUE_MID_Z = 24;
export const TOWER_RED_MID_X = 24;
export const TOWER_RED_MID_Z = -24;
export const TOWER_BLUE_TOP_X = -48;
export const TOWER_BLUE_TOP_Z = 22;
export const TOWER_RED_TOP_X = 22;
export const TOWER_RED_TOP_Z = -48;
export const TOWER_BLUE_BOT_X = -22;
export const TOWER_BLUE_BOT_Z = 48;
export const TOWER_RED_BOT_X = 48;
export const TOWER_RED_BOT_Z = -22;
export const TOWER_MAX_HP = 1000;
export const TOWER_DAMAGE = 40;
export const TOWER_ATTACK_RANGE = 14;
export const TOWER_ATTACK_COOLDOWN_MS = 1500;

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
      [-48, 30],
      [-48, -30],
      [-30, -48],
      [30, -48],
    ],
    red: [
      [30, -48],
      [-30, -48],
      [-48, -30],
      [-48, 30],
    ],
  },
  mid: {
    blue: [[-26, 26], [-8, 8], [8, -8], [26, -26]],
    red: [[26, -26], [8, -8], [-8, 8], [-26, 26]],
  },
  bot: {
    blue: [
      [-30, 48],
      [30, 48],
      [48, 30],
      [48, -30],
    ],
    red: [
      [48, -30],
      [48, 30],
      [30, 48],
      [-30, 48],
    ],
  },
};

// Bases — opposite corners of the map. Lane runs along the (+x,−z) ↔ (−x,+z)
// anti-diagonal; player (blue) base sits at the (−x,+z) corner so it shows
// up at "phone bottom-left" in landscape view.
export const BASE_RADIUS = 5;
export const BASE_BLUE_X = -HALF_W + 14;
export const BASE_BLUE_Z = HALF_H - 14;
export const BASE_RED_X = HALF_W - 14;
export const BASE_RED_Z = -HALF_H + 14;
export const BASE_MAX_HP = 1500;
export const BASE_HIT_RADIUS = 5;
export const BASE_REGEN_RADIUS = 12;
// Base attacks like a tower — slightly stronger and longer-ranged.
export const BASE_DAMAGE = 55;
export const BASE_ATTACK_RANGE = 16;
export const BASE_ATTACK_COOLDOWN_MS = 800;

// Spawn points — just in front of each base, on the lane diagonal.
const SPAWN_OFFSET = 6;
const DIAG = Math.SQRT1_2; // 1/sqrt(2)
export const SPAWN_BLUE_X = BASE_BLUE_X + SPAWN_OFFSET * DIAG;
export const SPAWN_BLUE_Z = BASE_BLUE_Z - SPAWN_OFFSET * DIAG;
export const SPAWN_RED_X = BASE_RED_X - SPAWN_OFFSET * DIAG;
export const SPAWN_RED_Z = BASE_RED_Z + SPAWN_OFFSET * DIAG;
export const SPAWN_ZONE_RADIUS = 6.5;

// Skills
export const SKILL_Q_DAMAGE = 130;
export const SKILL_Q_COOLDOWN_MS = 6000;
export const SKILL_Q_RANGE = 16;
export const SKILL_E_DAMAGE = 30;
export const SKILL_E_COOLDOWN_MS = 8000;
export const SKILL_E_RANGE = 14;
export const SKILL_E_SLOW_FACTOR = 0.5;
export const SKILL_E_SLOW_DURATION_MS = 2000;
export const SKILL_C_DAMAGE = 20;
export const SKILL_C_COOLDOWN_MS = 10000;
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
export const HEAL_COOLDOWN_MS = 22000;
export const RECALL_CHANNEL_MS = 5000;
export const RECALL_COOLDOWN_MS = 30000;

// Bot — tuned slightly weaker than the player so 1v1 feels fair.
export const BOT_MAX_HP = 420;
export const BOT_RADIUS = 1;
export const BOT_SPEED_3D = 4.6;
export const BOT_DAMAGE = 32;
export const BOT_ATTACK_RANGE = 11;
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
