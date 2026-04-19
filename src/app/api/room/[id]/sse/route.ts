import { registerClient, unregisterClient } from '@/modules/sse/registry';
import { getRoom, toPublicState, tryUpdateRoom } from '@/modules/room/store';
import { broadcast, pingClient, sendToPlayer } from '@/modules/sse/broadcaster';
import { auth } from '@/lib/auth';

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
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }
  const playerId = session.user.id;

  // The player must already exist in the room (added via the join/create flow).
  // Refuse otherwise to avoid creating ghost player entries in Redis.
  const initialRoom = await getRoom(roomId);
  if (!initialRoom) return new Response('Room not found', { status: 404 });
  if (!initialRoom.players[playerId]) {
    return new Response('Not a member of this room', { status: 403 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      registerClient(roomId, playerId, controller);

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

        // Best-effort: room may already be deleted by endGame.
        const updated = await tryUpdateRoom(roomId, (room) => ({
          ...room,
          players: {
            ...room.players,
            [playerId]: { ...room.players[playerId], connected: false },
          },
        }));

        // Broadcast so remaining clients can update presence UI AND so the
        // engine's all-answered check doesn't deadlock on a ghost player.
        if (updated) {
          const count = Object.values(updated.players).filter(
            (p) => p.connected
          ).length;
          broadcast(roomId, {
            event: 'player_left',
            data: { playerId, count },
          });
        }

        try {
          controller.close();
        } catch {
          // Stream already closed
        }
      };

      // Mark player as connected (best-effort — room may have been deleted
      // between the membership check above and this write).
      const connectedRoom = await tryUpdateRoom(roomId, (room) => ({
        ...room,
        players: {
          ...room.players,
          [playerId]: { ...room.players[playerId], connected: true },
        },
      }));

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
        const count = Object.values(connectedRoom.players).filter(
          (p) => p.connected
        ).length;
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
