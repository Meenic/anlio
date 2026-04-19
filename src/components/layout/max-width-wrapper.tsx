import { cn } from '@/lib/utils';
import type { ComponentProps } from 'react';

export function MaxWidthWrapper({
  className,
  ...props
}: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'mx-auto w-full max-w-5xl px-6 md:px-8 lg:px-12',
        className
      )}
      {...props}
    />
  );
}
