import { seedDefaultPhrases } from "@speak-bot/core";
import { randomUUID } from "node:crypto";
import { homedir, networkInterfaces } from "node:os";
import { join } from "node:path";
import { JsonFilePhraseRepository } from "./adapters/json-file-phrase-repository";
import { JsonFileSettingsStore } from "./adapters/json-file-settings-store";
import { createSystemSynthesizer } from "./adapters/tts/create-system-synthesizer";
import { loadConfig } from "./config";
import { createDesktopServer } from "./server/create-server";
import { createPageHandler, MOBILE_DIST_DIR, OVERLAY_FILE } from "./server/static-files";

async function main(): Promise<void> {
  const config = loadConfig({ argv: process.argv.slice(2), env: process.env, platform: process.platform, homeDir: homedir() });
  const log = (message: string) => console.log(`[speak-bot] ${message}`);

  const repository = new JsonFilePhraseRepository(join(config.dataDir, "phrases.json"));
  const settings = new JsonFileSettingsStore(join(config.dataDir, "settings.json"), config.defaults);
  const synthesizer = createSystemSynthesizer();
  const phraseDeps = { repository, generateId: randomUUID, now: () => Date.now() };

  if (!(await repository.exists())) await seedDefaultPhrases(phraseDeps);

  const pageHandler = createPageHandler({ mobileDistDir: MOBILE_DIST_DIR, overlayFile: OVERLAY_FILE });
  const server = createDesktopServer({ ...phraseDeps, settings, synthesizer, log, pageHandler });
  await server.listen(config.port, config.host);

  const { engine, supportsDeviceSelection } = synthesizer.capabilities;
  log(`Data directory: ${config.dataDir}`);
  log(`Speech engine: ${engine}${supportsDeviceSelection ? " (output device selectable)" : ""}`);
  for (const url of serverUrls(config.host, config.port)) log(`Listening on ${url}`);
  log(`OBS overlay (Browser Source): http://localhost:${config.port}/overlay`);

  const shutdown = () => {
    synthesizer.cancel();
    void server.close().finally(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

function serverUrls(host: string, port: number): string[] {
  if (host !== "0.0.0.0" && host !== "::") return [`http://${host}:${port}`];
  const lan = Object.values(networkInterfaces())
    .flat()
    .filter((address) => address && address.family === "IPv4" && !address.internal)
    .map((address) => `http://${address!.address}:${port}`);
  return [`http://localhost:${port}`, ...lan];
}

main().catch((error: unknown) => {
  console.error(`[speak-bot] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
