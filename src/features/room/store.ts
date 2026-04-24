import { redis } from '@/lib/redis';
import { ROOM_TTL_SECONDS } from './constants';
import type { InternalRoomState, RoomState } from './types';
import type { Question } from '@/features/game/types';
import { cacheLife, cacheTag } from 'next/cache';
import { withRoomLock } from './mutex';

export const roomKey = (id: string) => `room:${id}`;
export const codeKey = (code: string) => `code:${code}`;
/** Dedicated key for the ~20 KB question bank. Written once per game at
 *  `startGame`, read by the engine on every phase transition. Kept out of
 *  the main `roomKey` payload so hot-path writes stay tiny. */
export const roomQuestionsKey = (id: string) => `room:${id}:questions`;

/**
 * Kept for API-compatibility with code paths that still catch it, but now
 * only thrown in the "room disappeared mid-transaction" race. The legacy
 * optimistic-CAS retry loop is gone — see `./mutex.ts` for why.
 */
export class RoomConflictError extends Error {
  constructor(message = 'Room update conflict') {
    super(message);
    this.name = 'RoomConflictError';
  }
}

export async function getRoom(id: string): Promise<InternalRoomState | null> {
  const state = await redis.get<InternalRoomState>(roomKey(id));
  return state ? state : null;
}

export async function setRoom(state: InternalRoomState): Promise<void> {
  await redis.set(roomKey(state.id), state, {
    ex: ROOM_TTL_SECONDS,
  });
}

/**
 * Read-modify-write the room state under the per-room mutex.
 *
 * Because every mutation from this process runs serially per roomId (see
 * `./mutex.ts`), we no longer need version-checked writes — the GET/SET
 * pair is the hot path now, and we skip any Lua round-trip.
 *
 * The updater may return the exact same object reference to signal "no
 * change"; in that case we skip the Redis write entirely.
 */
export async function updateRoom(
  id: string,
  updater: (state: InternalRoomState) => InternalRoomState
): Promise<InternalRoomState> {
  return withRoomLock(id, async () => {
    const current = await getRoom(id);
    if (!current) throw new Error('Room not found');

    const updated = updater(current);
    if (updated === current) return current;

    const next = { ...updated, version: current.version + 1 };
    await setRoom(next);
    return next;
  });
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
    return await updateRoom(id, updater);
  } catch (error) {
    if (error instanceof Error && error.message === 'Room not found') {
      return null;
    }
    throw error;
  }
}

export function toPublicState(internalState: InternalRoomState): RoomState {
  const { answers, ...publicState } = internalState;
  return {
    ...publicState,
    answerCount: Object.keys(answers).length,
  };
}

// ---------------------------------------------------------------------------
// Questions (separate Redis key — see `roomQuestionsKey` comment)
// ---------------------------------------------------------------------------

export async function getQuestions(id: string): Promise<Question[] | null> {
  const value = await redis.get<Question[]>(roomQuestionsKey(id));
  return value ?? null;
}

export async function setQuestions(
  id: string,
  questions: Question[]
): Promise<void> {
  await redis.set(roomQuestionsKey(id), questions, { ex: ROOM_TTL_SECONDS });
}

export async function deleteQuestions(id: string): Promise<void> {
  await redis.del(roomQuestionsKey(id));
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

export async function getRoomIdByCodeCached(
  code: string
): Promise<string | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag(`room-code:${code}`);
  return redis.get<string>(codeKey(code));
}

export async function deleteRoomCode(code: string): Promise<void> {
  await redis.del(codeKey(code));
}
