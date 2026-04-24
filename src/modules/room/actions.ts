import { nanoid } from 'nanoid';
import { jsonError } from '@/lib/api/validate';
import { randomString, UNAMBIGUOUS_ALPHABET } from '@/lib/random';
import { broadcast } from '@/modules/sse/broadcaster';
import { cancelOfflineRemovalTimer } from '@/modules/sse/offline-removal';
import {
  codeKey,
  deleteQuestions,
  deleteRoom,
  deleteRoomCode,
  getRoomIdByCode,
  roomKey,
  setRoom,
  setRoomCode,
  roomQuestionsKey,
  toPublicState,
  updateRoom,
} from './store';
import { createRoomWithCodeIfAbsent, deleteRoomAndCode } from './redis-scripts';
import { countConnectedPlayers } from './selectors';
import { checkAllAnswered, revealQuestion } from '@/modules/game/engine';
import { MAX_PLAYERS, ROOM_CODE_LENGTH } from './constants';
import { DEFAULT_ROOM_SETTINGS } from '@/app/api/room/schemas';
import type { InternalRoomState, Player, RoomSettings } from './types';

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
      connected: false,
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

/**
 * Idempotent room join. Safe to call even if the user is already a member
 * (returns the existing room state). Invoked both by `/api/room/join` and
 * by the RSC / Server Action prehydration path — there is ONE source of truth.
 */
export async function joinRoomByCode(
  code: string,
  user: { id: string; name: string; image?: string | null }
): Promise<{ roomId: string }> {
  const roomId = await getRoomIdByCode(code);
  if (!roomId) throw jsonError(404, 'room_not_found');

  const player: Player = {
    id: user.id,
    name: user.name,
    avatarUrl: user.image ?? undefined,
    score: 0,
    wins: 0,
    ready: false,
    connected: false,
  };

  await updateRoom(roomId, (r) => {
    if (r.players[user.id]) return r;
    if (r.phase !== 'lobby') throw jsonError(409, 'wrong_phase');
    if (Object.keys(r.players).length >= MAX_PLAYERS) {
      throw jsonError(409, 'room_full');
    }
    return {
      ...r,
      players: { ...r.players, [user.id]: player },
    };
  });

  return { roomId };
}

export async function submitAnswer(params: {
  roomId: string;
  playerId: string;
  optionId: string;
}) {
  const { roomId, playerId, optionId } = params;
  const answeredAt = Date.now();

  // Under the per-room mutex this is a straight GET → validate → SET — no
  // Lua script, no retries, no version guard. All gating (phase, membership,
  // deadline, already-answered) happens here and throws HTTP errors on any
  // violation.
  const updated = await updateRoom(roomId, (r) => {
    if (!r.players[playerId]) throw jsonError(403, 'not_a_member');
    if (r.phase !== 'question') throw jsonError(409, 'wrong_phase');
    if (r.phaseEndsAt !== null && answeredAt > r.phaseEndsAt) {
      throw jsonError(410, 'phase_expired');
    }

    const lockOnFirstSubmit = r.settings.answerMode === 'lock_on_first_submit';
    if (lockOnFirstSubmit && r.answers[playerId] !== undefined) {
      throw jsonError(409, 'already_answered');
    }

    const firstAnsweredAt = r.players[playerId].answeredAt ?? answeredAt;
    return {
      ...r,
      answers: { ...r.answers, [playerId]: optionId },
      players: {
        ...r.players,
        [playerId]: {
          ...r.players[playerId],
          answeredAt: firstAnsweredAt,
        },
      },
    };
  }).catch((err) => {
    if (err instanceof Error && err.message === 'Room not found') {
      throw jsonError(404, 'room_not_found');
    }
    throw err;
  });

  broadcast(roomId, {
    event: 'answer_count',
    data: {
      answered: Object.keys(updated.answers).length,
      total: countConnectedPlayers(updated.players),
    },
  });

  const lockOnFirstSubmit =
    updated.settings.answerMode === 'lock_on_first_submit';
  if (lockOnFirstSubmit && checkAllAnswered(updated)) {
    await revealQuestion(roomId);
  }
}

export async function leaveRoom(params: {
  roomId: string;
  playerId: string;
}): Promise<void> {
  const { roomId, playerId } = params;
  let wasHost = false;
  let codeToDelete = '';
  const updated = await updateRoom(roomId, (r) => {
    if (!r.players[playerId]) throw jsonError(403, 'not_a_member');

    const players = { ...r.players };
    delete players[playerId];
    const remainingIds = Object.keys(players);
    if (remainingIds.length === 0) {
      codeToDelete = r.code;
      return { ...r, players };
    }

    wasHost = r.hostId === playerId;
    const nextHostId = wasHost ? remainingIds[0] : r.hostId;
    return { ...r, hostId: nextHostId, players };
  });

  cancelOfflineRemovalTimer(roomId, playerId);

  if (Object.keys(updated.players).length === 0) {
    await deleteRoomAndCode(
      roomKey(roomId),
      codeKey(codeToDelete),
      roomQuestionsKey(roomId)
    ).catch(async (err) => {
      console.warn(
        `[leaveRoom] deleteRoomAndCode failed, falling back to individual deletes room=${roomId}`,
        err
      );
      await deleteRoom(roomId);
      await deleteRoomCode(codeToDelete).catch((err2) => {
        console.error(
          `[leaveRoom] failed to delete room code=${codeToDelete}`,
          err2
        );
      });
      await deleteQuestions(roomId).catch(() => {});
    });
    return;
  }

  broadcast(roomId, {
    event: 'player_removed',
    data: { playerId, count: countConnectedPlayers(updated.players) },
  });
  if (wasHost) {
    broadcast(roomId, { event: 'state_sync', data: toPublicState(updated) });
  }
}
