'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useRoomSse } from '@/hooks/use-room-sse';
import { RoomSkeleton } from './layout/room-skeleton';
import { NameDialog } from '@/components/name-dialog';
import { RoomLayout } from './layout/room-layout';
import { RoomPhaseRouter } from './room-phase-router';
import { PlayerRail } from './layout/player-rail';
import { WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  bootstrapRoomAction,
  renameSelfAction,
} from '@/features/room/actions.server';
import type { RoomState } from '@/features/room/types';

type RoomShellProps = {
  roomId: string;
  roomCode: string;
  /** RSC-prehydrated snapshot when the user is already a room member.
   *  When present, first paint is the live room and `RoomLive` mounts
   *  directly with no bootstrap roundtrip. */
  initialState: RoomState | null;
  /** Session user id when a session cookie was present during the RSC
   *  render. `null` means the browser has no session — we must call the
   *  bootstrap server action to create one + join. */
  selfId: string | null;
};

/**
 * Room shell decision tree:
 *
 *   ┌ initialState + selfId  → render RoomLive immediately (fast path)
 *   ├ selfId only            → join via server action, then RoomLive
 *   └ neither                → signInAnonymous + join via server action
 *
 * In all three branches we avoid the previous 2-3 sequential client fetches
 * (getSession → signIn → updateUser → /api/room/join → getSession).
 */
export function RoomShell({
  roomId,
  roomCode,
  initialState,
  selfId,
}: RoomShellProps) {
  // Fast path: RSC already proved membership and snapshotted state.
  if (initialState && selfId) {
    return (
      <RoomLive
        roomId={roomId}
        selfId={selfId}
        initialState={initialState}
        // The RSC path never creates a new session, so no inline dialog.
        showRenameDialog={false}
      />
    );
  }

  return <RoomBootstrap roomId={roomId} roomCode={roomCode} />;
}

type BootstrapState =
  | { kind: 'pending' }
  | {
      kind: 'ready';
      selfId: string;
      initialState: RoomState;
      isNewSession: boolean;
    }
  | { kind: 'error'; message: string; retry: () => void };

function RoomBootstrap({
  roomId,
  roomCode,
}: {
  roomId: string;
  roomCode: string;
}) {
  const [state, setState] = useState<BootstrapState>({ kind: 'pending' });
  const [attempt, setAttempt] = useState(0);
  const inflight = useRef(false);
  const router = useRouter();

  const retry = useCallback(() => {
    inflight.current = false;
    setState({ kind: 'pending' });
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (inflight.current) return;
    inflight.current = true;
    let cancelled = false;

    (async () => {
      const result = await bootstrapRoomAction(roomCode);
      if (cancelled) return;
      if (!result.ok) {
        setState({ kind: 'error', message: result.message, retry });
        inflight.current = false;
        return;
      }
      setState({
        kind: 'ready',
        selfId: result.selfId,
        initialState: result.initialState,
        isNewSession: result.isNewSession,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [roomCode, attempt, retry]);

  if (state.kind === 'pending') {
    return <RoomSkeleton />;
  }

  if (state.kind === 'error') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <Card size="sm" className="w-full max-w-sm">
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <WifiOff className="size-8 text-destructive" />
            <div className="flex flex-col items-center gap-1 text-center">
              <p className="text-sm font-medium">
                Couldn&apos;t join this room
              </p>
              <p className="text-xs text-muted-foreground">{state.message}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" onClick={state.retry}>
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
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <RoomLive
      roomId={roomId}
      selfId={state.selfId}
      initialState={state.initialState}
      showRenameDialog={state.isNewSession}
    />
  );
}

function RoomLive({
  roomId,
  selfId,
  initialState,
  showRenameDialog,
}: {
  roomId: string;
  selfId: string;
  initialState: RoomState;
  showRenameDialog: boolean;
}) {
  const sse = useRoomSse(roomId, selfId, { initialState });
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(showRenameDialog);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (sse.removed) router.push('/?kicked=true');
  }, [sse.removed, router]);

  const handleRenameConfirm = useCallback(
    (name: string) => {
      setDialogOpen(false);
      startTransition(async () => {
        await renameSelfAction(roomId, name);
      });
    },
    [roomId]
  );

  // `sse.state` cannot actually be null here because we seeded it — but
  // keep the fallback skeleton to satisfy the type narrowing and guard
  // against future refactors that drop `initialState`.
  const room = sse.state ?? initialState;

  return (
    <>
      <RoomLayout
        room={room}
        selfId={selfId}
        sseStatus={sse.status}
        sidebar={
          <PlayerRail room={room} selfId={selfId} className="hidden lg:flex" />
        }
      >
        {sse.error && (
          <div
            role="alert"
            className="sticky top-0 z-10 flex items-center justify-center gap-2 bg-destructive/10 px-4 py-2 text-xs font-medium text-destructive"
          >
            {sse.error}
          </div>
        )}
        <RoomPhaseRouter
          room={room}
          selfId={selfId}
          currentQuestion={sse.currentQuestion}
          reveal={sse.reveal}
          leaderboard={sse.leaderboard}
          gameEnded={sse.gameEnded}
        />
      </RoomLayout>
      {/* Inline name dialog — shown only for fresh anonymous sessions so the
          user can rename their server-generated `Guest-XXXXXX` placeholder
          without blocking the room from rendering. */}
      <NameDialog
        open={dialogOpen}
        onConfirm={handleRenameConfirm}
        onOpenChange={setDialogOpen}
        title="Pick a display name"
        confirmLabel="Save"
      />
    </>
  );
}
