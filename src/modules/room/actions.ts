import { jsonError } from '@/lib/api/validate';
import { broadcast } from '@/modules/sse/broadcaster';
import { cancelOfflineRemovalTimer } from '@/modules/sse/offline-removal';
import {
  codeKey,
  deleteRoom,
  deleteRoomCode,
  roomKey,
  toPublicState,
  updateRoom,
} from './store';
import { deleteRoomAndCode, submitAnswerAtomically } from './redis-scripts';
import { countConnectedPlayers } from './selectors';
import { checkAllAnswered, revealQuestion } from '@/modules/game/engine';

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
    await deleteRoomAndCode(roomKey(roomId), codeKey(codeToDelete)).catch(
      async (err) => {
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
