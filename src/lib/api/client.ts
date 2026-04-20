import type { ApiErrorBody } from './validate';

/**
 * Client-side helper: extract a human-readable error message from a non-OK
 * `Response` whose body was produced by `jsonError`.
 *
 * Fallback order matches the legacy behavior already present across the UI:
 *   1. `body.message` — the human-friendly message set by `jsonError`
 *   2. `body.error`   — the machine error code (e.g. `room_full`).
 *                       Preserved for backwards compatibility; note that
 *                       this surfaces the CODE to the user when `message`
 *                       is missing, which is a minor UX wart — consider
 *                       always setting a message on the server instead.
 *   3. `fallback`     — caller-provided default, typically includes status.
 *
 * Never throws; a malformed body collapses to the fallback.
 */
export async function parseApiError(
  res: Response,
  fallback: string
): Promise<string> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  return body?.message ?? body?.error ?? fallback;
}
