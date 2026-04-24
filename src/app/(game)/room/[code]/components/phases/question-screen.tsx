'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { parseApiError } from '@/lib/api/client';
import type { QuestionPayload } from '@/modules/game/types';
import type { RoomState } from '@/modules/room/types';
import { CountdownBar } from './countdown-bar';

type QuestionScreenProps = {
  room: RoomState;
  question: QuestionPayload;
  /** Current number of players who've submitted an answer. */
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

  // Reset local state when the question changes (new round).
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

    // Optimistically lock if the mode dictates it; otherwise allow changes
    // until the phase ends.
    if (lockOnFirstSubmit) setLocked(true);

    try {
      const res = await fetch(`/api/room/${room.id}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionId }),
      });
      if (!res.ok) {
        // 409 already_answered — treat as a soft lock, not an error.
        if (res.status === 409) {
          setLocked(true);
        } else {
          throw new Error(
            await parseApiError(res, `Couldn’t submit answer (${res.status})`)
          );
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      // Allow the user to retry if submission failed and mode permits it.
      if (!lockOnFirstSubmit) setLocked(false);
    } finally {
      setSubmitting(false);
    }
  }

  const categoryLabel =
    room.settings.category.charAt(0).toUpperCase() +
    room.settings.category.slice(1);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4 sm:gap-6 sm:p-6">
      {/* Progress dots */}
      <ProgressDots current={question.index} total={question.total} />

      {/* Top meta: answered count */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span className="font-medium">
          Question {question.index + 1} / {question.total}
        </span>
        <span>
          {answerCount} / {connectedCount} answered
        </span>
      </div>

      {room.phaseEndsAt !== null && (
        <CountdownBar phaseEndsAt={room.phaseEndsAt} durationMs={durationMs} />
      )}

      {/* Question prompt */}
      <Card>
        <CardContent className="flex min-h-32 flex-col items-center justify-center gap-3 p-6">
          <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-primary">
            {categoryLabel}
          </span>
          <motion.h2
            key={question.question.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="text-center font-heading text-2xl font-semibold sm:text-3xl"
          >
            {question.question.text}
          </motion.h2>
        </CardContent>
      </Card>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {/* Options grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                'h-auto min-h-20 justify-start gap-4 whitespace-normal px-5 py-4 text-left text-base',
                isSelected && 'ring-2 ring-primary ring-offset-2'
              )}
            >
              <span
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-full font-heading text-lg font-bold',
                  isSelected
                    ? 'bg-primary-foreground text-primary'
                    : 'bg-secondary text-secondary-foreground'
                )}
              >
                {LETTERS[i]}
              </span>
              <span className="flex-1">{opt.text}</span>
            </Button>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        {lockOnFirstSubmit
          ? 'Your first answer is locked in.'
          : 'You can change your answer until the timer runs out.'}
      </p>
    </div>
  );
}

/**
 * Row of dots visualising question progress. Past questions are filled,
 * the current question is highlighted with the primary color, and future
 * questions are outlined.
 */
function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div
      className="flex items-center justify-center gap-1.5"
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
              'h-2 rounded-full transition-all',
              isCurrent
                ? 'w-6 bg-primary'
                : isPast
                  ? 'w-2 bg-muted-foreground/60'
                  : 'w-2 bg-muted-foreground/20'
            )}
          />
        );
      })}
    </div>
  );
}
