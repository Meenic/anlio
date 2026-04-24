'use server';

import { headers } from 'next/headers';
import { auth } from '@/features/session/auth';
import { ensureSessionUser } from '@/features/session/ensure-user.server';
import { HttpError } from '@/lib/http';
import { broadcast } from '@/features/realtime/broadcaster';
import { joinRoomByCode } from './service';
import { getRoom, toPublicState, updateRoom } from './store';
import type { RoomState } from './types';

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

    const user = await ensureSessionUser(preSession);
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

/**
 * Rename the current user AND propagate the new name into the specified
 * room, re-broadcasting a `player_joined` so other clients see it.
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
  try {
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
    });

    if (updated.players[userId]) {
      broadcast(roomId, {
        event: 'player_joined',
        data: {
          player: updated.players[userId],
          count: Object.values(updated.players).filter((p) => p.connected)
            .length,
        },
      });
    }
  } catch (error) {
    console.error('[renameSelfAction] updateRoom failed', error);
    return { ok: false, message: 'Failed to update room state.' };
  }

  return { ok: true };
}
