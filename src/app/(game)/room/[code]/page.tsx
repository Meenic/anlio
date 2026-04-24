import { notFound, redirect } from 'next/navigation';
import { ROOM_CODE_LENGTH } from '@/modules/room/constants';
import { getRoomIdByCodeCached } from '@/modules/room/store';
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

  const roomId = await getRoomIdByCodeCached(code);
  if (!roomId) {
    notFound();
  }

  return <RoomShell roomId={roomId} roomCode={code} />;
}
