import type { z } from 'zod';

/**
 * Structured error used by every route handler. Lives here (not in
 * `./http`) so client components can reference the shape without pulling
 * in server-only transitive deps (`next/cache`, Redis, etc.).
 */
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

/** Canonical shape of the body produced by `jsonError`. */
export type ApiErrorBody = {
  error: string;
  message?: string;
  issues?: z.core.$ZodIssue[] | unknown;
};
