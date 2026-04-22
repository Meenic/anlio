'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function KickedDialog() {
  const searchParams = useSearchParams();
  const router = useRouter();
  // Snapshot the "kicked" flag on mount. We deliberately ignore later
  // searchParams changes so that cleaning the URL below does NOT hide the
  // dialog (which would cause a one-frame flash before React re-renders).
  const [open, setOpen] = useState(() => searchParams.get('kicked') === 'true');

  useEffect(() => {
    if (open) {
      // Clean the query param so a refresh doesn't re-trigger the dialog.
      router.replace('/', { scroll: false });
    }
    // Run once on mount — the local `open` snapshot is the source of truth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>You were removed</DialogTitle>
          <DialogDescription>You are no longer in the room.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Dismiss</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
