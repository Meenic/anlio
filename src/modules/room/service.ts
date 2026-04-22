import { nanoid } from 'nanoid';
import { jsonError } from '@/lib/api/validate';
import { randomString } from '@/lib/random';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from './constants';
import { requireHost, requireMember, requirePhase } from './guards';
import {
  codeKey,
  deleteRoom,
  getRoomIdByCode,
  roomKey,
  setRoom,
  toPublicState,
  updateRoom,
  setRoomCode,
  deleteRoomCode,
} from './store';
import type { InternalRoomState, Player, RoomSettings } from './types';
import { getConnectedPlayers, countConnectedPlayers } from './selectors';
import { broadcast } from '@/modules/sse/broadcaster';
import { cancelOfflineRemovalTimer } from '@/modules/sse/offline-removal';
import {
  startGame,
  checkAllAnswered,
  revealQuestion,
} from '@/modules/game/engine';
import {
  createRoomWithCodeIfAbsent,
  deleteRoomAndCode,
  submitAnswerAtomically,
} from './redis-scripts';

const MAX_CODE_RETRIES = 5;

export async function createRoom(params: {
  user: { id: string; name: string; image?: string | null };
  settings: Partial<RoomSettings> | undefined;
  defaultSettings: RoomSettings;
}): Promise<{ id: string; code: string }> {
  const { user, settings, defaultSettings } = params;
  for (let i = 0; i < MAX_CODE_RETRIES; i++) {
    const code = randomString(ROOM_CODE_LENGTH, ROOM_CODE_ALPHABET);
    const id = nanoid();
    const host: Player = {
      id: user.id,
      name: user.name ?? 'Host',
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
      settings: { ...defaultSettings, ...(settings ?? {}) },
      currentQuestionIndex: 0,
      phaseEndsAt: null,
      createdAt: Date.now(),
      version: 1,
      questions: [],
      answers: {},
    };
    const created = await createRoomWithCodeIfAbsent(
      roomKey(id),
      codeKey(code),
      state
    );
    if (created) return { id, code };

    // Fallback path for clients/environments where script may fail.
    const existing = await getRoomIdByCode(code);
    if (existing) continue;
    await setRoom(state);
    try {
      await setRoomCode(code, id);
      return { id, code };
    } catch (error) {
      await deleteRoom(id).catch((err) => {
        console.error(
          `[createRoom] failed to rollback room deletion for id=${id}`,
          err
        );
      });
      throw error;
    }
  }
  throw jsonError(
    503,
    'code_collision',
    'Failed to allocate a unique room code; try again.'
  );
}

export async function joinRoom(params: {
  user: { id: string; name: string; image?: string | null };
  code: string;
}): Promise<{ id: string; code: string }> {
  const { user, code } = params;
  const roomId = await getRoomIdByCode(code);
  if (!roomId) throw jsonError(404, 'room_not_found');

  const player: Player = {
    id: user.id,
    name: user.name ?? 'Player',
    avatarUrl: user.image ?? undefined,
    score: 0,
    wins: 0,
    ready: false,
    connected: false,
  };

  const updated = await updateRoom(roomId, (r) => {
    if (r.players[user.id]) return r;
    requirePhase(r, 'lobby');
    if (Object.keys(r.players).length >= MAX_PLAYERS) {
      throw jsonError(409, 'room_full');
    }
    return {
      ...r,
      players: { ...r.players, [user.id]: player },
    };
  });

  return { id: roomId, code: updated.code };
}

export async function setReady(params: {
  roomId: string;
  playerId: string;
  ready: boolean;
}): Promise<void> {
  const { roomId, playerId, ready } = params;
  let stateChanged = false;
  await updateRoom(roomId, (r) => {
    requireMember(r, playerId);
    requirePhase(r, 'lobby');

    const player = r.players[playerId];
    if (player.ready === ready) return r;

    stateChanged = true;
    return {
      ...r,
      players: { ...r.players, [playerId]: { ...player, ready } },
    };
  });

  if (stateChanged) {
    broadcast(roomId, { event: 'ready_changed', data: { playerId, ready } });
  }
}

export async function updateRoomSettings(params: {
  roomId: string;
  playerId: string;
  patch: Partial<RoomSettings>;
}): Promise<void> {
  const { roomId, playerId, patch } = params;
  let stateChanged = false;
  const updated = await updateRoom(roomId, (r) => {
    requireHost(r, playerId);
    requirePhase(r, 'lobby');

    stateChanged = true;
    return { ...r, settings: { ...r.settings, ...patch } };
  });

  if (stateChanged) {
    broadcast(roomId, { event: 'settings_updated', data: updated.settings });
  }
}

export async function submitAnswer(params: {
  roomId: string;
  playerId: string;
  optionId: string;
}) {
  const { roomId, playerId, optionId } = params;
  const scripted = await submitAnswerAtomically(
    roomKey(roomId),
    playerId,
    optionId,
    Date.now()
  );
  if (scripted.status === 'not_found') throw jsonError(404, 'room_not_found');
  if (scripted.status === 'not_member') throw jsonError(403, 'not_a_member');
  if (scripted.status === 'wrong_phase') throw jsonError(409, 'wrong_phase');
  if (scripted.status === 'phase_expired')
    throw jsonError(410, 'phase_expired');
  if (scripted.status === 'already_answered') {
    throw jsonError(409, 'already_answered');
  }
  if (scripted.status === 'conflict') {
    throw jsonError(409, 'room_conflict');
  }
  if (scripted.status !== 'updated') {
    throw jsonError(500, 'internal_error', 'Unexpected submitAnswer result');
  }

  const updated = scripted.room;
  broadcast(roomId, {
    event: 'answer_count',
    data: {
      answered: Object.keys(updated.answers).length,
      total: countConnectedPlayers(updated.players),
    },
  });

  // Re-read settings from the updated state inside scripted.room
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
    requireMember(r, playerId);

    const players = { ...r.players };
    delete players[playerId];
    const remainingIds = Object.keys(players);
    if (remainingIds.length === 0) {
      codeToDelete = r.code;
      return { ...r, players }; // Room will be deleted after update
    }

    wasHost = r.hostId === playerId;
    const nextHostId = wasHost ? remainingIds[0] : r.hostId;
    return { ...r, hostId: nextHostId, players };
  });

  cancelOfflineRemovalTimer(roomId, playerId);

  if (Object.keys(updated.players).length === 0) {
    await deleteRoomAndCode(roomKey(roomId), codeKey(codeToDelete)).catch(
      async () => {
        await deleteRoom(roomId);
        await deleteRoomCode(codeToDelete).catch((err) => {
          console.error(
            `[leaveRoom] failed to delete room code=${codeToDelete}`,
            err
          );
        });
      }
    );
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

export async function kickPlayer(params: {
  roomId: string;
  hostId: string;
  targetId: string;
}): Promise<void> {
  const { roomId, hostId, targetId } = params;
  await updateRoom(roomId, (r) => {
    requireHost(r, hostId);
    requirePhase(r, 'lobby');
    if (targetId === hostId) throw jsonError(400, 'cannot_kick_self');
    if (!r.players[targetId]) throw jsonError(404, 'target_not_member');

    const players = { ...r.players };
    delete players[targetId];
    return { ...r, players };
  });

  cancelOfflineRemovalTimer(roomId, targetId);
  broadcast(roomId, { event: 'player_kicked', data: { playerId: targetId } });
}

export async function startRoomGame(params: {
  roomId: string;
  playerId: string;
}): Promise<void> {
  const { roomId, playerId } = params;
  const updated = await updateRoom(roomId, (r) => {
    requireHost(r, playerId);
    requirePhase(r, 'lobby');

    const connected = getConnectedPlayers(r.players);
    if (connected.length < MIN_PLAYERS) {
      throw jsonError(
        409,
        'not_enough_players',
        `At least ${MIN_PLAYERS} connected players are required to start.`
      );
    }
    const pending = connected.filter((p) => p.id !== r.hostId && !p.ready);
    if (pending.length > 0) throw jsonError(409, 'not_all_ready');

    return r; // Validation passed, return unmodified to skip write
  });

  await startGame(roomId, updated.settings);
}
