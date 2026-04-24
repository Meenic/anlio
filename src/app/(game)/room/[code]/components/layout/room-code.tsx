'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

type RoomCodeButtonProps = {
  code: string;
};

/**
 * Single-button room code copy — shows the code in monospace tracking
 * with an animated copy/check icon.
 */
export function RoomCodeButton({ code }: RoomCodeButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      variant="outline"
      onClick={() => void handleCopy()}
      aria-label={copied ? 'Copied room code' : 'Copy room code'}
      className="group relative h-auto gap-2.5 border-violet-foreground/15 bg-violet-foreground/10 px-5 py-2.5 font-mono text-sm font-bold tracking-[0.3em] text-violet-foreground transition-colors hover:bg-violet-foreground/15 hover:text-violet-foreground"
    >
      <span>{code}</span>
      <span className="relative size-4">
        <Copy
          className={`absolute inset-0 size-4 transition-all duration-200 ${
            copied ? 'scale-50 opacity-0' : 'scale-100 opacity-70'
          }`}
        />
        <Check
          className={`absolute inset-0 size-4 transition-all duration-200 ${
            copied ? 'scale-100 opacity-70' : 'scale-50 opacity-0'
          }`}
        />
      </span>
    </Button>
  );
}
