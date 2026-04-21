import { notFound, redirect } from 'next/navigation';
import { ROOM_CODE_LENGTH } from '@/modules/room/constants';
import { getRoomIdByCode } from '@/modules/room/store';
import { RoomClient } from './room-client';

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

  const roomId = await getRoomIdByCode(code);
  if (!roomId) {
    notFound();
  }

  return <RoomClient roomId={roomId} roomCode={code} />;
}
