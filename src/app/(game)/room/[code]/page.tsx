import { notFound, redirect } from 'next/navigation';
import { ROOM_CODE_LENGTH } from '@/features/room/constants';
import {
  getRoom,
  getRoomIdByCodeCached,
  toPublicState,
} from '@/features/room/store';
import { currentSessionUser } from '@/features/session/ensure-user.server';
import type { RoomState } from '@/features/room/types';
import { RoomShell } from '@/components/room/room-shell';

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
  const [roomId, session] = await Promise.all([
    getRoomIdByCodeCached(code),
    currentSessionUser(),
  ]);

  if (!roomId) {
    notFound();
  }

  // Fast path: the user already has a session. If they're already a member
  // we can fully prehydrate the public `RoomState` into the RSC payload so
  // the first paint is the live room.
  let initialState: RoomState | null = null;
  let selfId: string | null = null;

  if (session?.id) {
    const room = await getRoom(roomId);
    if (room?.players[session.id]) {
      initialState = toPublicState(room);
      selfId = session.id;
    } else if (room) {
      // Session exists but not a member yet. We deliberately do NOT write
      // to Redis from the RSC path — bootstrap runs on the client via a
      // Server Action, which keeps all room writes on one code path and
      // avoids double-joins under React's strict render.
      selfId = session.id;
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
