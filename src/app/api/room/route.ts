import { jsonOk, requireAuth, validateBody } from '@/lib/api/validate';
import { withApiErrors } from '@/lib/api/with-api-errors';
import { createRoom } from '@/modules/room/actions';
import { CreateRoomSchema } from './schemas';

export async function POST(request: Request) {
  return withApiErrors(async () => {
    const user = await requireAuth(request);
    const body = await validateBody(request, CreateRoomSchema);
    const { id, code } = await createRoom(
      {
        id: user.id,
        name: user.name ?? 'Host',
        image: user.image,
      },
      body.settings
    );
    return jsonOk({ id, code }, 201);
  });
}
