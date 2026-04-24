import { nanoid } from 'nanoid';
import { jsonError } from '@/lib/http';
import { randomString, UNAMBIGUOUS_ALPHABET } from '@/features/session/random';
import {
  codeKey,
  deleteRoom,
  getRoomIdByCode,
  roomKey,
  setRoom,
  setRoomCode,
} from '../store';
import { createRoomWithCodeIfAbsent } from '../redis-scripts';
import { ROOM_CODE_LENGTH } from '../constants';
import { DEFAULT_ROOM_SETTINGS } from '../schemas';
import type { InternalRoomState, Player, RoomSettings } from '../types';

const MAX_CODE_RETRIES = 5;

/**
 * Create a new room with the given host and settings. Returns `{ id, code }`
 * on success. Used by both the `/api/room` route handler and the homepage
 * Create-Room server action — ONE canonical implementation.
 *
 * The code-collision retry loop is bounded; after {@link MAX_CODE_RETRIES}
 * unsuccessful attempts we throw `code_collision` (503). This is rare
 * (1-in-millions at a 6-char unambiguous alphabet).
 */
export async function createRoom(
  user: { id: string; name: string; image?: string | null },
  settingsOverride?: Partial<RoomSettings>
): Promise<{ id: string; code: string }> {
  for (let i = 0; i < MAX_CODE_RETRIES; i++) {
    const code = randomString(ROOM_CODE_LENGTH, UNAMBIGUOUS_ALPHABET);
    const id = nanoid();
    const host: Player = {
      id: user.id,
      name: user.name,
      avatarUrl: user.image ?? undefined,
      score: 0,
      wins: 0,
      ready: true,
      connected: true,
    };
    const state: InternalRoomState = {
      id,
      code,
      hostId: user.id,
      phase: 'lobby',
      players: { [user.id]: host },
      settings: { ...DEFAULT_ROOM_SETTINGS, ...(settingsOverride ?? {}) },
      currentQuestionIndex: 0,
      phaseEndsAt: null,
      createdAt: Date.now(),
      version: 1,
      answers: {},
    };

    const created = await createRoomWithCodeIfAbsent(
      roomKey(id),
      codeKey(code),
      state
    );
    if (created) return { id, code };

    const existing = await getRoomIdByCode(code);
    if (existing) continue;
    // Fallback path when the atomic script is unavailable or returned
    // a conflict we can't explain. Write sequentially and best-effort
    // roll back on code-index failure.
    await setRoom(state);
    try {
      await setRoomCode(code, id);
      return { id, code };
    } catch (error) {
      await deleteRoom(id).catch((err) => {
        console.error(
          `[createRoom] rollback room deletion failed id=${id}`,
          err
        );
      });
      throw error;
    }
  }

  throw jsonError(503, 'code_collision', 'Failed to allocate a unique code.');
}
