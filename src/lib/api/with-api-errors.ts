import { HttpError, httpErrorToResponse } from './validate';
import { RoomConflictError } from '@/modules/room/store';

export async function withApiErrors(
  fn: () => Promise<Response>
): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof HttpError) return httpErrorToResponse(error);
    if (error instanceof Response) return error;
    if (error instanceof RoomConflictError) {
      return httpErrorToResponse(
        new HttpError(409, 'room_conflict', error.message)
      );
    }
    console.error('[api] unhandled route error', error);
    return httpErrorToResponse(
      new HttpError(500, 'internal_error', 'Internal server error')
    );
  }
}
