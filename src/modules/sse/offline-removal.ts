import { OFFLINE_PLAYER_GRACE_MS } from '@/modules/room/constants';
import { countConnectedPlayers } from '@/modules/room/selectors';
import {
  deleteRoom,
  deleteRoomCode,
  getRoom,
  setRoom,
  toPublicState,
} from '@/modules/room/store';
import type { InternalRoomState } from '@/modules/room/types';
import { broadcast } from './broadcaster';
import { registry } from './registry';

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

  const player = room.players[playerId];
  if (!player || player.connected) return;
  if (player.disconnectedAt !== disconnectedAt) return;

  const players = { ...room.players };
  delete players[playerId];
  const remainingIds = Object.keys(players);

  if (remainingIds.length === 0) {
    await deleteRoom(roomId);
    await deleteRoomCode(room.code);
    return;
  }

  const wasHost = room.hostId === playerId;
  const nextHostId = wasHost ? remainingIds[0] : room.hostId;

  const updated: InternalRoomState = {
    ...room,
    hostId: nextHostId,
    players,
  };

  await setRoom(updated);

  const count = countConnectedPlayers(updated.players);
  broadcast(roomId, {
    event: 'player_removed',
    data: { playerId, count },
  });

  if (wasHost) {
    broadcast(roomId, {
      event: 'state_sync',
      data: toPublicState(updated),
    });
  }
}
