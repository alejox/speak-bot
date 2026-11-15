import { describe, expect, it } from "vitest";
import { isAppUpdateState, isDevelopmentVersion, isServerEvent, type AppUpdateState } from "../src";

const IDLE: AppUpdateState = { currentVersion: "1.2.0", mode: "auto", status: "idle", autoCheck: true };

describe("isAppUpdateState", () => {
  it("accepts every shape the computer app sends", () => {
    const states: AppUpdateState[] = [
      IDLE,
      { ...IDLE, status: "checking" },
      { ...IDLE, status: "up-to-date", lastCheckedAt: 10 },
      { ...IDLE, status: "downloading", latestVersion: "1.3.0", progressPercent: 42.5, lastCheckedAt: 10 },
      { ...IDLE, status: "downloaded", latestVersion: "1.3.0", lastCheckedAt: 10 },
      { ...IDLE, mode: "notify", status: "available", latestVersion: "1.3.0", releaseUrl: "https://github.com/alejox/speak-bot/releases/tag/v1.3.0", lastCheckedAt: 10 },
      { ...IDLE, status: "error", lastCheckedAt: 10, autoCheck: false },
      { currentVersion: "1.2.0", mode: "disabled", status: "idle", autoCheck: true },
    ];
    for (const state of states) expect(isAppUpdateState(state)).toBe(true);
  });

  it("rejects malformed values", () => {
    expect(isAppUpdateState(null)).toBe(false);
    expect(isAppUpdateState({})).toBe(false);
    expect(isAppUpdateState({ ...IDLE, currentVersion: 1 })).toBe(false);
    expect(isAppUpdateState({ ...IDLE, mode: "manual" })).toBe(false);
    expect(isAppUpdateState({ ...IDLE, status: "paused" })).toBe(false);
    expect(isAppUpdateState({ ...IDLE, autoCheck: "yes" })).toBe(false);
    expect(isAppUpdateState({ ...IDLE, latestVersion: 2 })).toBe(false);
    expect(isAppUpdateState({ ...IDLE, progressPercent: "50" })).toBe(false);
    expect(isAppUpdateState({ ...IDLE, lastCheckedAt: "now" })).toBe(false);
  });

  it("only accepts an https release page", () => {
    expect(isAppUpdateState({ ...IDLE, releaseUrl: "http://github.com/alejox/speak-bot/releases" })).toBe(false);
    expect(isAppUpdateState({ ...IDLE, releaseUrl: "javascript:alert(1)" })).toBe(false);
    expect(isAppUpdateState({ ...IDLE, releaseUrl: "not a url" })).toBe(false);
  });
});

describe("isDevelopmentVersion", () => {
  it("is true for the version of a build that never got a release version", () => {
    for (const version of ["0.0.0", "v0.0.0", "0.0.0-dev.12", "0.0.0+local"]) expect(isDevelopmentVersion(version), version).toBe(true);
  });

  it("is false for every released version and for anything that is not a version", () => {
    for (const version of ["0.0.1", "0.1.0", "1.0.0", "10.0.0", "1.0.0-beta.1", "", "dev"]) expect(isDevelopmentVersion(version), version).toBe(false);
  });
});

describe("app-update server event", () => {
  it("is a server event when it carries a valid state", () => {
    expect(isServerEvent({ type: "app-update", update: IDLE, at: 1 })).toBe(true);
    expect(isServerEvent({ type: "app-update", update: { ...IDLE, status: "paused" }, at: 1 })).toBe(false);
    expect(isServerEvent({ type: "app-update", at: 1 })).toBe(false);
  });
});
