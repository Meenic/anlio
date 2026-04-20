import { jsonError, requireAuth, validateBody } from '@/lib/api/validate';
import { getRoom, updateRoom } from '@/modules/room/store';
import { broadcast } from '@/modules/sse/broadcaster';
import { checkAllAnswered, revealQuestion } from '@/modules/game/engine';
import { countConnectedPlayers } from '@/modules/room/selectors';
import { AnswerSchema } from '../../schemas';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: roomId } = await params;

    // 1. Auth
    const { id: playerId } = await requireAuth(request);

    // 2. Validate + guard
    const { optionId } = await validateBody(request, AnswerSchema);

    const room = await getRoom(roomId);
    if (!room) return jsonError(404, 'room_not_found');
    if (!room.players[playerId]) return jsonError(403, 'not_a_member');
    if (room.phase !== 'question') return jsonError(409, 'wrong_phase');
    if (room.answers[playerId] !== undefined) {
      return jsonError(409, 'already_answered');
    }
    // Defensive: the reveal timer should have already fired, but if the
    // request raced past it, reject rather than accept a late answer.
    if (room.phaseEndsAt !== null && Date.now() > room.phaseEndsAt) {
      return jsonError(410, 'phase_expired');
    }

    // 3. Mutate atomically — record the answer and the timestamp used by
    // the scoring helper. Re-check guards inside the updater to avoid races.
    const now = Date.now();
    const updated = await updateRoom(roomId, (r) => {
      if (r.phase !== 'question') return r;
      if (r.answers[playerId] !== undefined) return r;
      return {
        ...r,
        answers: { ...r.answers, [playerId]: optionId },
        players: {
          ...r.players,
          [playerId]: { ...r.players[playerId], answeredAt: now },
        },
      };
    });

    // 4. Broadcast aggregate progress.
    const connectedTotal = countConnectedPlayers(updated.players);
    broadcast(roomId, {
      event: 'answer_count',
      data: {
        answered: Object.keys(updated.answers).length,
        total: connectedTotal,
      },
    });

    // Fast-forward to reveal if every connected player has locked in.
    // `revealQuestion` has its own phase guard so a late call is a no-op.
    if (checkAllAnswered(updated)) {
      await revealQuestion(roomId);
    }

    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
}
