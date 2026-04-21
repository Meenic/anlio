import { db } from '@/drizzle/db';
import { gameResults } from '@/drizzle/schemas/game-schema';
import { nanoid } from 'nanoid';
import type { Player, RoomSettings } from '@/modules/room/types';

export async function insertGameResult(params: {
  roomId: string;
  players: Player[];
  settings: RoomSettings;
}): Promise<void> {
  const { roomId, players, settings } = params;
  await db.insert(gameResults).values({
    id: nanoid(),
    roomId,
    players,
    settings,
  });
}
