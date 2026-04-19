import type { ZodType } from 'zod';
import { auth } from '@/lib/auth';

/**
 * Validate a request body against a Zod schema.
 *
 * On failure this THROWS a well-formed `Response` object. Route handlers
 * should catch it with the standard pattern:
 *
 * ```ts
 * try {
 *   const body = await validateBody(request, SomeSchema);
 *   // …
 * } catch (err) {
 *   if (err instanceof Response) return err;
 *   throw err;
 * }
 * ```
 */
export async function validateBody<T>(
  request: Request,
  schema: ZodType<T>
): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw jsonError(400, 'invalid_json', 'Request body is not valid JSON.');
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    throw jsonError(
      400,
      'validation_failed',
      'Request body did not match the expected schema.',
      result.error.issues
    );
  }
  return result.data;
}

/**
 * Require an authenticated session. Returns the session user object.
 * On failure this THROWS a well-formed `Response` (401) — caught by the
 * standard route catch block just like `validateBody`.
 */
export async function requireAuth(
  request: Request
): Promise<{ id: string; name: string; image?: string | null }> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) throw jsonError(401, 'unauthorized');
  return session.user;
}

/** Structured JSON error response used by every route. */
export function jsonError(
  status: number,
  code: string,
  message?: string,
  issues?: unknown
): Response {
  return new Response(JSON.stringify({ error: code, message, issues }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Structured JSON success response. */
export function jsonOk<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
