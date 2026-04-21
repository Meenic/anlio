import { requireAuth, validateBody } from '@/lib/api/validate';
import { withApiErrors } from '@/lib/api/with-api-errors';
import { startRoomGame } from '@/modules/room/service';
import { StartGameSchema } from '../../schemas';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withApiErrors(async () => {
    const { id: roomId } = await params;

    // 1. Auth
    const { id: playerId } = await requireAuth(request);

    // 2. Validate + guard
    await validateBody(request, StartGameSchema);

    await startRoomGame({ roomId, playerId });

    return new Response(null, { status: 202 });
  });
}
