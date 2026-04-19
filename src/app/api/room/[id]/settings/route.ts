import { jsonError, requireAuth, validateBody } from '@/lib/api/validate';
import { getRoom, updateRoom } from '@/modules/room/store';
import { broadcast } from '@/modules/sse/broadcaster';
import { UpdateSettingsSchema } from '../../schemas';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: roomId } = await params;

    // 1. Auth
    const { id: playerId } = await requireAuth(request);

    // 2. Validate + guard
    const patch = await validateBody(request, UpdateSettingsSchema);

    const room = await getRoom(roomId);
    if (!room) return jsonError(404, 'room_not_found');
    if (room.hostId !== playerId) return jsonError(403, 'not_host');
    if (room.phase !== 'lobby') return jsonError(409, 'wrong_phase');

    // 3. Mutate — shallow merge.
    const updated = await updateRoom(roomId, (r) => ({
      ...r,
      settings: { ...r.settings, ...patch },
    }));

    // 4. Broadcast the final merged settings so every client is in sync.
    broadcast(roomId, {
      event: 'settings_updated',
      data: updated.settings,
    });

    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
}
