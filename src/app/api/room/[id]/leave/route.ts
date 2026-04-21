import { requireAuth, validateBody } from '@/lib/api/validate';
import { withApiErrors } from '@/lib/api/with-api-errors';
import { leaveRoom } from '@/modules/room/service';
import { LeaveRoomSchema } from '../../schemas';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withApiErrors(async () => {
    const { id: roomId } = await params;

    // 1. Auth
    const { id: playerId } = await requireAuth(request);

    // 2. Validate + guard
    await validateBody(request, LeaveRoomSchema);

    await leaveRoom({ roomId, playerId });

    return new Response(null, { status: 204 });
  });
}
