'use server';

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { HttpError } from '@/lib/api/validate';
import { createRoom, joinRoomByCode } from './actions';
import { getRoom, toPublicState, updateRoom } from './store';
import { broadcast } from '@/modules/sse/broadcaster';
import { ROOM_CODE_LENGTH } from './constants';
import type { RoomState } from './types';

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
async function ensureSessionUser(): Promise<{
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

export type BootstrapFailure = {
  ok: false;
  /** Stable error code for the client to branch on. */
  code: 'room_not_found' | 'wrong_phase' | 'room_full' | 'internal_error';
  message: string;
};

export type BootstrapSuccess = {
  ok: true;
  selfId: string;
  roomId: string;
  initialState: RoomState;
  /** True iff this request created the anonymous session (client should show
   *  the inline name dialog). */
  isNewSession: boolean;
};

export type BootstrapResult = BootstrapSuccess | BootstrapFailure;

/**
 * Single-roundtrip cold-start for `/room/[code]`:
 *   1. Ensure an anonymous session exists (creates + sets cookie if not).
 *   2. Idempotently add the user to the room.
 *   3. Return the hydrated public `RoomState` so the client can render a
 *      live UI instantly — no `RoomSkeleton` flash, no `Connecting…` wait
 *      for the first SSE `state_sync`.
 *
 * This is called from a client component on mount only when the RSC pass
 * could not pre-hydrate (typically: no session cookie present). Returning
 * users hit the fast path in `page.tsx` and never invoke this action.
 */
export async function bootstrapRoomAction(
  code: string
): Promise<BootstrapResult> {
  try {
    const hdrs = await headers();
    const preSession = await auth.api.getSession({ headers: hdrs });
    const isNewSession = !preSession?.user?.id;

    const user = await ensureSessionUser();
    const { roomId } = await joinRoomByCode(code, user);

    const room = await getRoom(roomId);
    if (!room) {
      return {
        ok: false,
        code: 'room_not_found',
        message: 'Room vanished during join.',
      };
    }

    return {
      ok: true,
      selfId: user.id,
      roomId,
      initialState: toPublicState(room),
      isNewSession,
    };
  } catch (error) {
    if (error instanceof HttpError) {
      return {
        ok: false,
        code:
          error.code === 'room_not_found' ||
          error.code === 'wrong_phase' ||
          error.code === 'room_full'
            ? (error.code as BootstrapFailure['code'])
            : 'internal_error',
        message: error.message,
      };
    }
    console.error('[bootstrapRoomAction] unexpected error', error);
    return {
      ok: false,
      code: 'internal_error',
      message: 'Something went wrong.',
    };
  }
}

// ---------------------------------------------------------------------------
// Homepage entry-point actions
// ---------------------------------------------------------------------------

export type HomeActionResult =
  | { ok: true; code: string }
  | { ok: false; message: string };

/**
 * Homepage "Create a Room" button. Ensures a session cookie, creates the
 * room server-side, and returns the join code. The client then navigates
 * to `/room/{code}` where the RSC page is guaranteed to find the user as
 * a member — so the entire trip skips the bootstrap-action fallback and
 * paints the live lobby on first frame.
 */
export async function createRoomAction(): Promise<HomeActionResult> {
  try {
    const user = await ensureSessionUser();
    const { code } = await createRoom(user);
    return { ok: true, code };
  } catch (error) {
    if (error instanceof HttpError) {
      return { ok: false, message: error.message };
    }
    console.error('[createRoomAction] unexpected error', error);
    return { ok: false, message: 'Failed to create a room.' };
  }
}

/**
 * Homepage "Join Room" form. Validates + normalises the code, ensures a
 * session, and joins idempotently. Same reasoning as
 * {@link createRoomAction}: the navigation lands on a page that can fully
 * prehydrate.
 */
export async function joinRoomAction(
  rawCode: string
): Promise<HomeActionResult> {
  const code = rawCode.trim().toUpperCase();
  if (code.length !== ROOM_CODE_LENGTH) {
    return {
      ok: false,
      message: `Enter the ${ROOM_CODE_LENGTH}-character room code.`,
    };
  }
  try {
    const user = await ensureSessionUser();
    await joinRoomByCode(code, user);
    return { ok: true, code };
  } catch (error) {
    if (error instanceof HttpError) {
      return { ok: false, message: error.message };
    }
    console.error('[joinRoomAction] unexpected error', error);
    return { ok: false, message: 'Failed to join room.' };
  }
}

/**
 * Rename the current user AND propagate the new name into every room they
 * are a member of. We only update the specified room to keep writes bounded.
 */
export async function renameSelfAction(
  roomId: string,
  name: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 32) {
    return { ok: false, message: 'Name must be 1–32 characters.' };
  }
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session?.user?.id) {
    return { ok: false, message: 'Not authenticated.' };
  }
  const userId = session.user.id;

  try {
    await auth.api.updateUser({
      body: { name: trimmed },
      headers: hdrs,
    });
  } catch (error) {
    console.error('[renameSelfAction] updateUser failed', error);
    return { ok: false, message: 'Failed to update profile.' };
  }

  // Patch the in-room player snapshot + re-broadcast so other clients see it.
  const updated = await updateRoom(roomId, (r) => {
    const player = r.players[userId];
    if (!player || player.name === trimmed) return r;
    return {
      ...r,
      players: {
        ...r.players,
        [userId]: { ...player, name: trimmed },
      },
    };
  }).catch(() => null);

  if (updated?.players[userId]) {
    broadcast(roomId, {
      event: 'player_joined',
      data: {
        player: updated.players[userId],
        count: Object.values(updated.players).filter((p) => p.connected).length,
      },
    });
  }

  return { ok: true };
}
