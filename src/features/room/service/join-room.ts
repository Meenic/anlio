import { jsonError } from '@/lib/http';
import { getRoomIdByCode, updateRoom } from '../store';
import { MAX_PLAYERS } from '../constants';
import type { Player } from '../types';

/**
 * Idempotent room join. Safe to call even if the user is already a member
 * (returns the existing room state). Invoked both by `/api/room/join` and
 * by the RSC / Server Action prehydration path — there is ONE source of truth.
 */
export async function joinRoomByCode(
  code: string,
  user: { id: string; name: string; image?: string | null }
): Promise<{ roomId: string }> {
  const roomId = await getRoomIdByCode(code);
  if (!roomId) throw jsonError(404, 'room_not_found');

  const player: Player = {
    id: user.id,
    name: user.name,
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

  return { roomId };
}
