'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { MIN_PLAYERS } from '@/features/room/constants';
import { parseApiError } from '@/lib/http-client';
import { getConnectedPlayers } from '@/features/room/selectors';
import type { RoomState } from '@/features/room/types';
import { cn } from '@/lib/utils';
import {
  SettingsPanel,
  CATEGORY_OPTIONS,
  ANSWER_MODE_OPTIONS,
} from '../shared/settings-panel';
import { Loader2, LogOut, Play } from 'lucide-react';

type LobbyProps = {
  room: RoomState;
  selfId: string;
};

export function Lobby({ room, selfId }: LobbyProps) {
  const isHost = room.hostId === selfId;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card">
      {/* Scrollable settings body */}
      <div className="flex-1 overflow-y-auto px-5 py-6">
        {isHost ? (
          <SettingsPanel roomId={room.id} settings={room.settings} />
        ) : (
          <NonHostSettingsSummary room={room} />
        )}
      </div>

      {/* Pinned action bar */}
      <div className="shrink-0 border-t border-border px-5 py-4">
        <div className="flex items-stretch gap-3">
          <LeaveRoomButton roomId={room.id} />
          {isHost ? (
            <StartButton room={room} />
          ) : (
            <ReadyButton room={room} selfId={selfId} />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Non-host: read-only settings summary
// ---------------------------------------------------------------------------

function NonHostSettingsSummary({ room }: { room: RoomState }) {
  const { settings } = room;
  const categoryLabel =
    CATEGORY_OPTIONS.find((o) => o.value === settings.category)?.label ??
    settings.category;
  const answerModeLabel =
    ANSWER_MODE_OPTIONS.find((o) => o.value === settings.answerMode)?.label ??
    settings.answerMode;
  const rows: { label: string; value: string }[] = [
    { label: 'Questions', value: `${settings.questionCount}` },
    { label: 'Time per question', value: `${settings.timePerQuestion}s` },
    { label: 'Category', value: categoryLabel },
    { label: 'Answer mode', value: answerModeLabel },
    { label: 'Visibility', value: settings.isPublic ? 'Public' : 'Private' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
          Game Settings
        </p>
        <p className="text-sm text-muted-foreground">
          Waiting for the host to start the match.
        </p>
      </div>
      <div className="rounded-xl border border-border bg-background px-4">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between gap-3 border-b border-border/60 py-3 text-sm last:border-b-0"
          >
            <span className="text-muted-foreground">{r.label}</span>
            <span className="font-semibold">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Leave button
// ---------------------------------------------------------------------------

function LeaveRoomButton({ roomId }: { roomId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleLeave() {
    if (pending) return;
    setPending(true);
    try {
      await fetch(`/api/room/${roomId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    } catch {
      // Ignore — navigate home regardless
    } finally {
      router.push('/');
    }
  }

  return (
    <Button
      type="button"
      size="lg"
      variant="outline"
      onClick={handleLeave}
      disabled={pending}
      className="flex-1 font-semibold"
    >
      {pending ? <Loader2 className="animate-spin" /> : <LogOut />}
      {pending ? 'Leaving…' : 'Leave Room'}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Host: start button
// ---------------------------------------------------------------------------

function StartButton({ room }: { room: RoomState }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connected = getConnectedPlayers(room.players);
  const allReady = connected
    .filter((p) => p.id !== room.hostId)
    .every((p) => p.ready);
  const enoughPlayers = connected.length >= MIN_PLAYERS;
  const canStart = enoughPlayers && allReady && !pending;

  async function handleStart() {
    if (!canStart) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/room/${room.id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        throw new Error(
          await parseApiError(res, `Failed to start the game (${res.status})`)
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setPending(false);
    }
  }

  return (
    <div className="flex flex-2 flex-col items-stretch gap-1.5">
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button
        size="lg"
        onClick={handleStart}
        disabled={!canStart}
        className="w-full bg-violet font-semibold text-violet-foreground hover:bg-violet/90"
      >
        {pending ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Play className="fill-current" />
        )}
        {pending ? 'Starting…' : 'Start Game'}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Non-host: ready toggle
// ---------------------------------------------------------------------------

function ReadyButton({ room, selfId }: { room: RoomState; selfId: string }) {
  const [optimisticReady, setOptimisticReady] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const self = room.players[selfId];
  const serverReady = self?.ready ?? false;
  const currentlyReady = optimisticReady ?? serverReady;
  const isPending = optimisticReady !== null && optimisticReady !== serverReady;

  async function handleToggle() {
    if (isPending || !self) return;
    const next = !currentlyReady;
    setOptimisticReady(next);
    setError(null);
    try {
      const res = await fetch(`/api/room/${room.id}/ready`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ready: next }),
      });
      if (!res.ok) {
        throw new Error(
          await parseApiError(
            res,
            `Failed to update ready state (${res.status})`
          )
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setOptimisticReady(null);
    }
  }

  return (
    <div className="flex flex-2 flex-col items-stretch gap-1.5">
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button
        size="lg"
        variant={currentlyReady ? 'secondary' : 'default'}
        onClick={handleToggle}
        disabled={isPending}
        aria-pressed={currentlyReady}
        className={cn(
          'w-full font-semibold',
          !currentlyReady &&
            'bg-violet text-violet-foreground hover:bg-violet/90'
        )}
      >
        {isPending ? 'Saving…' : currentlyReady ? 'Not Ready' : "I'm Ready"}
      </Button>
    </div>
  );
}
