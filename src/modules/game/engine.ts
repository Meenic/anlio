import { getRoom, updateRoom, deleteRoom } from '../room/store';
import { broadcast } from '../sse/broadcaster';
import { calculateTimeBonus } from './scoring';
import { fetchQuestions } from './questions';
import { db } from '@/drizzle/db';
import { gameResults } from '@/drizzle/schemas/game-schema';
import { nanoid } from 'nanoid';
import type { InternalRoomState, Player } from '../room/types';
import {
  STARTING_DELAY_MS,
  REVEAL_DELAY_MS,
  LEADERBOARD_DELAY_MS,
  BASE_SCORE,
} from './constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if every connected player has locked in an answer. */
export function checkAllAnswered(room: InternalRoomState): boolean {
  const connectedPlayers = Object.values(room.players).filter(
    (p) => p.connected
  );
  if (connectedPlayers.length === 0) return false;
  return connectedPlayers.every((p) => room.answers[p.id] !== undefined);
}

/** Return players sorted by score descending. */
function rankedPlayers(players: Record<string, Player>): Player[] {
  return Object.values(players).sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Phase transitions
// ---------------------------------------------------------------------------
// TODO: setTimeout lives in process memory and will NOT survive serverless
// cold-starts or multi-instance deployments. Consider migrating to a durable
// scheduler (e.g. Upstash QStash) for production use.
// ---------------------------------------------------------------------------

export async function startGame(roomId: string) {
  const room = await getRoom(roomId);
  if (!room || room.phase !== 'lobby') return;

  const questions = await fetchQuestions(room.settings);

  await updateRoom(roomId, (r) => ({
    ...r,
    phase: 'starting',
    questions,
    currentQuestionIndex: 0,
    answers: {},
    phaseEndsAt: Date.now() + STARTING_DELAY_MS,
  }));

  broadcast(roomId, {
    event: 'game_starting',
    data: { startsIn: STARTING_DELAY_MS / 1000 },
  });

  setTimeout(() => pushQuestion(roomId), STARTING_DELAY_MS);
}

export async function pushQuestion(roomId: string) {
  const room = await getRoom(roomId);
  if (!room || (room.phase !== 'starting' && room.phase !== 'leaderboard')) {
    return;
  }

  const question = room.questions[room.currentQuestionIndex];
  if (!question) return;

  const timeLimit = room.settings.timePerQuestion;
  const phaseEndsAt = Date.now() + timeLimit * 1000;

  await updateRoom(roomId, (r) => ({
    ...r,
    phase: 'question',
    answers: {},
    phaseEndsAt,
  }));

  // Strip the correct answer to prevent network-tab cheating
  const { correctOptionId: _c, category: _cat, ...safeQuestion } = question;

  broadcast(roomId, {
    event: 'question',
    data: {
      index: room.currentQuestionIndex,
      total: room.questions.length,
      question: safeQuestion,
      phaseEndsAt,
    },
  });

  setTimeout(() => revealQuestion(roomId), timeLimit * 1000);
}

export async function revealQuestion(roomId: string) {
  const current = await getRoom(roomId);
  if (!current || current.phase !== 'question') return;

  const question = current.questions[current.currentQuestionIndex];
  const updatedPlayers = { ...current.players };
  const timeLimitSeconds = current.settings.timePerQuestion;
  const questionStartedAt = current.phaseEndsAt! - timeLimitSeconds * 1000;

  for (const [playerId, optionId] of Object.entries(current.answers)) {
    if (optionId === question.correctOptionId) {
      const player = updatedPlayers[playerId];
      const timeBonus = calculateTimeBonus(
        player.answeredAt!,
        questionStartedAt,
        timeLimitSeconds
      );

      updatedPlayers[playerId] = {
        ...player,
        score: player.score + BASE_SCORE + timeBonus,
      };
    }
  }

  const updated = await updateRoom(roomId, (r) => ({
    ...r,
    phase: 'reveal',
    players: updatedPlayers,
    phaseEndsAt: Date.now() + REVEAL_DELAY_MS,
  }));

  broadcast(roomId, {
    event: 'reveal',
    data: {
      correctOptionId: question.correctOptionId,
      answers: updated.answers,
      players: updated.players,
    },
  });

  setTimeout(() => showLeaderboard(roomId), REVEAL_DELAY_MS);
}

export async function showLeaderboard(roomId: string) {
  const room = await getRoom(roomId);
  if (!room || room.phase !== 'reveal') return;

  const isLastQuestion = room.currentQuestionIndex >= room.questions.length - 1;

  if (isLastQuestion) {
    await endGame(roomId);
    return;
  }

  await updateRoom(roomId, (r) => ({
    ...r,
    phase: 'leaderboard',
    currentQuestionIndex: r.currentQuestionIndex + 1,
    phaseEndsAt: Date.now() + LEADERBOARD_DELAY_MS,
  }));

  broadcast(roomId, {
    event: 'leaderboard',
    data: {
      players: rankedPlayers(room.players),
      nextIn: LEADERBOARD_DELAY_MS / 1000,
    },
  });

  setTimeout(() => pushQuestion(roomId), LEADERBOARD_DELAY_MS);
}

export async function endGame(roomId: string) {
  const room = await getRoom(roomId);
  if (!room || room.phase === 'ended') return;

  await updateRoom(roomId, (r) => ({ ...r, phase: 'ended' }));

  const finalPlayers = rankedPlayers(room.players);

  broadcast(roomId, {
    event: 'game_ended',
    data: { players: finalPlayers },
  });

  await db.insert(gameResults).values({
    id: nanoid(),
    roomId,
    players: finalPlayers,
    settings: room.settings,
  });

  await deleteRoom(roomId);
}
