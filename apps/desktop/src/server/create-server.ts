import type { PhraseRepository, ServerEvent } from "@speak-bot/core";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { hostname as osHostname } from "node:os";
import type { JsonFileSettingsStore } from "../adapters/json-file-settings-store";
import type { DesktopSpeechSynthesizer } from "../adapters/tts/process-speech-synthesizer";
import { createApiHandler } from "./api";
import { EventHub } from "./event-hub";
import { requestPathname, sendJson } from "./http-utils";
import { createRequestGuard } from "./request-guard";

export interface DesktopServerDependencies {
  repository: PhraseRepository;
  settings: JsonFileSettingsStore;
  synthesizer: DesktopSpeechSynthesizer;
  generateId: () => string;
  now: () => number;
  log?: (message: string) => void;
  /** Extra trusted Host names besides loopback, IP literals and this machine's name. */
  allowedHosts?: readonly string[];
  /** This machine's name; defaults to os.hostname(). */
  hostname?: string;
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
  const isAllowedRequest = createRequestGuard({ hostname: deps.hostname ?? osHostname(), allowedHosts: deps.allowedHosts });
  const hub = new EventHub(isAllowedRequest);
  const handleApi = createApiHandler({ ...deps, broadcast: (event) => hub.broadcast(event) });

  const httpServer = createServer((request, response) => {
    void (async () => {
      if (!isAllowedRequest(request)) {
        sendJson(response, 403, { error: "Forbidden host or origin." });
        return;
      }
      const pathname = requestPathname(request);
      if (pathname === null) {
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
