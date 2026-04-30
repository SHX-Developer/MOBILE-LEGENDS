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
export const PLAYER_SPEED_3D = 9;

// Projectiles
export const PROJECTILE_SPEED_3D = 28;
export const PROJECTILE_LIFETIME_MS = 1500;
export const PROJECTILE_RADIUS = 0.4;

// Player combat
export const PLAYER_MAX_HP = 500;
export const PLAYER_ATTACK_DAMAGE = 50;
export const PLAYER_ATTACK_RANGE = 12;
export const PLAYER_ATTACK_COOLDOWN_MS = 700;
export const PLAYER_RESPAWN_MS = 6000;

// Towers — placed midway between each base and centre, on the diagonal.
export const TOWER_RADIUS = 1.6;
export const TOWER_HEIGHT = 5;
export const TOWER_BLUE_X = -22;
export const TOWER_BLUE_Z = 22;
export const TOWER_RED_X = 22;
export const TOWER_RED_Z = -22;
export const TOWER_MAX_HP = 1000;
export const TOWER_DAMAGE = 40;
export const TOWER_ATTACK_RANGE = 14;
export const TOWER_ATTACK_COOLDOWN_MS = 1100;

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

// Spawn points — just in front of each base, on the lane diagonal.
const SPAWN_OFFSET = 6;
const DIAG = Math.SQRT1_2; // 1/sqrt(2)
export const SPAWN_BLUE_X = BASE_BLUE_X + SPAWN_OFFSET * DIAG;
export const SPAWN_BLUE_Z = BASE_BLUE_Z - SPAWN_OFFSET * DIAG;
export const SPAWN_RED_X = BASE_RED_X - SPAWN_OFFSET * DIAG;
export const SPAWN_RED_Z = BASE_RED_Z + SPAWN_OFFSET * DIAG;

// Skills
export const SKILL_Q_DAMAGE = 130;
export const SKILL_Q_COOLDOWN_MS = 6000;
export const SKILL_Q_RANGE = 16;
export const SKILL_E_DAMAGE = 30;
export const SKILL_E_COOLDOWN_MS = 8000;
export const SKILL_E_RANGE = 14;
export const SKILL_E_SLOW_FACTOR = 0.5;
export const SKILL_E_SLOW_DURATION_MS = 2000;

// Bot
export const BOT_MAX_HP = 500;
export const BOT_RADIUS = 1;
export const BOT_SPEED_3D = 7;
export const BOT_DAMAGE = 50;
export const BOT_ATTACK_RANGE = 12;
export const BOT_ATTACK_COOLDOWN_MS = 800;
export const BOT_VISION_RANGE = 32;
export const BOT_RESPAWN_MS = 6000;
export const BOT_RETREAT_HP_FRACTION = 0.2;
export const BOT_REGEN_PER_SEC = 60;

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
