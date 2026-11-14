import type { AppUpdateMode, AppUpdateState } from "@speed-deck/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppUpdateController, CHECK_INTERVAL_MS, STARTUP_CHECK_DELAY_MS, type BackendEvent, type UpdateNotice, type UpdaterBackend } from "../src/update/app-update-controller";

/** A stand-in for electron-updater: each check answers with the next scripted outcome once the test lets it. */
class FakeBackend implements UpdaterBackend {
  checks = 0;
  downloads = 0;
  installs = 0;
  /** What the next checks find; the last one repeats. A version means "available", null "nothing new". */
  outcomes: (string | null | Error)[] = [null];
  /** When set, checks wait until the test calls it. */
  release: (() => void) | undefined;
  hold = false;
  downloadFails: Error | undefined;
  private listener: (event: BackendEvent) => void = () => {};

  onEvent(listener: (event: BackendEvent) => void): void {
    this.listener = listener;
  }

  emit(event: BackendEvent): void {
    this.listener(event);
  }

  async check(): Promise<void> {
    this.checks += 1;
    this.emit({ type: "checking" });
    if (this.hold) await new Promise<void>((resolve) => (this.release = resolve));
    const outcome = this.outcomes.length > 1 ? this.outcomes.shift()! : this.outcomes[0]!;
    if (outcome instanceof Error) {
      this.emit({ type: "error", message: outcome.message });
      throw outcome;
    }
    this.emit(outcome === null ? { type: "not-available" } : { type: "available", version: outcome });
  }

  async download(): Promise<void> {
    this.downloads += 1;
    if (this.downloadFails) throw this.downloadFails;
  }

  quitAndInstall(): void {
    this.installs += 1;
  }
}

describe("AppUpdateController", () => {
  let backend: FakeBackend;
  let logs: string[];
  let notices: UpdateNotice[];
  let notified: string | undefined;
  let clock: number;

  const create = (mode: AppUpdateMode = "auto", options: { withBackend?: boolean } = {}) =>
    new AppUpdateController({
      currentVersion: "1.2.0",
      mode,
      backend: options.withBackend === false ? undefined : backend,
      now: () => clock,
      log: (message) => logs.push(message),
      notify: (notice) => notices.push(notice),
      notified: { load: () => notified, save: (version) => void (notified = version) },
    });

  beforeEach(() => {
    vi.useFakeTimers();
    backend = new FakeBackend();
    logs = [];
    notices = [];
    notified = undefined;
    clock = 1000;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("scheduling", () => {
    it("checks once shortly after startup, not at once, and then every 6 hours", async () => {
      const controller = create();
      controller.start();
      expect(backend.checks).toBe(0);
      expect(controller.state().status).toBe("idle");

      await vi.advanceTimersByTimeAsync(STARTUP_CHECK_DELAY_MS - 1);
      expect(backend.checks).toBe(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(backend.checks).toBe(1);
      expect(controller.state()).toMatchObject({ status: "up-to-date", lastCheckedAt: 1000 });

      expect(CHECK_INTERVAL_MS).toBe(6 * 60 * 60 * 1000);
      await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS - 1);
      expect(backend.checks).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(backend.checks).toBe(2);
      await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 2);
      expect(backend.checks).toBe(4);
    });

    it("makes no check by itself while automatic checks are off, only the manual one", async () => {
      const controller = create();
      controller.setAutoCheck(false);
      controller.start();
      await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 3);
      expect(backend.checks).toBe(0);
      expect(controller.state()).toMatchObject({ status: "idle", autoCheck: false });

      await controller.check();
      expect(backend.checks).toBe(1);
      expect(controller.state().status).toBe("up-to-date");
    });

    it("stops and resumes its own checks when the setting changes while running", async () => {
      const controller = create();
      controller.start();
      await vi.advanceTimersByTimeAsync(STARTUP_CHECK_DELAY_MS);
      expect(backend.checks).toBe(1);

      controller.setAutoCheck(false);
      await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 2);
      expect(backend.checks).toBe(1);

      controller.setAutoCheck(true);
      await vi.advanceTimersByTimeAsync(STARTUP_CHECK_DELAY_MS);
      expect(backend.checks).toBe(2);
      await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
      expect(backend.checks).toBe(3);
    });

    it("does not schedule anything before it is started, nor after it is stopped", async () => {
      const controller = create();
      controller.setAutoCheck(true);
      await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
      expect(backend.checks).toBe(0);

      controller.start();
      controller.stop();
      await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 2);
      expect(backend.checks).toBe(0);
    });

    it("joins a manual check to the one already running instead of starting another", async () => {
      const controller = create();
      backend.hold = true;
      const first = controller.check();
      const second = controller.check();
      expect(controller.state().status).toBe("checking");
      expect(backend.checks).toBe(1);

      backend.release?.();
      const [a, b] = await Promise.all([first, second]);
      expect(a.status).toBe("up-to-date");
      expect(b).toEqual(a);
      expect(backend.checks).toBe(1);

      // Once it ended, the next manual check is a new one.
      backend.hold = false;
      await controller.check();
      expect(backend.checks).toBe(2);
    });

    it("skips the scheduled check while a manual one is running", async () => {
      const controller = create();
      controller.start();
      backend.hold = true;
      const manual = controller.check();
      await vi.advanceTimersByTimeAsync(STARTUP_CHECK_DELAY_MS);
      expect(backend.checks).toBe(1);
      backend.release?.();
      await manual;
    });
  });

  describe("where the app installs updates itself", () => {
    it("downloads a new version, tells once that it is ready and restarts on request", async () => {
      const controller = create("auto");
      const seen: AppUpdateState[] = [];
      controller.subscribe((state) => seen.push(state));
      backend.outcomes = ["1.3.0"];

      const afterCheck = await controller.check();
      expect(afterCheck).toMatchObject({ status: "downloading", latestVersion: "1.3.0", progressPercent: 0 });
      expect(backend.downloads).toBe(1);
      expect(controller.install()).toBe(false);
      expect(backend.installs).toBe(0);

      backend.emit({ type: "progress", percent: 60 });
      backend.emit({ type: "downloaded", version: "1.3.0" });
      expect(controller.state()).toMatchObject({ status: "downloaded", latestVersion: "1.3.0" });
      expect(seen.map((state) => state.status)).toEqual(["checking", "downloading", "downloading", "downloaded"]);
      expect(notices).toEqual([{ kind: "downloaded", version: "1.3.0" }]);
      expect(notified).toBe("1.3.0");

      // A later check neither asks again nor notifies again.
      await controller.check();
      expect(backend.checks).toBe(1);
      expect(notices).toHaveLength(1);

      expect(controller.install()).toBe(true);
      expect(backend.installs).toBe(1);
    });

    it("does not notify again for a version it already announced before a restart", async () => {
      notified = "1.3.0";
      const controller = create("auto");
      backend.outcomes = ["1.3.0"];
      await controller.check();
      backend.emit({ type: "downloaded", version: "1.3.0" });
      expect(controller.state().status).toBe("downloaded");
      expect(notices).toEqual([]);
    });

    it("turns a failed download into a quiet error and tries again at the next check", async () => {
      const controller = create("auto");
      backend.outcomes = ["1.3.0"];
      backend.downloadFails = new Error("net::ERR_INTERNET_DISCONNECTED");
      await controller.check();
      await vi.advanceTimersByTimeAsync(0);
      expect(controller.state()).toMatchObject({ status: "error", latestVersion: "1.3.0" });
      expect(logs.join("\n")).toContain("net::ERR_INTERNET_DISCONNECTED");
      expect(notices).toEqual([]);

      backend.downloadFails = undefined;
      await controller.check();
      expect(backend.downloads).toBe(2);
      expect(controller.state().status).toBe("downloading");
    });
  });

  describe("where updates are installed by hand", () => {
    it("announces the version with its page, never downloads and cannot install", async () => {
      const controller = create("notify");
      backend.outcomes = ["1.3.0"];
      const state = await controller.check();
      expect(state).toMatchObject({ status: "available", latestVersion: "1.3.0", releaseUrl: "https://github.com/alejox/speak-bot/releases/tag/v1.3.0" });
      expect(backend.downloads).toBe(0);
      expect(notices).toEqual([{ kind: "available", version: "1.3.0" }]);
      expect(controller.install()).toBe(false);
      expect(backend.installs).toBe(0);

      // Found again 6 hours later: no second notification for the same version.
      await controller.check();
      expect(backend.checks).toBe(2);
      expect(notices).toHaveLength(1);

      // A newer one is announced.
      backend.outcomes = ["1.4.0"];
      await controller.check();
      expect(notices).toEqual([
        { kind: "available", version: "1.3.0" },
        { kind: "available", version: "1.4.0" },
      ]);
    });
  });

  describe("failures", () => {
    it.each([
      ["offline", "net::ERR_INTERNET_DISCONNECTED"],
      ["GitHub rate limit", "HttpError: 403 rate limit exceeded"],
      ["no release yet", "No published versions on GitHub"],
      ["a release without update metadata", "Cannot find latest-mac.yml in the latest release artifacts: HttpError: 404"],
    ])("stays quiet and usable when the check fails: %s", async (_name, message) => {
      const controller = create("notify");
      backend.outcomes = [null, new Error(message), null];
      clock = 1000;
      await controller.check();
      clock = 2000;
      const failed = await controller.check();
      expect(failed).toMatchObject({ status: "error", lastCheckedAt: 1000 });
      expect(logs.filter((line) => line.includes(message))).toHaveLength(1);
      expect(notices).toEqual([]);

      clock = 3000;
      expect(await controller.check()).toMatchObject({ status: "up-to-date", lastCheckedAt: 3000 });
    });

    it("is an error when the updater answers nothing at all", async () => {
      const controller = create("notify");
      backend.check = async () => {};
      expect((await controller.check()).status).toBe("error");
    });

    it("never offers a downgrade or a prerelease the update source reports", async () => {
      const controller = create("auto");
      backend.outcomes = ["1.1.0", "1.3.0-beta.2"];
      expect((await controller.check()).status).toBe("up-to-date");
      expect((await controller.check()).status).toBe("up-to-date");
      expect(backend.downloads).toBe(0);
      expect(notices).toEqual([]);
    });

    it("keeps working when a listener or the notification throws", async () => {
      const controller = new AppUpdateController({
        currentVersion: "1.2.0",
        mode: "notify",
        backend,
        now: () => clock,
        log: (message) => logs.push(message),
        notify: () => {
          throw new Error("no notification daemon");
        },
      });
      controller.subscribe(() => {
        throw new Error("listener broke");
      });
      backend.outcomes = ["1.3.0"];
      expect((await controller.check()).status).toBe("available");
    });
  });

  describe("disabled", () => {
    it.each([
      ["a development build", "disabled" as const, true],
      ["no updater at all", "auto" as const, false],
    ])("only reports the version: %s", async (_name, mode, withBackend) => {
      const controller = create(mode, { withBackend });
      controller.start();
      await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 2);
      expect(await controller.check()).toEqual({ currentVersion: "1.2.0", mode: "disabled", status: "idle", autoCheck: true });
      expect(backend.checks).toBe(0);
      expect(controller.install()).toBe(false);
    });
  });

  it("stops telling a listener that unsubscribed", async () => {
    const controller = create();
    const seen: string[] = [];
    const stop = controller.subscribe((state) => seen.push(state.status));
    await controller.check();
    stop();
    await controller.check();
    expect(seen).toEqual(["checking", "up-to-date"]);
  });
});
