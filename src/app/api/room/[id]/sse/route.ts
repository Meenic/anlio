import { registerClient, unregisterClient } from '@/modules/sse/registry';
import { getRoom, updateRoom } from '@/modules/room/store';
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

      // Mark player as connected
      await updateRoom(roomId, (room) => ({
        ...room,
        players: {
          ...room.players,
          [playerId]: { ...room.players[playerId], connected: true },
        },
      }));

      // Immediately sync state so the client UI renders instantly
      const room = await getRoom(roomId);
      if (room) {
        sendToPlayer(roomId, playerId, { event: 'state_sync', data: room });
      }

      // Handle disconnects
      request.signal.addEventListener('abort', async () => {
        unregisterClient(roomId, playerId);

        await updateRoom(roomId, (room) => ({
          ...room,
          players: {
            ...room.players,
            [playerId]: { ...room.players[playerId], connected: false },
          },
        }));

        controller.close();
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
