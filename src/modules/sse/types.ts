import { QuestionPayload, RevealPayload } from '@/modules/game/types';
import { Player, RoomSettings, RoomState } from '@/modules/room/types';

export type SSEEvent =
  | { event: 'state_sync'; data: RoomState }
  | { event: 'player_joined'; data: { player: Player; count: number } }
  | { event: 'player_left'; data: { playerId: string; count: number } }
  | { event: 'player_kicked'; data: { playerId: string } }
  | { event: 'settings_updated'; data: RoomSettings }
  | { event: 'ready_changed'; data: { playerId: string; ready: boolean } }
  | { event: 'game_starting'; data: { startsIn: number } }
  | { event: 'question'; data: QuestionPayload }
  | { event: 'answer_count'; data: { answered: number; total: number } }
  | { event: 'reveal'; data: RevealPayload }
  | { event: 'leaderboard'; data: { players: Player[]; nextIn: number } }
  | { event: 'game_ended'; data: { players: Player[] } }
  | { event: 'error'; data: { message: string } };
