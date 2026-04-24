import { jsonError, requireAuth, validateBody } from '@/lib/http';
import { withApiErrors } from '@/lib/http';
import { getRoom } from '@/features/room/store';
import { startGame } from '@/features/game/engine';
import { getConnectedPlayers } from '@/features/room/selectors';
import { MIN_PLAYERS } from '@/features/room/constants';
import { StartGameSchema } from '@/features/room/schemas';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withApiErrors(async () => {
    const { id: roomId } = await params;
    const { id: playerId } = await requireAuth(request);
    await validateBody(request, StartGameSchema);

    const room = await getRoom(roomId);
    if (!room) throw jsonError(404, 'room_not_found');
    if (room.hostId !== playerId) throw jsonError(403, 'not_host');
    if (room.phase !== 'lobby') throw jsonError(409, 'wrong_phase');

    const connected = getConnectedPlayers(room.players);
    if (connected.length < MIN_PLAYERS) {
      throw jsonError(
        409,
        'not_enough_players',
        `At least ${MIN_PLAYERS} connected players are required to start.`
      );
    }
    const pending = connected.filter((p) => p.id !== room.hostId && !p.ready);
    if (pending.length > 0) throw jsonError(409, 'not_all_ready');

    await startGame(roomId, room.settings);

    return new Response(null, { status: 202 });
  });
}
