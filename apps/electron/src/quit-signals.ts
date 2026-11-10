/** How long a signal waits for the clean quit (closing the server) before the process exits anyway. */
export const QUIT_TIMEOUT_MS = 5000;

export interface QuitOnSignalsOptions {
  process: Pick<NodeJS.Process, "on" | "off">;
  /** Starts the clean quit (Electron's `app.quit`, which runs the will-quit close path). */
  quit: () => void;
  /** Ends the process right away (Electron's `app.exit`). */
  exit: (code: number) => void;
  timeoutMs?: number;
}

/**
 * Makes SIGTERM and SIGINT (e.g. `kill`, Ctrl+C, a logout) quit the app cleanly instead of being
 * ignored. A second signal, or a clean quit that takes longer than `timeoutMs`, exits right away.
 * Returns a function that removes the handlers.
 */
export function installQuitOnSignals({ process, quit, exit, timeoutMs = QUIT_TIMEOUT_MS }: QuitOnSignalsOptions): () => void {
  let quitting = false;
  const handle = () => {
    if (quitting) {
      exit(0);
      return;
    }
    quitting = true;
    const timer = setTimeout(() => exit(0), timeoutMs);
    // Never keeps the process alive by itself.
    timer.unref?.();
    quit();
  };
  process.on("SIGTERM", handle);
  process.on("SIGINT", handle);
  return () => {
    process.off("SIGTERM", handle);
    process.off("SIGINT", handle);
  };
}
