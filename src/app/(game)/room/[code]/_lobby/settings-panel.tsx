'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { parseApiError } from '@/lib/api/client';
import type { RoomSettings } from '@/modules/room/types';

/**
 * Categories are validated server-side as any non-empty string up to 32 chars
 * (`@/src/app/api/room/schemas.ts` → `RoomSettingsSchema.category`). This
 * preset list is purely a UI affordance — the server does not constrain which
 * strings are valid, so adding/removing entries here is safe.
 */
const CATEGORY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'general', label: 'General' },
  { value: 'science', label: 'Science' },
  { value: 'history', label: 'History' },
  { value: 'geography', label: 'Geography' },
  { value: 'sports', label: 'Sports' },
  { value: 'entertainment', label: 'Entertainment' },
];

const QUESTION_COUNT_OPTIONS = [5, 10, 15, 20] as const;
const TIME_PER_QUESTION_OPTIONS = [10, 20, 30] as const;

type SettingsPanelProps = {
  roomId: string;
  settings: RoomSettings;
};

export function SettingsPanel({ roomId, settings }: SettingsPanelProps) {
  // `pending` tracks which key has an in-flight PATCH so we can dim that
  // group while awaiting the server's `settings_updated` broadcast. Actual
  // state is still read from props (SSE) — no local copy of `settings`.
  const [pending, setPending] = useState<keyof RoomSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function patch<K extends keyof RoomSettings>(
    key: K,
    value: RoomSettings[K]
  ) {
    if (settings[key] === value) return;
    setPending(key);
    setError(null);
    try {
      const res = await fetch(`/api/room/${roomId}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) {
        throw new Error(
          await parseApiError(res, `Failed to update settings (${res.status})`)
        );
      }
      // No setState — the authoritative value arrives via the
      // `settings_updated` SSE event and flows through the hook.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setPending(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Game settings</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <SettingGroup label="Questions" disabled={pending === 'questionCount'}>
          {QUESTION_COUNT_OPTIONS.map((n) => (
            <OptionButton
              key={n}
              selected={settings.questionCount === n}
              onClick={() => patch('questionCount', n)}
              disabled={pending === 'questionCount'}
            >
              {n}
            </OptionButton>
          ))}
        </SettingGroup>

        <SettingGroup
          label="Time per question"
          disabled={pending === 'timePerQuestion'}
        >
          {TIME_PER_QUESTION_OPTIONS.map((s) => (
            <OptionButton
              key={s}
              selected={settings.timePerQuestion === s}
              onClick={() => patch('timePerQuestion', s)}
              disabled={pending === 'timePerQuestion'}
            >
              {s}s
            </OptionButton>
          ))}
        </SettingGroup>

        <SettingGroup label="Category" disabled={pending === 'category'}>
          {CATEGORY_OPTIONS.map((c) => (
            <OptionButton
              key={c.value}
              selected={settings.category === c.value}
              onClick={() => patch('category', c.value)}
              disabled={pending === 'category'}
            >
              {c.label}
            </OptionButton>
          ))}
        </SettingGroup>

        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function SettingGroup({
  label,
  disabled,
  children,
}: {
  label: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 transition-opacity',
        disabled && 'opacity-60'
      )}
    >
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </Label>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function OptionButton({
  selected,
  ...rest
}: React.ComponentProps<typeof Button> & { selected: boolean }) {
  return (
    <Button
      type="button"
      size="sm"
      variant={selected ? 'default' : 'outline'}
      aria-pressed={selected}
      {...rest}
    />
  );
}
