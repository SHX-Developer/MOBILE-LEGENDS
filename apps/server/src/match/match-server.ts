import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import type {
  MatchClientMessage,
  MatchCombatEvent,
  MatchPlayerSnapshot,
  MatchServerMessage,
  MatchSkillId,
  MatchSnapshot,
  MatchTeam,
} from '@ml/shared';

const TICK_MS = 50;
const PLAYER_RADIUS = 1;
const PLAYER_SPEED = 6.4;
const PLAYER_MAX_HP = 500;
const HP_PER_LEVEL = 70;
const DAMAGE_PER_LEVEL = 10;
const ATTACK_DAMAGE = 50;
const ATTACK_RANGE = 12;
const ATTACK_COOLDOWN_MS = 480;
const Q_DAMAGE = 130;
const Q_RANGE = 16;
const Q_COOLDOWN_MS = 6000;
const E_DAMAGE = 30;
const E_RANGE = 14;
const E_COOLDOWN_MS = 8000;
const C_DAMAGE = 20;
const C_RANGE = 13;
const C_COOLDOWN_MS = 10000;
const STUN_MS = 1000;
const HERO_MAX_LEVEL = 10;
const XP_BASE = 90;
const XP_GROWTH = 1.45;
const KILL_XP = 130;
const BASE_RESPAWN_MS = 6000;
const RESPAWN_LEVEL_MS = 900;
const RESPAWN_MINUTE_MS = 700;
const RESPAWN_MAX_MS = 32000;
const WIN_KILLS = 3;

const SPAWNS: Record<MatchTeam, { x: number; z: number }> = {
  blue: { x: -41.757359312880716, z: 41.757359312880716 },
  red: { x: 41.757359312880716, z: -41.757359312880716 },
};

interface Session {
  id: string;
  ws: WebSocket;
  room?: Room;
}

interface PlayerState {
  session: Session;
  team: MatchTeam;
  x: number;
  z: number;
  facingX: number;
  facingZ: number;
  inputX: number;
  inputZ: number;
  hp: number;
  level: number;
  xp: number;
  alive: boolean;
  respawnAt: number;
  stunnedUntil: number;
  kills: number;
  lastAttackAt: number;
  lastQAt: number;
  lastEAt: number;
  lastCAt: number;
}

interface Room {
  id: string;
  players: [PlayerState, PlayerState];
  startedAt: number;
  lastTickAt: number;
  phase: 'playing' | 'ended';
  winner?: MatchTeam;
  interval: NodeJS.Timeout;
}

export function attachMatchServer(server: HttpServer): void {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const sessions = new Map<WebSocket, Session>();
  const queue: Session[] = [];
  const rooms = new Set<Room>();

  wss.on('connection', (ws) => {
    const session: Session = { id: crypto.randomUUID(), ws };
    sessions.set(ws, session);
    send(session, { type: 'connected', playerId: session.id });

    ws.on('message', (data) => {
      const message = parseMessage(data);
      if (!message) return;
      handleMessage(session, message, queue, rooms);
    });

    ws.on('close', () => {
      sessions.delete(ws);
      removeFromQueue(queue, session);
      if (session.room) endRoom(session.room, otherTeam(session.room, session), rooms);
    });
  });
}

function handleMessage(
  session: Session,
  message: MatchClientMessage,
  queue: Session[],
  rooms: Set<Room>,
): void {
  if (message.type === 'find_match') {
    if (session.room) return;
    if (!queue.includes(session)) queue.push(session);
    send(session, { type: 'queued' });
    tryCreateRoom(queue, rooms);
    return;
  }

  if (message.type === 'leave_match') {
    removeFromQueue(queue, session);
    if (session.room) endRoom(session.room, otherTeam(session.room, session), rooms);
    return;
  }

  const player = findPlayer(session);
  if (!player || player.session.room?.phase !== 'playing') return;

  if (message.type === 'input') {
    player.inputX = clamp(message.x, -1, 1);
    player.inputZ = clamp(message.z, -1, 1);
  } else if (message.type === 'attack') {
    tryAttack(player, opponentOf(player), Date.now());
  } else if (message.type === 'skill') {
    trySkill(player, opponentOf(player), message.id, message.dirX, message.dirZ, Date.now());
  }
  maybeEndRoom(player.session.room, rooms);
}

function tryCreateRoom(queue: Session[], rooms: Set<Room>): void {
  while (queue.length >= 2) {
    const a = queue.shift();
    const b = queue.shift();
    if (!a || !b || a.ws.readyState !== WebSocket.OPEN || b.ws.readyState !== WebSocket.OPEN) continue;

    const now = Date.now();
    const room: Room = {
      id: crypto.randomUUID(),
      players: [createPlayer(a, 'blue'), createPlayer(b, 'red')],
      startedAt: now,
      lastTickAt: now,
      phase: 'playing',
      interval: setInterval(() => tickRoom(room, rooms), TICK_MS),
    };
    a.room = room;
    b.room = room;
    rooms.add(room);

    send(a, { type: 'match_found', roomId: room.id, playerId: a.id, team: 'blue' });
    send(b, { type: 'match_found', roomId: room.id, playerId: b.id, team: 'red' });
    broadcast(room, { type: 'snapshot', snapshot: snapshotRoom(room) });
  }
}

function createPlayer(session: Session, team: MatchTeam): PlayerState {
  const spawn = SPAWNS[team];
  return {
    session,
    team,
    x: spawn.x,
    z: spawn.z,
    facingX: team === 'blue' ? 1 : -1,
    facingZ: team === 'blue' ? -1 : 1,
    inputX: 0,
    inputZ: 0,
    hp: PLAYER_MAX_HP,
    level: 1,
    xp: 0,
    alive: true,
    respawnAt: 0,
    stunnedUntil: 0,
    kills: 0,
    lastAttackAt: -Infinity,
    lastQAt: -Infinity,
    lastEAt: -Infinity,
    lastCAt: -Infinity,
  };
}

function tickRoom(room: Room, rooms: Set<Room>): void {
  if (room.phase !== 'playing') return;
  const now = Date.now();
  const dt = Math.min(0.12, (now - room.lastTickAt) / 1000);
  room.lastTickAt = now;

  for (const player of room.players) {
    if (!player.alive) {
      if (now >= player.respawnAt) respawn(player);
      continue;
    }
    if (player.stunnedUntil > now) continue;
    const len = Math.hypot(player.inputX, player.inputZ);
    if (len <= 0.01) continue;
    const nx = player.inputX / len;
    const nz = player.inputZ / len;
    player.x = clamp(player.x + nx * PLAYER_SPEED * dt, -55, 55);
    player.z = clamp(player.z + nz * PLAYER_SPEED * dt, -55, 55);
    player.facingX = nx;
    player.facingZ = nz;
  }

  broadcast(room, { type: 'snapshot', snapshot: snapshotRoom(room) });
}

function tryAttack(attacker: PlayerState, target: PlayerState, now: number): void {
  if (!canAct(attacker, now) || !target.alive) return;
  if (now - attacker.lastAttackAt < ATTACK_COOLDOWN_MS) return;
  if (distance(attacker, target) > ATTACK_RANGE + PLAYER_RADIUS * 2) return;
  attacker.lastAttackAt = now;
  faceTarget(attacker, target);
  const damage = applyDamage(attacker, target, ATTACK_DAMAGE + (attacker.level - 1) * DAMAGE_PER_LEVEL, now);
  broadcastCombatEvent(attacker, target, {
    kind: 'attack',
    startX: attacker.x,
    startZ: attacker.z,
    endX: target.x,
    endZ: target.z,
    hit: damage > 0,
    damage,
    createdAt: now,
  });
}

function trySkill(
  caster: PlayerState,
  target: PlayerState,
  id: MatchSkillId,
  dirX: number,
  dirZ: number,
  now: number,
): void {
  if (!canAct(caster, now) || !target.alive) return;
  const len = Math.hypot(dirX, dirZ);
  if (len <= 0.01) {
    dirX = caster.facingX;
    dirZ = caster.facingZ;
  } else {
    dirX /= len;
    dirZ /= len;
  }

  if (id === 'q') {
    if (now - caster.lastQAt < Q_COOLDOWN_MS) return;
    caster.lastQAt = now;
    if (lineHits(caster, target, dirX, dirZ, Q_RANGE, 1.4)) {
      const damage = applyDamage(caster, target, Q_DAMAGE + (caster.level - 1) * DAMAGE_PER_LEVEL * 1.5, now);
      broadcastCombatEvent(caster, target, skillEvent('q', caster, target, dirX, dirZ, Q_RANGE, damage, now));
    } else {
      broadcastCombatEvent(caster, target, skillEvent('q', caster, target, dirX, dirZ, Q_RANGE, 0, now));
    }
  } else if (id === 'e') {
    if (now - caster.lastEAt < E_COOLDOWN_MS) return;
    caster.lastEAt = now;
    if (lineHits(caster, target, dirX, dirZ, E_RANGE, 1.25)) {
      const damage = applyDamage(caster, target, E_DAMAGE + (caster.level - 1) * 6, now);
      broadcastCombatEvent(caster, target, skillEvent('e', caster, target, dirX, dirZ, E_RANGE, damage, now));
    } else {
      broadcastCombatEvent(caster, target, skillEvent('e', caster, target, dirX, dirZ, E_RANGE, 0, now));
    }
  } else {
    if (now - caster.lastCAt < C_COOLDOWN_MS) return;
    caster.lastCAt = now;
    if (lineHits(caster, target, dirX, dirZ, C_RANGE, 1.35)) {
      target.stunnedUntil = Math.max(target.stunnedUntil, now + STUN_MS);
      const damage = applyDamage(caster, target, C_DAMAGE + (caster.level - 1) * 4, now);
      broadcastCombatEvent(caster, target, skillEvent('c', caster, target, dirX, dirZ, C_RANGE, damage, now, STUN_MS));
    } else {
      broadcastCombatEvent(caster, target, skillEvent('c', caster, target, dirX, dirZ, C_RANGE, 0, now));
    }
  }
  caster.facingX = dirX;
  caster.facingZ = dirZ;
}

function applyDamage(attacker: PlayerState, target: PlayerState, damage: number, now: number): number {
  const applied = Math.min(target.hp, Math.round(damage));
  target.hp = Math.max(0, target.hp - applied);
  if (target.hp > 0) return applied;
  target.alive = false;
  target.inputX = 0;
  target.inputZ = 0;
  target.respawnAt = now + respawnDelay(target.level, attacker.session.room?.startedAt ?? now, now);
  attacker.kills += 1;
  grantXp(attacker, KILL_XP);
  if (attacker.kills >= WIN_KILLS && attacker.session.room) {
    attacker.session.room.phase = 'ended';
    attacker.session.room.winner = attacker.team;
  }
  return applied;
}

function skillEvent(
  id: MatchSkillId,
  caster: PlayerState,
  target: PlayerState,
  dirX: number,
  dirZ: number,
  range: number,
  damage: number,
  now: number,
  stunnedMs?: number,
): Omit<MatchCombatEvent, 'id' | 'attackerId' | 'targetId'> {
  return {
    kind: 'skill',
    skillId: id,
    startX: caster.x,
    startZ: caster.z,
    endX: damage > 0 ? target.x : caster.x + dirX * range,
    endZ: damage > 0 ? target.z : caster.z + dirZ * range,
    hit: damage > 0,
    damage,
    stunnedMs,
    createdAt: now,
  };
}

function broadcastCombatEvent(
  attacker: PlayerState,
  target: PlayerState,
  event: Omit<MatchCombatEvent, 'id' | 'attackerId' | 'targetId'>,
): void {
  const room = attacker.session.room;
  if (!room) return;
  broadcast(room, {
    type: 'combat_event',
    event: {
      id: crypto.randomUUID(),
      attackerId: attacker.session.id,
      targetId: target.session.id,
      ...event,
    },
  });
}

function grantXp(player: PlayerState, amount: number): void {
  if (player.level >= HERO_MAX_LEVEL) return;
  player.xp += amount;
  while (player.level < HERO_MAX_LEVEL && player.xp >= xpToNext(player.level)) {
    player.xp -= xpToNext(player.level);
    const oldMax = maxHp(player.level);
    player.level += 1;
    player.hp = Math.min(maxHp(player.level), player.hp + (maxHp(player.level) - oldMax));
  }
  if (player.level >= HERO_MAX_LEVEL) player.xp = 0;
}

function snapshotRoom(room: Room): MatchSnapshot {
  return {
    roomId: room.id,
    phase: room.phase,
    serverTime: Date.now(),
    startedAt: room.startedAt,
    winner: room.winner,
    players: room.players.map(snapshotPlayer),
  };
}

function snapshotPlayer(player: PlayerState): MatchPlayerSnapshot {
  const now = Date.now();
  return {
    id: player.session.id,
    team: player.team,
    x: player.x,
    z: player.z,
    facingX: player.facingX,
    facingZ: player.facingZ,
    hp: player.hp,
    maxHp: maxHp(player.level),
    level: player.level,
    xp: player.xp,
    xpToNext: player.level >= HERO_MAX_LEVEL ? 0 : xpToNext(player.level),
    alive: player.alive,
    respawnInMs: player.alive ? 0 : Math.max(0, player.respawnAt - now),
    kills: player.kills,
  };
}

function endRoom(room: Room, winner: MatchTeam | undefined, rooms: Set<Room>): void {
  if (!rooms.has(room)) return;
  room.phase = 'ended';
  room.winner = winner;
  broadcast(room, { type: 'match_end', snapshot: snapshotRoom(room) });
  clearInterval(room.interval);
  rooms.delete(room);
  for (const player of room.players) player.session.room = undefined;
}

function maybeEndRoom(room: Room | undefined, rooms: Set<Room>): void {
  if (room?.phase === 'ended') endRoom(room, room.winner, rooms);
}

function send(session: Session, message: MatchServerMessage): void {
  if (session.ws.readyState === WebSocket.OPEN) session.ws.send(JSON.stringify(message));
}

function broadcast(room: Room, message: MatchServerMessage): void {
  for (const player of room.players) send(player.session, message);
}

function parseMessage(data: RawData): MatchClientMessage | null {
  try {
    return JSON.parse(String(data)) as MatchClientMessage;
  } catch {
    return null;
  }
}

function removeFromQueue(queue: Session[], session: Session): void {
  const index = queue.indexOf(session);
  if (index >= 0) queue.splice(index, 1);
}

function findPlayer(session: Session): PlayerState | null {
  return session.room?.players.find((p) => p.session === session) ?? null;
}

function opponentOf(player: PlayerState): PlayerState {
  const room = player.session.room;
  if (!room) throw new Error('player has no room');
  return room.players[0] === player ? room.players[1] : room.players[0];
}

function otherTeam(room: Room, session: Session): MatchTeam | undefined {
  return room.players.find((p) => p.session !== session)?.team;
}

function canAct(player: PlayerState, now: number): boolean {
  return player.alive && player.stunnedUntil <= now;
}

function faceTarget(player: PlayerState, target: PlayerState): void {
  const dx = target.x - player.x;
  const dz = target.z - player.z;
  const len = Math.hypot(dx, dz);
  if (len <= 0.01) return;
  player.facingX = dx / len;
  player.facingZ = dz / len;
}

function lineHits(
  caster: PlayerState,
  target: PlayerState,
  dirX: number,
  dirZ: number,
  range: number,
  width: number,
): boolean {
  const tx = target.x - caster.x;
  const tz = target.z - caster.z;
  const forward = tx * dirX + tz * dirZ;
  if (forward < 0 || forward > range) return false;
  const perpX = tx - dirX * forward;
  const perpZ = tz - dirZ * forward;
  return Math.hypot(perpX, perpZ) <= width + PLAYER_RADIUS;
}

function distance(a: PlayerState, b: PlayerState): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function respawn(player: PlayerState): void {
  const spawn = SPAWNS[player.team];
  player.x = spawn.x;
  player.z = spawn.z;
  player.hp = maxHp(player.level);
  player.alive = true;
  player.stunnedUntil = 0;
  player.respawnAt = 0;
}

function respawnDelay(level: number, startedAt: number, now: number): number {
  const matchMinutes = Math.floor((now - startedAt) / 60000);
  return Math.min(RESPAWN_MAX_MS, BASE_RESPAWN_MS + (level - 1) * RESPAWN_LEVEL_MS + matchMinutes * RESPAWN_MINUTE_MS);
}

function maxHp(level: number): number {
  return PLAYER_MAX_HP + (level - 1) * HP_PER_LEVEL;
}

function xpToNext(level: number): number {
  return Math.round(XP_BASE * XP_GROWTH ** (level - 1));
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
