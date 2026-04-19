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
