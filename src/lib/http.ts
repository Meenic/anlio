// NOTE: this module transitively imports `@/features/room/store`, which
// uses `next/cache` and therefore cannot be bundled into a Client
// Component. Client code must import from `./http-client` instead.
import type { ZodType } from 'zod';
import { auth } from '@/features/session/auth';
import { RoomConflictError } from '@/features/room/store';
import { HttpError, type ApiErrorBody } from './http-types';

// Re-export so server-only callers have a single import surface.
export { HttpError, type ApiErrorBody };

// ---------------------------------------------------------------------------
// Response builders
// ---------------------------------------------------------------------------

export function httpErrorToResponse(error: HttpError): Response {
  const body: ApiErrorBody = {
    error: error.code,
    message: error.message,
    issues: error.issues,
  };
  return new Response(JSON.stringify(body), {
    status: error.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Structured JSON error response. Callers typically `throw jsonError(...)`
 * and rely on {@link withApiErrors} to re-emit it — hence the return type
 * is a plain `Response` rather than `HttpError`.
 */
export function jsonError(
  status: number,
  code: string,
  message?: string,
  issues?: unknown
): Response {
  const body: ApiErrorBody = { error: code, message, issues };
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function jsonOk<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

/**
 * Validate a request body against a Zod schema.
 * Throws an {@link HttpError} (400) on failure — auto-converted by
 * {@link withApiErrors}.
 */
export async function validateBody<T>(
  request: Request,
  schema: ZodType<T>
): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body is not valid JSON.');
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new HttpError(
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
 * Throws an {@link HttpError} (401) on failure.
 */
export async function requireAuth(
  request: Request
): Promise<{ id: string; name: string; image?: string | null }> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id)
    throw new HttpError(401, 'unauthorized', 'Unauthorized');
  return session.user;
}

// ---------------------------------------------------------------------------
// Route-handler wrapper
// ---------------------------------------------------------------------------

/**
 * Uniform error boundary for every `app/api/**` route handler.
 *
 * Catches:
 * - `HttpError` → structured JSON response at the declared status.
 * - `Response` — convention for code that does `throw jsonError(...)`.
 * - `RoomConflictError` → legacy mutex-contention signal → 409.
 * - Everything else → 500 + console.error.
 */
export async function withApiErrors(
  fn: () => Promise<Response>
): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof HttpError) return httpErrorToResponse(error);
    if (error instanceof Response) return error;
    if (error instanceof RoomConflictError) {
      return httpErrorToResponse(
        new HttpError(409, 'room_conflict', error.message)
      );
    }
    console.error('[api] unhandled route error', error);
    return httpErrorToResponse(
      new HttpError(500, 'internal_error', 'Internal server error')
    );
  }
}
