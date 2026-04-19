type Controller = ReadableStreamDefaultController;

// Maps roomId -> (playerId -> Controller)
export const registry = new Map<string, Map<string, Controller>>();

export function registerClient(
  roomId: string,
  playerId: string,
  controller: Controller
) {
  if (!registry.has(roomId)) {
    registry.set(roomId, new Map());
  }
  registry.get(roomId)!.set(playerId, controller);
}

export function unregisterClient(roomId: string, playerId: string) {
  const roomClients = registry.get(roomId);
  if (roomClients) {
    roomClients.delete(playerId);
    if (roomClients.size === 0) {
      registry.delete(roomId);
    }
  }
}
