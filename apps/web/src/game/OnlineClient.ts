import type {
  MatchClientMessage,
  MatchCombatEvent,
  MatchServerMessage,
  MatchSkillId,
  MatchSnapshot,
  MatchTeam,
} from '@ml/shared';

type OnlineStatus = 'connecting' | 'offline' | 'queued' | 'playing' | 'ended';

export class OnlineClient {
  private ws: WebSocket | null = null;
  private playerId: string | null = null;
  private team: MatchTeam | null = null;
  private status: OnlineStatus = 'connecting';
  private snapshot: MatchSnapshot | null = null;
  private combatEvents: MatchCombatEvent[] = [];
  private lastInputSentAt = 0;
  private lastInput = { x: 0, z: 0 };
  onMatchEnd?: (winner: MatchTeam) => void;

  connect(): void {
    const url = buildWsUrl();
    this.ws = new WebSocket(url);
    this.ws.addEventListener('open', () => {
      this.status = 'queued';
      this.send({ type: 'find_match' });
    });
    this.ws.addEventListener('message', (event) => this.handleMessage(event.data));
    this.ws.addEventListener('close', () => {
      if (this.status !== 'ended') this.status = 'offline';
    });
    this.ws.addEventListener('error', () => {
      this.status = 'offline';
    });
  }

  dispose(): void {
    this.send({ type: 'leave_match' });
    this.ws?.close();
    this.ws = null;
  }

  getStatus(): OnlineStatus {
    return this.status;
  }

  getPlayerId(): string | null {
    return this.playerId;
  }

  getTeam(): MatchTeam | null {
    return this.team;
  }

  getSnapshot(): MatchSnapshot | null {
    return this.snapshot;
  }

  drainCombatEvents(): MatchCombatEvent[] {
    const events = this.combatEvents;
    this.combatEvents = [];
    return events;
  }

  sendInput(x: number, z: number, now = performance.now()): void {
    if (this.status !== 'playing') return;
    const changed = Math.abs(x - this.lastInput.x) > 0.02 || Math.abs(z - this.lastInput.z) > 0.02;
    if (!changed && now - this.lastInputSentAt < 120) return;
    this.lastInput = { x, z };
    this.lastInputSentAt = now;
    this.send({ type: 'input', x, z });
  }

  attack(): void {
    if (this.status === 'playing') this.send({ type: 'attack' });
  }

  skill(id: MatchSkillId, dirX: number, dirZ: number): void {
    if (this.status === 'playing') this.send({ type: 'skill', id, dirX, dirZ });
  }

  private handleMessage(raw: unknown): void {
    const message = parseMessage(raw);
    if (!message) return;
    if (message.type === 'connected') {
      this.playerId = message.playerId;
    } else if (message.type === 'queued') {
      this.status = 'queued';
    } else if (message.type === 'match_found') {
      this.playerId = message.playerId;
      this.team = message.team;
      this.status = 'playing';
    } else if (message.type === 'snapshot') {
      this.snapshot = message.snapshot;
      if (message.snapshot.phase === 'playing') this.status = 'playing';
    } else if (message.type === 'combat_event') {
      this.combatEvents.push(message.event);
    } else if (message.type === 'match_end') {
      this.snapshot = message.snapshot;
      this.status = 'ended';
      if (message.snapshot.winner) this.onMatchEnd?.(message.snapshot.winner);
    }
  }

  private send(message: MatchClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }
}

function parseMessage(raw: unknown): MatchServerMessage | null {
  try {
    return JSON.parse(String(raw)) as MatchServerMessage;
  } catch {
    return null;
  }
}

function buildWsUrl(): string {
  const explicit = import.meta.env.VITE_WS_URL as string | undefined;
  if (explicit) return explicit;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}
