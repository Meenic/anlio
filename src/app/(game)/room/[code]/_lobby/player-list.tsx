'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { MAX_PLAYERS } from '@/modules/room/constants';
import { parseApiError } from '@/lib/api/client';
import type { Player } from '@/modules/room/types';
import { Check, Crown, WifiOff, UserX } from 'lucide-react';

type PlayerListProps = {
  players: Record<string, Player>;
  hostId: string;
  selfId: string | null;
  roomId: string;
};

export function PlayerList({
  players,
  hostId,
  selfId,
  roomId,
}: PlayerListProps) {
  const isHost = selfId === hostId;

  // Stable order: host first, then by name. Using `id` as final tiebreaker
  // guarantees deterministic render across re-renders.
  const sorted = Object.values(players).sort((a, b) => {
    if (a.id === hostId) return -1;
    if (b.id === hostId) return 1;
    return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });

  const total = sorted.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Players</span>
          <span className="text-sm font-normal text-muted-foreground">
            {total} / {MAX_PLAYERS}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3.5">
        {sorted.map((p) => (
          <PlayerRow
            key={p.id}
            player={p}
            isHost={p.id === hostId}
            isSelf={p.id === selfId}
            canKick={isHost && p.id !== hostId && p.id !== selfId}
            roomId={roomId}
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
  canKick,
  roomId,
}: {
  player: Player;
  isHost: boolean;
  isSelf: boolean;
  canKick: boolean;
  roomId: string;
}) {
  const [kicking, setKicking] = useState(false);
  const [kickError, setKickError] = useState<string | null>(null);
  const initial = player.name.charAt(0).toUpperCase();

  async function handleKick() {
    if (kicking) return;
    setKicking(true);
    setKickError(null);
    try {
      const res = await fetch(`/api/room/${roomId}/kick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: player.id }),
      });
      if (!res.ok) {
        throw new Error(
          await parseApiError(res, `Failed to kick player (${res.status})`)
        );
      }
    } catch (e) {
      setKickError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setKicking(false);
    }
  }

  const rowContent = (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl transition-opacity',
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
          {isSelf && <span className="ml-1 text-muted-foreground">(you)</span>}
        </span>
        {isHost && (
          <Badge variant="secondary">
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

  if (!canKick) {
    return (
      <div className="flex flex-col gap-1">
        {rowContent}
        {kickError && (
          <p className="text-xs text-destructive" role="alert">
            {kickError}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={kicking}
            className="cursor-pointer text-left"
            aria-label={`Options for ${player.name}`}
          >
            {rowContent}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            variant="destructive"
            onClick={handleKick}
            disabled={kicking}
          >
            <UserX />
            Kick player
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {kickError && (
        <p className="text-xs text-destructive" role="alert">
          {kickError}
        </p>
      )}
    </div>
  );
}
