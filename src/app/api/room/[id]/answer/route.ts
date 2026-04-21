import { jsonError, requireAuth, validateBody } from '@/lib/api/validate';
import { getRoom, RoomConflictError, updateRoom } from '@/modules/room/store';
import { broadcast } from '@/modules/sse/broadcaster';
import { checkAllAnswered, revealQuestion } from '@/modules/game/engine';
import { countConnectedPlayers } from '@/modules/room/selectors';
import { AnswerSchema } from '../../schemas';

function isLockOnFirstSubmit(mode: string | undefined): boolean {
  return mode === 'lock_on_first_submit';
}

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
    const lockOnFirstSubmit = isLockOnFirstSubmit(room.settings.answerMode);
    if (lockOnFirstSubmit && room.answers[playerId] !== undefined) {
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
      if (!r.players[playerId]) return r;
      const alreadyAnswered = r.answers[playerId] !== undefined;
      if (isLockOnFirstSubmit(r.settings.answerMode) && alreadyAnswered) {
        return r;
      }
      if (r.phaseEndsAt !== null && now > r.phaseEndsAt) return r;

      const firstAnsweredAt = r.players[playerId].answeredAt ?? now;
      return {
        ...r,
        answers: { ...r.answers, [playerId]: optionId },
        players: {
          ...r.players,
          [playerId]: {
            ...r.players[playerId],
            answeredAt: firstAnsweredAt,
          },
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

    // Fast-forward only when answers are immutable. In change-allowed mode we
    // keep the question open until timer expiry so players can revise.
    if (lockOnFirstSubmit && checkAllAnswered(updated)) {
      await revealQuestion(roomId);
    }

    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof Response) return err;
    if (err instanceof RoomConflictError) {
      return jsonError(409, 'room_conflict');
    }
    throw err;
  }
}
