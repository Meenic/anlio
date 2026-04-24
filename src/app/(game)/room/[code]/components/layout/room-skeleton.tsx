import { Skeleton } from '@/components/ui/skeleton';

export function RoomSkeleton() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <div className="mx-auto flex w-full max-w-5xl flex-1 min-h-0 flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
        {/* Hero header */}
        <div className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-2.5 w-20 rounded-full" />
            <Skeleton className="h-8 w-56 sm:w-72" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-28 rounded-xl" />
            <Skeleton className="h-9 w-16 rounded-xl" />
          </div>
        </div>

        {/* Main grid */}
        <div className="grid flex-1 min-h-0 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          {/* Player rail skeleton */}
          <div className="hidden flex-col overflow-hidden rounded-2xl bg-violet/80 lg:flex">
            <div className="border-b border-violet-foreground/10 p-4">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-2.5 w-12 rounded-full bg-violet-foreground/20" />
                <Skeleton className="h-5 w-16 rounded-full bg-violet-foreground/20" />
              </div>
              <Skeleton className="mt-3 h-7 w-14 bg-violet-foreground/20" />
              <Skeleton className="mt-2 h-2.5 w-28 rounded-full bg-violet-foreground/20" />
            </div>
            <div className="flex-1 space-y-1.5 px-3 py-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2.5 rounded-xl bg-violet-foreground/10 px-2 py-1.5"
                >
                  <Skeleton className="size-7 rounded-full bg-violet-foreground/20" />
                  <Skeleton className="h-2.5 flex-1 rounded-full bg-violet-foreground/20" />
                </div>
              ))}
            </div>
            <div className="border-t border-violet-foreground/10 px-3 pb-4 pt-3">
              <Skeleton className="mx-auto h-2.5 w-20 rounded-full bg-violet-foreground/20" />
              <Skeleton className="mx-auto mt-2.5 h-9 w-32 rounded-xl bg-violet-foreground/20" />
            </div>
          </div>

          {/* Main content skeleton */}
          <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
            {/* Pinned header strip */}
            <div className="shrink-0 border-b border-border px-5 py-3">
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-2.5 w-16 rounded-full" />
                  <Skeleton className="h-2.5 w-28 rounded-full" />
                </div>
                <Skeleton className="h-8 w-20 rounded-xl" />
              </div>
            </div>
            {/* Body */}
            <div className="flex flex-1 flex-col gap-3 overflow-hidden px-5 py-5">
              <div className="flex flex-col gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <Skeleton className="size-8 rounded-full" />
                      <div className="flex flex-col gap-1.5">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-2.5 w-36" />
                      </div>
                    </div>
                    <Skeleton className="h-7 w-16 rounded-xl" />
                  </div>
                ))}
              </div>
            </div>
            {/* Pinned footer strip */}
            <div className="shrink-0 border-t border-border px-5 py-4">
              <div className="flex items-stretch gap-3">
                <Skeleton className="h-11 flex-1 rounded-xl" />
                <Skeleton className="h-11 flex-2 rounded-xl" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
