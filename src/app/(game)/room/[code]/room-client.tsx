'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRoomSse } from '@/hooks/use-room-sse';
import { authClient } from '@/lib/auth-client';
import { parseApiError } from '@/lib/api/client';
import { getOrCreateSession } from '@/lib/ensure-session';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { NameDialog } from '@/components/marketing/name-dialog';
import { Lobby } from './_lobby/lobby';
import { Loader2, WifiOff } from 'lucide-react';

type RoomClientProps = {
  roomId: string;
  roomCode: string;
};

/**
 * Client entry for a room. Owns:
 *  - The single `useRoomSse` connection (no other component fetches state).
 *  - The current user identity from `authClient.useSession()` (used to
 *    determine host vs non-host, and to highlight the current player).
 *  - The phase router — dispatches to the right screen based on `room.phase`.
 *
 * Only the `lobby` phase has a real UI in this task; other phases render
 * a neutral placeholder until the game screens are built.
 */
export function RoomClient({ roomId, roomCode }: RoomClientProps) {
  return <RoomEntryGate roomId={roomId} roomCode={roomCode} />;
}

function RoomEntryGate({ roomId, roomCode }: RoomClientProps) {
  const router = useRouter();
  const { open, promptName, handleConfirm, handleOpenChange } = useNameDialog();

  const [joining, setJoining] = useState(true);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const sessionAbort = new AbortController();

    async function bootstrapMembership() {
      setJoining(true);
      setJoinError(null);

      try {
        const sessionResult = await getOrCreateSession(
          promptName,
          sessionAbort.signal
        );
        if (cancelled) return;

        if (sessionResult === 'aborted') {
          setJoinError('Display name is required to join this room.');
          setJoining(false);
          return;
        }

        const res = await fetch('/api/room/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: roomCode }),
        });
        if (!res.ok) {
          throw new Error(
            await parseApiError(res, `Failed to join room (${res.status})`)
          );
        }

        if (!cancelled) {
          setJoining(false);
          setJoinError(null);
        }
      } catch (e) {
        if (cancelled) return;
        setJoinError(e instanceof Error ? e.message : 'Something went wrong.');
        setJoining(false);
      }
    }

    void bootstrapMembership();
    return () => {
      cancelled = true;
      sessionAbort.abort();
    };
  }, [attempt, promptName, roomCode]);

  if (joining) {
    return (
      <>
        <CenteredCard>
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Joining the room…</p>
        </CenteredCard>

        <NameDialog
          open={open}
          onConfirm={handleConfirm}
          onOpenChange={handleOpenChange}
        />
      </>
    );
  }

  if (joinError) {
    return (
      <>
        <CenteredCard>
          <WifiOff className="size-8 text-destructive" />
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-sm font-medium">Couldn’t join this room</p>
            <p className="text-xs text-muted-foreground">{joinError}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" onClick={retry}>
              Try again
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push('/')}
            >
              Back home
            </Button>
          </div>
        </CenteredCard>

        <NameDialog
          open={open}
          onConfirm={handleConfirm}
          onOpenChange={handleOpenChange}
        />
      </>
    );
  }

  return (
    <>
      <RoomLive roomId={roomId} />
      <NameDialog
        open={open}
        onConfirm={handleConfirm}
        onOpenChange={handleOpenChange}
      />
    </>
  );
}

type NameDialogResolver = (name: string | null) => void;

function useNameDialog() {
  const [open, setOpen] = useState(false);
  const resolverRef = useRef<NameDialogResolver | null>(null);

  const promptName = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setOpen(true);
    });
  }, []);

  const handleConfirm = useCallback((name: string) => {
    resolverRef.current?.(name);
    resolverRef.current = null;
    setOpen(false);
  }, []);

  const handleOpenChange = useCallback((next: boolean) => {
    if (!next) {
      resolverRef.current?.(null);
      resolverRef.current = null;
    }
    setOpen(next);
  }, []);

  return { open, promptName, handleConfirm, handleOpenChange };
}

function RoomLive({ roomId }: { roomId: string }) {
  const { state, status, loading, error } = useRoomSse(roomId);
  const session = authClient.useSession();
  const selfId = session.data?.user?.id ?? null;

  // 1. Connecting / first-state-sync pending → skeleton shell.
  //    Note: once `loading` flips false it stays false across reconnects,
  //    so transient network blips do NOT bounce the UI back to a skeleton.
  if (loading || !state) {
    return <ConnectingShell status={status} />;
  }

  // 2. Connection-level error AFTER we already have state — banner, keep UI.
  //    (EventSource auto-reconnects; a fresh state_sync lands on recovery.)
  const errorBanner = status === 'error' ? <ErrorBanner /> : null;

  // 3. We can't proceed without a known identity — this should never happen
  //    for a user who got far enough to mount this component (the SSE route
  //    requires auth to open the stream), but guard anyway.
  if (!selfId) {
    return (
      <CenteredCard>
        <p className="text-sm text-muted-foreground">
          Not signed in. Please return to the home page.
        </p>
      </CenteredCard>
    );
  }

  // 4. App-level `error` event from the server (rare — validation failures
  //    reach the client mostly via HTTP responses, not SSE). Render as a
  //    non-blocking banner alongside the main UI.
  const appErrorBanner = error ? <AppErrorBanner message={error} /> : null;

  // 5. Phase dispatch.
  let content: React.ReactNode;
  switch (state.phase) {
    case 'lobby':
      content = <Lobby room={state} selfId={selfId} />;
      break;
    case 'starting':
    case 'question':
    case 'reveal':
    case 'leaderboard':
    case 'ended':
      content = <PhasePlaceholder phase={state.phase} />;
      break;
    default: {
      const _never: never = state.phase;
      void _never;
      content = null;
    }
  }

  return (
    <>
      {errorBanner}
      {appErrorBanner}
      {content}
    </>
  );
}

// ---------------------------------------------------------------------------
// Loading / error shells — no hardcoded colors, only theme tokens.
// ---------------------------------------------------------------------------

function ConnectingShell({
  status,
}: {
  status: 'connecting' | 'connected' | 'error';
}) {
  return (
    <CenteredCard>
      {status === 'error' ? (
        <>
          <WifiOff className="size-8 text-destructive" />
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-sm font-medium">Can’t reach the room</p>
            <p className="text-xs text-muted-foreground">
              Checking your connection… we’ll reconnect automatically.
            </p>
          </div>
        </>
      ) : (
        <>
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Joining the room…</p>
        </>
      )}
    </CenteredCard>
  );
}

function ErrorBanner() {
  return (
    <div
      role="status"
      className="sticky top-0 z-10 flex items-center justify-center gap-2 bg-destructive/10 px-4 py-2 text-xs font-medium text-destructive"
    >
      <WifiOff className="size-3" />
      Reconnecting…
    </div>
  );
}

function AppErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="sticky top-0 z-10 flex items-center justify-center gap-2 bg-destructive/10 px-4 py-2 text-xs font-medium text-destructive"
    >
      {message}
    </div>
  );
}

function PhasePlaceholder({ phase }: { phase: string }) {
  return (
    <CenteredCard>
      <p className="text-sm font-medium capitalize">{phase}</p>
      <p className="text-xs text-muted-foreground">
        Game screens are not implemented yet.
      </p>
    </CenteredCard>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Card size="sm" className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          {children}
        </CardContent>
      </Card>
    </div>
  );
}
