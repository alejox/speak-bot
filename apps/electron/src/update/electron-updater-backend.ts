import { AppImageUpdater, autoUpdater, type AppUpdater as ElectronAppUpdater } from "electron-updater";
import type { BackendEvent, UpdaterBackend } from "./app-update-controller";

/** Sent in place of electron-updater's per-installation id: the same for everyone. */
const ANONYMOUS_STAGING_ID = "none";

export interface ElectronUpdaterBackendOptions {
  /** True when the app runs as a Linux AppImage (`process.env.APPIMAGE` is set). */
  appImage: boolean;
  log: (message: string) => void;
  /**
   * Runs before the app quits to install: frees what the next copy of the app needs (the server's port, the
   * single-instance lock), because on Linux the new AppImage starts while this process is still quitting.
   */
  beforeInstall: () => Promise<void>;
}

/**
 * electron-updater behind the small interface the controller drives. Its update source is the
 * `app-update.yml` electron-builder embeds from `publish` in electron-builder.yml (GitHub Releases).
 * The controller decides what to download: nothing here downloads by itself.
 */
export function createElectronUpdaterBackend({ appImage, log, beforeInstall }: ElectronUpdaterBackendOptions): UpdaterBackend {
  // Reading `autoUpdater` creates the updater for this platform (NSIS, macOS, or on Linux the one named by
  // the `package-type` file a .deb build leaves in the resources). An AppImage must replace its own file
  // whatever that file says, so its updater is chosen here.
  const updater: ElectronAppUpdater = appImage ? new AppImageUpdater() : autoUpdater;
  updater.autoDownload = false;
  // A downloaded update that was not installed on request is installed when the app quits.
  updater.autoInstallOnAppQuit = true;
  // Only published stable releases, and never an older one. The controller checks the version again.
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  updater.fullChangelog = false;
  // electron-updater adds to every request a random id it keeps per installation (`x-user-staging-id`, for
  // staged rollouts, which this app does not use). A constant takes its place, so a check carries nothing
  // that tells one installation from another.
  updater.requestHeaders = { "x-user-staging-id": ANONYMOUS_STAGING_ID };
  // Failures are logged once by the controller, with the state they lead to.
  updater.logger = {
    info: (message?: unknown) => log(`Updater: ${String(message)}`),
    warn: (message?: unknown) => log(`Updater: ${String(message)}`),
    error: () => {},
  };

  let listener: (event: BackendEvent) => void = () => {};
  updater.on("checking-for-update", () => listener({ type: "checking" }));
  updater.on("update-available", (info) => listener({ type: "available", version: info.version }));
  updater.on("update-not-available", () => listener({ type: "not-available" }));
  updater.on("download-progress", (progress) => listener({ type: "progress", percent: progress.percent }));
  updater.on("update-downloaded", (info) => listener({ type: "downloaded", version: info.version }));
  updater.on("update-cancelled", () => listener({ type: "error", message: "The download was cancelled." }));
  // Without a listener an "error" event would be thrown as an uncaught exception.
  updater.on("error", (error) => listener({ type: "error", message: firstLine(error) }));

  return {
    onEvent: (next) => {
      listener = next;
    },
    check: async () => {
      try {
        // Null means the updater considers itself inactive (not packaged, or not an AppImage on Linux).
        if ((await updater.checkForUpdates()) === null) throw new Error("The updater is not active in this build.");
      } catch (error) {
        throw new Error(firstLine(error));
      }
    },
    download: async () => {
      try {
        await updater.downloadUpdate();
      } catch (error) {
        throw new Error(firstLine(error));
      }
    },
    quitAndInstall: () => {
      void beforeInstall()
        .catch((error: unknown) => log(`Could not prepare the restart: ${firstLine(error)}`))
        // Silent on Windows (no installer wizard) and the app starts again afterwards.
        .then(() => updater.quitAndInstall(true, true));
    },
  };
}

/** The reason without the stack or the page GitHub answered with, which electron-updater appends. */
function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (message.split("\n")[0] ?? "").slice(0, 300);
}
