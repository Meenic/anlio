import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { ROOM_CODE_LENGTH } from '@/modules/room/constants';
import {
  getRoom,
  getRoomIdByCodeCached,
  toPublicState,
} from '@/modules/room/store';
import { auth } from '@/lib/auth';
import type { RoomState } from '@/modules/room/types';
import { RoomShell } from './components/room-shell';

export default async function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const code = rawCode.trim().toUpperCase();

  if (code.length !== ROOM_CODE_LENGTH) {
    notFound();
  }
  if (rawCode !== code) {
    redirect(`/room/${code}`);
  }

  // Parallelize the two server IOs on the critical path.
  // The RSC render CANNOT set cookies (Next constraint), so we do NOT
  // attempt to auto-create an anonymous session here — if no session is
  // present, the client invokes `bootstrapRoomAction` on mount instead.
  const hdrs = await headers();
  const [roomId, session] = await Promise.all([
    getRoomIdByCodeCached(code),
    auth.api.getSession({ headers: hdrs }),
  ]);

  if (!roomId) {
    notFound();
  }

  // Fast path: the user already has a session. If they're already a member
  // we can fully prehydrate the public `RoomState` into the RSC payload so
  // the first paint is the live room.
  let initialState: RoomState | null = null;
  let selfId: string | null = null;

  if (session?.user?.id) {
    const room = await getRoom(roomId);
    if (room?.players[session.user.id]) {
      initialState = toPublicState(room);
      selfId = session.user.id;
    } else if (room) {
      // Session exists but not a member yet. We deliberately do NOT write
      // to Redis from the RSC path — bootstrap runs on the client via a
      // Server Action, which keeps all room writes on one code path and
      // avoids double-joins under React's strict render.
      selfId = session.user.id;
    }
  }

  return (
    <RoomShell
      roomId={roomId}
      roomCode={code}
      initialState={initialState}
      selfId={selfId}
    />
  );
}
