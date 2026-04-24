'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

type StartingScreenProps = {
  phaseEndsAt: number;
};

export function StartingScreen({ phaseEndsAt }: StartingScreenProps) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.ceil((phaseEndsAt - Date.now()) / 1000))
  );

  useEffect(() => {
    const tick = () => {
      setRemaining(Math.max(0, Math.ceil((phaseEndsAt - Date.now()) / 1000)));
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [phaseEndsAt]);

  const label = remaining > 0 ? String(remaining) : 'GO!';

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 overflow-hidden rounded-2xl border border-border bg-card">
      <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground">
        Game starting
      </p>
      <AnimatePresence mode="wait">
        <motion.div
          key={label}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 1.5, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          className="select-none font-heading text-[8rem] font-bold leading-none text-primary sm:text-[11rem]"
        >
          {label}
        </motion.div>
      </AnimatePresence>
      <p className="text-sm text-muted-foreground">Get ready…</p>
    </div>
  );
}
