import { registerClient, unregisterClient } from '@/features/realtime/registry';
import { getRoom, toPublicState, tryUpdateRoom } from '@/features/room/store';
import {
  broadcast,
  pingClient,
  sendToPlayer,
} from '@/features/realtime/broadcaster';
import { HttpError, httpErrorToResponse, requireAuth } from '@/lib/http';
import { countConnectedPlayers } from '@/features/room/selectors';
import {
  cancelOfflineRemovalTimer,
  scheduleOfflineRemovalTimer,
} from '@/features/realtime/offline-removal';

/** Heartbeat interval in ms. Short enough to catch dead sockets quickly,
 *  long enough not to waste bandwidth. */
const HEARTBEAT_INTERVAL_MS = 15_000;

/** Return a minimal SSE stream that emits a single `error` event and then
 *  closes. Used for fatal pre-flight rejections (room not found, not a member)
 *  so the client can handle them gracefully instead of getting a plain JSON
 *  response that the browser's EventSource cannot parse. */
function sseErrorStream(message: string): Response {
  const stream = new ReadableStream({
    start(controller) {
      const payload = JSON.stringify({ message });
      controller.enqueue(
        new TextEncoder().encode(`event: error\ndata: ${payload}\n\n`)
      );
      controller.close();
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: roomId } = await params;

  // --- SECURITY: identity is derived from the verified server session, NOT
  // from client-supplied query params. Otherwise anyone who knows a room id
  // could impersonate any player in that room. ---
  let playerId: string;
  try {
    playerId = (await requireAuth(request)).id;
  } catch (error) {
    if (error instanceof HttpError) return httpErrorToResponse(error);
    throw error;
  }

  // The player must already exist in the room (added via the join/create flow).
  // Refuse otherwise to avoid creating ghost player entries in Redis.
  const initialRoom = await getRoom(roomId);
  if (!initialRoom) return sseErrorStream('room_not_found');
  if (!initialRoom.players[playerId]) {
    return sseErrorStream('not_a_member');
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

      // PAINT-FIRST ORDER: we already fetched `initialRoom` during the
      // pre-flight membership check. Ship the `state_sync` to the client
      // immediately — one TCP packet, no Redis write on the critical path —
      // so the browser can render the live room while we, in parallel, mark
      // the player `connected=true` and broadcast `player_joined` to peers.
      //
      // Flipping this order cuts ~1 Redis RTT off first-paint latency for
      // the joining client. Other clients see a marginally later
      // `player_joined` (still within the same tick for hot Redis), which
      // is a non-issue since presence is best-effort anyway.
      sendToPlayer(roomId, playerId, {
        event: 'state_sync',
        data: toPublicState(initialRoom),
      });

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

      // Re-sync with the authoritative post-write snapshot so any state that
      // changed between the pre-flight read and the connected-flag write is
      // reflected on the client. Cheap: same controller, same encoder.
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
