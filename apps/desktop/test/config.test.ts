import { posix, win32 } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

const base = { argv: [], env: {}, platform: "darwin" as NodeJS.Platform, homeDir: "/home/me" };

describe("loadConfig", () => {
  it("uses sensible defaults", () => {
    expect(loadConfig(base)).toEqual({
      port: 4545,
      host: "0.0.0.0",
      dataDir: posix.join("/home/me", "Library", "Application Support", "speed-deck"),
      legacyDataDir: posix.join("/home/me", "Library", "Application Support", "speak-bot"),
      defaults: { voiceId: "", rate: 1, deviceId: "", language: "es", captionsVisible: true },
      allowedHosts: [],
    });
  });

  it("reads extra allowed hosts as a comma-separated list", () => {
    expect(loadConfig({ ...base, env: { SPEED_DECK_ALLOWED_HOSTS: " Speak.Example.com, ,obs.lan " } }).allowedHosts).toEqual([
      "speak.example.com",
      "obs.lan",
    ]);
    expect(
      loadConfig({ ...base, env: { SPEED_DECK_ALLOWED_HOSTS: "a.lan" }, argv: ["--allowed-host", "b.lan"] }).allowedHosts,
    ).toEqual(["b.lan"]);
  });

  it("reads env vars and lets CLI flags win", () => {
    const config = loadConfig({
      ...base,
      platform: "linux",
      env: { SPEED_DECK_PORT: "5000", SPEED_DECK_VOICE: "Alex", SPEED_DECK_DATA_DIR: "/data" },
      argv: ["--port", "6000", "--host=127.0.0.1", "--rate", "1.5", "--device", "BlackHole 2ch"],
    });

    expect(config).toEqual({
      port: 6000,
      host: "127.0.0.1",
      dataDir: "/data",
      defaults: { voiceId: "Alex", rate: 1.5, deviceId: "BlackHole 2ch", language: "es", captionsVisible: true },
      allowedHosts: [],
    });
  });

  it("still accepts the older SPEAK_BOT_* env vars, with SPEED_DECK_* winning", () => {
    const config = loadConfig({
      ...base,
      env: { SPEAK_BOT_PORT: "5000", SPEAK_BOT_HOST: "127.0.0.1", SPEAK_BOT_RATE: "1.5", SPEAK_BOT_DATA_DIR: "/old", SPEED_DECK_DATA_DIR: "/new" },
    });
    expect(config).toMatchObject({ port: 5000, host: "127.0.0.1", dataDir: "/new", defaults: { rate: 1.5 } });
    expect(config.legacyDataDir).toBeUndefined();
    expect(loadConfig({ ...base, env: { SPEAK_BOT_ALLOWED_HOSTS: "a.lan" } }).allowedHosts).toEqual(["a.lan"]);
  });

  it("uses the per-OS data directory and remembers the one older versions used", () => {
    const linux = loadConfig({ ...base, platform: "linux" });
    expect(linux.dataDir).toBe(posix.join("/home/me", ".config", "speed-deck"));
    expect(linux.legacyDataDir).toBe(posix.join("/home/me", ".config", "speak-bot"));
    expect(loadConfig({ ...base, platform: "linux", env: { XDG_CONFIG_HOME: "/xdg" } }).dataDir).toBe(posix.join("/xdg", "speed-deck"));
    const windows = loadConfig({ ...base, platform: "win32", env: { APPDATA: "C:\\Users\\me\\AppData\\Roaming" } });
    expect(windows.dataDir).toBe(win32.join("C:\\Users\\me\\AppData\\Roaming", "speed-deck"));
    expect(windows.legacyDataDir).toBe(win32.join("C:\\Users\\me\\AppData\\Roaming", "speak-bot"));
    expect(loadConfig({ ...base, platform: "win32" }).dataDir).toBe(win32.join("/home/me", "AppData", "Roaming", "speed-deck"));
    // An explicit data directory is used as is, without migrating anything into it.
    expect(loadConfig({ ...base, argv: ["--data-dir", "/data"] }).legacyDataDir).toBeUndefined();
  });

  it("rejects invalid values", () => {
    expect(() => loadConfig({ ...base, argv: ["--port", "abc"] })).toThrow(/port/);
    expect(() => loadConfig({ ...base, argv: ["--rate", "9"] })).toThrow(/rate/);
  });
});
