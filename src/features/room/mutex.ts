/**
 * Per-room async mutex. All mutations to `room:{id}` must flow through
 * {@link withRoomLock} so writes from this process serialize and we never
 * need optimistic CAS retries.
 *
 * Constraint: THIS PROCESS is the only writer. Any additional deployment
 * replicas would each hold their own lock map and re-introduce the need
 * for version-checked writes. The project explicitly targets a single
 * long-running node, so this is a safe simplification for now.
 *
 * Implementation: each roomId owns a tail Promise. A new task chains onto
 * the tail via `tail.then(task)`; the map entry is cleared when the tail
 * settles so abandoned rooms don't leak memory. Rejections inside one
 * task never poison the chain — the tail Promise is coerced to `void` via
 * `.catch(() => undefined)` so downstream awaiters resume normally.
 */

type Tail = Promise<unknown>;

const tails = new Map<string, Tail>();

export async function withRoomLock<T>(
  roomId: string,
  task: () => Promise<T>
): Promise<T> {
  const previous = tails.get(roomId) ?? Promise.resolve();

  // Chain onto the previous tail — isolated via `.catch` so a prior
  // failure doesn't skip our task.
  const run = previous.catch(() => undefined).then(() => task());

  // Store the new tail so the next caller chains onto us.
  tails.set(roomId, run);

  try {
    return await run;
  } finally {
    // If no one chained onto us in the meantime, evict the entry.
    if (tails.get(roomId) === run) {
      tails.delete(roomId);
    }
  }
}

/** Testing helper — drop all in-flight locks. Do NOT call from app code. */
export function __resetRoomLocks(): void {
  tails.clear();
}
