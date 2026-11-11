import type { DesktopSettings } from "@speed-deck/core";
import { randomUUID } from "node:crypto";
import { homedir, hostname, networkInterfaces } from "node:os";
import { join } from "node:path";
import { prepareBoards } from "./adapters/board-migration";
import { migrateLegacyDataDir } from "./adapters/legacy-data-dir";
import { JsonFileBoardRepository } from "./adapters/json-file-board-repository";
import { JsonFileSettingsStore } from "./adapters/json-file-settings-store";
import { createObsWebSocketClient, type ObsClient } from "./adapters/obs/obs-client";
import { ObsConnectionManager } from "./adapters/obs/obs-connection-manager";
import { createApplicationLauncher } from "./adapters/apps/create-application-launcher";
import { createSystemSynthesizer } from "./adapters/tts/create-system-synthesizer";
import { createBonjourAdvertiser } from "./adapters/discovery/bonjour-advertiser";
import { readComputerName } from "./adapters/discovery/computer-name";
import { AdFeed } from "./ads/ad-feed";
import { loadConfig, type ConfigSources } from "./config";
import { loadMonetizationConfig } from "./config/monetization";
import { desktopAnnouncement } from "./discovery/desktop-announcement";
import { loadOrCreateDesktopId } from "./discovery/desktop-id";
import type { Advertisement, ServiceAdvertiser } from "./discovery/service-advertiser";
import { JsonFileLicenseStore } from "./license/json-file-license-store";
import { LemonSqueezyLicenseService } from "./license/lemon-squeezy-license-service";
import { LicenseManager } from "./license/license-manager";
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
  /** Used for the license server and the ad feed; defaults to the global fetch. */
  fetch?: typeof globalThis.fetch;
  /** Announces the server on the LAN as `_speeddeck._tcp`; defaults to multicast DNS. */
  advertiser?: ServiceAdvertiser;
  /** The name phones show for this computer; defaults to the computer name set in the system. */
  computerName?: string;
}

export interface RunningDesktop {
  /** The port actually in use (may differ from the configured one). */
  port: number;
  host: string;
  /** Random per launch; GET /api/health on `port` reports it. */
  instanceId: string;
  /** Stable across restarts; announced on the LAN and reported by GET /api/health. */
  desktopId: string;
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
  const env = options.env ?? process.env;
  const config = loadConfig({
    argv: options.argv ?? [],
    env,
    platform: options.platform ?? process.platform,
    homeDir: options.homeDir ?? homedir(),
  });
  const log = options.log ?? (() => {});
  // Data saved before the rename to Speed Deck is copied to the new folder once.
  await migrateLegacyDataDir(config, log);

  const repository = new JsonFileBoardRepository(join(config.dataDir, "boards.json"));
  const settings = new JsonFileSettingsStore(join(config.dataDir, "settings.json"), config.defaults);
  const synthesizer = createSystemSynthesizer();
  const boardDeps = { repository, generateId: randomUUID, now: () => Date.now() };
  const obs = new ObsConnectionManager({ createClient: options.createObsClient ?? createObsWebSocketClient, log });

  // Phrases saved by older versions become the communication board, once.
  const prepared = await prepareBoards(repository, {
    legacyPhrasesFile: join(config.dataDir, "phrases.json"),
    language: (await settings.load()).language,
    log,
  });
  if (prepared === "migrated") log("Moved the saved phrases to the communication board (backup: phrases.json.migrated.bak).");
  const monetization = loadMonetizationConfig(env);
  const license = new LicenseManager({
    store: new JsonFileLicenseStore(join(config.dataDir, "license.json")),
    service:
      monetization.storeId !== undefined && monetization.productId !== undefined
        ? new LemonSqueezyLicenseService({ storeId: monetization.storeId, productId: monetization.productId, fetch: options.fetch })
        : undefined,
    instanceName: hostname(),
    checkoutUrl: monetization.checkoutUrl,
    now: () => Date.now(),
    log,
  });
  const ads = new AdFeed({ feedUrl: monetization.adFeedUrl, dir: join(config.dataDir, "ad"), fetch: options.fetch, log });
  const desktopId = await loadOrCreateDesktopId(join(config.dataDir, "desktop.json"), randomUUID);
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
    desktopId,
    obs,
    apps: createApplicationLauncher(),
    license,
    ads,
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
  // Validates the saved license now and every 24 h; failures keep the saved status.
  void license.start();
  // Refreshes the sponsor banner now and every 6 h; failures keep the last good one.
  void ads.start();
  log(`Speech engine: ${engine}${supportsDeviceSelection ? " (output device selectable)" : ""}`);
  // Phones find this computer (and its new address after an IP change) without scanning the QR again.
  // Only a server reachable from the LAN is announced.
  let advertisement: Advertisement | undefined;
  if (isWildcardHost(config.host)) {
    const advertiser = options.advertiser ?? createBonjourAdvertiser(log);
    const displayName = options.computerName ?? (await readComputerName());
    advertisement = advertiser.advertise(desktopAnnouncement({ desktopId, displayName, port: actualPort }));
  }

  let closing: Promise<void> | undefined;
  return {
    port: actualPort,
    host: config.host,
    instanceId: server.instanceId,
    desktopId,
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
        await advertisement?.stop();
        license.stop();
        ads.stop();
        await obs.close();
        await server.close();
      })();
      return closing;
    },
  };
}

function isWildcardHost(host: string): boolean {
  return host === "0.0.0.0" || host === "::";
}

function serverUrls(host: string, port: number): string[] {
  if (!isWildcardHost(host)) return [`http://${host}:${port}`];
  const lan = connectionInfo(port, networkInterfaces()).lanUrls.map((url) => url.replace(/\/$/, ""));
  return [`http://localhost:${port}`, ...lan];
}
