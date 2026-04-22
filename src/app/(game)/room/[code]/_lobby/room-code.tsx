'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, Copy } from 'lucide-react';

const FEEDBACK_MS = 1500;

export function RoomCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending timeout on unmount so we don't setState after unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Clipboard denied / unavailable — fall through; the code is still
      // visible on screen for manual copying.
      return;
    }
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), FEEDBACK_MS);
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <div className="flex flex-col items-center gap-1 sm:items-start">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Room code
          </span>
          <span
            className="font-heading text-3xl font-semibold tabular-nums tracking-[0.2em] sm:text-4xl"
            aria-label={`Room code ${code.split('').join(' ')}`}
          >
            {code}
          </span>
        </div>
        <Button
          type="button"
          variant={copied ? 'secondary' : 'default'}
          onClick={handleCopy}
          aria-live="polite"
        >
          {copied ? (
            <>
              <Check />
              Copied
            </>
          ) : (
            <>
              <Copy />
              Copy code
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
