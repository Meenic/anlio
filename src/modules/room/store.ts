import { redis } from '@/lib/redis';
import { ROOM_TTL_SECONDS } from './constants';
import type { InternalRoomState, RoomState } from './types';

export const roomKey = (id: string) => `room:${id}`;
export const codeKey = (code: string) => `code:${code}`;
const roomLockKey = (id: string) => `room-lock:${id}`;
const ROOM_UPDATE_MAX_RETRIES = 5;
const ROOM_UPDATE_LOCK_TTL_SECONDS = 2;
const ROOM_UPDATE_BACKOFF_MS = 25;

export class RoomConflictError extends Error {
  constructor(message = 'Room update conflict') {
    super(message);
    this.name = 'RoomConflictError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeRoomVersion(state: InternalRoomState): InternalRoomState {
  return {
    ...state,
    version: typeof state.version === 'number' ? state.version : 0,
  };
}

async function acquireRoomLock(id: string, owner: string): Promise<boolean> {
  const result = await redis.set(roomLockKey(id), owner, {
    nx: true,
    ex: ROOM_UPDATE_LOCK_TTL_SECONDS,
  });
  return result === 'OK';
}

async function releaseRoomLock(id: string, owner: string): Promise<void> {
  const lock = await redis.get<string>(roomLockKey(id));
  if (lock === owner) {
    await redis.del(roomLockKey(id));
  }
}

export async function getRoom(id: string): Promise<InternalRoomState | null> {
  const state = await redis.get<InternalRoomState>(roomKey(id));
  return state ? normalizeRoomVersion(state) : null;
}

export async function setRoom(state: InternalRoomState): Promise<void> {
  await redis.set(roomKey(state.id), normalizeRoomVersion(state), {
    ex: ROOM_TTL_SECONDS,
  });
}

export async function updateRoomWithRetry(
  id: string,
  updater: (state: InternalRoomState) => InternalRoomState
): Promise<InternalRoomState> {
  for (let attempt = 0; attempt < ROOM_UPDATE_MAX_RETRIES; attempt++) {
    const owner = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const acquired = await acquireRoomLock(id, owner);
    if (!acquired) {
      await sleep(ROOM_UPDATE_BACKOFF_MS * (attempt + 1));
      continue;
    }

    try {
      const current = await getRoom(id);
      if (!current) throw new Error('Room not found');
      const updated = normalizeRoomVersion(updater(current));
      const next = {
        ...updated,
        version: current.version + 1,
      };
      await setRoom(next);
      return next;
    } finally {
      await releaseRoomLock(id, owner);
    }
  }

  console.warn(
    `[room-store] update conflict after retries room=${id} retries=${ROOM_UPDATE_MAX_RETRIES}`
  );
  throw new RoomConflictError(
    `Failed to update room ${id} after ${ROOM_UPDATE_MAX_RETRIES} retries`
  );
}

export async function updateRoom(
  id: string,
  updater: (state: InternalRoomState) => InternalRoomState
): Promise<InternalRoomState> {
  return updateRoomWithRetry(id, updater);
}

export async function deleteRoom(id: string): Promise<void> {
  await redis.del(roomKey(id));
}

/** Non-throwing variant — returns null if the room no longer exists. */
export async function tryUpdateRoom(
  id: string,
  updater: (state: InternalRoomState) => InternalRoomState
): Promise<InternalRoomState | null> {
  try {
    return await updateRoomWithRetry(id, updater);
  } catch (error) {
    if (error instanceof Error && error.message === 'Room not found') {
      return null;
    }
    throw error;
  }
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
