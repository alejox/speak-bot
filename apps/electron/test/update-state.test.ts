import type { AppUpdateState } from "@speed-deck/core";
import { describe, expect, it } from "vitest";
import { initialUpdateState, reduceUpdate, type UpdaterEvent } from "../src/update/update-state";
import { isNewerStableVersion, releasePageUrl } from "../src/update/versions";

const auto = initialUpdateState({ currentVersion: "1.2.0", mode: "auto" });
const notify = initialUpdateState({ currentVersion: "1.2.0", mode: "notify" });
const run = (state: AppUpdateState, events: UpdaterEvent[], now = 100) => events.reduce((current, event) => reduceUpdate(current, event, now), state);

describe("isNewerStableVersion", () => {
  it("accepts only a higher stable version", () => {
    expect(isNewerStableVersion("1.2.0", "1.2.1")).toBe(true);
    expect(isNewerStableVersion("1.2.0", "1.10.0")).toBe(true);
    expect(isNewerStableVersion("1.9.9", "2.0.0")).toBe(true);
    expect(isNewerStableVersion("1.2.0", "v1.3.0")).toBe(true);
  });

  it("never accepts a downgrade or the same version", () => {
    expect(isNewerStableVersion("1.2.0", "1.2.0")).toBe(false);
    expect(isNewerStableVersion("1.2.0", "1.1.9")).toBe(false);
    expect(isNewerStableVersion("2.0.0", "1.99.99")).toBe(false);
  });

  it("never accepts a prerelease, even a higher one", () => {
    expect(isNewerStableVersion("1.2.0", "1.3.0-beta.1")).toBe(false);
    expect(isNewerStableVersion("1.2.0", "2.0.0-rc.1")).toBe(false);
    expect(isNewerStableVersion("1.2.0", "1.3.0+build.5")).toBe(false);
  });

  it("offers the stable release to a development build of the same or a lower version", () => {
    expect(isNewerStableVersion("1.3.0-dev.4", "1.3.0")).toBe(true);
    expect(isNewerStableVersion("0.0.0-dev.12", "1.0.0")).toBe(true);
    expect(isNewerStableVersion("1.3.0-dev.4", "1.2.9")).toBe(false);
  });

  it("refuses anything that is not a version", () => {
    for (const candidate of ["", "latest", "1.2", "1.2.x", "1.2.3.4", "../1.3.0", "1.3.0/../../x"]) expect(isNewerStableVersion("1.2.0", candidate)).toBe(false);
    expect(isNewerStableVersion("unknown", "1.3.0")).toBe(false);
  });
});

describe("releasePageUrl", () => {
  it("is the GitHub page of the version's tag", () => {
    expect(releasePageUrl("1.3.0")).toBe("https://github.com/alejox/speak-bot/releases/tag/v1.3.0");
    expect(releasePageUrl("v1.3.0")).toBe("https://github.com/alejox/speak-bot/releases/tag/v1.3.0");
  });
});

describe("reduceUpdate", () => {
  it("starts idle, checking by itself, with the version of the running app", () => {
    expect(auto).toEqual({ currentVersion: "1.2.0", mode: "auto", status: "idle", autoCheck: true });
    expect(initialUpdateState({ currentVersion: "1.2.0", mode: "notify", autoCheck: false }).autoCheck).toBe(false);
  });

  it("reports a check and its answer when there is nothing new", () => {
    expect(run(auto, [{ type: "checking" }]).status).toBe("checking");
    expect(run(auto, [{ type: "checking" }, { type: "not-available" }], 500)).toEqual({ ...auto, status: "up-to-date", lastCheckedAt: 500 });
  });

  it("downloads a new version in the background where the app installs updates itself", () => {
    const found = run(auto, [{ type: "checking" }, { type: "available", version: "1.3.0" }], 500);
    expect(found).toEqual({ ...auto, status: "downloading", latestVersion: "1.3.0", progressPercent: 0, lastCheckedAt: 500 });
    expect(found.releaseUrl).toBeUndefined();

    const half = run(found, [{ type: "progress", percent: 49.6 }]);
    expect(half).toMatchObject({ status: "downloading", progressPercent: 50 });
    expect(run(half, [{ type: "progress", percent: 250 }]).progressPercent).toBe(100);
    expect(run(half, [{ type: "progress", percent: -3 }]).progressPercent).toBe(0);

    const done = run(half, [{ type: "downloaded", version: "1.3.0" }]);
    expect(done).toEqual({ ...auto, status: "downloaded", latestVersion: "1.3.0", lastCheckedAt: 500 });
  });

  it("returns the same state for progress that does not change the whole percent, so nothing is broadcast", () => {
    const downloading = run(auto, [{ type: "available", version: "1.3.0" }, { type: "progress", percent: 12.2 }]);
    expect(reduceUpdate(downloading, { type: "progress", percent: 12.4 }, 1)).toBe(downloading);
    // Progress means nothing unless a download is running.
    expect(reduceUpdate(auto, { type: "progress", percent: 30 }, 1)).toBe(auto);
  });

  it("only announces a new version, with its page, where updates are installed by hand", () => {
    const found = run(notify, [{ type: "checking" }, { type: "available", version: "1.3.0" }], 500);
    expect(found).toEqual({
      ...notify,
      status: "available",
      latestVersion: "1.3.0",
      releaseUrl: "https://github.com/alejox/speak-bot/releases/tag/v1.3.0",
      lastCheckedAt: 500,
    });
    // A stray download event cannot make this system claim an update is ready to install.
    expect(reduceUpdate(found, { type: "downloaded", version: "1.3.0" }, 1)).toBe(found);
  });

  it("never offers a downgrade or a prerelease, whatever the update source says", () => {
    for (const version of ["1.2.0", "1.1.0", "1.3.0-beta.1", "not-a-version"]) {
      for (const state of [auto, notify]) {
        expect(run(state, [{ type: "checking" }, { type: "available", version }], 500)).toEqual({ ...state, status: "up-to-date", lastCheckedAt: 500 });
      }
    }
    expect(run(auto, [{ type: "available", version: "1.3.0" }, { type: "downloaded", version: "1.1.0" }]).status).toBe("downloading");
  });

  it("shows a quiet error with the last check that worked when a check fails", () => {
    const checked = run(auto, [{ type: "checking" }, { type: "not-available" }], 500);
    const failed = run(checked, [{ type: "checking" }, { type: "error" }], 900);
    expect(failed).toEqual({ ...auto, status: "error", lastCheckedAt: 500 });
    // The next check that works clears it.
    expect(run(failed, [{ type: "checking" }, { type: "not-available" }], 1200)).toEqual({ ...auto, status: "up-to-date", lastCheckedAt: 1200 });
  });

  it("is an error without a last check while no release was ever published", () => {
    const failed = run(notify, [{ type: "checking" }, { type: "error" }], 900);
    expect(failed).toEqual({ ...notify, status: "error" });
    expect(failed.lastCheckedAt).toBeUndefined();
  });

  it("stops showing progress when a download fails, and tries again on the next check", () => {
    const failed = run(auto, [{ type: "available", version: "1.3.0" }, { type: "progress", percent: 30 }, { type: "error" }], 500);
    expect(failed).toEqual({ ...auto, status: "error", latestVersion: "1.3.0", lastCheckedAt: 500 });
    expect(run(failed, [{ type: "checking" }, { type: "available", version: "1.3.0" }], 700)).toMatchObject({ status: "downloading", progressPercent: 0, lastCheckedAt: 700 });
  });

  it("keeps the announced version while a later check fails on a system that installs by hand", () => {
    const found = run(notify, [{ type: "available", version: "1.3.0" }], 500);
    const failed = run(found, [{ type: "checking" }, { type: "error" }], 900);
    expect(failed).toMatchObject({ status: "error", latestVersion: "1.3.0", releaseUrl: "https://github.com/alejox/speak-bot/releases/tag/v1.3.0", lastCheckedAt: 500 });
  });

  it("keeps a downloaded update ready whatever happens afterwards", () => {
    const done = run(auto, [{ type: "available", version: "1.3.0" }, { type: "downloaded", version: "1.3.0" }], 500);
    for (const event of [{ type: "checking" }, { type: "error" }, { type: "not-available" }, { type: "progress", percent: 5 }] satisfies UpdaterEvent[]) {
      expect(reduceUpdate(done, event, 900)).toBe(done);
    }
  });

  it("does not restart a download that is running when another check finds the same version", () => {
    const downloading = run(auto, [{ type: "available", version: "1.3.0" }, { type: "progress", percent: 40 }], 500);
    expect(reduceUpdate(downloading, { type: "checking" }, 900)).toBe(downloading);
    expect(reduceUpdate(downloading, { type: "available", version: "1.3.0" }, 900)).toBe(downloading);
  });

  it("follows the automatic checks setting without touching the rest", () => {
    const found = run(notify, [{ type: "available", version: "1.3.0" }], 500);
    expect(reduceUpdate(found, { type: "auto-check", enabled: false }, 900)).toEqual({ ...found, autoCheck: false });
    expect(reduceUpdate(found, { type: "auto-check", enabled: true }, 900)).toBe(found);
  });

  it("ignores updater events while updates are disabled, but still keeps the setting", () => {
    const disabled = initialUpdateState({ currentVersion: "1.2.0", mode: "disabled" });
    for (const event of [{ type: "checking" }, { type: "available", version: "1.3.0" }, { type: "error" }] satisfies UpdaterEvent[]) {
      expect(reduceUpdate(disabled, event, 1)).toBe(disabled);
    }
    expect(reduceUpdate(disabled, { type: "auto-check", enabled: false }, 1).autoCheck).toBe(false);
  });
});
