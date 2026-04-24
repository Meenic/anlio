'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronRight } from 'lucide-react';
import { ROOM_CODE_LENGTH } from '@/modules/room/constants';
import {
  createRoomAction,
  joinRoomAction,
} from '@/modules/room/server-actions';

/**
 * Homepage Create-Room button. Single server-action roundtrip: session
 * ensured + room created server-side + code returned. Navigation lands on
 * a page where the RSC can fully prehydrate — the user sees the live
 * lobby on first frame, no skeleton dance, no name dialog on the home
 * page (the rename UI is shown inline over the hydrated room instead).
 */
export function CreateRoomButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await createRoomAction();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(`/room/${result.code}`);
    });
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
    </>
  );
}

/**
 * Homepage Join-Room form. Same one-roundtrip pattern as
 * {@link CreateRoomButton} — validation + session + join all happen in a
 * single server action.
 */
export function JoinRoomForm() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await joinRoomAction(code);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(`/room/${result.code}`);
    });
  }

  return (
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
  );
}

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
