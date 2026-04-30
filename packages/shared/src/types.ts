export interface TelegramAuthPayload {
  initData: string;
}

export interface TelegramAuthResponse {
  user: PublicUser;
  isNew: boolean;
}

export interface CreateNicknameRequest {
  telegramId: string;
  nickname: string;
}

export interface PublicUser {
  id: string;
  telegramId: string;
  nickname: string | null;
  createdAt: string;
}

export interface ApiError {
  statusCode: number;
  message: string;
}

export type MatchTeam = 'blue' | 'red';
export type MatchPhase = 'queued' | 'playing' | 'ended';
export type MatchSkillId = 'q' | 'e' | 'c';
export type MatchCombatKind = 'attack' | 'skill';

export interface MatchPlayerSnapshot {
  id: string;
  team: MatchTeam;
  x: number;
  z: number;
  facingX: number;
  facingZ: number;
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  xpToNext: number;
  alive: boolean;
  respawnInMs: number;
  kills: number;
}

export interface MatchSnapshot {
  roomId: string;
  phase: MatchPhase;
  serverTime: number;
  startedAt: number;
  winner?: MatchTeam;
  players: MatchPlayerSnapshot[];
}

export interface MatchCombatEvent {
  id: string;
  kind: MatchCombatKind;
  skillId?: MatchSkillId;
  attackerId: string;
  targetId: string;
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  hit: boolean;
  damage: number;
  stunnedMs?: number;
  createdAt: number;
}

export type MatchServerMessage =
  | { type: 'connected'; playerId: string }
  | { type: 'queued' }
  | { type: 'match_found'; roomId: string; playerId: string; team: MatchTeam }
  | { type: 'snapshot'; snapshot: MatchSnapshot }
  | { type: 'combat_event'; event: MatchCombatEvent }
  | { type: 'match_end'; snapshot: MatchSnapshot };

export type MatchClientMessage =
  | { type: 'find_match' }
  | { type: 'input'; x: number; z: number }
  | { type: 'attack' }
  | { type: 'skill'; id: MatchSkillId; dirX: number; dirZ: number }
  | { type: 'leave_match' };
