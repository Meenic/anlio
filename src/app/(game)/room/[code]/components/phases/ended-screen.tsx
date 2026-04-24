'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
          await parseApiError(res, `Couldn’t start rematch (${res.status})`)
        );
      }
      // The server broadcasts state_sync → phase flips to 'lobby' → this
      // component unmounts. Leave `rematching` true until that happens.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setRematching(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <Trophy className="size-10 text-yellow-500" />
        <h1 className="font-heading text-3xl font-bold">Game over</h1>
        <p className="text-sm text-muted-foreground">
          {ended.winnerIds.length === 1
            ? `${ended.players.find((p) => winnerSet.has(p.id))?.name ?? 'Someone'} wins!`
            : 'It’s a tie!'}
        </p>
      </div>

      {/* Podium */}
      <div className="flex items-end justify-center gap-3 sm:gap-6">
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
        <Card>
          <CardContent className="flex flex-col gap-1.5 p-4">
            {rest.map((p, idx) => {
              const rank = idx + 4;
              const isSelf = p.id === selfId;
              return (
                <div
                  key={p.id}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-2 py-1.5',
                    isSelf && 'bg-primary/5'
                  )}
                >
                  <span className="w-6 text-center text-sm font-medium text-muted-foreground">
                    {rank}
                  </span>
                  <Avatar className="size-8">
                    {p.avatarUrl && <AvatarImage src={p.avatarUrl} alt="" />}
                    <AvatarFallback>
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
          </CardContent>
        </Card>
      )}

      {error && (
        <p className="text-center text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex justify-center">
        {isHost ? (
          <Button size="lg" onClick={handleRematch} disabled={rematching}>
            <RotateCcw />
            {rematching ? 'Resetting…' : 'Play again'}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
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
  const height =
    rank === 1 ? 'h-32 sm:h-40' : rank === 2 ? 'h-24 sm:h-32' : 'h-20 sm:h-24';
  const color =
    rank === 1
      ? 'bg-yellow-400 text-black'
      : rank === 2
        ? 'bg-slate-300 text-black'
        : 'bg-amber-700 text-white';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: rank === 1 ? 0.2 : rank === 2 ? 0.35 : 0.5,
        type: 'spring',
        stiffness: 240,
        damping: 22,
      }}
      className="flex w-24 flex-col items-center gap-2 sm:w-28"
    >
      <div className="relative">
        {isWinner && (
          <Crown className="absolute -top-6 left-1/2 size-6 -translate-x-1/2 text-yellow-500" />
        )}
        <Avatar className="size-14 sm:size-16">
          {player.avatarUrl && <AvatarImage src={player.avatarUrl} alt="" />}
          <AvatarFallback>
            {player.name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </div>
      <div className="flex flex-col items-center gap-0.5 text-center">
        <p
          className={cn(
            'truncate text-sm font-medium',
            isSelf && 'text-primary'
          )}
        >
          {player.name}
        </p>
        <p className="text-xs tabular-nums text-muted-foreground">
          {player.score.toLocaleString()}
        </p>
        {player.wins > 0 && (
          <Badge variant="secondary" className="mt-0.5 text-[10px]">
            {player.wins} win{player.wins === 1 ? '' : 's'}
          </Badge>
        )}
      </div>
      <div
        className={cn(
          'flex w-full items-center justify-center rounded-t-lg font-heading text-2xl font-bold',
          height,
          color
        )}
      >
        {rank}
      </div>
    </motion.div>
  );
}
