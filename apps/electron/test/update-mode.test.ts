import { describe, expect, it } from "vitest";
import { updateMode } from "../src/update/update-mode";

const packaged = { isPackaged: true, hasUpdateConfig: true, appImage: undefined };

describe("updateMode", () => {
  it("installs updates by itself on Windows", () => {
    expect(updateMode({ ...packaged, platform: "win32" })).toBe("auto");
  });

  it("installs updates by itself on Linux only when running as an AppImage", () => {
    expect(updateMode({ ...packaged, platform: "linux", appImage: "/home/ana/Speed Deck.AppImage" })).toBe("auto");
    expect(updateMode({ ...packaged, platform: "linux" })).toBe("notify");
    expect(updateMode({ ...packaged, platform: "linux", appImage: "" })).toBe("notify");
  });

  it("only announces updates on macOS, where the app is not signed with a Developer ID", () => {
    expect(updateMode({ ...packaged, platform: "darwin" })).toBe("notify");
    // APPIMAGE means nothing outside Linux.
    expect(updateMode({ ...packaged, platform: "darwin", appImage: "/tmp/x.AppImage" })).toBe("notify");
  });

  it("is disabled in development and when the build has no update source", () => {
    for (const platform of ["win32", "darwin", "linux"] as const) {
      expect(updateMode({ ...packaged, platform, isPackaged: false })).toBe("disabled");
      expect(updateMode({ ...packaged, platform, hasUpdateConfig: false })).toBe("disabled");
    }
  });

  it("is disabled on systems the app is not built for", () => {
    expect(updateMode({ ...packaged, platform: "freebsd" })).toBe("disabled");
  });
});
