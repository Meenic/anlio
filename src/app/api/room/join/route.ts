import {
  jsonError,
  jsonOk,
  requireAuth,
  validateBody,
} from '@/lib/api/validate';
import { withApiErrors } from '@/lib/api/with-api-errors';
import { getRoomIdByCode, updateRoom } from '@/modules/room/store';
import { MAX_PLAYERS } from '@/modules/room/constants';
import { JoinRoomSchema } from '../schemas';
import type { Player } from '@/modules/room/types';

export async function POST(request: Request) {
  return withApiErrors(async () => {
    const user = await requireAuth(request);
    const { code } = await validateBody(request, JoinRoomSchema);

    const roomId = await getRoomIdByCode(code);
    if (!roomId) throw jsonError(404, 'room_not_found');

    const player: Player = {
      id: user.id,
      name: user.name ?? 'Player',
      avatarUrl: user.image ?? undefined,
      score: 0,
      wins: 0,
      ready: false,
      connected: false,
    };

    await updateRoom(roomId, (r) => {
      if (r.players[user.id]) return r;
      if (r.phase !== 'lobby') throw jsonError(409, 'wrong_phase');
      if (Object.keys(r.players).length >= MAX_PLAYERS) {
        throw jsonError(409, 'room_full');
      }
      return {
        ...r,
        players: { ...r.players, [user.id]: player },
      };
    });

    return jsonOk({ id: roomId, code });
  });
}
