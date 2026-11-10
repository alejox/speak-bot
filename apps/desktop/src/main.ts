import { startDesktop } from "./start-desktop";

async function main(): Promise<void> {
  const log = (message: string) => console.log(`[speak-bot] ${message}`);
  const desktop = await startDesktop({ argv: process.argv.slice(2), log });

  for (const url of desktop.urls) log(`Listening on ${url}`);
  log(`OBS overlay (Browser Source): ${desktop.overlayUrl}`);
  log(`OBS dock (Custom Browser Dock): ${desktop.dockUrl}`);

  const shutdown = () => void desktop.close().finally(() => process.exit(0));
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  console.error(`[speak-bot] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
