/** Receives the error (or rejection reason) and, for exceptions, where it escaped from. */
type CrashListener = (reason: unknown, origin?: unknown) => void;

/** The part of `process` the guard listens on, so tests can pass an EventEmitter. */
export interface CrashGuardProcess {
  on(event: "uncaughtException" | "unhandledRejection", listener: CrashListener): unknown;
  off(event: "uncaughtException" | "unhandledRejection", listener: CrashListener): unknown;
}

export interface CrashGuardOptions {
  process: CrashGuardProcess;
  log: (message: string) => void;
}

/**
 * Keeps the process alive when an error escapes every handler (a network error on a socket nobody listens
 * to, a rejected promise nobody awaited): it is logged with its code, origin and stack, and the app goes on.
 * Speed Deck speaks for someone, so losing one request is always better than losing the voice. Having a
 * listener also stops Electron from showing its own crash dialog. Returns a function that removes the handlers.
 */
export function installCrashGuard({ process, log }: CrashGuardOptions): () => void {
  // A handler that throws would end the process it is there to protect.
  const report = (message: string) => {
    try {
      log(message);
    } catch {
      // Nothing left to tell it to.
    }
  };
  const onException: CrashListener = (error, origin) => report(`Uncaught exception (${typeof origin === "string" ? origin : "uncaughtException"}), still running: ${describe(error)}`);
  const onRejection: CrashListener = (reason) => report(`Unhandled rejection, still running: ${describe(reason)}`);
  process.on("uncaughtException", onException);
  process.on("unhandledRejection", onRejection);
  return () => {
    process.off("uncaughtException", onException);
    process.off("unhandledRejection", onRejection);
  };
}

/** The error's code, message and stack on one log entry; anything else as text. */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const { code, syscall } = error as NodeJS.ErrnoException;
  const context = [code, syscall].filter((part) => typeof part === "string" && part !== "").join(" ");
  return `${context ? `[${context}] ` : ""}${error.stack ?? `${error.name}: ${error.message}`}`;
}
