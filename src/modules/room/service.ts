import { nanoid } from 'nanoid';
import { jsonError } from '@/lib/api/validate';
import { randomString } from '@/lib/random';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from './constants';
import {
  requireHost,
  requireMember,
  requirePhase,
  requireRoom,
} from './guards';
import {
  codeKey,
  deleteRoom,
  getRoomIdByCode,
  roomKey,
  setRoom,
  toPublicState,
  updateRoom,
} from './store';
import type { InternalRoomState, Player, RoomSettings } from './types';
import { linkCodeOrRollback, unlinkCodeBestEffort } from './code-index';
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
    ).catch(() => false);
    if (created) return { id, code };

    // Fallback path for clients/environments where script may fail.
    const existing = await getRoomIdByCode(code);
    if (existing) continue;
    await setRoom(state);
    try {
      await linkCodeOrRollback(code, id);
      return { id, code };
    } catch (error) {
      await deleteRoom(id).catch(() => undefined);
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

  const room = await requireRoom(roomId);
  if (room.players[user.id]) return { id: roomId, code: room.code };
  requirePhase(room, 'lobby');
  if (Object.keys(room.players).length >= MAX_PLAYERS) {
    throw jsonError(409, 'room_full');
  }

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
    if (r.phase !== 'lobby') return r;
    if (Object.keys(r.players).length >= MAX_PLAYERS) return r;
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
  const room = await requireRoom(roomId);
  requireMember(room, playerId);
  requirePhase(room, 'lobby');

  if (room.players[playerId].ready === ready) return;

  const updated = await updateRoom(roomId, (r) => {
    if (r.phase !== 'lobby') return r;
    const player = r.players[playerId];
    if (!player || player.ready === ready) return r;
    return {
      ...r,
      players: { ...r.players, [playerId]: { ...player, ready } },
    };
  });

  if (updated.players[playerId]?.ready !== room.players[playerId].ready) {
    broadcast(roomId, { event: 'ready_changed', data: { playerId, ready } });
  }
}

export async function updateRoomSettings(params: {
  roomId: string;
  playerId: string;
  patch: Partial<RoomSettings>;
}): Promise<void> {
  const { roomId, playerId, patch } = params;
  const room = await requireRoom(roomId);
  requireHost(room, playerId);
  requirePhase(room, 'lobby');

  const updated = await updateRoom(roomId, (r) => {
    if (r.phase !== 'lobby' || r.hostId !== playerId) return r;
    return { ...r, settings: { ...r.settings, ...patch } };
  });

  broadcast(roomId, { event: 'settings_updated', data: updated.settings });
}

export async function submitAnswer(params: {
  roomId: string;
  playerId: string;
  optionId: string;
}) {
  const { roomId, playerId, optionId } = params;
  const room = await requireRoom(roomId);
  requireMember(room, playerId);
  requirePhase(room, 'question');
  const lockOnFirstSubmit = room.settings.answerMode === 'lock_on_first_submit';
  if (lockOnFirstSubmit && room.answers[playerId] !== undefined) {
    throw jsonError(409, 'already_answered');
  }
  if (room.phaseEndsAt !== null && Date.now() > room.phaseEndsAt) {
    throw jsonError(410, 'phase_expired');
  }

  const scripted = await submitAnswerAtomically(
    roomKey(roomId),
    playerId,
    optionId,
    Date.now(),
    lockOnFirstSubmit
  );
  if (scripted.status === 'not_found') throw jsonError(404, 'room_not_found');
  if (scripted.status === 'not_member') throw jsonError(403, 'not_a_member');
  if (scripted.status === 'wrong_phase') throw jsonError(409, 'wrong_phase');
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

  if (lockOnFirstSubmit && checkAllAnswered(updated)) {
    await revealQuestion(roomId);
  }
}

export async function leaveRoom(params: {
  roomId: string;
  playerId: string;
}): Promise<void> {
  const { roomId, playerId } = params;
  const room = await requireRoom(roomId);
  requireMember(room, playerId);
  cancelOfflineRemovalTimer(roomId, playerId);

  const remainingIds = Object.keys(room.players).filter(
    (id) => id !== playerId
  );
  if (remainingIds.length === 0) {
    await deleteRoomAndCode(roomKey(roomId), codeKey(room.code)).catch(
      async () => {
        await deleteRoom(roomId);
        await unlinkCodeBestEffort(room.code, 'room:leave');
      }
    );
    return;
  }

  const wasHost = room.hostId === playerId;
  const nextHostId = wasHost ? remainingIds[0] : room.hostId;
  const updated = await updateRoom(roomId, (r) => {
    if (!r.players[playerId]) return r;
    const players = { ...r.players };
    delete players[playerId];
    return { ...r, hostId: nextHostId, players };
  });

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
  const room = await requireRoom(roomId);
  requireHost(room, hostId);
  requirePhase(room, 'lobby');
  if (targetId === hostId) throw jsonError(400, 'cannot_kick_self');
  if (!room.players[targetId]) throw jsonError(404, 'target_not_member');

  await updateRoom(roomId, (r) => {
    if (!r.players[targetId]) return r;
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
  const room = await requireRoom(roomId);
  requireHost(room, playerId);
  requirePhase(room, 'lobby');

  const connected = getConnectedPlayers(room.players);
  if (connected.length < MIN_PLAYERS) {
    throw jsonError(
      409,
      'not_enough_players',
      `At least ${MIN_PLAYERS} connected players are required to start.`
    );
  }
  const pending = connected.filter((p) => p.id !== room.hostId && !p.ready);
  if (pending.length > 0) throw jsonError(409, 'not_all_ready');

  await startGame(roomId);
}
