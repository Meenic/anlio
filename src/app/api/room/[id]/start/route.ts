import { jsonError, requireAuth, validateBody } from '@/lib/api/validate';
import { getRoom } from '@/modules/room/store';
import { startGame } from '@/modules/game/engine';
import { MIN_PLAYERS } from '@/modules/room/constants';
import { StartGameSchema } from '../../schemas';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: roomId } = await params;

    // 1. Auth
    const { id: playerId } = await requireAuth(request);

    // 2. Validate + guard
    await validateBody(request, StartGameSchema);

    const room = await getRoom(roomId);
    if (!room) return jsonError(404, 'room_not_found');
    if (room.hostId !== playerId) return jsonError(403, 'not_host');
    if (room.phase !== 'lobby') return jsonError(409, 'wrong_phase');

    const connected = Object.values(room.players).filter((p) => p.connected);
    if (connected.length < MIN_PLAYERS) {
      return jsonError(
        409,
        'not_enough_players',
        `At least ${MIN_PLAYERS} connected players are required to start.`
      );
    }

    // Every connected non-host player must be ready. Host is implicitly ready.
    const pending = connected.filter(
      (p) => p.id !== room.hostId && !p.ready
    );
    if (pending.length > 0) {
      return jsonError(409, 'not_all_ready');
    }

    // 3 + 4. Hand off to the engine — it performs the state transition
    // (`updateRoom`) and broadcasts `game_starting` itself, then schedules
    // the first question.
    await startGame(roomId);

    return new Response(null, { status: 202 });
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
}
