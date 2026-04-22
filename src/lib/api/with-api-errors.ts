import { jsonError } from './validate';
import { RoomConflictError } from '@/modules/room/store';
import { metricsStorage } from '../metrics';

export async function withApiErrors(
  fn: () => Promise<Response>
): Promise<Response> {
  return await metricsStorage.run({ redis: 0, db: 0 }, async () => {
    try {
      const response = await fn();
      const metrics = metricsStorage.getStore();

      if (metrics && response instanceof Response) {
        // We can't mutate Response headers directly if it's already finalized in some cases,
        // but for Next.js Route Handlers, we can often clone or just use the existing one.
        response.headers.set('x-metrics-redis', metrics.redis.toString());
        response.headers.set('x-metrics-db', metrics.db.toString());
      }

      return response;
    } catch (error) {
      if (error instanceof Response) return error;
      if (error instanceof RoomConflictError) {
        return jsonError(409, 'room_conflict');
      }
      console.error('[api] unhandled route error', error);
      return jsonError(500, 'internal_error');
    }
  });
}
