import { join } from "node:path";

export interface AppPathSources {
  /** `app.isPackaged`. */
  isPackaged: boolean;
  /** `process.resourcesPath`: where electron-builder puts `extraResources`. */
  resourcesPath: string;
  /** Folder of the bundled main script (`apps/electron/dist`, or `<app.asar>/dist` when packaged). */
  bundleDir: string;
  /** `process.platform`: macOS gets a monochrome template image for the menu bar. */
  platform: NodeJS.Platform;
}

export interface AppPaths {
  mobileDistDir: string;
  overlayFile: string;
  trayIcon: string;
  windowIcon: string;
}

/**
 * Locates the files the app needs. While developing they come from the repository; in an
 * installer the web app and overlay are `extraResources` and the icons ship inside the app.
 */
export function resolveAppPaths({ isPackaged, resourcesPath, bundleDir, platform }: AppPathSources): AppPaths {
  const appDir = join(bundleDir, "..");
  const repoAppsDir = join(appDir, "..");
  return {
    mobileDistDir: isPackaged ? join(resourcesPath, "mobile") : join(repoAppsDir, "mobile", "dist"),
    overlayFile: isPackaged ? join(resourcesPath, "overlay.html") : join(repoAppsDir, "desktop", "public", "overlay.html"),
    // The "Template" suffix makes macOS tint it for light and dark menu bars.
    trayIcon: join(appDir, "assets", platform === "darwin" ? "trayTemplate.png" : "tray.png"),
    windowIcon: join(appDir, "assets", "icon.png"),
  };
}
