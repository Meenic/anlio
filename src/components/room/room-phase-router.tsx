'use client';

import type { RoomState } from '@/features/room/types';
import type {
  GameEndedPayload,
  LeaderboardPayload,
  QuestionPayload,
  RevealPayload,
} from '@/features/game/types';
import { Lobby } from './phases/lobby';
import { StartingScreen } from './phases/starting-screen';
import { QuestionScreen } from './phases/question-screen';
import { RevealScreen } from './phases/reveal-screen';
import { LeaderboardScreen } from './phases/leaderboard-screen';
import { EndedScreen } from './phases/ended-screen';

type PhaseRouterProps = {
  room: RoomState;
  selfId: string;
  currentQuestion: QuestionPayload | null;
  reveal: RevealPayload | null;
  leaderboard: LeaderboardPayload | null;
  gameEnded: GameEndedPayload | null;
};

export function RoomPhaseRouter({
  room,
  selfId,
  currentQuestion,
  reveal,
  leaderboard,
  gameEnded,
}: PhaseRouterProps) {
  switch (room.phase) {
    case 'lobby':
      return <Lobby room={room} selfId={selfId} />;

    case 'starting':
      return room.phaseEndsAt !== null ? (
        <StartingScreen phaseEndsAt={room.phaseEndsAt} />
      ) : (
        <PhasePlaceholder phase="starting" />
      );

    case 'question':
      return currentQuestion ? (
        <QuestionScreen
          room={room}
          question={currentQuestion}
          answerCount={room.answerCount}
        />
      ) : (
        <PhasePlaceholder phase="question" />
      );

    case 'reveal':
      return reveal ? (
        <RevealScreen reveal={reveal} selfId={selfId} />
      ) : (
        <PhasePlaceholder phase="reveal" />
      );

    case 'leaderboard':
      return leaderboard ? (
        <LeaderboardScreen leaderboard={leaderboard} selfId={selfId} />
      ) : (
        <PhasePlaceholder phase="leaderboard" />
      );

    case 'ended':
      return gameEnded ? (
        <EndedScreen room={room} ended={gameEnded} selfId={selfId} />
      ) : (
        <PhasePlaceholder phase="ended" />
      );

    default: {
      room.phase satisfies never;
      return <PhasePlaceholder phase="unknown" />;
    }
  }
}

function PhasePlaceholder({ phase }: { phase: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-sm font-medium capitalize">{phase}</p>
        <p className="text-xs text-muted-foreground">
          Game screens are not implemented yet.
        </p>
      </div>
    </div>
  );
}
