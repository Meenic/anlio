import { jsonOk, requireAuth, validateBody } from '@/lib/api/validate';
import { withApiErrors } from '@/lib/api/with-api-errors';
import { createRoom } from '@/modules/room/service';
import { CreateRoomSchema, DEFAULT_ROOM_SETTINGS } from './schemas';

export async function POST(request: Request) {
  return withApiErrors(async () => {
    // 1. Auth
    const user = await requireAuth(request);

    // 2. Validate + guard
    const body = await validateBody(request, CreateRoomSchema);

    const { id, code } = await createRoom({
      user,
      settings: body.settings,
      defaultSettings: DEFAULT_ROOM_SETTINGS,
    });

    // 4. No broadcast — no listeners yet.
    return jsonOk({ id, code }, 201);
  });
}
