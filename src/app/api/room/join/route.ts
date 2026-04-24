import { jsonOk, requireAuth, validateBody } from '@/lib/api/validate';
import { withApiErrors } from '@/lib/api/with-api-errors';
import { joinRoomByCode } from '@/modules/room/actions';
import { JoinRoomSchema } from '../schemas';

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
