'use client';

import { useRoomSse } from '@/hooks/use-room-sse';
import { authClient } from '@/lib/auth-client';
import { Card, CardContent } from '@/components/ui/card';
import { Lobby } from './_lobby/lobby';
import { Loader2, WifiOff } from 'lucide-react';

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
export function RoomClient({ roomId }: { roomId: string }) {
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
        <CardContent className="flex flex-col items-center gap-3 py-8">
          {children}
        </CardContent>
      </Card>
    </div>
  );
}
