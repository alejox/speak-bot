import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BackendEvent } from "../src/update/app-update-controller";

/** electron-updater's `autoUpdater`, reduced to what the backend touches. */
class FakeAutoUpdater extends EventEmitter {
  autoDownload = true;
  autoInstallOnAppQuit = false;
  allowPrerelease = true;
  allowDowngrade = true;
  fullChangelog = true;
  requestHeaders: Record<string, string> | null = null;
  logger: unknown = console;
  checkResult: unknown = { isUpdateAvailable: false };
  checkError: Error | undefined;
  downloadError: Error | undefined;
  installs: Array<[boolean, boolean]> = [];

  async checkForUpdates(): Promise<unknown> {
    if (this.checkError) throw this.checkError;
    return this.checkResult;
  }

  async downloadUpdate(): Promise<string[]> {
    if (this.downloadError) throw this.downloadError;
    return [];
  }

  quitAndInstall(isSilent: boolean, isForceRunAfter: boolean): void {
    this.installs.push([isSilent, isForceRunAfter]);
  }
}

const fake = vi.hoisted(() => ({ updater: undefined as unknown, appImageUpdater: undefined as unknown, picked: [] as string[] }));
vi.mock("electron-updater", () => ({
  /** What electron-updater picks by itself: on Linux, by a file the .deb build leaves in the app's resources. */
  get autoUpdater() {
    fake.picked.push("autoUpdater");
    return fake.updater;
  },
  AppImageUpdater: function AppImageUpdater() {
    fake.picked.push("AppImageUpdater");
    return fake.appImageUpdater;
  },
}));

describe("createElectronUpdaterBackend", () => {
  let updater: FakeAutoUpdater;
  let logs: string[];
  let events: BackendEvent[];
  let prepared: number;

  const create = async (appImage = false) => {
    const { createElectronUpdaterBackend } = await import("../src/update/electron-updater-backend");
    const backend = createElectronUpdaterBackend({
      appImage,
      log: (message) => logs.push(message),
      beforeInstall: async () => {
        prepared += 1;
      },
    });
    backend.onEvent((event) => events.push(event));
    return backend;
  };

  beforeEach(() => {
    updater = new FakeAutoUpdater();
    fake.updater = updater;
    fake.appImageUpdater = undefined;
    fake.picked = [];
    logs = [];
    events = [];
    prepared = 0;
  });

  it("never downloads by itself, never takes a prerelease or an older version, and installs on quit", async () => {
    await create();
    expect(updater.autoDownload).toBe(false);
    expect(updater.allowPrerelease).toBe(false);
    expect(updater.allowDowngrade).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(true);
  });

  it("uses the AppImage updater when running as an AppImage, whatever the build left in the resources", async () => {
    const appImageUpdater = new FakeAutoUpdater();
    fake.appImageUpdater = appImageUpdater;
    const backend = await create(true);
    expect(fake.picked).toEqual(["AppImageUpdater"]);
    expect(appImageUpdater.autoDownload).toBe(false);
    appImageUpdater.emit("update-available", { version: "1.3.0" });
    expect(events).toEqual([{ type: "available", version: "1.3.0" }]);
    backend.quitAndInstall();
    await vi.waitFor(() => expect(appImageUpdater.installs).toEqual([[true, true]]));
    expect(updater.installs).toEqual([]);
  });

  it("lets electron-updater pick the updater everywhere else", async () => {
    await create(false);
    expect(fake.picked).toEqual(["autoUpdater"]);
  });

  it("sends nothing that identifies the installation with its requests", async () => {
    await create();
    // electron-updater would otherwise add a random id it keeps per installation.
    expect(updater.requestHeaders).toEqual({ "x-user-staging-id": "none" });
  });

  it("translates the updater's events", async () => {
    await create();
    updater.emit("checking-for-update");
    updater.emit("update-available", { version: "1.3.0" });
    updater.emit("update-not-available", { version: "1.2.0" });
    updater.emit("download-progress", { percent: 41.5, total: 10, transferred: 4, bytesPerSecond: 1 });
    updater.emit("update-downloaded", { version: "1.3.0", downloadedFile: "/tmp/x" });
    updater.emit("error", new Error("net::ERR_INTERNET_DISCONNECTED\n    at stack line"));
    expect(events).toEqual([
      { type: "checking" },
      { type: "available", version: "1.3.0" },
      { type: "not-available" },
      { type: "progress", percent: 41.5 },
      { type: "downloaded", version: "1.3.0" },
      { type: "error", message: "net::ERR_INTERNET_DISCONNECTED" },
    ]);
  });

  it("rejects a check with the reason only, without the page GitHub answered with", async () => {
    const backend = await create();
    updater.checkError = new Error("Cannot find latest-mac.yml in the latest release artifacts: HttpError: 404\n<html>…</html>");
    await expect(backend.check()).rejects.toThrow(/^Cannot find latest-mac\.yml in the latest release artifacts: HttpError: 404$/);
    updater.checkError = undefined;
    await expect(backend.check()).resolves.toBeUndefined();
  });

  it("rejects a check the updater skipped because it considers itself inactive", async () => {
    const backend = await create();
    updater.checkResult = null;
    await expect(backend.check()).rejects.toThrow("not active");
  });

  it("rejects a failed download", async () => {
    const backend = await create();
    updater.downloadError = new Error("sha512 checksum mismatch");
    await expect(backend.download()).rejects.toThrow("sha512 checksum mismatch");
  });

  it("frees the port and the lock before it quits to install, silently and starting the app again", async () => {
    const backend = await create();
    backend.quitAndInstall();
    expect(updater.installs).toEqual([]);
    await vi.waitFor(() => expect(updater.installs).toEqual([[true, true]]));
    expect(prepared).toBe(1);
  });

  it("does not print the updater's own error logs, which the controller reports once", async () => {
    await create();
    const logger = updater.logger as { info(message: string): void; warn(message: string): void; error(message: string): void };
    logger.error("stack…");
    logger.info("Checking for update");
    expect(logs).toEqual(["Updater: Checking for update"]);
  });
});
