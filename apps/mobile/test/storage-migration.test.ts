import { beforeEach, describe, expect, it } from "vitest";
import { migrateLegacyStorageKeys } from "../src/adapters/browser-storage";
import { createAppServices } from "../src/app/composition-root";
import { LANGUAGE_STORAGE_KEY } from "../src/adapters/local-storage-language-store";

describe("migrateLegacyStorageKeys", () => {
  beforeEach(() => localStorage.clear());

  it("moves values saved as speak-bot:* to speed-deck:*, once", () => {
    localStorage.setItem("speak-bot:language", '"en"');
    localStorage.setItem("speak-bot:boards", "[]");
    localStorage.setItem("speed-deck:boards", '[{"id":"new"}]');
    localStorage.setItem("other-app:key", "kept");

    migrateLegacyStorageKeys(localStorage);

    expect(localStorage.getItem("speed-deck:language")).toBe('"en"');
    // A value already saved under the new key wins.
    expect(localStorage.getItem("speed-deck:boards")).toBe('[{"id":"new"}]');
    expect(localStorage.getItem("speak-bot:language")).toBeNull();
    expect(localStorage.getItem("speak-bot:boards")).toBeNull();
    expect(localStorage.getItem("other-app:key")).toBe("kept");

    localStorage.setItem("speed-deck:language", '"es"');
    migrateLegacyStorageKeys(localStorage);
    expect(localStorage.getItem("speed-deck:language")).toBe('"es"');
  });

  it("ignores missing storage", () => {
    expect(() => migrateLegacyStorageKeys(null)).not.toThrow();
  });

  it("runs when the app starts", () => {
    localStorage.setItem("speak-bot:language", '"en"');
    createAppServices();
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('"en"');
  });
});
