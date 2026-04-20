import type { Player } from './types';

/** All players whose SSE stream is currently open. */
export function getConnectedPlayers(players: Record<string, Player>): Player[] {
  return Object.values(players).filter((p) => p.connected);
}

/** Count of {@link getConnectedPlayers}. */
export function countConnectedPlayers(players: Record<string, Player>): number {
  return getConnectedPlayers(players).length;
}
