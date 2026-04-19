import { registry } from './registry';
import type { SSEEvent } from './types';

const encoder = new TextEncoder();

export function broadcast(roomId: string, event: SSEEvent) {
  const clients = registry.get(roomId);
  if (!clients) return;

  const chunk = encoder.encode(
    `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`
  );

  for (const [playerId, controller] of clients) {
    try {
      controller.enqueue(chunk);
    } catch {
      clients.delete(playerId); // Clean up dead connections
    }
  }
}

/**
 * Write an SSE comment (`:ping\n\n`) to a client.
 * Returns `true` if the write succeeded, `false` if the socket is dead
 * or not registered. The caller is responsible for running cleanup
 * (unregister + broadcast) when this returns `false`.
 */
export function pingClient(roomId: string, playerId: string): boolean {
  const controller = registry.get(roomId)?.get(playerId);
  if (!controller) return false;
  try {
    controller.enqueue(encoder.encode(`: ping\n\n`));
    return true;
  } catch {
    return false;
  }
}

export function sendToPlayer(
  roomId: string,
  playerId: string,
  event: SSEEvent
) {
  const controller = registry.get(roomId)?.get(playerId);
  if (!controller) return;

  try {
    controller.enqueue(
      encoder.encode(
        `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`
      )
    );
  } catch {
    registry.get(roomId)?.delete(playerId);
  }
}
