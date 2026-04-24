import { jsonError, requireAuth, validateBody } from '@/lib/http';
import { withApiErrors } from '@/lib/http';
import { updateRoom } from '@/features/room/store';
import { broadcast } from '@/features/realtime/broadcaster';
import { cancelOfflineRemovalTimer } from '@/features/realtime/offline-removal';
import { registry, unregisterClient } from '@/features/realtime/registry';
import { KickSchema } from '@/features/room/schemas';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withApiErrors(async () => {
    const { id: roomId } = await params;
    const { id: playerId } = await requireAuth(request);
    const { targetId } = await validateBody(request, KickSchema);

    await updateRoom(roomId, (r) => {
      if (r.hostId !== playerId) throw jsonError(403, 'not_host');
      if (r.phase !== 'lobby') throw jsonError(409, 'wrong_phase');
      if (targetId === playerId) throw jsonError(400, 'cannot_kick_self');
      if (!r.players[targetId]) throw jsonError(404, 'target_not_member');

      const players = { ...r.players };
      delete players[targetId];
      return { ...r, players };
    });

    cancelOfflineRemovalTimer(roomId, targetId);
    broadcast(roomId, { event: 'player_kicked', data: { playerId: targetId } });

    // Force-close the kicked player's SSE stream.
    const controller = registry.get(roomId)?.get(targetId);
    try {
      controller?.close();
    } catch {
      // Stream already closed — nothing to do.
    }
    unregisterClient(roomId, targetId);

    return new Response(null, { status: 204 });
  });
}
