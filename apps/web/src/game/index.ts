import { Game, type GameOptions } from './Game.js';

export function createGame(container: HTMLElement, opts: GameOptions): Game {
  return new Game(container, opts);
}

export type { Game, GameOptions, GameMode, MatchResult } from './Game.js';
