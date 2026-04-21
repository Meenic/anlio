import { deleteRoomCode, setRoomCode } from './store';

const CODE_DELETE_RETRY_DELAY_MS = 500;

export async function linkCodeOrRollback(code: string, roomId: string) {
  await setRoomCode(code, roomId);
}

export async function unlinkCodeBestEffort(
  code: string,
  context: string
): Promise<void> {
  try {
    await deleteRoomCode(code);
  } catch (error) {
    const handle = setTimeout(async () => {
      try {
        await deleteRoomCode(code);
      } catch (retryError) {
        console.error(
          `[${context}] failed delayed deleteRoomCode for code=${code}`,
          retryError
        );
      }
    }, CODE_DELETE_RETRY_DELAY_MS);
    handle.unref?.();
    console.error(
      `[${context}] deleteRoomCode failed for code=${code}; scheduled retry`,
      error
    );
  }
}
