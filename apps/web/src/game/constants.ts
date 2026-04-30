// Map: single horizontal lane along X. Z is the short axis.
export const MAP_W = 140;
export const MAP_H = 36;
export const HALF_W = MAP_W / 2;
export const HALF_H = MAP_H / 2;

export const LANE_WIDTH = 12;

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

// Towers (one per side, midway between base and centre)
export const TOWER_RADIUS = 1.6;
export const TOWER_HEIGHT = 5;
export const TOWER_BLUE_X = -28;
export const TOWER_RED_X = 28;
export const TOWER_MAX_HP = 1000;
export const TOWER_DAMAGE = 40;
export const TOWER_ATTACK_RANGE = 14;
export const TOWER_ATTACK_COOLDOWN_MS = 1100;

// Bases (one per side, at the far ends of the lane)
export const BASE_RADIUS = 5;
export const BASE_BLUE_X = -HALF_W + 12;
export const BASE_RED_X = HALF_W - 12;
export const BASE_MAX_HP = 1500;
export const BASE_HIT_RADIUS = 5;

// Spawn point for the player (just in front of blue base, on the lane)
export const SPAWN_BLUE_X = BASE_BLUE_X + 6;
export const SPAWN_BLUE_Z = 0;
export const SPAWN_RED_X = BASE_RED_X - 6;
export const SPAWN_RED_Z = 0;

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
