import { requireAuth, validateBody } from '@/lib/api/validate';
import { withApiErrors } from '@/lib/api/with-api-errors';
import { updateRoomSettings } from '@/modules/room/service';
import { UpdateSettingsSchema } from '../../schemas';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withApiErrors(async () => {
    const { id: roomId } = await params;

    // 1. Auth
    const { id: playerId } = await requireAuth(request);

    // 2. Validate + guard
    const patch = await validateBody(request, UpdateSettingsSchema);

    await updateRoomSettings({ roomId, playerId, patch });

    return new Response(null, { status: 204 });
  });
}
