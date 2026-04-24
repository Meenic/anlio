'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { RoomState } from '@/modules/room/types';
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
 * Persistent page-level shell that wraps every phase. Provides:
 *  - A hero header with phase title, room code pill, and live indicator.
 *  - A two-column grid: 220px violet player rail on the left, main content on the right.
 *  - On mobile the rail collapses into a drawer toggled from the header.
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
    <div className="min-h-dvh py-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 sm:px-6">
        <HeaderBar room={room} sseStatus={sseStatus} />

        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          {/* Desktop player rail */}
          {sidebar ?? (
            <PlayerRail
              room={room}
              selfId={selfId}
              className="hidden lg:flex"
            />
          )}

          {/* Mobile player rail drawer */}
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

          {/* Main content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={room.phase}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Mobile floating players button */}
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
