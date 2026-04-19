import { jsonError, requireAuth, validateBody } from '@/lib/api/validate';
import { getRoom, updateRoom } from '@/modules/room/store';
import { broadcast } from '@/modules/sse/broadcaster';
import { ReadySchema } from '../../schemas';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: roomId } = await params;

    // 1. Auth
    const { id: playerId } = await requireAuth(request);

    // 2. Validate + guard
    const { ready } = await validateBody(request, ReadySchema);

    const room = await getRoom(roomId);
    if (!room) return jsonError(404, 'room_not_found');
    if (!room.players[playerId]) return jsonError(403, 'not_a_member');
    if (room.phase !== 'lobby') return jsonError(409, 'wrong_phase');

    // No-op fast path
    if (room.players[playerId].ready === ready) {
      return new Response(null, { status: 204 });
    }

    // 3. Mutate
    await updateRoom(roomId, (r) => ({
      ...r,
      players: {
        ...r.players,
        [playerId]: { ...r.players[playerId], ready },
      },
    }));

    // 4. Broadcast
    broadcast(roomId, {
      event: 'ready_changed',
      data: { playerId, ready },
    });

    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
}
