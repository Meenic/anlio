'use client';

import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Check, X } from 'lucide-react';
import type { RevealPayload } from '@/modules/game/types';

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

  // How many players chose each option (for the breakdown bar).
  const countsByOption: Record<string, number> = {};
  for (const opt of reveal.question.options) countsByOption[opt.id] = 0;
  for (const chosen of Object.values(reveal.answers)) {
    if (countsByOption[chosen] !== undefined) countsByOption[chosen]++;
  }
  const totalAnswers = Object.values(reveal.answers).length || 1;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span className="font-medium">
          Question {reveal.questionIndex + 1} / {reveal.totalQuestions}
        </span>
        <ScoreBadge
          delta={myDelta}
          correct={gotItRight}
          skipped={didNotAnswer}
        />
      </div>

      <Card>
        <CardContent className="flex min-h-32 items-center justify-center p-6">
          <h2 className="text-center font-heading text-2xl font-semibold sm:text-3xl">
            {reveal.question.text}
          </h2>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {reveal.question.options.map((opt, i) => {
          const isCorrect = opt.id === reveal.correctOptionId;
          const isMine = opt.id === myAnswer;
          const count = countsByOption[opt.id] ?? 0;
          const pct = Math.round((count / totalAnswers) * 100);

          return (
            <div
              key={opt.id}
              className={cn(
                'relative overflow-hidden rounded-xl border-2 p-4 transition-colors',
                isCorrect
                  ? 'border-emerald-500 bg-emerald-500/10'
                  : isMine
                    ? 'border-destructive bg-destructive/10'
                    : 'border-border bg-card'
              )}
            >
              {/* Answer-breakdown fill */}
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className={cn(
                  'absolute inset-y-0 left-0 z-0 opacity-30',
                  isCorrect ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                )}
              />
              <div className="relative z-10 flex items-center gap-4">
                <span
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-full font-heading text-lg font-bold',
                    isCorrect
                      ? 'bg-emerald-500 text-white'
                      : isMine
                        ? 'bg-destructive text-destructive-foreground'
                        : 'bg-secondary text-secondary-foreground'
                  )}
                >
                  {isCorrect ? (
                    <Check className="size-5" />
                  ) : isMine ? (
                    <X className="size-5" />
                  ) : (
                    LETTERS[i]
                  )}
                </span>
                <span className="flex-1 text-base font-medium">{opt.text}</span>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {count}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        {didNotAnswer
          ? 'You didn’t answer in time.'
          : gotItRight
            ? 'Nice! You got it right.'
            : 'Not this time — better luck next round.'}
      </p>
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
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive"
      >
        +0
      </motion.span>
    );
  }

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.6, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 18 }}
      className="rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400"
    >
      +{delta.toLocaleString()}
    </motion.span>
  );
}
