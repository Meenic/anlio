import { jsonError, requireAuth, validateBody } from '@/lib/api/validate';
import { withApiErrors } from '@/lib/api/with-api-errors';
import { updateRoom, toPublicState } from '@/modules/room/store';
import { broadcast } from '@/modules/sse/broadcaster';
import { RematchSchema } from '../../schemas';

/**
 * Reset a finished room back to the lobby so players can start a new game.
 *
 * Only the host may trigger a rematch, and only from the `ended` phase. We
 * preserve `wins` on every player (they're per-room across rematches) but
 * reset `score` and `ready` flags, and clear the cached questions/answers.
 * A `state_sync` broadcast moves every client's UI back to the lobby.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withApiErrors(async () => {
    const { id: roomId } = await params;
    const { id: playerId } = await requireAuth(request);
    await validateBody(request, RematchSchema);

    const updated = await updateRoom(roomId, (r) => {
      if (r.hostId !== playerId) throw jsonError(403, 'not_host');
      if (r.phase !== 'ended') throw jsonError(409, 'wrong_phase');

      const players = { ...r.players };
      for (const [id, p] of Object.entries(players)) {
        players[id] = { ...p, score: 0, ready: false, answeredAt: undefined };
      }

      return {
        ...r,
        phase: 'lobby',
        players,
        questions: [],
        answers: {},
        currentQuestionIndex: 0,
        phaseEndsAt: null,
      };
    });

    broadcast(roomId, { event: 'state_sync', data: toPublicState(updated) });

    return new Response(null, { status: 204 });
  });
}
