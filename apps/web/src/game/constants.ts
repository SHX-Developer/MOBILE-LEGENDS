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
// Arcshooter (внутреннее имя ranger): sustained DPS marksman with the
// fastest auto-attack of all roles. HP/damage anchored to the new five-role
// balance pass — see balance doc / commit notes for the rationale.
export const PLAYER_MAX_HP = 2200;
export const PLAYER_ATTACK_DAMAGE = 180;
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

// Arcshooter skills.
// Q "Rapid Fire" — modeled as a single 360-damage burst (3×120 in lore).
export const SKILL_Q_DAMAGE = 360;
export const SKILL_Q_COOLDOWN_MS = 7000;
export const SKILL_Q_RANGE = 16;
// E "Piercing Arrow" — 250 damage, pierces every enemy on its line.
export const SKILL_E_DAMAGE = 250;
export const SKILL_E_COOLDOWN_MS = 8000;
export const SKILL_E_RANGE = 18;
// E used to be a slow — kept the constants for now (not used by the new
// skill, but other code paths reference them) so we don't break imports.
export const SKILL_E_SLOW_FACTOR = 0.5;
export const SKILL_E_SLOW_DURATION_MS = 2000;
// C "Focus Mode" — self-buff: +40% attack speed for 4 seconds.
export const SKILL_C_DAMAGE = 0;
export const SKILL_C_COOLDOWN_MS = 18000;
export const SKILL_C_RANGE = 0;
export const SKILL_C_STUN_DURATION_MS = 0;
export const SKILL_C_ATTACK_SPEED_FACTOR = 1.4;
export const SKILL_C_ATTACK_SPEED_DURATION_MS = 4000;

// Minions
// Slower waves than before — at the new 5v5 match size, the lanes were
// getting crowded and CPU-busy with constant minion spam every 14s. 28s
// keeps the lanes alive without flooding them.
export const MINION_WAVE_INTERVAL_MS = 28000;
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
// The game now ships five heroes. The player picks one in offline mode;
// the ally is automatically a different archetype to round out the team.
export type HeroKind = 'ranger' | 'mage' | 'fighter' | 'assassin' | 'tank';

// Arcanist (mage) — burst caster. Lower HP than the marksman, longer
// auto-attack rhythm, but the highest spell damage in the roster.
export const MAGE_MAX_HP = 2000;
export const MAGE_ATTACK_DAMAGE = 220;
export const MAGE_ATTACK_RANGE = 9;
export const MAGE_ATTACK_COOLDOWN_MS = 820;
export const MAGE_SPEED_3D = 5.6;

// Arcanist skills.
// Q "Arcane Burst" — 300 damage AoE blast on impact.
export const MAGE_Q_DAMAGE = 300;
export const MAGE_Q_COOLDOWN_MS = 7000;
export const MAGE_Q_RANGE = 14;
// E "Magic Trap" — projectile that lingers as a slowing zone on landing.
//   For MVP it's modeled as a slow projectile with a small splash.
export const MAGE_E_DAMAGE = 150;
export const MAGE_E_SLOW_FACTOR = 0.6; // 40% slow → multiplier 0.6
export const MAGE_E_SLOW_DURATION_MS = 2500;
export const MAGE_E_COOLDOWN_MS = 11000;
export const MAGE_E_RANGE = 13;
// C "Meteor Call" — ult. Massive single-target hit + AoE shockwave.
export const MAGE_C_DAMAGE = 450;
export const MAGE_C_AOE_RADIUS = 5;
export const MAGE_C_AOE_DAMAGE = 220;
export const MAGE_C_STUN_DURATION_MS = 1500;
export const MAGE_C_COOLDOWN_MS = 25000;
export const MAGE_C_RANGE = 16;

// --- Warlord (Варлорд / fighter) -----------------------------------------
// Hybrid bruiser. Solid HP, balanced damage, mixed offence (heavy melee +
// AoE finisher + self-buff). The "any situation" pick.
export const FIGHTER_MAX_HP = 3000;
export const FIGHTER_ATTACK_DAMAGE = 170;
export const FIGHTER_ATTACK_RANGE = 4;
export const FIGHTER_ATTACK_COOLDOWN_MS = 520;
export const FIGHTER_SPEED_3D = 5.8;

// Q "Power Strike" — heavy single-target sword strike.
export const FIGHTER_Q_DAMAGE = 220;
export const FIGHTER_Q_SLOW_FACTOR = 0.7;
export const FIGHTER_Q_SLOW_DURATION_MS = 1500;
export const FIGHTER_Q_COOLDOWN_MS = 6000;
export const FIGHTER_Q_RANGE = 5;

// E "Rage Mode" — self-buff: +30% outgoing damage for 5s. The "-10%
// defence" half of the lore is implemented by the buff doing nothing
// to incoming damage, which leaves the warlord exposed during the
// damage window. Pure offence trade-off.
export const FIGHTER_E_DAMAGE_BONUS = 0.3;
export const FIGHTER_E_BUFF_DURATION_MS = 5000;
export const FIGHTER_E_COOLDOWN_MS = 16000;
// Legacy constants — still imported by older code paths to avoid
// dropping symbols mid-refactor. Effective values for the new skill
// are above.
export const FIGHTER_E_RANGE = 0;
export const FIGHTER_E_AOE_RADIUS = 0;
export const FIGHTER_E_AOE_DAMAGE = 0;

// C "Spin Attack" — self-cast spin around the warlord, AoE on every
// enemy in radius. Same "vortex" mesh as before — visually identical.
export const FIGHTER_C_AOE_RADIUS = 4.2;
export const FIGHTER_C_AOE_DAMAGE = 180;
export const FIGHTER_C_STUN_DURATION_MS = 800;
export const FIGHTER_C_COOLDOWN_MS = 11000;

// --- Shadowblade (Тенеклинок / assassin) ---------------------------------
// Glass cannon. Lowest HP, highest single-target damage, fastest movement.
// Combo loop: Shadow Dash → Backstab → Invisibility for the reset.
export const ASSASSIN_MAX_HP = 1800;
export const ASSASSIN_ATTACK_DAMAGE = 260;
export const ASSASSIN_ATTACK_RANGE = 4.5;
export const ASSASSIN_ATTACK_COOLDOWN_MS = 440;
export const ASSASSIN_SPEED_3D = 7.0;

// Q "Shadow Dash" — short teleport in the aim direction + on-arrival
// AoE damage at the landing point.
export const ASSASSIN_Q_DAMAGE = 200;
export const ASSASSIN_Q_RANGE = 7; // teleport distance
export const ASSASSIN_Q_AOE_RADIUS = 2.4;
export const ASSASSIN_Q_COOLDOWN_MS = 7000;

// E "Backstab" — heavy single-target strike. Directional bonus is
// stretch-goal; the MVP just deals the base damage.
export const ASSASSIN_E_DAMAGE = 350;
export const ASSASSIN_E_COOLDOWN_MS = 6000;
export const ASSASSIN_E_RANGE = 5;
// Legacy constants — kept for compatibility while older code paths still
// import them.
export const ASSASSIN_E_AOE_RADIUS = 0;
export const ASSASSIN_E_AOE_DAMAGE = 0;

// C "Invisibility" — self-buff: 3 seconds of invisibility. No damage —
// the value is the reset / reposition for the combo. Implemented in
// PlayerObject as `invisibleUntil`.
export const ASSASSIN_C_INVIS_MS = 3000;
export const ASSASSIN_C_COOLDOWN_MS = 18000;
// Legacy fields kept for older code paths.
export const ASSASSIN_C_DAMAGE = 0;
export const ASSASSIN_C_EXECUTE_HP_PCT = 0.5;
export const ASSASSIN_C_EXECUTE_BONUS = 0;
export const ASSASSIN_C_RANGE = 0;

// --- Bulwark (Страж / tank) ----------------------------------------------
// Frontline. Largest HP pool in the game, lowest damage, control kit.
// Trade single-target burst for "I will not die" vibes.
export const TANK_MAX_HP = 4200;
export const TANK_ATTACK_DAMAGE = 120;
export const TANK_ATTACK_RANGE = 4;
export const TANK_ATTACK_COOLDOWN_MS = 720;
export const TANK_SPEED_3D = 4.8;

// Q "Shield Slam" — single-target slam: 150 damage + 1s stun.
export const TANK_Q_DAMAGE = 150;
export const TANK_Q_STUN_DURATION_MS = 1000;
export const TANK_Q_COOLDOWN_MS = 11000;
export const TANK_Q_RANGE = 5;

// E "Iron Wall" — self-shield. Adds 600 HP of absorb that stacks on top
// of the bulwark's max HP and depletes from incoming damage first.
// Replaces the previous heal+speed buff.
export const TANK_E_SHIELD = 600;
export const TANK_E_SHIELD_DURATION_MS = 6000;
export const TANK_E_COOLDOWN_MS = 14000;
// Legacy heal/speed values kept so the bot's tank AI keeps a working
// fallback for the time being.
export const TANK_E_HEAL = 0;
export const TANK_E_SPEED_BUFF_FACTOR = 1;
export const TANK_E_SPEED_BUFF_MS = 0;

// C "Taunt" — for the MVP this is implemented as a giant AoE stun that
// "pulls aggro" by stunning everyone in radius (close enough — every
// stunned bot can't AI away from the bulwark for the duration).
export const TANK_C_AOE_RADIUS = 5.5;
export const TANK_C_AOE_DAMAGE = 60;
export const TANK_C_STUN_DURATION_MS = 2000;
export const TANK_C_COOLDOWN_MS = 22000;

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
