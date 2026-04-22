'use client';

import { useCallback, useRef, useState } from 'react';

export function useNameDialog() {
  const [open, setOpen] = useState(false);
  const resolverRef = useRef<((name: string | null) => void) | null>(null);

  const promptName = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setOpen(true);
    });
  }, []);

  const handleConfirm = useCallback((name: string) => {
    resolverRef.current?.(name);
    resolverRef.current = null;
    setOpen(false);
  }, []);

  const handleOpenChange = useCallback((next: boolean) => {
    if (!next) {
      resolverRef.current?.(null);
      resolverRef.current = null;
    }
    setOpen(next);
  }, []);

  return { open, promptName, handleConfirm, handleOpenChange };
}
