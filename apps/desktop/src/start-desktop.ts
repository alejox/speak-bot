import { seedDefaultPhrases } from "@speak-bot/core";
import { randomUUID } from "node:crypto";
import { homedir, networkInterfaces } from "node:os";
import { join } from "node:path";
import { JsonFilePhraseRepository } from "./adapters/json-file-phrase-repository";
import { JsonFileSettingsStore } from "./adapters/json-file-settings-store";
import { createSystemSynthesizer } from "./adapters/tts/create-system-synthesizer";
import { loadConfig, type ConfigSources } from "./config";
import { createDesktopServer } from "./server/create-server";
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

  const repository = new JsonFilePhraseRepository(join(config.dataDir, "phrases.json"));
  const settings = new JsonFileSettingsStore(join(config.dataDir, "settings.json"), config.defaults);
  const synthesizer = createSystemSynthesizer();
  const phraseDeps = { repository, generateId: randomUUID, now: () => Date.now() };

  if (!(await repository.exists())) await seedDefaultPhrases(phraseDeps);

  const pageHandler = createPageHandler({
    mobileDistDir: options.mobileDistDir ?? MOBILE_DIST_DIR,
    overlayFile: options.overlayFile ?? OVERLAY_FILE,
  });
  const server = createDesktopServer({ ...phraseDeps, settings, synthesizer, log, pageHandler, allowedHosts: config.allowedHosts });

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
  log(`Speech engine: ${engine}${supportsDeviceSelection ? " (output device selectable)" : ""}`);

  let closing: Promise<void> | undefined;
  return {
    port: actualPort,
    host: config.host,
    instanceId: server.instanceId,
    dataDir: config.dataDir,
    urls: serverUrls(config.host, actualPort),
    overlayUrl: connectionInfo(actualPort, {}).overlayUrl,
    close: () => {
      closing ??= (async () => {
        synthesizer.cancel();
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
