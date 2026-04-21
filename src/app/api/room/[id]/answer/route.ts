import { requireAuth, validateBody } from '@/lib/api/validate';
import { withApiErrors } from '@/lib/api/with-api-errors';
import { submitAnswer } from '@/modules/room/service';
import { AnswerSchema } from '../../schemas';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withApiErrors(async () => {
    const { id: roomId } = await params;

    // 1. Auth
    const { id: playerId } = await requireAuth(request);

    // 2. Validate + guard
    const { optionId } = await validateBody(request, AnswerSchema);

    await submitAnswer({ roomId, playerId, optionId });

    return new Response(null, { status: 204 });
  });
}
