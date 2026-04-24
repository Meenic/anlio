'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Crown, RotateCcw, Trophy } from 'lucide-react';
import { parseApiError } from '@/lib/api/client';
import type { GameEndedPayload } from '@/modules/game/types';
import type { RoomState } from '@/modules/room/types';

type EndedScreenProps = {
  room: RoomState;
  ended: GameEndedPayload;
  selfId: string;
};

export function EndedScreen({ room, ended, selfId }: EndedScreenProps) {
  const isHost = room.hostId === selfId;
  const winnerSet = new Set(ended.winnerIds);
  const top3 = ended.players.slice(0, 3);
  const rest = ended.players.slice(3);

  const [rematching, setRematching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRematch() {
    if (rematching) return;
    setRematching(true);
    setError(null);
    try {
      const res = await fetch(`/api/room/${room.id}/rematch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        throw new Error(
          await parseApiError(res, `Couldn't start rematch (${res.status})`)
        );
      }
      // Leave rematching=true; server broadcasts state_sync → phase flips to
      // 'lobby' → this component unmounts.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setRematching(false);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card">
      {/* Pinned header */}
      <div className="shrink-0 border-b border-border px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <Trophy className="size-4 text-yellow-500" />
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
            Game Over
          </p>
        </div>
        <p className="mt-0.5 text-sm font-medium">
          {ended.winnerIds.length === 1
            ? `${ended.players.find((p) => winnerSet.has(p.id))?.name ?? 'Someone'} wins!`
            : "It's a tie!"}
        </p>
      </div>

      {/* Scrollable body */}
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4 sm:p-5">
        {/* Podium */}
        <div className="flex items-end justify-center gap-2 sm:gap-4">
          {top3[1] && (
            <PodiumStep
              player={top3[1]}
              rank={2}
              isSelf={top3[1].id === selfId}
              isWinner={winnerSet.has(top3[1].id)}
            />
          )}
          {top3[0] && (
            <PodiumStep
              player={top3[0]}
              rank={1}
              isSelf={top3[0].id === selfId}
              isWinner={winnerSet.has(top3[0].id)}
            />
          )}
          {top3[2] && (
            <PodiumStep
              player={top3[2]}
              rank={3}
              isSelf={top3[2].id === selfId}
              isWinner={winnerSet.has(top3[2].id)}
            />
          )}
        </div>

        {/* Full standings */}
        {rest.length > 0 && (
          <div className="flex flex-col gap-1 rounded-xl border border-border bg-background px-1 py-1">
            {rest.map((p, idx) => {
              const rank = idx + 4;
              const isSelf = p.id === selfId;
              return (
                <div
                  key={p.id}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2',
                    isSelf && 'bg-primary/5'
                  )}
                >
                  <span className="w-5 text-center text-xs font-medium text-muted-foreground tabular-nums">
                    {rank}
                  </span>
                  <Avatar className="size-7">
                    {p.avatarUrl && <AvatarImage src={p.avatarUrl} alt="" />}
                    <AvatarFallback className="text-[10px]">
                      {p.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 truncate text-sm">
                    {p.name}
                    {isSelf && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        (you)
                      </span>
                    )}
                  </span>
                  <span className="text-sm font-semibold tabular-nums">
                    {p.score.toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pinned footer action */}
      <div className="shrink-0 border-t border-border px-4 py-4 sm:px-5">
        {error && (
          <p className="mb-2 text-center text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
        {isHost ? (
          <Button
            size="lg"
            onClick={handleRematch}
            disabled={rematching}
            className="w-full bg-violet font-semibold text-violet-foreground hover:bg-violet/90"
          >
            <RotateCcw />
            {rematching ? 'Resetting…' : 'Play again'}
          </Button>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            Waiting for the host to start a rematch…
          </p>
        )}
      </div>
    </div>
  );
}

function PodiumStep({
  player,
  rank,
  isSelf,
  isWinner,
}: {
  player: GameEndedPayload['players'][number];
  rank: 1 | 2 | 3;
  isSelf: boolean;
  isWinner: boolean;
}) {
  const barHeight =
    rank === 1 ? 'h-24 sm:h-32' : rank === 2 ? 'h-18 sm:h-24' : 'h-14 sm:h-18';
  const barColor =
    rank === 1
      ? 'bg-yellow-400 text-black'
      : rank === 2
        ? 'bg-slate-300 text-black'
        : 'bg-amber-700 text-white';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: rank === 1 ? 0.15 : rank === 2 ? 0.3 : 0.45,
        type: 'spring',
        stiffness: 240,
        damping: 22,
      }}
      className="flex w-20 flex-col items-center gap-1.5 sm:w-24"
    >
      <div className="relative">
        {isWinner && (
          <Crown className="absolute -top-5 left-1/2 size-5 -translate-x-1/2 text-yellow-500" />
        )}
        <Avatar className="size-12 sm:size-14">
          {player.avatarUrl && <AvatarImage src={player.avatarUrl} alt="" />}
          <AvatarFallback className="text-xs">
            {player.name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </div>
      <div className="flex flex-col items-center gap-0.5 text-center">
        <p
          className={cn(
            'w-full truncate text-xs font-medium',
            isSelf && 'text-primary'
          )}
        >
          {player.name}
        </p>
        <p className="text-[11px] tabular-nums text-muted-foreground">
          {player.score.toLocaleString()}
        </p>
        {player.wins > 0 && (
          <Badge variant="secondary" className="mt-0.5 text-[10px]">
            {player.wins}W
          </Badge>
        )}
      </div>
      <div
        className={cn(
          'flex w-full items-center justify-center rounded-t-lg font-heading text-xl font-bold',
          barHeight,
          barColor
        )}
      >
        {rank}
      </div>
    </motion.div>
  );
}
