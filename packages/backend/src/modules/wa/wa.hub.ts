import type { WebSocket } from "@fastify/websocket";

const clients = new Map<string, Set<WebSocket>>();

export const waHub = {
  subscribe(userId: string, ws: WebSocket) {
    if (!clients.has(userId)) clients.set(userId, new Set());
    clients.get(userId)!.add(ws);
    ws.on("close", () => clients.get(userId)?.delete(ws));
  },

  emit(userId: string, event: object) {
    const sockets = clients.get(userId);
    if (!sockets?.size) return;
    const msg = JSON.stringify(event);
    for (const ws of sockets) {
      if (ws.readyState === ws.OPEN) ws.send(msg);
    }
  },
};
