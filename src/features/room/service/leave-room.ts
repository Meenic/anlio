import { jsonError } from '@/lib/http';
import { broadcast } from '@/features/realtime/broadcaster';
import { cancelOfflineRemovalTimer } from '@/features/realtime/offline-removal';
import {
  codeKey,
  deleteQuestions,
  deleteRoom,
  deleteRoomCode,
  roomKey,
  roomQuestionsKey,
  toPublicState,
  updateRoom,
} from '../store';
import { deleteRoomAndCode } from '../redis-scripts';
import { countConnectedPlayers } from '../selectors';

/**
 * Remove a player from a room. When the last player leaves, the room + its
 * questions bank + the code-index entry are all torn down in one atomic
 * Lua script (with a best-effort fallback to individual DELs). Host
 * transfer is automatic: the first remaining player becomes host.
 */
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
