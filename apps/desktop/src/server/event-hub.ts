import { isOverlayClipReport, OVERLAY_CLIENT_QUERY, type OverlayClipReport, type OverlayCommand, type ServerEvent } from "@speed-deck/core";
import type { IncomingMessage, Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { requestPathname } from "./http-utils";

export const EVENTS_PATH = "/ws";

/** What the hub tells about OBS overlays (clients at `/ws?client=overlay`), which play the voice clips. */
export interface OverlayListener {
  overlayConnected(overlay: number): void;
  overlayDisconnected(overlay: number): void;
  report(overlay: number, report: OverlayClipReport): void;
}

/** Broadcasts server events to every WebSocket client connected at `/ws`, and clip commands to overlays. */
export class EventHub {
  private readonly sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  private readonly overlaySockets = new Set<WebSocket>();
  private nextOverlay = 1;

  /** `isAllowed` rejects foreign hosts and origins, so other websites cannot read captions. */
  constructor(
    private readonly isAllowed: (request: IncomingMessage) => boolean = () => true,
    private readonly overlays?: OverlayListener,
  ) {}

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
      const isOverlay = (request.url ?? "").split("?")[1]?.split("&").includes(OVERLAY_CLIENT_QUERY) === true;
      this.sockets.handleUpgrade(request, socket, head, (client) => {
        client.on("error", () => client.terminate());
        // Other clients only listen; their messages are ignored.
        if (isOverlay) this.addOverlay(client);
      });
    });
  }

  broadcast(event: ServerEvent): void {
    const payload = JSON.stringify(event);
    for (const client of this.sockets.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  }

  /** Sends a clip command to the overlays only. */
  sendToOverlays(command: OverlayCommand): void {
    const payload = JSON.stringify(command);
    for (const client of this.overlaySockets) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  }

  private addOverlay(client: WebSocket): void {
    const overlay = this.nextOverlay++;
    this.overlaySockets.add(client);
    this.overlays?.overlayConnected(overlay);
    client.on("message", (data) => {
      let report: unknown;
      try {
        report = JSON.parse(String(data));
      } catch {
        return;
      }
      if (isOverlayClipReport(report)) this.overlays?.report(overlay, report);
    });
    client.once("close", () => {
      this.overlaySockets.delete(client);
      this.overlays?.overlayDisconnected(overlay);
    });
  }

  close(): Promise<void> {
    for (const client of this.sockets.clients) client.terminate();
    return new Promise((resolve) => this.sockets.close(() => resolve()));
  }
}
