import { isDevelopmentVersion, type AppUpdateMode } from "@speed-deck/core";

export interface UpdateEnvironment {
  platform: NodeJS.Platform;
  /** False while running from source (`npm run dev`). */
  isPackaged: boolean;
  /** `process.env.APPIMAGE`: the AppImage file the app runs from, set by the AppImage runtime. */
  appImage: string | undefined;
  /** Whether the build carries its update source (`app-update.yml` in the app's resources). */
  hasUpdateConfig: boolean;
  /** The app's own version (`app.getVersion()`). */
  currentVersion: string;
}

/**
 * What this installation can do with a new version, decided from capability:
 * - Windows (NSIS installer) and a Linux AppImage replace themselves: "auto".
 * - macOS only accepts updates signed with an Apple Developer ID, which this app does not have, and a Linux
 *   .deb belongs to the system's package manager: both only announce the version ("notify").
 * - A development build, or one built without an update source, never looks: "disabled". So does an
 *   installer built by hand without a release version (0.0.0, see `isDevelopmentVersion`): every published
 *   version counts as newer than it, so updating would replace it with older code.
 */
export function updateMode({ platform, isPackaged, appImage, hasUpdateConfig, currentVersion }: UpdateEnvironment): AppUpdateMode {
  if (!isPackaged || !hasUpdateConfig || isDevelopmentVersion(currentVersion)) return "disabled";
  switch (platform) {
    case "win32":
      return "auto";
    case "linux":
      return appImage ? "auto" : "notify";
    case "darwin":
      return "notify";
    default:
      return "disabled";
  }
}
