import { jsonError, requireAuth, validateBody } from '@/lib/api/validate';
import {
  deleteRoom,
  deleteRoomCode,
  getRoom,
  toPublicState,
  updateRoom,
} from '@/modules/room/store';
import { broadcast } from '@/modules/sse/broadcaster';
import { LeaveRoomSchema } from '../../schemas';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: roomId } = await params;

    // 1. Auth
    const { id: playerId } = await requireAuth(request);

    // 2. Validate + guard
    await validateBody(request, LeaveRoomSchema);

    const room = await getRoom(roomId);
    if (!room) return jsonError(404, 'room_not_found');
    if (!room.players[playerId]) return jsonError(403, 'not_a_member');

    // If this is the last player, delete the room entirely.
    const remainingIds = Object.keys(room.players).filter(
      (id) => id !== playerId
    );

    if (remainingIds.length === 0) {
      await deleteRoom(roomId);
      await deleteRoomCode(room.code);
      return new Response(null, { status: 204 });
    }

    // 3. Mutate — remove the player, transfer host if they were hosting.
    const wasHost = room.hostId === playerId;
    const newHostId = wasHost ? remainingIds[0] : room.hostId;

    const updated = await updateRoom(roomId, (r) => {
      const players = { ...r.players };
      delete players[playerId];
      return {
        ...r,
        hostId: newHostId,
        players,
      };
    });

    // 4. Broadcast
    const count = Object.values(updated.players).filter((p) => p.connected)
      .length;
    broadcast(roomId, {
      event: 'player_left',
      data: { playerId, count },
    });

    // If the host changed, resend state_sync so every client picks up the
    // new `hostId` immediately instead of waiting for the next event.
    if (wasHost) {
      broadcast(roomId, {
        event: 'state_sync',
        data: toPublicState(updated),
      });
    }

    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
}
