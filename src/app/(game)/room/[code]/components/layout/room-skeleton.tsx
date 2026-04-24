import { Skeleton } from '@/components/ui/skeleton';

export function RoomSkeleton() {
  return (
    <div className="min-h-dvh py-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 sm:px-6">
        {/* Hero header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-24 rounded-full" />
            <Skeleton className="h-9 w-64 sm:w-80" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-28 rounded-xl" />
            <Skeleton className="h-9 w-16 rounded-xl" />
          </div>
        </div>

        {/* Two-column grid */}
        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          {/* Player rail skeleton */}
          <div className="hidden flex-col overflow-hidden rounded-2xl bg-violet/80 lg:flex">
            {/* Rail header */}
            <div className="border-b border-violet-foreground/10 p-4">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-2.5 w-12 rounded-full bg-violet-foreground/20" />
                <Skeleton className="h-5 w-16 rounded-full bg-violet-foreground/20" />
              </div>
              <Skeleton className="mt-3 h-7 w-16 bg-violet-foreground/20" />
              <Skeleton className="mt-2 h-3 w-28 rounded-full bg-violet-foreground/20" />
            </div>
            {/* Player rows */}
            <div className="flex-1 space-y-1.5 px-3 py-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2.5 rounded-xl bg-violet-foreground/10 px-2 py-1.5"
                >
                  <Skeleton className="size-7 rounded-full bg-violet-foreground/20" />
                  <Skeleton className="h-3 flex-1 rounded-full bg-violet-foreground/20" />
                </div>
              ))}
            </div>
            {/* Room code */}
            <div className="border-t border-violet-foreground/10 px-3 pb-4 pt-3">
              <Skeleton className="mx-auto h-3 w-20 rounded-full bg-violet-foreground/20" />
              <Skeleton className="mx-auto mt-2 h-9 w-32 rounded-xl bg-violet-foreground/20" />
            </div>
          </div>

          {/* Main content skeleton */}
          <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex-1 px-5 py-6">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 px-1">
                  <Skeleton className="size-4 rounded" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <div className="flex flex-col divide-y rounded-2xl border bg-card">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-3 px-4 py-3.5"
                    >
                      <div className="flex items-center gap-3">
                        <Skeleton className="size-9 rounded-xl" />
                        <div className="flex flex-col gap-1.5">
                          <Skeleton className="h-3.5 w-28" />
                          <Skeleton className="h-3 w-40" />
                        </div>
                      </div>
                      <Skeleton className="h-8 w-20 rounded-xl" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="border-t border-border px-5 py-4">
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
