'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { RoomState } from '@/features/room/types';
import type { RoomSseStatus } from '@/hooks/use-room-sse';
import { HeaderBar } from './header-bar';
import { PlayerRail } from './player-rail';
import { Button } from '@/components/ui/button';
import { Users } from 'lucide-react';

type RoomLayoutProps = {
  room: RoomState;
  selfId: string;
  sseStatus?: RoomSseStatus;
  /** Optional sidebar slot. Falls back to built-in PlayerRail. */
  sidebar?: React.ReactNode;
  /** Main phase content (lobby body, question screen, etc.). */
  children: React.ReactNode;
};

/**
 * Fixed-height page shell that wraps every phase.
 *
 * Uses `h-dvh` so the viewport height is always fully occupied — the player
 * rail and main content always have the same height regardless of which phase
 * is active. Each phase component is responsible for making itself `h-full`
 * and handling its own internal overflow/scrolling.
 */
export function RoomLayout({
  room,
  selfId,
  sseStatus,
  sidebar,
  children,
}: RoomLayoutProps) {
  const [railOpen, setRailOpen] = useState(false);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <div className="mx-auto flex w-full max-w-5xl flex-1 min-h-0 flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
        {/* Hero header — shrinks, does not scroll */}
        <HeaderBar room={room} sseStatus={sseStatus} />

        {/* Main grid — fills remaining height */}
        <div className="grid flex-1 min-h-0 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          {/* Desktop sidebar */}
          {sidebar ?? (
            <PlayerRail
              room={room}
              selfId={selfId}
              className="hidden lg:flex"
            />
          )}

          {/* Mobile player-rail drawer */}
          <AnimatePresence>
            {railOpen && (
              <>
                <motion.div
                  key="backdrop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="fixed inset-0 z-40 bg-foreground/30 lg:hidden"
                  onClick={() => setRailOpen(false)}
                />
                <motion.div
                  key="rail"
                  initial={{ x: '-100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '-100%' }}
                  transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                  className="fixed inset-y-0 left-0 z-50 w-[220px] shadow-2xl lg:hidden"
                >
                  {sidebar ?? (
                    <PlayerRail
                      room={room}
                      selfId={selfId}
                      className="flex h-full rounded-none"
                    />
                  )}
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* Phase content — animated on phase change, fills grid cell */}
          <AnimatePresence mode="wait">
            <motion.div
              key={room.phase}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="min-h-0"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Mobile floating players toggle */}
      <Button
        type="button"
        size="icon"
        className="fixed bottom-4 right-4 z-30 shadow-lg lg:hidden"
        onClick={() => setRailOpen((o) => !o)}
        aria-label="Show players"
      >
        <Users />
      </Button>
    </div>
  );
}
