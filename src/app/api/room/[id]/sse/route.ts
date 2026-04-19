import { registerClient, unregisterClient } from '@/modules/sse/registry';
import { getRoom, toPublicState, tryUpdateRoom } from '@/modules/room/store';
import { sendToPlayer } from '@/modules/sse/broadcaster';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: roomId } = await params;
  const playerId = new URL(request.url).searchParams.get('playerId');

  if (!playerId) return new Response('Missing playerId', { status: 400 });

  const stream = new ReadableStream({
    async start(controller) {
      registerClient(roomId, playerId, controller);

      // Mark player as connected (room may not exist yet — best-effort)
      try {
        await tryUpdateRoom(roomId, (room) => ({
          ...room,
          players: {
            ...room.players,
            [playerId]: { ...room.players[playerId], connected: true },
          },
        }));
      } catch {
        // Room or player missing — the client will get an error via state_sync
      }

      // Immediately sync state so the client UI renders instantly
      const room = await getRoom(roomId);
      if (room) {
        const safeRoom = toPublicState(room);
        sendToPlayer(roomId, playerId, { event: 'state_sync', data: safeRoom });
      }

      // Handle disconnects
      request.signal.addEventListener('abort', async () => {
        unregisterClient(roomId, playerId);

        try {
          await tryUpdateRoom(roomId, (room) => ({
            ...room,
            players: {
              ...room.players,
              [playerId]: { ...room.players[playerId], connected: false },
            },
          }));
        } catch {
          // Room already deleted (game ended) — nothing to update
        }

        try {
          controller.close();
        } catch {
          // Stream already closed
        }
      });
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
