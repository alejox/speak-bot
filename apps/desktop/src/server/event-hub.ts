import type { ServerEvent } from "@speak-bot/core";
import type { IncomingMessage, Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { requestPathname } from "./http-utils";

export const EVENTS_PATH = "/ws";

/** Broadcasts server events to every WebSocket client connected at `/ws`. */
export class EventHub {
  private readonly sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 });

  /** `isAllowed` rejects foreign hosts and origins, so other websites cannot read captions. */
  constructor(private readonly isAllowed: (request: IncomingMessage) => boolean = () => true) {}

  attach(server: Server): void {
    server.on("upgrade", (request, socket, head) => {
      // Upgrade listeners must never throw: an uncaught error here would kill the process.
      if (requestPathname(request) !== EVENTS_PATH) {
        socket.destroy();
        return;
      }
      if (!this.isAllowed(request)) {
        socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n", () => socket.destroy());
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
