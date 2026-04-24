'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { parseApiError } from '@/lib/http-client';
import type { Player, RoomState } from '@/features/room/types';
import { Check, Crown, Lock, UserX, Users, WifiOff } from 'lucide-react';
import { RoomCodeButton } from './room-code';

type PlayerRailProps = {
  room: RoomState;
  selfId: string;
  className?: string;
};

/**
 * Violet sidebar rail: header with player count, scrollable player list,
 * and room code copy button pinned at the bottom. Matches the reference
 * RoomLobbyPlayerRail design.
 */
export function PlayerRail({ room, selfId, className }: PlayerRailProps) {
  const { players, hostId, phase, settings, code, id: roomId } = room;
  const isLobby = phase === 'lobby';
  const iAmHost = selfId === hostId;

  const sorted = useMemo(() => {
    const list = Object.values(players);
    if (isLobby) {
      return [...list].sort((a, b) => {
        if (a.id === hostId) return -1;
        if (b.id === hostId) return 1;
        return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
      });
    }
    return [...list].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    });
  }, [players, hostId, isLobby]);

  const connected = useMemo(() => sorted.filter((p) => p.connected), [sorted]);

  const phaseLabel = isLobby
    ? 'Waiting for host…'
    : `Round ${room.currentQuestionIndex + 1} of ${settings.questionCount}`;

  return (
    <aside
      className={cn(
        'flex flex-col overflow-hidden rounded-2xl bg-violet text-violet-foreground',
        className
      )}
    >
      {/* Header */}
      <div className="border-b border-violet-foreground/10 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-violet-foreground/60">
            Players
          </p>
          <Badge className="gap-1 bg-violet-foreground/10 px-2 py-0.5 text-[10px] font-bold text-violet-foreground shadow-none hover:bg-violet-foreground/10">
            {settings.isPublic ? (
              <>
                <Users /> Public
              </>
            ) : (
              <>
                <Lock /> Private
              </>
            )}
          </Badge>
        </div>
        <p className="mt-2 text-2xl font-extrabold leading-none">
          {connected.length}
          <span className="ml-1.5 text-sm font-semibold text-violet-foreground/70">
            connected
          </span>
        </p>
        <p className="mt-1.5 text-xs text-violet-foreground/65">{phaseLabel}</p>
      </div>

      {/* Player list */}
      <div className="flex-1 space-y-1.5 overflow-y-auto px-3 py-3">
        <AnimatePresence initial={false}>
          {sorted.map((p, idx) => (
            <motion.div
              key={p.id}
              layout
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            >
              <PlayerRow
                player={p}
                rank={isLobby ? null : idx + 1}
                isHost={p.id === hostId}
                isSelf={p.id === selfId}
                canKick={
                  iAmHost && p.id !== hostId && p.id !== selfId && isLobby
                }
                roomId={roomId}
                showScore={!isLobby}
                showReady={isLobby}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Room code */}
      <div className="border-t border-violet-foreground/10 px-3 pb-4 pt-3">
        <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-[0.3em] text-violet-foreground/55">
          Room Code
        </p>
        <div className="flex justify-center">
          <RoomCodeButton code={code} />
        </div>
      </div>
    </aside>
  );
}

function PlayerRow({
  player,
  rank,
  isHost,
  isSelf,
  canKick,
  roomId,
  showScore,
  showReady,
}: {
  player: Player;
  rank: number | null;
  isHost: boolean;
  isSelf: boolean;
  canKick: boolean;
  roomId: string;
  showScore: boolean;
  showReady: boolean;
}) {
  const [kicking, setKicking] = useState(false);
  const [kickError, setKickError] = useState<string | null>(null);
  const initials = player.name.slice(0, 2).toUpperCase();

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

  const row = (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors',
        isSelf
          ? 'bg-violet-foreground/20 ring-1 ring-violet-foreground/30'
          : 'bg-violet-foreground/10 hover:bg-violet-foreground/15',
        !player.connected && 'opacity-50'
      )}
    >
      {rank !== null && (
        <span
          className={cn(
            'w-4 text-center font-heading text-xs font-bold tabular-nums',
            rank === 1 ? 'text-amber' : 'text-violet-foreground/60'
          )}
        >
          {rank}
        </span>
      )}
      <Avatar className="size-7">
        {player.avatarUrl && <AvatarImage src={player.avatarUrl} alt="" />}
        <AvatarFallback className="bg-violet-foreground/20 text-[10px] font-semibold text-violet-foreground">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <span className="truncate text-xs font-medium text-violet-foreground">
          {player.name}
        </span>
        {isHost && (
          <Crown className="size-3 shrink-0 text-amber fill-current" />
        )}
        {isSelf && (
          <span className="text-[10px] text-violet-foreground/60">(you)</span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {!player.connected ? (
          <WifiOff className="size-3 text-violet-foreground/50" />
        ) : showScore ? (
          <span className="font-heading text-xs font-bold tabular-nums text-violet-foreground">
            {player.score.toLocaleString()}
          </span>
        ) : showReady && player.ready && !isHost ? (
          <span className="flex size-4 items-center justify-center rounded-full bg-violet-foreground/20 text-violet-foreground">
            <Check className="size-3" />
          </span>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-0.5">
      {canKick ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={kicking}
              aria-label={`Options for ${player.name}`}
              className="w-full text-left"
            >
              {row}
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
      ) : (
        row
      )}
      {kickError && (
        <p className="px-1 text-[10px] text-destructive" role="alert">
          {kickError}
        </p>
      )}
    </div>
  );
}
