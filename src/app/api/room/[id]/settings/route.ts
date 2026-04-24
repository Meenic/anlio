import { jsonError, requireAuth, validateBody } from '@/lib/http';
import { withApiErrors } from '@/lib/http';
import { updateRoom } from '@/features/room/store';
import { broadcast } from '@/features/realtime/broadcaster';
import { UpdateSettingsSchema } from '@/features/room/schemas';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withApiErrors(async () => {
    const { id: roomId } = await params;
    const { id: playerId } = await requireAuth(request);
    const patch = await validateBody(request, UpdateSettingsSchema);

    let stateChanged = false;
    const updated = await updateRoom(roomId, (r) => {
      if (r.hostId !== playerId) throw jsonError(403, 'not_host');
      if (r.phase !== 'lobby') throw jsonError(409, 'wrong_phase');

      stateChanged = true;
      return { ...r, settings: { ...r.settings, ...patch } };
    });

    if (stateChanged) {
      broadcast(roomId, { event: 'settings_updated', data: updated.settings });
    }

    return new Response(null, { status: 204 });
  });
}
