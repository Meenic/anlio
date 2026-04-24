'use server';

import { headers } from 'next/headers';
import { auth } from './auth';

/**
 * Resolve the current session user, creating an anonymous one if the
 * browser has no cookie. On creation, better-auth's `next-cookies`
 * plugin pushes the `Set-Cookie` through `cookies().set()` — legal here
 * because we're in a Server Action context.
 *
 * IMPORTANT: we do NOT call `getSession` again after `signInAnonymous`.
 * The newly-minted session cookie lives in the *response* Set-Cookie
 * (handed to `cookies().set()` by the `nextCookies` plugin), NOT in the
 * `hdrs` object captured above — so a re-read would see no cookie and
 * wrongly conclude "Session lost after sign-in". Use the `user` payload
 * the sign-in endpoint already returned.
 */
export async function ensureSessionUser(): Promise<{
  id: string;
  name: string;
  image?: string | null;
}> {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (session?.user?.id) {
    return {
      id: session.user.id,
      name: session.user.name ?? 'Player',
      image: session.user.image,
    };
  }

  const signedIn = await auth.api.signInAnonymous({ headers: hdrs });
  const newUser = signedIn?.user as
    | { id?: string; name?: string | null; image?: string | null }
    | undefined;
  if (!newUser?.id) {
    throw new Error('Failed to create an anonymous session.');
  }
  return {
    id: newUser.id,
    name: newUser.name ?? 'Player',
    image: newUser.image,
  };
}

/**
 * Read-only session check — returns `null` when there is no cookie. Used by
 * the RSC prehydration path (`app/(game)/room/[code]/page.tsx`) where we
 * must NOT mutate state during render.
 */
export async function currentSessionUser(): Promise<{
  id: string;
  name: string;
  image?: string | null;
} | null> {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    name: session.user.name ?? 'Player',
    image: session.user.image,
  };
}
