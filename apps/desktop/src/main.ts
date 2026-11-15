import { installCrashGuard } from "./crash-guard";
import { startDesktop } from "./start-desktop";

const log = (message: string) => console.log(`[speed-deck] ${message}`);
// Before anything else: an error nobody handles is logged and the server keeps speaking.
installCrashGuard({ process, log: (message) => console.error(`[speed-deck] ${message}`) });

async function main(): Promise<void> {
  const desktop = await startDesktop({ argv: process.argv.slice(2), log });

  for (const url of desktop.urls) log(`Listening on ${url}`);
  log(`OBS overlay (Browser Source): ${desktop.overlayUrl}`);
  log(`OBS dock (Custom Browser Dock): ${desktop.dockUrl}`);

  const shutdown = () => void desktop.close().finally(() => process.exit(0));
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  console.error(`[speed-deck] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
