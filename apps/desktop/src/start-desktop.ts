import type { DesktopSettings } from "@speak-bot/core";
import { randomUUID } from "node:crypto";
import { homedir, networkInterfaces } from "node:os";
import { join } from "node:path";
import { prepareBoards } from "./adapters/board-migration";
import { JsonFileBoardRepository } from "./adapters/json-file-board-repository";
import { JsonFileSettingsStore } from "./adapters/json-file-settings-store";
import { createObsWebSocketClient, type ObsClient } from "./adapters/obs/obs-client";
import { ObsConnectionManager } from "./adapters/obs/obs-connection-manager";
import { createSystemSynthesizer } from "./adapters/tts/create-system-synthesizer";
import { loadConfig, type ConfigSources } from "./config";
import { createDesktopServer } from "./server/create-server";
import { applyObsSettings } from "./server/obs-settings";
import { connectionInfo } from "./server/network";
import { listenWithFallback } from "./server/port-fallback";
import { isPortOwnedBy } from "./server/port-ownership";
import { createPageHandler, MOBILE_DIST_DIR, OVERLAY_FILE } from "./server/static-files";

export interface StartDesktopOptions extends Partial<ConfigSources> {
  /** Folder with the built mobile app; defaults to apps/mobile/dist next to this source tree. */
  mobileDistDir?: string;
  /** The OBS overlay page; defaults to apps/desktop/public/overlay.html. */
  overlayFile?: string;
  log?: (message: string) => void;
  /** How many consecutive ports to try when the configured one is busy. */
  portAttempts?: number;
  /** Creates OBS clients; defaults to obs-websocket-js. */
  createObsClient?: () => ObsClient;
}

export interface RunningDesktop {
  /** The port actually in use (may differ from the configured one). */
  port: number;
  host: string;
  /** Random per launch; GET /api/health on `port` reports it. */
  instanceId: string;
  dataDir: string;
  /** Every URL the app can be opened at, localhost first. */
  urls: string[];
  overlayUrl: string;
  /** OBS Custom Browser Dock URL (compact app view). */
  dockUrl: string;
  /** The saved desktop settings (voice, rate, device, interface language). */
  loadSettings(): Promise<DesktopSettings>;
  /** Notifies after settings are saved from any client. Returns an unsubscribe function. */
  onSettingsChanged(listener: (settings: DesktopSettings) => void): () => void;
  /** Stops speech and the server. Safe to call more than once. */
  close(): Promise<void>;
}

export const DEFAULT_PORT_ATTEMPTS = 10;

/** Starts the desktop server with the system speech engine. Used by the CLI and the Electron app. */
export async function startDesktop(options: StartDesktopOptions = {}): Promise<RunningDesktop> {
  const config = loadConfig({
    argv: options.argv ?? [],
    env: options.env ?? process.env,
    platform: options.platform ?? process.platform,
    homeDir: options.homeDir ?? homedir(),
  });
  const log = options.log ?? (() => {});

  const repository = new JsonFileBoardRepository(join(config.dataDir, "boards.json"));
  const settings = new JsonFileSettingsStore(join(config.dataDir, "settings.json"), config.defaults);
  const synthesizer = createSystemSynthesizer();
  const boardDeps = { repository, generateId: randomUUID, now: () => Date.now() };
  const obs = new ObsConnectionManager({ createClient: options.createObsClient ?? createObsWebSocketClient, log });

  // Phrases saved by older versions become the communication board, once.
  const prepared = await prepareBoards(repository, {
    legacyPhrasesFile: join(config.dataDir, "phrases.json"),
    language: (await settings.load()).language,
  });
  if (prepared === "migrated") log("Moved the saved phrases to the communication board (backup: phrases.json.migrated.bak).");
  const settingsListeners = new Set<(next: DesktopSettings) => void>();

  const pageHandler = createPageHandler({
    mobileDistDir: options.mobileDistDir ?? MOBILE_DIST_DIR,
    overlayFile: options.overlayFile ?? OVERLAY_FILE,
  });
  const server = createDesktopServer({
    ...boardDeps,
    settings,
    synthesizer,
    log,
    pageHandler,
    allowedHosts: config.allowedHosts,
    obs,
    onSettingsChanged: (next) => {
      for (const listener of [...settingsListeners]) listener(next);
    },
  });

  const listeningPort = () => (server.httpServer.address() as { port: number }).port;
  const port = await listenWithFallback((candidate) => server.listen(candidate, config.host), {
    port: config.port,
    attempts: options.portAttempts ?? DEFAULT_PORT_ATTEMPTS,
    // Loopback must reach this server, not another app sharing the port (possible on macOS).
    isOwned: () => isPortOwnedBy(listeningPort(), server.instanceId),
    release: () => server.unlisten(),
  });
  const actualPort = port === 0 ? listeningPort() : port;
  if (actualPort !== config.port && config.port !== 0) log(`Port ${config.port} is busy; using ${actualPort} instead.`);

  const { engine, supportsDeviceSelection } = synthesizer.capabilities;
  log(`Data directory: ${config.dataDir}`);
  // Connects in the background when OBS control is enabled; failures retry and never stop the server.
  void applyObsSettings(obs, (await settings.loadStored()).obs).catch((error: unknown) => log(`OBS: ${String(error)}`));
  log(`Speech engine: ${engine}${supportsDeviceSelection ? " (output device selectable)" : ""}`);

  let closing: Promise<void> | undefined;
  return {
    port: actualPort,
    host: config.host,
    instanceId: server.instanceId,
    dataDir: config.dataDir,
    urls: serverUrls(config.host, actualPort),
    overlayUrl: connectionInfo(actualPort, {}).overlayUrl,
    dockUrl: connectionInfo(actualPort, {}).dockUrl,
    loadSettings: () => settings.load(),
    onSettingsChanged: (listener) => {
      settingsListeners.add(listener);
      return () => settingsListeners.delete(listener);
    },
    close: () => {
      closing ??= (async () => {
        synthesizer.cancel();
        await obs.close();
        await server.close();
      })();
      return closing;
    },
  };
}

function serverUrls(host: string, port: number): string[] {
  if (host !== "0.0.0.0" && host !== "::") return [`http://${host}:${port}`];
  const lan = connectionInfo(port, networkInterfaces()).lanUrls.map((url) => url.replace(/\/$/, ""));
  return [`http://localhost:${port}`, ...lan];
}
