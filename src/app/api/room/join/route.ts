import {
  jsonError,
  jsonOk,
  requireAuth,
  validateBody,
} from '@/lib/api/validate';
import { getRoom, getRoomIdByCode, updateRoom } from '@/modules/room/store';
import { MAX_PLAYERS } from '@/modules/room/constants';
import type { Player } from '@/modules/room/types';
import { JoinRoomSchema } from '../schemas';

export async function POST(request: Request) {
  try {
    // 1. Auth
    const user = await requireAuth(request);
    const playerId = user.id;

    // 2. Validate + guard
    const { code } = await validateBody(request, JoinRoomSchema);

    const roomId = await getRoomIdByCode(code);
    if (!roomId) return jsonError(404, 'room_not_found');

    const room = await getRoom(roomId);
    if (!room) return jsonError(404, 'room_not_found');

    // Idempotent re-join: if already a member, return success even after the
    // lobby phase so refresh/direct-link reconnects keep working.
    if (room.players[playerId]) {
      return jsonOk({ id: roomId, code: room.code });
    }

    if (room.phase !== 'lobby') {
      return jsonError(409, 'game_already_started');
    }

    if (Object.keys(room.players).length >= MAX_PLAYERS) {
      return jsonError(409, 'room_full');
    }

    // 3. Mutate atomically.
    const player: Player = {
      id: playerId,
      name: user.name ?? 'Player',
      avatarUrl: user.image ?? undefined,
      score: 0,
      ready: false,
      connected: false, // flips to true when the SSE stream opens
    };

    await updateRoom(roomId, (r) => {
      // Re-check inside the updater in case of races.
      if (r.players[playerId]) return r;
      if (Object.keys(r.players).length >= MAX_PLAYERS) return r;
      return {
        ...r,
        players: { ...r.players, [playerId]: player },
      };
    });

    // 4. No broadcast here — SSE route emits `player_joined` on connect.
    return jsonOk({ id: roomId, code: room.code });
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
}
