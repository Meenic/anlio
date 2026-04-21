import { jsonError, requireAuth, validateBody } from '@/lib/api/validate';
import { getRoom, RoomConflictError, updateRoom } from '@/modules/room/store';
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
    const updated = await updateRoom(roomId, (r) => {
      if (r.phase !== 'lobby') return r;
      const player = r.players[playerId];
      if (!player) return r;
      if (player.ready === ready) return r;
      return {
        ...r,
        players: {
          ...r.players,
          [playerId]: { ...player, ready },
        },
      };
    });

    // 4. Broadcast
    if (updated.players[playerId]?.ready === room.players[playerId].ready) {
      return new Response(null, { status: 204 });
    }

    broadcast(roomId, {
      event: 'ready_changed',
      data: { playerId, ready },
    });

    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof Response) return err;
    if (err instanceof RoomConflictError) {
      return jsonError(409, 'room_conflict');
    }
    throw err;
  }
}
