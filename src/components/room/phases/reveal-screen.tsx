'use client';

import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Check, X } from 'lucide-react';
import type { RevealPayload } from '@/features/game/types';

type RevealScreenProps = {
  reveal: RevealPayload;
  selfId: string;
};

const LETTERS = ['A', 'B', 'C', 'D'] as const;

export function RevealScreen({ reveal, selfId }: RevealScreenProps) {
  const myAnswer = reveal.answers[selfId];
  const myDelta = reveal.scoreDeltas[selfId] ?? 0;
  const gotItRight = myAnswer === reveal.correctOptionId;
  const didNotAnswer = myAnswer === undefined;

  const countsByOption: Record<string, number> = {};
  for (const opt of reveal.question.options) countsByOption[opt.id] = 0;
  for (const chosen of Object.values(reveal.answers)) {
    if (countsByOption[chosen] !== undefined) countsByOption[chosen]++;
  }
  const totalAnswers = Object.values(reveal.answers).length || 1;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card">
      {/* Pinned top bar */}
      <div className="shrink-0 border-b border-border px-4 py-3 sm:px-5">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
              Results
            </p>
            <p className="text-xs font-medium text-muted-foreground">
              Question {reveal.questionIndex + 1} of {reveal.totalQuestions}
            </p>
          </div>
          <ScoreBadge
            delta={myDelta}
            correct={gotItRight}
            skipped={didNotAnswer}
          />
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-5">
        {/* Question recap */}
        <Card className="shrink-0">
          <CardContent className="flex min-h-20 items-center justify-center p-5">
            <h2 className="text-center font-heading text-lg font-semibold sm:text-xl">
              {reveal.question.text}
            </h2>
          </CardContent>
        </Card>

        {/* Options with breakdown */}
        <div className="grid shrink-0 grid-cols-1 gap-2.5 sm:grid-cols-2">
          {reveal.question.options.map((opt, i) => {
            const isCorrect = opt.id === reveal.correctOptionId;
            const isMine = opt.id === myAnswer;
            const count = countsByOption[opt.id] ?? 0;
            const pct = Math.round((count / totalAnswers) * 100);

            return (
              <div
                key={opt.id}
                className={cn(
                  'relative overflow-hidden rounded-xl border-2 p-3.5 transition-colors',
                  isCorrect
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : isMine
                      ? 'border-destructive bg-destructive/10'
                      : 'border-border bg-card'
                )}
              >
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.55, delay: 0.08 }}
                  className={cn(
                    'absolute inset-y-0 left-0 z-0 opacity-25',
                    isCorrect ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                  )}
                />
                <div className="relative z-10 flex items-center gap-3">
                  <span
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-full font-heading text-sm font-bold',
                      isCorrect
                        ? 'bg-emerald-500 text-white'
                        : isMine
                          ? 'bg-destructive text-destructive-foreground'
                          : 'bg-secondary text-secondary-foreground'
                    )}
                  >
                    {isCorrect ? (
                      <Check className="size-4" />
                    ) : isMine ? (
                      <X className="size-4" />
                    ) : (
                      LETTERS[i]
                    )}
                  </span>
                  <span className="flex-1 text-sm font-medium">{opt.text}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {count}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pinned bottom status */}
      <div className="shrink-0 border-t border-border px-4 py-2.5 sm:px-5">
        <p className="text-center text-[11px] text-muted-foreground">
          {didNotAnswer
            ? "You didn't answer in time."
            : gotItRight
              ? 'Nice! You got it right.'
              : 'Not this time — better luck next round.'}
        </p>
      </div>
    </div>
  );
}

function ScoreBadge({
  delta,
  correct,
  skipped,
}: {
  delta: number;
  correct: boolean;
  skipped: boolean;
}) {
  if (skipped) {
    return (
      <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
        No answer
      </span>
    );
  }
  if (!correct) {
    return (
      <motion.span
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive"
      >
        +0
      </motion.span>
    );
  }
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.7, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 18 }}
      className="rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400"
    >
      +{delta.toLocaleString()}
    </motion.span>
  );
}
