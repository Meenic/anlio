/**
 * Public surface of the `room` feature. Import from `@/features/room`
 * when you want the domain-level API; reach into sub-paths only for
 * infrastructure pieces (`./store`, `./mutex`, `./redis-scripts`) or the
 * server-action entry points (`./actions.server`).
 */
export * from './types';
export * from './constants';
export * from './selectors';
export * from './service';
export {
  toPublicState,
  getRoom,
  getRoomIdByCode,
  getRoomIdByCodeCached,
  RoomConflictError,
} from './store';
