'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { LeaderboardPayload } from '@/modules/game/types';

type LeaderboardScreenProps = {
  leaderboard: LeaderboardPayload;
  selfId: string;
};

export function LeaderboardScreen({
  leaderboard,
  selfId,
}: LeaderboardScreenProps) {
  const { players, nextIn, questionIndex, totalQuestions } = leaderboard;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span className="font-medium">
          After question {questionIndex + 1} / {totalQuestions}
        </span>
        <span>Next in {nextIn}s…</span>
      </div>

      <h2 className="text-center font-heading text-3xl font-bold">
        Leaderboard
      </h2>

      <Card>
        <CardContent className="flex flex-col gap-2 p-4">
          <AnimatePresence initial={false}>
            {players.map((p, idx) => {
              const isSelf = p.id === selfId;
              const rank = idx + 1;
              return (
                <motion.div
                  key={p.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border px-3 py-2.5',
                    isSelf
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-card'
                  )}
                >
                  <RankBadge rank={rank} />
                  <Avatar className="size-9">
                    {p.avatarUrl && <AvatarImage src={p.avatarUrl} alt="" />}
                    <AvatarFallback>
                      {p.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 overflow-hidden">
                    <p className="truncate text-sm font-medium">
                      {p.name}
                      {isSelf && (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          (you)
                        </span>
                      )}
                    </p>
                    {!p.connected && (
                      <p className="text-xs text-muted-foreground">Offline</p>
                    )}
                  </div>
                  <span className="font-heading text-lg font-bold tabular-nums">
                    {p.score.toLocaleString()}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </CardContent>
      </Card>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const medal =
    rank === 1
      ? 'bg-yellow-400 text-black'
      : rank === 2
        ? 'bg-slate-300 text-black'
        : rank === 3
          ? 'bg-amber-700 text-white'
          : 'bg-secondary text-secondary-foreground';

  return (
    <Badge
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full p-0 font-heading text-sm font-bold',
        medal
      )}
    >
      {rank}
    </Badge>
  );
}
