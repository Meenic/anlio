import { registerClient, unregisterClient } from '@/modules/sse/registry';
import { getRoom, toPublicState, tryUpdateRoom } from '@/modules/room/store';
import { broadcast, pingClient, sendToPlayer } from '@/modules/sse/broadcaster';
import { jsonError, requireAuth } from '@/lib/api/validate';
import { countConnectedPlayers } from '@/modules/room/selectors';
import {
  cancelOfflineRemovalTimer,
  scheduleOfflineRemovalTimer,
} from '@/modules/sse/offline-removal';

/** Heartbeat interval in ms. Short enough to catch dead sockets quickly,
 *  long enough not to waste bandwidth. */
const HEARTBEAT_INTERVAL_MS = 15_000;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: roomId } = await params;

  // --- SECURITY: identity is derived from the verified server session, NOT
  // from client-supplied query params. Otherwise anyone who knows a room id
  // could impersonate any player in that room. ---
  //
  // Note: unlike other routes we catch+return directly instead of using a
  // try/catch wrapper around the whole handler — once the stream body is
  // returned, a thrown `Response` from `requireAuth` can no longer be
  // converted into the HTTP response.
  const authResult = await requireAuth(request).catch((e) => e as Response);
  if (authResult instanceof Response) return authResult;
  const playerId = authResult.id;

  // The player must already exist in the room (added via the join/create flow).
  // Refuse otherwise to avoid creating ghost player entries in Redis.
  const initialRoom = await getRoom(roomId);
  if (!initialRoom) return jsonError(404, 'room_not_found');
  if (!initialRoom.players[playerId]) {
    return jsonError(403, 'not_a_member');
  }

  const stream = new ReadableStream({
    async start(controller) {
      registerClient(roomId, playerId, controller);
      cancelOfflineRemovalTimer(roomId, playerId);

      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let cleaned = false;

      /** Shared cleanup path. Runs on abort, dead heartbeat, or error.
       *  Idempotent — safe to call multiple times. */
      const cleanup = async () => {
        if (cleaned) return;
        cleaned = true;

        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }

        unregisterClient(roomId, playerId);

        let disconnectedAt: number | null = null;

        // Best-effort: room may already be deleted by endGame.
        // The `if (!room.players[playerId])` guard is CRITICAL for the kick
        // and leave flows — those routes remove the player entry before this
        // cleanup runs, and without the guard we'd spread `undefined` and
        // resurrect the player as `{ connected: false }`, also triggering a
        // spurious `player_left` broadcast right after `player_kicked`.
        const updated = await tryUpdateRoom(roomId, (room) => {
          const player = room.players[playerId];
          if (!player || !player.connected) return room;

          const now = Date.now();
          disconnectedAt = now;

          return {
            ...room,
            players: {
              ...room.players,
              [playerId]: {
                ...player,
                connected: false,
                disconnectedAt: now,
              },
            },
          };
        });

        // Broadcast so remaining clients can update presence UI. We keep the
        // player in-room as `connected=false` for a grace window and only
        // auto-remove if they fail to reconnect in time.
        if (updated && disconnectedAt !== null) {
          const count = countConnectedPlayers(updated.players);
          broadcast(roomId, {
            event: 'player_left',
            data: { playerId, count, disconnectedAt },
          });

          scheduleOfflineRemovalTimer(roomId, playerId, disconnectedAt);
        }

        try {
          controller.close();
        } catch {
          // Stream already closed
        }
      };

      // Mark player as connected (best-effort — room may have been deleted
      // between the membership check above and this write).
      const connectedRoom = await tryUpdateRoom(roomId, (room) => {
        const player = room.players[playerId];
        if (!player) return room;

        const { disconnectedAt: _disconnectedAt, ...rest } = player;
        return {
          ...room,
          players: {
            ...room.players,
            [playerId]: { ...rest, connected: true },
          },
        };
      });

      if (!connectedRoom || !connectedRoom.players[playerId]) {
        unregisterClient(roomId, playerId);
        try {
          controller.close();
        } catch {
          // Stream already closed
        }
        return;
      }

      if (connectedRoom) {
        // Immediately sync public state so the client UI renders instantly.
        // `toPublicState` strips questions + individual answers but exposes
        // `answerCount` so a reconnecting client can render the answered
        // indicator correctly.
        sendToPlayer(roomId, playerId, {
          event: 'state_sync',
          data: toPublicState(connectedRoom),
        });

        // Symmetric to the `player_left` broadcast in `cleanup`: tell the
        // rest of the room their presence indicators are stale so they
        // don't have to wait for the next unrelated state update.
        const count = countConnectedPlayers(connectedRoom.players);
        broadcast(roomId, {
          event: 'player_joined',
          data: { player: connectedRoom.players[playerId], count },
        });
      }

      // Heartbeat: detect dead sockets that never trigger `abort`
      // (phone locks, laptop sleep, NAT drops, etc.).
      heartbeat = setInterval(() => {
        const alive = pingClient(roomId, playerId);
        if (!alive) {
          void cleanup();
        }
      }, HEARTBEAT_INTERVAL_MS);

      // Clean disconnects.
      request.signal.addEventListener('abort', () => void cleanup());
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
