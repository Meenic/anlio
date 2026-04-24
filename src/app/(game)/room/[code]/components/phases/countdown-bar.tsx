'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type CountdownBarProps = {
  /** Epoch ms when the current phase ends. */
  phaseEndsAt: number;
  /** Total duration of the phase in ms (used to compute the bar's 100% width). */
  durationMs: number;
  /** Optional label shown next to the bar (e.g. remaining seconds). Defaults
   *  to the computed remaining seconds when omitted. */
  label?: string;
  className?: string;
};

/**
 * Smoothly-shrinking progress bar anchored to a server-authoritative
 * `phaseEndsAt` wall-clock. The bar's width is recomputed on a `requestAnimationFrame`
 * loop so it stays in sync even if the tab was backgrounded.
 *
 * Color transitions:
 *  - > 50% remaining  → `bg-primary`
 *  - 25–50% remaining → `bg-chart-4` (amber) via `bg-yellow-500` fallback token
 *  - < 25% remaining  → `bg-destructive`
 */
export function CountdownBar({
  phaseEndsAt,
  durationMs,
  label,
  className,
}: CountdownBarProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setNow(Date.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const remainingMs = Math.max(0, phaseEndsAt - now);
  const pct = Math.min(100, Math.max(0, (remainingMs / durationMs) * 100));
  const remainingSec = Math.ceil(remainingMs / 1000);

  const barColor =
    pct > 50 ? 'bg-primary' : pct > 25 ? 'bg-amber-500' : 'bg-destructive';

  return (
    <div className={cn('flex w-full flex-col gap-1.5', className)}>
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span>{label ?? 'Time left'}</span>
        <span className="tabular-nums">{remainingSec}s</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={cn('h-full rounded-full transition-colors', barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
