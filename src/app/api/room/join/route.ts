import { jsonOk, requireAuth, validateBody } from '@/lib/http';
import { withApiErrors } from '@/lib/http';
import { joinRoomByCode } from '@/features/room/service';
import { JoinRoomSchema } from '@/features/room/schemas';

export async function POST(request: Request) {
  return withApiErrors(async () => {
    const user = await requireAuth(request);
    const { code } = await validateBody(request, JoinRoomSchema);
    const { roomId } = await joinRoomByCode(code, {
      id: user.id,
      name: user.name ?? 'Player',
      image: user.image,
    });
    return jsonOk({ id: roomId, code });
  });
}
