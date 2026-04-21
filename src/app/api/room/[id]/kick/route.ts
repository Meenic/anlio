import { requireAuth, validateBody } from '@/lib/api/validate';
import { withApiErrors } from '@/lib/api/with-api-errors';
import { kickPlayer } from '@/modules/room/service';
import { registry, unregisterClient } from '@/modules/sse/registry';
import { KickSchema } from '../../schemas';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withApiErrors(async () => {
    const { id: roomId } = await params;

    // 1. Auth
    const { id: playerId } = await requireAuth(request);

    // 2. Validate + guard
    const { targetId } = await validateBody(request, KickSchema);

    await kickPlayer({ roomId, hostId: playerId, targetId });

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

    return new Response(null, { status: 204 });
  });
}
