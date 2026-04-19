import { pgTable, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import type { Player, RoomSettings } from '@/modules/room/types';

export const gameResults = pgTable('game_results', {
  id: text('id').primaryKey(),
  roomId: text('room_id').notNull(),
  players: jsonb('players').$type<Player[]>().notNull(),
  settings: jsonb('settings').$type<RoomSettings>().notNull(),
  playedAt: timestamp('played_at').defaultNow().notNull(),
});
