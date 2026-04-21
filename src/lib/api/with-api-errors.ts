import { jsonError } from './validate';
import { RoomConflictError } from '@/modules/room/store';

export async function withApiErrors(
  fn: () => Promise<Response>
): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof RoomConflictError) {
      return jsonError(409, 'room_conflict');
    }
    console.error('[api] unhandled route error', error);
    return jsonError(500, 'internal_error');
  }
}
