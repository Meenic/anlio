'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRoomSse } from '@/hooks/use-room-sse';
import { authClient } from '@/lib/auth-client';
import { parseApiError } from '@/lib/api/client';
import { getOrCreateSession } from '@/lib/ensure-session';
import type { EnsureSessionResult } from '@/lib/ensure-session';
import { RoomSkeleton } from './layout/room-skeleton';
import { NameDialog } from '@/components/marketing/name-dialog';
import { useNameDialog } from '@/hooks/use-name-dialog';
import { RoomLayout } from './layout/room-layout';
import { RoomPhaseRouter } from './room-phase-router';
import { PlayerRail } from './layout/player-rail';
import { WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type RoomShellProps = {
  roomId: string;
  roomCode: string;
};

export function RoomShell({ roomId, roomCode }: RoomShellProps) {
  const { open, promptName, handleConfirm, handleOpenChange } = useNameDialog();
  const membership = useJoinRoom(roomCode, promptName);
  const router = useRouter();

  if (membership.kind === 'joining') {
    return (
      <>
        <RoomSkeleton />
        <NameDialog
          open={open}
          onConfirm={handleConfirm}
          onOpenChange={handleOpenChange}
        />
      </>
    );
  }

  if (membership.kind === 'error') {
    return (
      <>
        <div className="flex min-h-[60vh] items-center justify-center p-6">
          <Card size="sm" className="w-full max-w-sm">
            <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
              <WifiOff className="size-8 text-destructive" />
              <div className="flex flex-col items-center gap-1 text-center">
                <p className="text-sm font-medium">
                  Couldn&apos;t join this room
                </p>
                <p className="text-xs text-muted-foreground">
                  {membership.message}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" onClick={membership.retry}>
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
        <NameDialog
          open={open}
          onConfirm={handleConfirm}
          onOpenChange={handleOpenChange}
        />
      </>
    );
  }

  return <RoomLive roomId={roomId} selfId={membership.selfId} />;
}

type JoinState =
  | { kind: 'joining' }
  | { kind: 'error'; message: string; retry: () => void }
  | { kind: 'joined'; selfId: string };

function useJoinRoom(
  roomCode: string,
  promptName: () => Promise<string | null>
): JoinState {
  const [state, setState] = useState<JoinState>({ kind: 'joining' });
  const [attempt, setAttempt] = useState(0);
  const hasJoined = useRef(false);

  const retry = useCallback(() => {
    hasJoined.current = false;
    setAttempt((n) => n + 1);
    setState({ kind: 'joining' });
  }, []);

  useEffect(() => {
    if (hasJoined.current) return;

    let cancelled = false;
    const abort = new AbortController();

    async function bootstrap() {
      hasJoined.current = true;
      setState({ kind: 'joining' });

      try {
        const result: EnsureSessionResult = await getOrCreateSession(
          promptName,
          abort.signal
        );
        if (cancelled) return;
        if (result === 'aborted') {
          hasJoined.current = false;
          setState({
            kind: 'error',
            message: 'Display name is required to join this room.',
            retry,
          });
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

        if (cancelled) return;

        // Fetch fresh session to get user ID — useSession() hasn't updated yet
        // after anonymous sign-in.
        const { data } = await authClient.getSession();
        const userId = data?.user?.id;
        if (userId) {
          setState({ kind: 'joined', selfId: userId });
        } else {
          hasJoined.current = false;
          setState({
            kind: 'error',
            message: 'Session lost after joining. Please refresh.',
            retry,
          });
        }
      } catch (e) {
        if (cancelled) return;
        hasJoined.current = false;
        setState({
          kind: 'error',
          message: e instanceof Error ? e.message : 'Something went wrong.',
          retry,
        });
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [attempt, roomCode, promptName, retry]);

  return state;
}

function RoomLive({ roomId, selfId }: { roomId: string; selfId: string }) {
  const sse = useRoomSse(roomId, selfId);
  const router = useRouter();

  useEffect(() => {
    if (sse.removed) router.push('/?kicked=true');
  }, [sse.removed, router]);

  if (sse.loading || !sse.state) {
    return <RoomSkeleton />;
  }

  return (
    <RoomLayout
      room={sse.state}
      selfId={selfId}
      sseStatus={sse.status}
      sidebar={
        <PlayerRail
          room={sse.state}
          selfId={selfId}
          className="hidden lg:flex"
        />
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
        room={sse.state}
        selfId={selfId}
        currentQuestion={sse.currentQuestion}
        reveal={sse.reveal}
        leaderboard={sse.leaderboard}
        gameEnded={sse.gameEnded}
      />
    </RoomLayout>
  );
}
