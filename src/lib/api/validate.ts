import type { z, ZodType } from 'zod';
import { auth } from '@/lib/auth';

/** Structured error that route middleware converts into an HTTP Response. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly message: string,
    public readonly issues?: unknown
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * Validate a request body against a Zod schema.
 *
 * On failure this THROWS an {@link HttpError}. Route handlers using
 * {@link withApiErrors} do not need an explicit catch — the wrapper
 * converts the error into the correct HTTP response automatically.
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
 * On failure this THROWS an {@link HttpError} (401) — caught by
 * {@link withApiErrors} automatically.
 */
export async function requireAuth(
  request: Request
): Promise<{ id: string; name: string; image?: string | null }> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id)
    throw new HttpError(401, 'unauthorized', 'Unauthorized');
  return session.user;
}

/**
 * Canonical shape of the body produced by {@link jsonError}. Exported so
 * client-side parsers (see `@/lib/api/client`) stay in sync with the server.
 */
export type ApiErrorBody = {
  error: string;
  message?: string;
  issues?: z.core.$ZodIssue[] | unknown;
};

/** Build a JSON {@link Response} from an {@link HttpError}. */
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

/** Structured JSON error response used by every route. */
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

/** Structured JSON success response. */
export function jsonOk<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
