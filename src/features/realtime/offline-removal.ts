import { OFFLINE_PLAYER_GRACE_MS } from '@/features/room/constants';
import { countConnectedPlayers } from '@/features/room/selectors';
import {
  deleteQuestions,
  deleteRoom,
  getRoom,
  toPublicState,
  updateRoom,
  codeKey,
  roomKey,
  roomQuestionsKey,
} from '@/features/room/store';
import { deleteRoomAndCode } from '@/features/room/redis-scripts';
import { broadcast } from './broadcaster';
import { registry } from './registry';
import { deleteRoomCode } from '@/features/room/store';

type TimerHandle = ReturnType<typeof setTimeout>;

// roomId -> playerId -> timeout handle
const offlineRemovalTimers = new Map<string, Map<string, TimerHandle>>();

function getOrCreateRoomTimers(roomId: string): Map<string, TimerHandle> {
  let roomTimers = offlineRemovalTimers.get(roomId);
  if (!roomTimers) {
    roomTimers = new Map();
    offlineRemovalTimers.set(roomId, roomTimers);
  }
  return roomTimers;
}

function clearTimer(roomId: string, playerId: string): void {
  const roomTimers = offlineRemovalTimers.get(roomId);
  if (!roomTimers) return;

  const handle = roomTimers.get(playerId);
  if (handle) {
    clearTimeout(handle);
    roomTimers.delete(playerId);
  }

  if (roomTimers.size === 0) {
    offlineRemovalTimers.delete(roomId);
  }
}

export function cancelOfflineRemovalTimer(
  roomId: string,
  playerId: string
): void {
  clearTimer(roomId, playerId);
}

export function scheduleOfflineRemovalTimer(
  roomId: string,
  playerId: string,
  disconnectedAt: number
): void {
  clearTimer(roomId, playerId);

  const timeout = setTimeout(() => {
    void removeIfStillOffline(roomId, playerId, disconnectedAt);
  }, OFFLINE_PLAYER_GRACE_MS);

  // Avoid keeping the Node process alive solely for pending presence timers.
  const maybeNodeTimeout = timeout as TimerHandle & { unref?: () => void };
  if (typeof maybeNodeTimeout.unref === 'function') {
    maybeNodeTimeout.unref();
  }

  getOrCreateRoomTimers(roomId).set(playerId, timeout);
}

async function removeIfStillOffline(
  roomId: string,
  playerId: string,
  disconnectedAt: number
): Promise<void> {
  clearTimer(roomId, playerId);

  // A live SSE stream means the player has reconnected.
  if (registry.get(roomId)?.has(playerId)) return;

  const room = await getRoom(roomId);
  if (!room) return;

  const updated = await updateRoom(roomId, (current) => {
    const player = current.players[playerId];
    if (!player || player.connected) return current;
    if (player.disconnectedAt !== disconnectedAt) return current;

    const players = { ...current.players };
    delete players[playerId];
    const remainingIds = Object.keys(players);
    if (remainingIds.length === 0) {
      return { ...current, players };
    }

    const nextHostId =
      current.hostId === playerId ? remainingIds[0] : current.hostId;
    return {
      ...current,
      hostId: nextHostId,
      players,
    };
  });

  if (updated.players[playerId]) {
    return;
  }

  if (Object.keys(updated.players).length === 0) {
    await deleteRoomAndCode(
      roomKey(roomId),
      codeKey(room.code),
      roomQuestionsKey(roomId)
    ).catch(async (err) => {
      console.warn(
        `[offline-removal] deleteRoomAndCode failed, falling back to individual deletes room=${roomId}`,
        err
      );
      await deleteRoom(roomId).catch((err) => {
        console.error(`[offline-removal] failed to delete room=${roomId}`, err);
      });
      await deleteRoomCode(room.code).catch((err) => {
        console.error(
          `[offline-removal] failed to delete room code=${room.code}`,
          err
        );
      });
      await deleteQuestions(roomId).catch(() => {});
    });
    return;
  }

  const count = countConnectedPlayers(updated.players);
  broadcast(roomId, {
    event: 'player_removed',
    data: { playerId, count },
  });

  if (room.hostId === playerId && updated.hostId !== playerId) {
    broadcast(roomId, {
      event: 'state_sync',
      data: toPublicState(updated),
    });
  }
}
