import type { ApplicationLauncher, BoardRepository, DesktopSettings, ObsController, ServerEvent } from "@speed-deck/core";
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { hostname as osHostname } from "node:os";
import type { JsonFileSettingsStore } from "../adapters/json-file-settings-store";
import type { AdFeed } from "../ads/ad-feed";
import type { AdsGrants } from "../ads/ads-grants";
import type { DesktopSpeechSynthesizer } from "../adapters/tts/process-speech-synthesizer";
import { createApiHandler } from "./api";
import { EventHub } from "./event-hub";
import { requestPathname, sendJson } from "./http-utils";
import type { NetworkInterfaces } from "./network";
import type { OverlayAudio } from "./overlay-audio";
import { createRequestGuard } from "./request-guard";

export interface DesktopServerDependencies {
  repository: BoardRepository;
  settings: JsonFileSettingsStore;
  synthesizer: DesktopSpeechSynthesizer;
  generateId: () => string;
  now: () => number;
  log?: (message: string) => void;
  /** Extra trusted Host names besides loopback, IP literals and this machine's name. */
  allowedHosts?: readonly string[];
  /** This machine's name; defaults to os.hostname(). */
  hostname?: string;
  /** Lists this computer's network interfaces; defaults to os.networkInterfaces(). */
  networkInterfaces?: () => NetworkInterfaces;
  /** Handles every non-API GET (static files, overlay). Returns false when it did not respond. */
  pageHandler?: (request: IncomingMessage, response: ServerResponse, pathname: string) => Promise<boolean>;
  /** Reported by GET /api/health; defaults to a random id per server. */
  instanceId?: string;
  /** Stable id of this computer, reported by GET /api/health when set. */
  desktopId?: string;
  /** Called after settings are saved through the API. */
  onSettingsChanged?: (settings: DesktopSettings) => void;
  /** Controls OBS; its status and state changes are broadcast to every client. */
  obs?: ObsController;
  /** Lists and opens the applications of this computer for "open application" keys. */
  apps?: ApplicationLauncher;
  /** The phones whose "remove ads" purchase removes the ads here; changes are broadcast as ads-changed. */
  adsGrants?: AdsGrants;
  /** The cached sponsor banner served at /api/ad. */
  ads?: AdFeed;
  /** Plays voice clips on the OBS overlays; absent means the voice only goes to the speakers. */
  overlayAudio?: OverlayAudio;
}

export interface DesktopServer {
  readonly httpServer: Server;
  /** Random per launch; GET /api/health reports it so the desktop can recognise itself. */
  readonly instanceId: string;
  broadcast(event: ServerEvent): void;
  listen(port: number, host: string): Promise<void>;
  /** Stops listening without shutting the server down, so it can listen on another port. */
  unlisten(): Promise<void>;
  close(): Promise<void>;
}

export function createDesktopServer(deps: DesktopServerDependencies): DesktopServer {
  const isAllowedRequest = createRequestGuard({ hostname: deps.hostname ?? osHostname(), allowedHosts: deps.allowedHosts });
  const hub = new EventHub(isAllowedRequest, deps.overlayAudio);
  deps.overlayAudio?.bind((command) => hub.sendToOverlays(command));
  const instanceId = deps.instanceId ?? randomUUID();
  const handleApi = createApiHandler({ ...deps, instanceId, broadcast: (event) => hub.broadcast(event) });
  const now = deps.now;
  const stopObsEvents = deps.obs?.subscribe((event) => {
    if (event.type === "status") hub.broadcast({ type: "obs-status", ...event.status, at: now() });
    else if (event.type === "state") hub.broadcast({ type: "obs-state", state: event.state, at: now() });
    else hub.broadcast({ type: "obs-input-volume", inputName: event.inputName, volumeMul: event.volumeMul, at: now() });
  });

  const stopAdsEvents = deps.adsGrants?.subscribe((ads) => hub.broadcast({ type: "ads-changed", ads, at: now() }));
  const stopOverlayEvents = deps.overlayAudio?.onConnectedChange((connected) => hub.broadcast({ type: "overlay-audio", connected, at: now() }));

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
    instanceId,
    broadcast: (event) => hub.broadcast(event),
    listen: (port, host) =>
      new Promise((resolve, reject) => {
        httpServer.once("error", reject);
        httpServer.listen(port, host, () => {
          httpServer.off("error", reject);
          resolve();
        });
      }),
    unlisten: async () => {
      httpServer.closeAllConnections();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
    close: async () => {
      stopObsEvents?.();
      stopAdsEvents?.();
      stopOverlayEvents?.();
      await hub.close();
      httpServer.closeAllConnections();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}
