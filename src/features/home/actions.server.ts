'use server';

import { HttpError } from '@/lib/http';
import { ensureSessionUser } from '@/features/session/ensure-user.server';
import { createRoom, joinRoomByCode } from '@/features/room/service';
import { ROOM_CODE_LENGTH } from '@/features/room/constants';

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
