import { redis } from '@/lib/redis';
import type { RoomState } from './types';

const TTL = 60 * 60 * 2; // 2 hours
export const roomKey = (id: string) => `room:${id}`;

export async function getRoom(id: string): Promise<RoomState | null> {
  return redis.get<RoomState>(roomKey(id));
}

export async function setRoom(state: RoomState): Promise<void> {
  await redis.set(roomKey(state.id), state, { ex: TTL });
}

// Atomic read-modify-write
export async function updateRoom(
  id: string,
  updater: (state: RoomState) => RoomState
): Promise<RoomState> {
  const current = await getRoom(id);
  if (!current) throw new Error('Room not found');
  const updated = updater(current);
  await setRoom(updated);
  return updated;
}

export async function deleteRoom(id: string): Promise<void> {
  await redis.del(roomKey(id));
}
