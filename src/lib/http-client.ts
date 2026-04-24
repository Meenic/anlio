import type { ApiErrorBody } from './http-types';

/**
 * Extract a human-readable error from a non-OK `Response` whose body was
 * produced by `jsonError`. Never throws — a malformed body collapses to
 * `fallback`. Safe to import from Client Components (no server-only deps).
 */
export async function parseApiError(
  res: Response,
  fallback: string
): Promise<string> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  return body?.message ?? body?.error ?? fallback;
}
