import { jsonOk, requireAuth, validateBody } from '@/lib/http';
import { withApiErrors } from '@/lib/http';
import { createRoom } from '@/features/room/service';
import { CreateRoomSchema } from '@/features/room/schemas';

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
