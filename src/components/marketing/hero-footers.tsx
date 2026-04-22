'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronRight } from 'lucide-react';
import { getOrCreateSession } from '@/lib/ensure-session';
import { parseApiError } from '@/lib/api/client';
import { ROOM_CODE_LENGTH } from '@/modules/room/constants';
import { NameDialog } from './name-dialog';

/**
 * Reset transient component state when the page is restored from the
 * back-forward cache (clicking Back after navigating away and returning).
 *
 * React state is preserved through bfcache, so a `pending`/`error` set
 * before navigation would otherwise linger and leave the button stuck in
 * a disabled “Creating…” / “Joining…” state. The `pageshow` event fires
 * on both initial load and bfcache restore; `event.persisted === true`
 * distinguishes the restore case.
 *
 * `useState` setters are identity-stable, so the caller typically wraps
 * the reset in a `useCallback(..., [])` to keep the listener stable.
 */
function useBfcacheReset(reset: () => void) {
  useEffect(() => {
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) reset();
    }
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [reset]);
}

/**
 * Shared hook: manages the `<NameDialog>` open state and exposes a
 * `promptName()` returning a promise that resolves with the confirmed name
 * or `null` if the dialog is dismissed. This is the closure passed to
 * `getOrCreateSession` from each click handler.
 *
 * A single dialog instance is rendered alongside both the Create and Join
 * entry points. One dialog is enough because only one action can be pending
 * at a time (user has to dismiss or confirm before trying the other).
 */
import { useNameDialog } from '@/hooks/use-name-dialog';

// ---------------------------------------------------------------------------
// Create Room
// ---------------------------------------------------------------------------

export function CreateRoomButton() {
  const router = useRouter();
  const { open, promptName, handleConfirm, handleOpenChange } = useNameDialog();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useBfcacheReset(
    useCallback(() => {
      setPending(false);
      setError(null);
    }, [])
  );

  async function handleClick() {
    if (pending) return;
    setError(null);

    const result = await getOrCreateSession(promptName);
    if (result === 'aborted') return;

    setPending(true);
    try {
      const res = await fetch('/api/room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        throw new Error(
          await parseApiError(res, `Failed to create room (${res.status})`)
        );
      }
      const data = (await res.json()) as { id: string; code: string };
      router.push(`/room/${data.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setPending(false);
    }
  }

  return (
    <>
      <Button
        size="lg"
        onClick={handleClick}
        disabled={pending}
        className="h-11 w-full bg-violet-foreground/90 text-violet font-semibold hover:bg-violet-foreground/75"
      >
        {pending ? 'Creating…' : 'Create a Room'}
        {!pending && <ChevronRight strokeWidth={3} />}
      </Button>
      {error && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <NameDialog
        open={open}
        onConfirm={handleConfirm}
        onOpenChange={handleOpenChange}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Join Room
// ---------------------------------------------------------------------------

export function JoinRoomForm() {
  const router = useRouter();
  const { open, promptName, handleConfirm, handleOpenChange } = useNameDialog();
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useBfcacheReset(
    useCallback(() => {
      setPending(false);
      setError(null);
    }, [])
  );

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);

    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== ROOM_CODE_LENGTH) {
      setError(`Enter the ${ROOM_CODE_LENGTH}-character room code.`);
      return;
    }

    const result = await getOrCreateSession(promptName);
    if (result === 'aborted') return;

    setPending(true);
    try {
      const res = await fetch('/api/room/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed }),
      });
      if (!res.ok) {
        throw new Error(
          await parseApiError(res, `Failed to join room (${res.status})`)
        );
      }
      const data = (await res.json()) as { id: string; code: string };
      router.push(`/room/${data.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setPending(false);
    }
  }

  return (
    <>
      <form className="flex w-full flex-col gap-2" onSubmit={handleSubmit}>
        <div className="flex w-full items-center gap-2">
          <Input
            id="room-code-input"
            placeholder="Enter code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={ROOM_CODE_LENGTH}
            autoComplete="off"
            spellCheck={false}
            className="h-11 flex-1 border-lavender-foreground/20 bg-lavender-foreground/10 font-mono tracking-widest uppercase text-lavender-foreground placeholder:text-lavender-foreground/50 focus-visible:border-lavender-foreground/40 focus-visible:ring-lavender-foreground/15"
          />
          <Button
            type="submit"
            size="lg"
            disabled={pending}
            className="h-11 bg-lavender-foreground text-lavender font-semibold uppercase hover:bg-lavender-foreground/85"
          >
            {pending ? 'Joining…' : 'Join'}
          </Button>
        </div>
        {error && (
          <p className="text-[11px] font-medium text-lavender-foreground/80">
            {error}
          </p>
        )}
      </form>
      <NameDialog
        open={open}
        onConfirm={handleConfirm}
        onOpenChange={handleOpenChange}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Unchanged — purely cosmetic, no auth flow.
// ---------------------------------------------------------------------------

export function LeaderboardStats() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="size-7 rounded-full border-2 bg-amber-accent border-amber"
          />
        ))}
      </div>
      <span className="text-xs font-semibold opacity-80">
        +1.2k players active
      </span>
    </div>
  );
}
