'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { MIN_PLAYERS } from '@/modules/room/constants';
import { parseApiError } from '@/lib/api/client';
import { getConnectedPlayers } from '@/modules/room/selectors';
import type { RoomState } from '@/modules/room/types';
import { PlayerList } from './player-list';
import { SettingsPanel } from './settings-panel';
import { RoomCode } from './room-code';
import { Play, LogOut } from 'lucide-react';

type LobbyProps = {
  room: RoomState;
  selfId: string;
};

export function Lobby({ room, selfId }: LobbyProps) {
  const isHost = room.hostId === selfId;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <RoomCode code={room.code} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <PlayerList
          players={room.players}
          hostId={room.hostId}
          selfId={selfId}
          roomId={room.id}
        />
        {isHost && <SettingsPanel roomId={room.id} settings={room.settings} />}
      </div>

      <div className="flex items-start justify-between">
        <LeaveButton roomId={room.id} />
        {isHost ? (
          <StartButton room={room} />
        ) : (
          <ReadyButton room={room} selfId={selfId} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Host: start button
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Leave room button (host or non-host)
// ---------------------------------------------------------------------------

function LeaveButton({ roomId }: { roomId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLeave() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/room/${roomId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        throw new Error(
          await parseApiError(res, `Failed to leave room (${res.status})`)
        );
      }
      router.push('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button
        size="lg"
        variant="outline"
        onClick={handleLeave}
        disabled={pending}
      >
        <LogOut />
        {pending ? 'Leaving…' : 'Leave room'}
      </Button>
    </div>
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

  // Surface the exact blocker to the host so they know what to wait for.
  // Order matters: "not enough players" is reported before "waiting on ready"
  // because it's the more fundamental precondition.
  const hint = !enoughPlayers
    ? `Waiting for ${MIN_PLAYERS - connected.length} more player${
        MIN_PLAYERS - connected.length === 1 ? '' : 's'
      }…`
    : !allReady
      ? 'Waiting for all players to be ready…'
      : null;

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
      // On success the server transitions phase → `starting` and broadcasts
      // `game_starting`; the hook will flip `room.phase` and this component
      // will unmount. Leave `pending` true until that happens.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button size="lg" onClick={handleStart} disabled={!canStart}>
        <Play />
        {pending ? 'Starting…' : 'Start game'}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Non-host: ready toggle
// ---------------------------------------------------------------------------

function ReadyButton({ room, selfId }: { room: RoomState; selfId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const self = room.players[selfId];
  const currentlyReady = self?.ready ?? false;

  // Clear pending when the authoritative SSE state confirms the toggle.
  useEffect(() => {
    if (pending) setPending(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentlyReady]);

  async function handleToggle() {
    if (pending || !self) return;
    const next = !currentlyReady;
    setPending(true);
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
      // Authoritative state arrives via the `ready_changed` SSE event.
      // `useEffect` above will clear `pending` when `currentlyReady` flips.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button
        size="lg"
        variant={currentlyReady ? 'secondary' : 'default'}
        onClick={handleToggle}
        disabled={pending}
        aria-pressed={currentlyReady}
      >
        {pending ? 'Saving…' : currentlyReady ? 'I’m not ready' : 'I’m ready'}
      </Button>
    </div>
  );
}
