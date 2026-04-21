import { authClient } from '@/lib/auth-client';

/**
 * Result of {@link getOrCreateSession}.
 *
 * - `'ready'` — a session exists (either pre-existing or freshly created and
 *   named). The caller may proceed directly to the route call.
 * - `'aborted'` — the user closed the name dialog without confirming. No
 *   session was created, no DB writes were made. The caller must NOT proceed.
 */
export type EnsureSessionResult = 'ready' | 'aborted';

/**
 * Gate the Create / Join flows on an authenticated session with a confirmed
 * display name. Contract:
 *
 * 1. If a session already exists, return `'ready'` without network activity.
 * 2. Otherwise call `promptName()`. If it resolves to `null` (dialog closed),
 *    return `'aborted'` — do nothing else.
 * 3. Otherwise create an anonymous session AND unconditionally overwrite
 *    `user.name` via `updateUser({ name })` so the DB reflects exactly what
 *    the player confirmed (never the server-generated placeholder).
 *
 * The unconditional overwrite is important: the server-side and client-side
 * `Guest-XXXXXX` generators are independent; their output will almost never
 * match character-for-character, so we always overwrite to keep `user.name`
 * in sync with what the player saw in the dialog.
 */
export async function getOrCreateSession(
  promptName: () => Promise<string | null>,
  signal?: AbortSignal
): Promise<EnsureSessionResult> {
  const { data } = await authClient.getSession();
  if (signal?.aborted) return 'aborted';
  if (data?.session) return 'ready';

  const name = await promptName();
  if (signal?.aborted) return 'aborted';
  if (name === null) return 'aborted';

  await authClient.signIn.anonymous();
  if (signal?.aborted) return 'aborted';
  await authClient.updateUser({ name });
  if (signal?.aborted) return 'aborted';
  return 'ready';
}
