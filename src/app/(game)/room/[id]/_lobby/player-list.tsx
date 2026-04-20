'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { MAX_PLAYERS } from '@/modules/room/constants';
import type { Player } from '@/modules/room/types';
import { Check, Crown, WifiOff } from 'lucide-react';

type PlayerListProps = {
  players: Record<string, Player>;
  hostId: string;
  selfId: string | null;
};

export function PlayerList({ players, hostId, selfId }: PlayerListProps) {
  // Stable order: host first, then by name. Using `id` as final tiebreaker
  // guarantees deterministic render across re-renders.
  const sorted = Object.values(players).sort((a, b) => {
    if (a.id === hostId) return -1;
    if (b.id === hostId) return 1;
    return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });

  const total = sorted.length;

  return (
    <Card size="sm" className="gap-3">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Players</span>
          <span className="text-sm font-normal text-muted-foreground">
            {total} / {MAX_PLAYERS}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        {sorted.map((p) => (
          <PlayerRow
            key={p.id}
            player={p}
            isHost={p.id === hostId}
            isSelf={p.id === selfId}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function PlayerRow({
  player,
  isHost,
  isSelf,
}: {
  player: Player;
  isHost: boolean;
  isSelf: boolean;
}) {
  const initial = player.name.charAt(0).toUpperCase();

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl px-3 py-2 transition-opacity',
        !player.connected && 'opacity-60'
      )}
      data-connected={player.connected}
    >
      <div
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1 ring-inset',
          player.connected
            ? 'bg-primary/10 text-primary ring-primary/20'
            : 'bg-muted text-muted-foreground ring-border'
        )}
        aria-hidden
      >
        {initial}
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-sm font-medium">
          {player.name}
          {isSelf && (
            <span className="ml-1 text-muted-foreground">(you)</span>
          )}
        </span>
        {isHost && (
          <Badge variant="secondary" className="gap-1">
            <Crown />
            Host
          </Badge>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {!player.connected && (
          <Badge variant="outline" className="gap-1 text-muted-foreground">
            <WifiOff />
            Offline
          </Badge>
        )}
        {player.connected && player.ready && !isHost && (
          <Badge className="gap-1">
            <Check />
            Ready
          </Badge>
        )}
      </div>
    </div>
  );
}
