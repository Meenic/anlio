import { redis } from '@/lib/redis';
import { ROOM_TTL_SECONDS } from './constants';
import type { InternalRoomState, RoomState } from './types';

export const roomKey = (id: string) => `room:${id}`;
export const codeKey = (code: string) => `code:${code}`;

export async function getRoom(id: string): Promise<InternalRoomState | null> {
  return redis.get<InternalRoomState>(roomKey(id));
}

export async function setRoom(state: InternalRoomState): Promise<void> {
  await redis.set(roomKey(state.id), state, { ex: ROOM_TTL_SECONDS });
}

// Atomic read-modify-write
export async function updateRoom(
  id: string,
  updater: (state: InternalRoomState) => InternalRoomState
): Promise<InternalRoomState> {
  const current = await getRoom(id);
  if (!current) throw new Error('Room not found');
  const updated = updater(current);
  await setRoom(updated);
  return updated;
}

export async function deleteRoom(id: string): Promise<void> {
  await redis.del(roomKey(id));
}

/** Non-throwing variant — returns null if the room no longer exists. */
export async function tryUpdateRoom(
  id: string,
  updater: (state: InternalRoomState) => InternalRoomState
): Promise<InternalRoomState | null> {
  const current = await getRoom(id);
  if (!current) return null;
  const updated = updater(current);
  await setRoom(updated);
  return updated;
}

export function toPublicState(internalState: InternalRoomState): RoomState {
  const { questions: _q, answers, ...publicState } = internalState;
  return {
    ...publicState,
    answerCount: Object.keys(answers).length,
  };
}

// ---------------------------------------------------------------------------
// Code -> roomId index (used by join-by-code)
// ---------------------------------------------------------------------------

export async function setRoomCode(code: string, roomId: string): Promise<void> {
  await redis.set(codeKey(code), roomId, { ex: ROOM_TTL_SECONDS });
}

export async function getRoomIdByCode(code: string): Promise<string | null> {
  return redis.get<string>(codeKey(code));
}

export async function deleteRoomCode(code: string): Promise<void> {
  await redis.del(codeKey(code));
}
