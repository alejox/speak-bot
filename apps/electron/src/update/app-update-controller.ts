import type { AppUpdateMode, AppUpdater, AppUpdateState } from "@speed-deck/core";
import { initialUpdateState, reduceUpdate, type UpdaterEvent } from "./update-state";

/** The first check waits this long after startup, so it never competes with opening the window. */
export const STARTUP_CHECK_DELAY_MS = 15_000;
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** An event from the updater; failures carry the technical reason for the log. */
export type BackendEvent = Exclude<UpdaterEvent, { type: "auto-check" }> & { message?: string };

/** The little of electron-updater this app uses, so tests can drive a fake. */
export interface UpdaterBackend {
  onEvent(listener: (event: BackendEvent) => void): void;
  /** Asks the update source for the latest version; the answer arrives as events. Rejects when it could not ask. */
  check(): Promise<void>;
  /** Downloads the version the last check found; progress and the end arrive as events. */
  download(): Promise<void>;
  /** Quits the app, installs the downloaded update and starts the app again. */
  quitAndInstall(): void;
}

/** Something worth one system notification: an update is ready to install, or (installed by hand) exists. */
export interface UpdateNotice {
  kind: "downloaded" | "available";
  version: string;
}

export interface AppUpdateControllerOptions {
  currentVersion: string;
  mode: AppUpdateMode;
  /** Absent means updates are disabled whatever `mode` says. */
  backend?: UpdaterBackend;
  now: () => number;
  log: (message: string) => void;
  /** Shows the single notification for a version. */
  notify?: (notice: UpdateNotice) => void;
  /** Remembers the last version notified across restarts, so each version is announced once. */
  notified?: { load(): string | undefined; save(version: string): void };
}

/**
 * Drives the updater: when to check (shortly after startup, every 6 hours, on request), what to do with a
 * new version on this system (download it, or only announce it) and the state every client sees.
 * Nothing here throws or shows a dialog: every failure ends as the quiet "error" state and a log line.
 */
export class AppUpdateController implements AppUpdater {
  private current: AppUpdateState;
  private readonly backend: UpdaterBackend | undefined;
  private readonly listeners = new Set<(state: AppUpdateState) => void>();
  private running: Promise<AppUpdateState> | undefined;
  private started = false;
  private startupTimer: ReturnType<typeof setTimeout> | undefined;
  private intervalTimer: ReturnType<typeof setInterval> | undefined;
  private notifiedVersion: string | undefined;
  /** The failure already logged for the operation in progress: the updater reports one both ways. */
  private loggedFailure: string | undefined;

  constructor(private readonly options: AppUpdateControllerOptions) {
    this.backend = options.mode === "disabled" ? undefined : options.backend;
    this.current = initialUpdateState({ currentVersion: options.currentVersion, mode: this.backend ? options.mode : "disabled" });
    this.backend?.onEvent((event) => this.handle(event));
    try {
      this.notifiedVersion = options.notified?.load();
    } catch {
      // Not knowing only risks one repeated notification.
    }
  }

  state(): AppUpdateState {
    return this.current;
  }

  subscribe(listener: (state: AppUpdateState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Begins the checks the app makes by itself, when the setting allows them. */
  start(): void {
    this.started = true;
    this.schedule();
  }

  stop(): void {
    this.started = false;
    this.unschedule();
  }

  setAutoCheck(enabled: boolean): void {
    if (enabled === this.current.autoCheck) return;
    this.apply({ type: "auto-check", enabled });
    this.unschedule();
    this.schedule();
  }

  check(): Promise<AppUpdateState> {
    const { backend } = this;
    // A download in progress or finished already is the answer.
    if (!backend || this.current.status === "downloading" || this.current.status === "downloaded") return Promise.resolve(this.current);
    this.running ??= this.runCheck(backend).finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  install(): boolean {
    if (!this.backend || this.current.mode !== "auto" || this.current.status !== "downloaded") return false;
    try {
      this.backend.quitAndInstall();
      return true;
    } catch (error) {
      this.options.log(`Could not start the update: ${describe(error)}`);
      return false;
    }
  }

  private schedule(): void {
    if (!this.started || !this.backend || !this.current.autoCheck) return;
    this.startupTimer = setTimeout(() => {
      void this.check();
      this.intervalTimer = setInterval(() => void this.check(), CHECK_INTERVAL_MS);
    }, STARTUP_CHECK_DELAY_MS);
  }

  private unschedule(): void {
    clearTimeout(this.startupTimer);
    clearInterval(this.intervalTimer);
    this.startupTimer = undefined;
    this.intervalTimer = undefined;
  }

  private async runCheck(backend: UpdaterBackend): Promise<AppUpdateState> {
    this.loggedFailure = undefined;
    this.apply({ type: "checking" });
    try {
      await backend.check();
      // An updater that answered nothing (it considers itself inactive) did not check.
      if (this.current.status === "checking") this.fail("The updater gave no answer.");
    } catch (error) {
      this.fail(describe(error));
    }
    return this.current;
  }

  private handle(event: BackendEvent): void {
    if (event.type === "error") this.fail(event.message ?? "Unknown updater error.");
    else this.apply(event);
  }

  private fail(message: string): void {
    if (message !== this.loggedFailure) this.options.log(`Could not check for updates or download one: ${message}`);
    this.loggedFailure = message;
    this.apply({ type: "error" });
  }

  private apply(event: UpdaterEvent): void {
    const previous = this.current;
    const next = reduceUpdate(previous, event, this.options.now());
    if (next === previous) return;
    this.current = next;
    for (const listener of [...this.listeners]) {
      try {
        listener(next);
      } catch (error) {
        this.options.log(`An update listener failed: ${describe(error)}`);
      }
    }
    if (next.status === "downloading" && previous.status !== "downloading") this.download();
    if (next.status === "downloaded" && next.latestVersion) this.announce({ kind: "downloaded", version: next.latestVersion });
    if (next.status === "available" && next.latestVersion) this.announce({ kind: "available", version: next.latestVersion });
  }

  private download(): void {
    this.loggedFailure = undefined;
    void this.backend?.download().catch((error: unknown) => this.fail(describe(error)));
  }

  /** At most one notification per version, also across restarts. */
  private announce(notice: UpdateNotice): void {
    if (this.notifiedVersion === notice.version) return;
    this.notifiedVersion = notice.version;
    try {
      this.options.notified?.save(notice.version);
      this.options.notify?.(notice);
    } catch (error) {
      this.options.log(`Could not show the update notification: ${describe(error)}`);
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
