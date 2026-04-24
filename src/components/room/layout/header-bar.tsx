'use client';

import type { RoomSseStatus } from '@/hooks/use-room-sse';
import type { RoomState } from '@/features/room/types';
import { Hash, Wifi, WifiOff } from 'lucide-react';

type HeaderBarProps = {
  room: RoomState;
  /** SSE connection status forwarded from the room hook. */
  sseStatus?: RoomSseStatus;
};

/**
 * Hero-style page header:
 *  - Label + italic violet underline heading (phase-aware).
 *  - Room code pill + live/reconnecting/error indicator on the right.
 */
export function HeaderBar({ room, sseStatus = 'connected' }: HeaderBarProps) {
  const { label, heading, accent } = describePhase(room);

  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground">
          {label}
        </p>
        <h1 className="text-balance text-3xl font-semibold leading-[1.05] sm:text-4xl">
          {heading}{' '}
          <em className="font-extrabold not-italic text-violet underline decoration-violet-accent decoration-[3px] underline-offset-4">
            {accent}
          </em>
        </h1>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
          <Hash className="size-3.5 text-muted-foreground" />
          <span className="font-mono text-sm font-bold tracking-[0.28em]">
            {room.code}
          </span>
        </div>
        <ConnectionIndicator status={sseStatus} />
      </div>
    </header>
  );
}

function describePhase(room: RoomState): {
  label: string;
  heading: string;
  accent: string;
} {
  const total = room.settings.questionCount;
  switch (room.phase) {
    case 'lobby':
      return { label: 'Room Lobby', heading: 'Waiting for', accent: 'players' };
    case 'starting':
      return { label: 'Room Lobby', heading: 'Get', accent: 'ready' };
    case 'question':
      return {
        label: `Question ${room.currentQuestionIndex + 1} of ${total}`,
        heading: 'Answer the',
        accent: 'question',
      };
    case 'reveal':
      return {
        label: `Result — question ${room.currentQuestionIndex + 1}`,
        heading: 'Here are the',
        accent: 'results',
      };
    case 'leaderboard':
      return {
        label: 'Between rounds',
        heading: 'Current',
        accent: 'standings',
      };
    case 'ended':
      return { label: 'Game over', heading: 'Final', accent: 'results' };
    default: {
      room.phase satisfies never;
      return { label: 'Room Lobby', heading: 'Waiting for', accent: 'players' };
    }
  }
}

function ConnectionIndicator({
  status,
}: {
  status: 'connecting' | 'connected' | 'error';
}) {
  if (status === 'connected') {
    return (
      <div className="flex items-center gap-1.5 rounded-xl border border-violet/20 bg-violet/10 px-3 py-2 text-xs font-bold text-violet">
        <Wifi className="size-3.5" />
        Live
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="flex items-center gap-1.5 rounded-xl border border-amber/30 bg-amber/10 px-3 py-2 text-xs font-bold text-amber-foreground">
        <WifiOff className="size-3.5" />
        Reconnecting
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground">
      <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60" />
      Connecting
    </div>
  );
}
