import { jsonError } from '@/lib/api/validate';
import { getRoom } from './store';
import type { InternalRoomState, RoomPhase } from './types';

export async function requireRoom(roomId: string): Promise<InternalRoomState> {
  const room = await getRoom(roomId);
  if (!room) throw jsonError(404, 'room_not_found');
  return room;
}

export function requireMember(room: InternalRoomState, userId: string): void {
  if (!room.players[userId]) throw jsonError(403, 'not_a_member');
}

export function requireHost(room: InternalRoomState, userId: string): void {
  if (room.hostId !== userId) throw jsonError(403, 'not_host');
}

export function requirePhase(
  room: InternalRoomState,
  allowed: RoomPhase | RoomPhase[]
): void {
  const allowedPhases = Array.isArray(allowed) ? allowed : [allowed];
  if (!allowedPhases.includes(room.phase)) {
    throw jsonError(409, 'wrong_phase');
  }
}
