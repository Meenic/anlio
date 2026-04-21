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

function topScore(players: Player[]): number {
  return players[0]?.score ?? 0;
}

function topScorerIds(players: Player[]): string[] {
  const score = topScore(players);
  return players.filter((p) => p.score === score).map((p) => p.id);
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

  const updated = await updateRoom(roomId, (r) => {
    if (r.phase !== 'lobby') return r;
    return {
      ...r,
      phase: 'starting',
      questions,
      currentQuestionIndex: 0,
      answers: {},
      phaseEndsAt: Date.now() + STARTING_DELAY_MS,
    };
  });
  if (updated.phase !== 'starting') return;

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

  const expectedIndex = room.currentQuestionIndex;
  const updated = await updateRoom(roomId, (r) => {
    if (r.phase !== 'starting' && r.phase !== 'leaderboard') return r;
    if (r.currentQuestionIndex !== expectedIndex) return r;
    const nextQuestion = r.questions[r.currentQuestionIndex];
    if (!nextQuestion) return r;
    return {
      ...r,
      phase: 'question',
      answers: {},
      phaseEndsAt,
    };
  });
  if (
    updated.phase !== 'question' ||
    updated.currentQuestionIndex !== expectedIndex
  ) {
    console.info(
      `[engine] pushQuestion no-op room=${roomId} expectedIndex=${expectedIndex}`
    );
    return;
  }

  // Strip the correct answer to prevent network-tab cheating
  const { correctOptionId: _c, category: _cat, ...safeQuestion } = question;

  broadcast(roomId, {
    event: 'question',
    data: {
      index: room.currentQuestionIndex,
      total: updated.questions.length,
      question: safeQuestion,
      phaseEndsAt: updated.phaseEndsAt!,
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

  const scoreDeltas: Record<string, number> = {};
  for (const [playerId, nextPlayer] of Object.entries(updatedPlayers)) {
    scoreDeltas[playerId] = nextPlayer.score - current.players[playerId].score;
  }

  const expectedIndex = current.currentQuestionIndex;
  const updated = await updateRoom(roomId, (r) => {
    if (r.phase !== 'question') return r;
    if (r.currentQuestionIndex !== expectedIndex) return r;
    return {
      ...r,
      phase: 'reveal',
      players: updatedPlayers,
      phaseEndsAt: Date.now() + REVEAL_DELAY_MS,
    };
  });
  if (
    updated.phase !== 'reveal' ||
    updated.currentQuestionIndex !== expectedIndex
  ) {
    console.info(
      `[engine] revealQuestion no-op room=${roomId} expectedIndex=${expectedIndex}`
    );
    return;
  }

  broadcast(roomId, {
    event: 'reveal',
    data: {
      questionIndex: current.currentQuestionIndex,
      totalQuestions: current.questions.length,
      question: {
        id: question.id,
        text: question.text,
        options: question.options,
        category: question.category,
      },
      correctOptionId: question.correctOptionId,
      answers: updated.answers,
      players: updated.players,
      scoreDeltas,
      revealedAt: Date.now(),
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

  const expectedIndex = room.currentQuestionIndex;
  const updated = await updateRoom(roomId, (r) => {
    if (r.phase !== 'reveal') return r;
    if (r.currentQuestionIndex !== expectedIndex) return r;
    return {
      ...r,
      phase: 'leaderboard',
      currentQuestionIndex: r.currentQuestionIndex + 1,
      phaseEndsAt: Date.now() + LEADERBOARD_DELAY_MS,
    };
  });
  if (updated.phase !== 'leaderboard') {
    console.info(
      `[engine] showLeaderboard no-op room=${roomId} expectedIndex=${expectedIndex}`
    );
    return;
  }

  const ranked = rankedPlayers(updated.players);

  broadcast(roomId, {
    event: 'leaderboard',
    data: {
      players: ranked,
      nextIn: LEADERBOARD_DELAY_MS / 1000,
      questionIndex: updated.currentQuestionIndex - 1,
      totalQuestions: updated.questions.length,
      topScore: topScore(ranked),
    },
  });

  setTimeout(() => pushQuestion(roomId), LEADERBOARD_DELAY_MS);
}

export async function endGame(roomId: string) {
  const room = await getRoom(roomId);
  if (!room || room.phase === 'ended') return;

  const endedRoom = await updateRoom(roomId, (r) => {
    if (r.phase === 'ended') return r;
    const ranked = rankedPlayers(r.players);
    const winnerIds = new Set(topScorerIds(ranked));

    const players: Record<string, Player> = {};
    for (const [playerId, player] of Object.entries(r.players)) {
      players[playerId] = winnerIds.has(playerId)
        ? { ...player, wins: player.wins + 1 }
        : player;
    }

    return { ...r, phase: 'ended', players };
  });
  if (endedRoom.phase !== 'ended') return;

  const finalPlayers = rankedPlayers(endedRoom.players);
  const winnerIds = topScorerIds(finalPlayers);

  broadcast(roomId, {
    event: 'game_ended',
    data: {
      players: finalPlayers,
      winnerIds,
      topScore: topScore(finalPlayers),
    },
  });

  // Persist results BEFORE deleting the room so a DB failure leaves
  // recoverable state in Redis rather than silently destroying it.
  try {
    await db.insert(gameResults).values({
      id: nanoid(),
      roomId,
      players: finalPlayers,
      settings: endedRoom.settings,
    });
  } catch (error) {
    console.error(
      `[engine] Failed to persist gameResults for room=${roomId} ` +
        `(players=${finalPlayers.length}, phase=ended). Room retained in ` +
        `Redis for manual recovery.`,
      error
    );
    return; // Do NOT delete the room — leave it for retry / investigation.
  }

  await deleteRoom(roomId);
}
