'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { generateGuestName } from '@/lib/random';

const MAX_NAME_LENGTH = 32;

export type NameDialogProps = {
  open: boolean;
  /** Called with the trimmed name when the user confirms. */
  onConfirm: (name: string) => void;
  /** Called with `false` when the dialog closes for any reason (Escape,
   *  backdrop click, explicit close). The parent should treat this as
   *  an abort — no session created, no auth call made. */
  onOpenChange: (open: boolean) => void;
  /** Optional — shown as the dialog title. Defaults to "Pick a display name". */
  title?: string;
  /** Optional — shown as the primary button label. Defaults to "Continue". */
  confirmLabel?: string;
};

export function NameDialog({
  open,
  onConfirm,
  onOpenChange,
  title = 'Pick a display name',
  confirmLabel = 'Continue',
}: NameDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/*
          Radix unmounts DialogContent when `open` is false, so `DialogBody`
          remounts on each open. That lets `useState(() => generateGuestName())`
          produce a fresh Guest-XXXXXX per open without a setState-in-effect.
        */}
        {open && (
          <DialogBody
            title={title}
            confirmLabel={confirmLabel}
            onConfirm={onConfirm}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type DialogBodyProps = {
  title: string;
  confirmLabel: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
};

function DialogBody({
  title,
  confirmLabel,
  onConfirm,
  onCancel,
}: DialogBodyProps) {
  const [name, setName] = useState(() => generateGuestName());

  const trimmed = name.trim();
  const canConfirm = trimmed.length > 0 && trimmed.length <= MAX_NAME_LENGTH;

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!canConfirm) return;
    onConfirm(trimmed);
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          This is how other players will see you. You can change it later from
          your profile.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-2 py-4">
        <Label htmlFor="display-name-input">Display name</Label>
        <Input
          id="display-name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_NAME_LENGTH}
          autoFocus
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canConfirm}>
          {confirmLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
