import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAppPaths } from "../src/paths";

describe("resolveAppPaths", () => {
  it("uses the repository folders while developing", () => {
    const bundleDir = join("/repo", "apps", "electron", "dist");
    expect(resolveAppPaths({ isPackaged: false, resourcesPath: "/ignored", bundleDir, platform: "linux" })).toEqual({
      mobileDistDir: join("/repo", "apps", "mobile", "dist"),
      overlayFile: join("/repo", "apps", "desktop", "public", "overlay.html"),
      trayIcon: join("/repo", "apps", "electron", "assets", "tray.png"),
      windowIcon: join("/repo", "apps", "electron", "assets", "icon.png"),
    });
  });

  it("uses the installer's resources folder when packaged", () => {
    const bundleDir = join("/Applications/Speak Bot.app/Contents/Resources/app.asar", "dist");
    expect(resolveAppPaths({ isPackaged: true, resourcesPath: "/Applications/Speak Bot.app/Contents/Resources", bundleDir, platform: "darwin" })).toEqual({
      mobileDistDir: join("/Applications/Speak Bot.app/Contents/Resources", "mobile"),
      overlayFile: join("/Applications/Speak Bot.app/Contents/Resources", "overlay.html"),
      trayIcon: join("/Applications/Speak Bot.app/Contents/Resources/app.asar", "assets", "trayTemplate.png"),
      windowIcon: join("/Applications/Speak Bot.app/Contents/Resources/app.asar", "assets", "icon.png"),
    });
  });

  it("uses the colored tray icon outside macOS", () => {
    const bundleDir = join("C:", "Program Files", "Speak Bot", "resources", "app.asar", "dist");
    const paths = resolveAppPaths({ isPackaged: true, resourcesPath: "C:/Program Files/Speak Bot/resources", bundleDir, platform: "win32" });
    expect(paths.trayIcon).toBe(join("C:", "Program Files", "Speak Bot", "resources", "app.asar", "assets", "tray.png"));
  });
});
