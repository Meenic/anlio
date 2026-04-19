'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronRight } from 'lucide-react';

export function CreateRoomButton() {
  return (
    <Button
      size="lg"
      className="h-11 w-full bg-violet-foreground/90 text-violet font-semibold hover:bg-violet-foreground/75"
    >
      Create a Room
      <ChevronRight strokeWidth={3} />
    </Button>
  );
}

export function JoinRoomForm() {
  return (
    <form
      className="flex w-full items-center gap-2"
      onSubmit={(e) => e.preventDefault()}
    >
      <Input
        id="room-code-input"
        placeholder="Enter code"
        className="h-11 flex-1 border-lavender-foreground/20 bg-lavender-foreground/10 text-lavender-foreground placeholder:text-lavender-foreground/50 focus-visible:border-lavender-foreground/40 focus-visible:ring-lavender-foreground/15"
      />
      <Button
        type="submit"
        size="lg"
        className="h-11 bg-lavender-foreground text-lavender font-semibold hover:bg-lavender-foreground/85"
      >
        Join
      </Button>
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
