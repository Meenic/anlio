import { jsonError } from '@/lib/http';
import { broadcast } from '@/features/realtime/broadcaster';
import { checkAllAnswered, revealQuestion } from '@/features/game/engine';
import { updateRoom } from '../store';
import { countConnectedPlayers } from '../selectors';

/**
 * Submit an answer during the `question` phase.
 *
 * Runs under the per-room mutex (via `updateRoom`) — the whole validate →
 * write → broadcast path is serialized per room, so we need no Lua script
 * and no retries. All gating (phase, membership, deadline, already-answered)
 * is expressed as inline `throw jsonError(...)` inside the updater.
 */
export async function submitAnswer(params: {
  roomId: string;
  playerId: string;
  optionId: string;
}) {
  const { roomId, playerId, optionId } = params;
  const answeredAt = Date.now();

  const updated = await updateRoom(roomId, (r) => {
    if (!r.players[playerId]) throw jsonError(403, 'not_a_member');
    if (r.phase !== 'question') throw jsonError(409, 'wrong_phase');
    if (r.phaseEndsAt !== null && answeredAt > r.phaseEndsAt) {
      throw jsonError(410, 'phase_expired');
    }

    const lockOnFirstSubmit = r.settings.answerMode === 'lock_on_first_submit';
    if (lockOnFirstSubmit && r.answers[playerId] !== undefined) {
      throw jsonError(409, 'already_answered');
    }

    const firstAnsweredAt = r.players[playerId].answeredAt ?? answeredAt;
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
  }).catch((err) => {
    if (err instanceof Error && err.message === 'Room not found') {
      throw jsonError(404, 'room_not_found');
    }
    throw err;
  });

  broadcast(roomId, {
    event: 'answer_count',
    data: {
      answered: Object.keys(updated.answers).length,
      total: countConnectedPlayers(updated.players),
    },
  });

  const lockOnFirstSubmit =
    updated.settings.answerMode === 'lock_on_first_submit';
  if (lockOnFirstSubmit && checkAllAnswered(updated)) {
    await revealQuestion(roomId);
  }
}
