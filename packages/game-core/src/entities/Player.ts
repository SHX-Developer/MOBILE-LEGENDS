import { PLAYER_SPEED } from '../constants.js';

export interface Vec2 {
  x: number;
  y: number;
}

export interface PlayerState {
  id: string;
  position: Vec2;
  velocity: Vec2;
  hp: number;
  maxHp: number;
}

export function createPlayerState(id: string, position: Vec2): PlayerState {
  return {
    id,
    position: { ...position },
    velocity: { x: 0, y: 0 },
    hp: 100,
    maxHp: 100,
  };
}

export function applyMovement(
  state: PlayerState,
  input: { x: number; y: number },
  deltaSec: number,
): void {
  const len = Math.hypot(input.x, input.y) || 1;
  const nx = input.x / len;
  const ny = input.y / len;
  const moving = input.x !== 0 || input.y !== 0;

  state.velocity.x = moving ? nx * PLAYER_SPEED : 0;
  state.velocity.y = moving ? ny * PLAYER_SPEED : 0;

  state.position.x += state.velocity.x * deltaSec;
  state.position.y += state.velocity.y * deltaSec;
}
