import type { PhraseRepository, ServerEvent } from "@speak-bot/core";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { JsonFileSettingsStore } from "../adapters/json-file-settings-store";
import type { DesktopSpeechSynthesizer } from "../adapters/tts/process-speech-synthesizer";
import { createApiHandler } from "./api";
import { EventHub } from "./event-hub";
import { sendJson } from "./http-utils";

export interface DesktopServerDependencies {
  repository: PhraseRepository;
  settings: JsonFileSettingsStore;
  synthesizer: DesktopSpeechSynthesizer;
  generateId: () => string;
  now: () => number;
  log?: (message: string) => void;
  /** Handles every non-API GET (static files, overlay). Returns false when it did not respond. */
  pageHandler?: (request: IncomingMessage, response: ServerResponse, pathname: string) => Promise<boolean>;
}

export interface DesktopServer {
  readonly httpServer: Server;
  broadcast(event: ServerEvent): void;
  listen(port: number, host: string): Promise<void>;
  close(): Promise<void>;
}

export function createDesktopServer(deps: DesktopServerDependencies): DesktopServer {
  const hub = new EventHub();
  const handleApi = createApiHandler({ ...deps, broadcast: (event) => hub.broadcast(event) });

  const httpServer = createServer((request, response) => {
    void (async () => {
      let pathname: string;
      try {
        pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      } catch {
        sendJson(response, 400, { error: "Bad request." });
        return;
      }
      if (await handleApi(request, response, pathname)) return;
      if (deps.pageHandler && (await deps.pageHandler(request, response, pathname))) return;
      sendJson(response, 404, { error: "Not found." });
    })().catch((error: unknown) => {
      deps.log?.(`Unhandled request error: ${String(error)}`);
      if (!response.headersSent) sendJson(response, 500, { error: "Internal server error." });
      else response.destroy();
    });
  });
  hub.attach(httpServer);

  return {
    httpServer,
    broadcast: (event) => hub.broadcast(event),
    listen: (port, host) =>
      new Promise((resolve, reject) => {
        httpServer.once("error", reject);
        httpServer.listen(port, host, () => {
          httpServer.off("error", reject);
          resolve();
        });
      }),
    close: async () => {
      await hub.close();
      httpServer.closeAllConnections();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}
