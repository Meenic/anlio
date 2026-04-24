'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { parseApiError } from '@/lib/http-client';
import type { QuestionPayload } from '@/features/game/types';
import type { RoomState } from '@/features/room/types';
import { CountdownBar } from './countdown-bar';

type QuestionScreenProps = {
  room: RoomState;
  question: QuestionPayload;
  answerCount: number;
};

const LETTERS = ['A', 'B', 'C', 'D'] as const;

export function QuestionScreen({
  room,
  question,
  answerCount,
}: QuestionScreenProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelected(null);
    setSubmitting(false);
    setLocked(false);
    setError(null);
  }, [question.question.id]);

  const lockOnFirstSubmit = room.settings.answerMode === 'lock_on_first_submit';
  const durationMs = room.settings.timePerQuestion * 1000;

  const connectedCount = useMemo(
    () => Object.values(room.players).filter((p) => p.connected).length,
    [room.players]
  );

  async function submit(optionId: string) {
    if (submitting || locked) return;
    setSelected(optionId);
    setSubmitting(true);
    setError(null);
    if (lockOnFirstSubmit) setLocked(true);
    try {
      const res = await fetch(`/api/room/${room.id}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionId }),
      });
      if (!res.ok) {
        if (res.status === 409) {
          setLocked(true);
        } else {
          throw new Error(
            await parseApiError(res, `Couldn't submit answer (${res.status})`)
          );
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      if (!lockOnFirstSubmit) setLocked(false);
    } finally {
      setSubmitting(false);
    }
  }

  const categoryLabel =
    room.settings.category.charAt(0).toUpperCase() +
    room.settings.category.slice(1);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card">
      {/* Pinned top bar: progress + meta + countdown */}
      <div className="shrink-0 space-y-3 border-b border-border px-4 py-3 sm:px-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
              Question
            </p>
            <ProgressDots current={question.index} total={question.total} />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">
            {answerCount}/{connectedCount} answered
          </span>
        </div>
        {room.phaseEndsAt !== null && (
          <CountdownBar
            phaseEndsAt={room.phaseEndsAt}
            durationMs={durationMs}
          />
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-5">
        {/* Question card */}
        <Card className="shrink-0">
          <CardContent className="flex min-h-24 flex-col items-center justify-center gap-2 p-5">
            <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-primary">
              {categoryLabel}
            </span>
            <motion.h2
              key={question.question.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="text-center font-heading text-xl font-semibold sm:text-2xl"
            >
              {question.question.text}
            </motion.h2>
          </CardContent>
        </Card>

        {error && (
          <p className="shrink-0 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}

        {/* Answer options */}
        <div className="grid shrink-0 grid-cols-1 gap-2.5 sm:grid-cols-2">
          {question.question.options.map((opt, i) => {
            const isSelected = selected === opt.id;
            return (
              <Button
                key={opt.id}
                variant={isSelected ? 'default' : 'outline'}
                size="lg"
                disabled={locked && !isSelected}
                onClick={() => submit(opt.id)}
                className={cn(
                  'h-auto min-h-16 justify-start gap-3 whitespace-normal px-4 py-3 text-left',
                  isSelected && 'ring-2 ring-primary ring-offset-2'
                )}
              >
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full font-heading text-sm font-bold',
                    isSelected
                      ? 'bg-primary-foreground text-primary'
                      : 'bg-secondary text-secondary-foreground'
                  )}
                >
                  {LETTERS[i]}
                </span>
                <span className="flex-1 text-sm">{opt.text}</span>
              </Button>
            );
          })}
        </div>
      </div>

      {/* Pinned bottom hint */}
      <div className="shrink-0 border-t border-border px-4 py-2.5 sm:px-5">
        <p className="text-center text-[11px] text-muted-foreground">
          {lockOnFirstSubmit
            ? 'Your first answer is locked in.'
            : 'You can change your answer until the timer runs out.'}
        </p>
      </div>
    </div>
  );
}

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div
      className="flex items-center gap-1"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current + 1}
      aria-label={`Question ${current + 1} of ${total}`}
    >
      {Array.from({ length: total }).map((_, i) => {
        const isCurrent = i === current;
        const isPast = i < current;
        return (
          <span
            key={i}
            className={cn(
              'h-1.5 rounded-full transition-all duration-300',
              isCurrent
                ? 'w-5 bg-primary'
                : isPast
                  ? 'w-1.5 bg-muted-foreground/60'
                  : 'w-1.5 bg-muted-foreground/20'
            )}
          />
        );
      })}
    </div>
  );
}
