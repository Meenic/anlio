'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { parseApiError } from '@/lib/http-client';
import type { RoomSettings } from '@/features/room/types';
import {
  Globe,
  ListOrdered,
  Lock,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Timer,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const CATEGORY_OPTIONS: ReadonlyArray<{ value: string; label: string }> =
  [
    { value: 'general', label: 'General' },
    { value: 'science', label: 'Science' },
    { value: 'history', label: 'History' },
    { value: 'geography', label: 'Geography' },
    { value: 'sports', label: 'Sports' },
    { value: 'entertainment', label: 'Entertainment' },
  ];

const QUESTION_COUNT_OPTIONS = [5, 10, 15, 20] as const;
const TIME_PER_QUESTION_OPTIONS = [10, 20, 30] as const;

export const ANSWER_MODE_OPTIONS: ReadonlyArray<{
  value: RoomSettings['answerMode'];
  label: string;
}> = [
  {
    value: 'allow_changes_until_deadline',
    label: 'Allow changes until deadline',
  },
  { value: 'lock_on_first_submit', label: 'Lock on first submit' },
];

type SettingsPanelProps = {
  roomId: string;
  settings: RoomSettings;
};

export function SettingsPanel({ roomId, settings }: SettingsPanelProps) {
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-1">
        <SettingsIcon className="size-4 text-muted-foreground" />
        <h2 className="font-heading text-base font-semibold">Game settings</h2>
      </div>

      <div className="flex flex-col divide-y rounded-2xl border bg-card">
        <SettingRow
          icon={ListOrdered}
          title="Questions"
          description="How many rounds to play."
          disabled={pending === 'questionCount'}
        >
          <div className="flex flex-wrap gap-1.5">
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
          </div>
        </SettingRow>

        <SettingRow
          icon={Timer}
          title="Time per question"
          description="Seconds each player has to answer."
          disabled={pending === 'timePerQuestion'}
        >
          <div className="flex flex-wrap gap-1.5">
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
          </div>
        </SettingRow>

        <SettingRow
          icon={Sparkles}
          title="Category"
          description="Topic of the questions."
          disabled={pending === 'category'}
        >
          <Select
            value={settings.category}
            onValueChange={(v) => patch('category', v)}
            disabled={pending === 'category'}
          >
            <SelectTrigger className="w-44" aria-label="Category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {CATEGORY_OPTIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow
          icon={ShieldCheck}
          title="Answer mode"
          description="Whether answers can be changed before the timer ends."
          disabled={pending === 'answerMode'}
        >
          <Select
            value={settings.answerMode}
            onValueChange={(v) =>
              patch('answerMode', v as RoomSettings['answerMode'])
            }
            disabled={pending === 'answerMode'}
          >
            <SelectTrigger className="w-52" aria-label="Answer mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {ANSWER_MODE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow
          icon={settings.isPublic ? Globe : Lock}
          title={settings.isPublic ? 'Public room' : 'Private room'}
          description={
            settings.isPublic
              ? 'Anyone with the code can join.'
              : 'Only invited players can join.'
          }
          disabled={pending === 'isPublic'}
        >
          <Switch
            checked={settings.isPublic}
            onCheckedChange={(checked) => patch('isPublic', checked)}
            disabled={pending === 'isPublic'}
            aria-label="Public room"
          />
        </SettingRow>
      </div>

      {error && (
        <p className="px-1 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function SettingRow({
  icon: Icon,
  title,
  description,
  disabled,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-start gap-3 px-4 py-3.5 transition-opacity sm:flex-row sm:items-center sm:justify-between',
        disabled && 'opacity-60'
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <Label className="text-sm font-medium">{title}</Label>
          <span className="text-xs text-muted-foreground">{description}</span>
        </div>
      </div>
      <div className="shrink-0">{children}</div>
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
