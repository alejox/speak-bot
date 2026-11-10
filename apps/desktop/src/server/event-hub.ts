import type { ServerEvent } from "@speak-bot/core";
import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";

export const EVENTS_PATH = "/ws";

/** Broadcasts server events to every WebSocket client connected at `/ws`. */
export class EventHub {
  private readonly sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 });

  attach(server: Server): void {
    server.on("upgrade", (request, socket, head) => {
      const path = new URL(request.url ?? "/", "http://localhost").pathname;
      if (path !== EVENTS_PATH) {
        socket.destroy();
        return;
      }
      this.sockets.handleUpgrade(request, socket, head, (client) => {
        // Clients only listen; incoming messages are ignored.
        client.on("error", () => client.terminate());
      });
    });
  }

  broadcast(event: ServerEvent): void {
    const payload = JSON.stringify(event);
    for (const client of this.sockets.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  }

  close(): Promise<void> {
    for (const client of this.sockets.clients) client.terminate();
    return new Promise((resolve) => this.sockets.close(() => resolve()));
  }
}
