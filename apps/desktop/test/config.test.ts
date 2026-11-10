import { posix, win32 } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

const base = { argv: [], env: {}, platform: "darwin" as NodeJS.Platform, homeDir: "/home/me" };

describe("loadConfig", () => {
  it("uses sensible defaults", () => {
    expect(loadConfig(base)).toEqual({
      port: 4545,
      host: "0.0.0.0",
      dataDir: posix.join("/home/me", "Library", "Application Support", "speak-bot"),
      defaults: { voiceId: "", rate: 1, deviceId: "" },
    });
  });

  it("reads env vars and lets CLI flags win", () => {
    const config = loadConfig({
      ...base,
      platform: "linux",
      env: { SPEAK_BOT_PORT: "5000", SPEAK_BOT_VOICE: "Alex", SPEAK_BOT_DATA_DIR: "/data" },
      argv: ["--port", "6000", "--host=127.0.0.1", "--rate", "1.5", "--device", "BlackHole 2ch"],
    });

    expect(config).toEqual({
      port: 6000,
      host: "127.0.0.1",
      dataDir: "/data",
      defaults: { voiceId: "Alex", rate: 1.5, deviceId: "BlackHole 2ch" },
    });
  });

  it("uses the per-OS data directory", () => {
    expect(loadConfig({ ...base, platform: "linux" }).dataDir).toBe(posix.join("/home/me", ".config", "speak-bot"));
    expect(loadConfig({ ...base, platform: "linux", env: { XDG_CONFIG_HOME: "/xdg" } }).dataDir).toBe(
      posix.join("/xdg", "speak-bot"),
    );
    expect(loadConfig({ ...base, platform: "win32", env: { APPDATA: "C:\\Users\\me\\AppData\\Roaming" } }).dataDir).toBe(
      win32.join("C:\\Users\\me\\AppData\\Roaming", "speak-bot"),
    );
    expect(loadConfig({ ...base, platform: "win32" }).dataDir).toBe(win32.join("/home/me", "AppData", "Roaming", "speak-bot"));
  });

  it("rejects invalid values", () => {
    expect(() => loadConfig({ ...base, argv: ["--port", "abc"] })).toThrow(/port/);
    expect(() => loadConfig({ ...base, argv: ["--rate", "9"] })).toThrow(/rate/);
  });
});
