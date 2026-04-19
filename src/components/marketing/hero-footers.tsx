'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronRight } from 'lucide-react';
import { getOrCreateSession } from '@/lib/ensure-session';
import { NameDialog } from './name-dialog';

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
function useNameDialog() {
  const [open, setOpen] = useState(false);
  const resolverRef = useRef<((name: string | null) => void) | null>(null);

  function promptName(): Promise<string | null> {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setOpen(true);
    });
  }

  function handleConfirm(name: string) {
    resolverRef.current?.(name);
    resolverRef.current = null;
    setOpen(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      // Any close path (Escape, backdrop, Cancel) without an explicit confirm
      // resolves with null — the caller treats this as an abort.
      resolverRef.current?.(null);
      resolverRef.current = null;
    }
    setOpen(next);
  }

  return { open, promptName, handleConfirm, handleOpenChange };
}

// ---------------------------------------------------------------------------
// Create Room
// ---------------------------------------------------------------------------

export function CreateRoomButton() {
  const router = useRouter();
  const { open, promptName, handleConfirm, handleOpenChange } = useNameDialog();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) {
        setPending(false);
        setError(null);
      }
    }
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

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
        const data = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(
          data?.message ?? `Failed to create room (${res.status})`
        );
      }
      const data = (await res.json()) as { id: string; code: string };
      router.push(`/room/${data.id}`);
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

  useEffect(() => {
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) {
        setPending(false);
        setError(null);
      }
    }
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setError(null);

    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) {
      setError('Enter the 6-character room code.');
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
        const data = (await res.json().catch(() => null)) as {
          message?: string;
          error?: string;
        } | null;
        throw new Error(
          data?.message ?? data?.error ?? `Failed to join room (${res.status})`
        );
      }
      const data = (await res.json()) as { id: string };
      router.push(`/room/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setPending(false);
    }
  }

  return (
    <>
      <form className="flex w-full items-center gap-2" onSubmit={handleSubmit}>
        <Input
          id="room-code-input"
          placeholder="Enter code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={6}
          autoComplete="off"
          spellCheck={false}
          className="h-11 flex-1 border-lavender-foreground/20 bg-lavender-foreground/10 text-lavender-foreground placeholder:text-lavender-foreground/50 focus-visible:border-lavender-foreground/40 focus-visible:ring-lavender-foreground/15"
        />
        <Button
          type="submit"
          size="lg"
          disabled={pending}
          className="h-11 bg-lavender-foreground text-lavender font-semibold hover:bg-lavender-foreground/85"
        >
          {pending ? 'Joining…' : 'Join'}
        </Button>
      </form>
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
