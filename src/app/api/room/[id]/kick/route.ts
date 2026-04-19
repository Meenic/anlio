import { jsonError, requireAuth, validateBody } from '@/lib/api/validate';
import { getRoom, updateRoom } from '@/modules/room/store';
import { broadcast } from '@/modules/sse/broadcaster';
import { registry, unregisterClient } from '@/modules/sse/registry';
import { KickSchema } from '../../schemas';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: roomId } = await params;

    // 1. Auth
    const { id: playerId } = await requireAuth(request);

    // 2. Validate + guard
    const { targetId } = await validateBody(request, KickSchema);

    const room = await getRoom(roomId);
    if (!room) return jsonError(404, 'room_not_found');
    if (room.hostId !== playerId) return jsonError(403, 'not_host');
    if (room.phase !== 'lobby') return jsonError(409, 'wrong_phase');
    if (targetId === playerId) return jsonError(400, 'cannot_kick_self');
    if (!room.players[targetId]) return jsonError(404, 'target_not_member');

    // 3. Mutate — remove the target from the player map.
    await updateRoom(roomId, (r) => {
      if (!r.players[targetId]) return r;
      const players = { ...r.players };
      delete players[targetId];
      return { ...r, players };
    });

    // Force-close the kicked player's SSE stream. Closing the controller
    // directly does NOT fire `request.signal.abort`, so the SSE route's
    // heartbeat will eventually run its own cleanup — the `if (!players[id])`
    // guard in that cleanup (added for exactly this case) prevents a
    // zombie-player resurrection.
    const controller = registry.get(roomId)?.get(targetId);
    try {
      controller?.close();
    } catch {
      // Stream already closed — nothing to do.
    }
    unregisterClient(roomId, targetId);

    // 4. Broadcast — `player_kicked` is distinct from `player_left` so clients
    // can show a different toast / navigate the kicked user away.
    broadcast(roomId, {
      event: 'player_kicked',
      data: { playerId: targetId },
    });

    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
}
