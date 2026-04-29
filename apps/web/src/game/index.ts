import { Game } from './Game.js';

export function createGame(container: HTMLElement): Game {
  return new Game(container);
}

export type { Game };
