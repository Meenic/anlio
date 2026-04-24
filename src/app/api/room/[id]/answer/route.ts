import { requireAuth, validateBody } from '@/lib/http';
import { withApiErrors } from '@/lib/http';
import { submitAnswer } from '@/features/room/service';
import { AnswerSchema } from '@/features/room/schemas';

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
