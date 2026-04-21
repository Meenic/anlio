import { jsonOk, requireAuth, validateBody } from '@/lib/api/validate';
import { withApiErrors } from '@/lib/api/with-api-errors';
import { joinRoom } from '@/modules/room/service';
import { JoinRoomSchema } from '../schemas';

export async function POST(request: Request) {
  return withApiErrors(async () => {
    // 1. Auth
    const user = await requireAuth(request);

    // 2. Validate + guard
    const { code } = await validateBody(request, JoinRoomSchema);

    const joined = await joinRoom({ user, code });

    // 4. No broadcast here — SSE route emits `player_joined` on connect.
    return jsonOk(joined);
  });
}
