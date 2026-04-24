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
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 p-6">
      <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
        Game starting
      </p>
      <AnimatePresence mode="wait">
        <motion.div
          key={label}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 1.6, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          className="select-none font-heading text-[10rem] font-bold leading-none text-primary sm:text-[14rem]"
        >
          {label}
        </motion.div>
      </AnimatePresence>
      <p className="text-sm text-muted-foreground">Get ready…</p>
    </div>
  );
}
