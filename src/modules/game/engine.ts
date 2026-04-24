import {
  deleteQuestions,
  getQuestions,
  setQuestions,
  updateRoom,
} from '../room/store';
import { broadcast } from '../sse/broadcaster';
import { calculateTimeBonus } from './scoring';
import { fetchQuestions } from './questions';
import { db } from '@/drizzle/db';
import { gameResults } from '@/drizzle/schemas/game-schema';
import { nanoid } from 'nanoid';
import type { InternalRoomState, Player, RoomSettings } from '../room/types';
import { getConnectedPlayers } from '../room/selectors';
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
  const connected = getConnectedPlayers(room.players);
  if (connected.length === 0) return false;
  return connected.every((p) => room.answers[p.id] !== undefined);
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

export async function startGame(roomId: string, settings: RoomSettings) {
  const questions = await fetchQuestions(settings);

  // Persist questions to their dedicated key BEFORE the room mutates into
  // `starting` — guarantees every downstream phase handler has them
  // available even if the process restarts right after this point.
  await setQuestions(roomId, questions);

  const updated = await updateRoom(roomId, (r) => {
    if (r.phase !== 'lobby') return r;
    return {
      ...r,
      phase: 'starting',
      currentQuestionIndex: 0,
      answers: {},
      phaseEndsAt: Date.now() + STARTING_DELAY_MS,
    };
  });
  if (updated.phase !== 'starting') {
    // Transition rejected (e.g. another concurrent call beat us). Clean up
    // the orphaned questions blob so we don't leak Upstash bytes.
    await deleteQuestions(roomId).catch(() => {});
    return;
  }

  broadcast(roomId, {
    event: 'game_starting',
    data: { startsIn: STARTING_DELAY_MS / 1000 },
  });

  setTimeout(() => pushQuestion(roomId), STARTING_DELAY_MS);
}

export async function pushQuestion(roomId: string) {
  // Fetch questions once from their dedicated key. Closing over them in the
  // `updateRoom` mutator keeps the room blob small on every phase write.
  const questions = await getQuestions(roomId);
  if (!questions || questions.length === 0) {
    console.warn(`[engine] pushQuestion missing questions room=${roomId}`);
    return;
  }

  let expectedIndex = -1;
  let timeLimit = 0;

  const updated = await updateRoom(roomId, (r) => {
    if (r.phase !== 'starting' && r.phase !== 'leaderboard') return r;
    const nextQuestion = questions[r.currentQuestionIndex];
    if (!nextQuestion) return r;

    expectedIndex = r.currentQuestionIndex;
    timeLimit = r.settings.timePerQuestion;
    const phaseEndsAt = Date.now() + timeLimit * 1000;

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

  const question = questions[updated.currentQuestionIndex];
  // Strip the correct answer to prevent network-tab cheating
  const { correctOptionId: _c, category: _cat, ...safeQuestion } = question;

  broadcast(roomId, {
    event: 'question',
    data: {
      index: updated.currentQuestionIndex,
      total: questions.length,
      question: safeQuestion,
      phaseEndsAt: updated.phaseEndsAt!,
    },
  });

  setTimeout(() => revealQuestion(roomId), timeLimit * 1000);
}

export async function revealQuestion(roomId: string) {
  const questions = await getQuestions(roomId);
  if (!questions || questions.length === 0) {
    console.warn(`[engine] revealQuestion missing questions room=${roomId}`);
    return;
  }

  let scoreDeltas: Record<string, number> = {};

  const updated = await updateRoom(roomId, (r) => {
    if (r.phase !== 'question') return r;
    const question = questions[r.currentQuestionIndex];
    if (!question || r.phaseEndsAt === null) return r;

    const updatedPlayers = { ...r.players };
    const timeLimitSeconds = r.settings.timePerQuestion;
    const questionStartedAt = r.phaseEndsAt - timeLimitSeconds * 1000;

    for (const [playerId, optionId] of Object.entries(r.answers)) {
      if (optionId === question.correctOptionId) {
        const player = updatedPlayers[playerId];
        if (!player || player.answeredAt === undefined) continue;
        const timeBonus = calculateTimeBonus(
          player.answeredAt,
          questionStartedAt,
          timeLimitSeconds
        );

        updatedPlayers[playerId] = {
          ...player,
          score: player.score + BASE_SCORE + timeBonus,
        };
      }
    }

    scoreDeltas = {};
    for (const [playerId, nextPlayer] of Object.entries(updatedPlayers)) {
      scoreDeltas[playerId] = nextPlayer.score - r.players[playerId].score;
    }

    return {
      ...r,
      phase: 'reveal',
      players: updatedPlayers,
      phaseEndsAt: Date.now() + REVEAL_DELAY_MS,
    };
  });

  if (updated.phase !== 'reveal') return;

  const question = questions[updated.currentQuestionIndex];

  broadcast(roomId, {
    event: 'reveal',
    data: {
      questionIndex: updated.currentQuestionIndex,
      totalQuestions: questions.length,
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
  const questions = await getQuestions(roomId);
  if (!questions || questions.length === 0) {
    console.warn(`[engine] showLeaderboard missing questions room=${roomId}`);
    return;
  }

  const totalQuestions = questions.length;
  let isLastQuestion = false;

  const updated = await updateRoom(roomId, (r) => {
    if (r.phase !== 'reveal') return r;
    isLastQuestion = r.currentQuestionIndex >= totalQuestions - 1;
    if (isLastQuestion) return r;

    return {
      ...r,
      phase: 'leaderboard',
      currentQuestionIndex: r.currentQuestionIndex + 1,
      phaseEndsAt: Date.now() + LEADERBOARD_DELAY_MS,
    };
  });

  if (isLastQuestion) {
    await endGame(roomId);
    return;
  }

  if (updated.phase !== 'leaderboard') return;

  const ranked = rankedPlayers(updated.players);

  broadcast(roomId, {
    event: 'leaderboard',
    data: {
      players: ranked,
      nextIn: LEADERBOARD_DELAY_MS / 1000,
      questionIndex: updated.currentQuestionIndex - 1,
      totalQuestions,
      topScore: topScore(ranked),
    },
  });

  setTimeout(() => pushQuestion(roomId), LEADERBOARD_DELAY_MS);
}

export async function endGame(roomId: string) {
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

  // Persist results BEFORE cleaning up volatile state so a DB failure
  // leaves recoverable state in Redis rather than silently destroying it.
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

  // The questions bank is no longer needed once the game is over (a rematch
  // will re-fetch a fresh set). Drop it to free the ~20 KB Upstash slot.
  await deleteQuestions(roomId).catch((err) => {
    console.warn(`[engine] deleteQuestions failed room=${roomId}`, err);
  });

  // Keep the room alive in Redis so the host can start a rematch. The
  // existing TTL will garbage-collect it once it's truly abandoned; the
  // `leaveRoom` + offline-removal flows also delete it when empty.
}
