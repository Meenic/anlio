import { jsonError, requireAuth, validateBody } from '@/lib/api/validate';
import { withApiErrors } from '@/lib/api/with-api-errors';
import { updateRoom } from '@/modules/room/store';
import { broadcast } from '@/modules/sse/broadcaster';
import { ReadySchema } from '../../schemas';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withApiErrors(async () => {
    const { id: roomId } = await params;
    const { id: playerId } = await requireAuth(request);
    const { ready } = await validateBody(request, ReadySchema);

    let stateChanged = false;
    await updateRoom(roomId, (r) => {
      if (!r.players[playerId]) throw jsonError(403, 'not_a_member');
      if (r.phase !== 'lobby') throw jsonError(409, 'wrong_phase');

      const player = r.players[playerId];
      if (player.ready === ready) return r;

      stateChanged = true;
      return {
        ...r,
        players: { ...r.players, [playerId]: { ...player, ready } },
      };
    });

    if (stateChanged) {
      broadcast(roomId, { event: 'ready_changed', data: { playerId, ready } });
    }

    return new Response(null, { status: 204 });
  });
}
