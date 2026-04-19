import { pgTable, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const gameResults = pgTable('game_results', {
  id: text('id').primaryKey(),
  roomId: text('room_id').notNull(),
  players: jsonb('players').notNull(),
  settings: jsonb('settings').notNull(),
  playedAt: timestamp('played_at').defaultNow().notNull(),
});
