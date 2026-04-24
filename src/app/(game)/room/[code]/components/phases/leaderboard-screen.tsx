'use client';

import { AnimatePresence, motion } from 'framer-motion';
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
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card">
      {/* Pinned header */}
      <div className="shrink-0 border-b border-border px-4 py-3 sm:px-5">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
              Standings
            </p>
            <p className="text-xs font-medium text-muted-foreground">
              After question {questionIndex + 1} of {totalQuestions}
            </p>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground tabular-nums">
            Next in {nextIn}s
          </span>
        </div>
      </div>

      {/* Scrollable player list */}
      <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-3 sm:p-4">
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
                  'flex items-center gap-3 rounded-xl border px-3 py-2.5',
                  isSelf
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border bg-background'
                )}
              >
                <RankBadge rank={rank} />
                <Avatar className="size-8">
                  {p.avatarUrl && <AvatarImage src={p.avatarUrl} alt="" />}
                  <AvatarFallback className="text-xs">
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
                <span className="font-heading text-base font-bold tabular-nums">
                  {p.score.toLocaleString()}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const style =
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
        'flex size-7 shrink-0 items-center justify-center rounded-full p-0 font-heading text-xs font-bold shadow-none',
        style
      )}
    >
      {rank}
    </Badge>
  );
}
