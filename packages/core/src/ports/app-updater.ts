/**
 * How the computer app updates itself on this system:
 * - "auto": it downloads new versions in the background and installs them when it quits or on request;
 * - "notify": it only says a new version exists and links to its download page (it cannot install it itself);
 * - "disabled": it never looks for versions (a development build, or one built without an update source).
 */
export type AppUpdateMode = "auto" | "notify" | "disabled";

export type AppUpdateStatus = "idle" | "checking" | "up-to-date" | "available" | "downloading" | "downloaded" | "error";

export const APP_UPDATE_MODES: readonly AppUpdateMode[] = ["auto", "notify", "disabled"];
export const APP_UPDATE_STATUSES: readonly AppUpdateStatus[] = ["idle", "checking", "up-to-date", "available", "downloading", "downloaded", "error"];

/** The computer app's version and where it is with updates. */
export interface AppUpdateState {
  readonly currentVersion: string;
  readonly mode: AppUpdateMode;
  /** "error" means the last check or download failed; `lastCheckedAt` still tells the last check that worked. */
  readonly status: AppUpdateStatus;
  /** The newer version found, from "available" on. */
  readonly latestVersion?: string;
  /** 0 to 100 while "downloading". */
  readonly progressPercent?: number;
  /** https page of the newer version, for systems that install it by hand ("notify"). */
  readonly releaseUrl?: string;
  /** Epoch ms of the last check that got an answer. */
  readonly lastCheckedAt?: number;
  /** Whether the app looks for updates by itself (shortly after it starts and every few hours). */
  readonly autoCheck: boolean;
}

/** The computer app's updater; absent when the server runs without the app (`npm start`). */
export interface AppUpdater {
  state(): AppUpdateState;
  /** Notifies every state change. Returns an unsubscribe function. */
  subscribe(listener: (state: AppUpdateState) => void): () => void;
  /** Looks for a new version now; resolves with the state once the check ended. Never rejects. */
  check(): Promise<AppUpdateState>;
  /** Restarts the app to install a downloaded update; false when there is nothing downloaded to install. */
  install(): boolean;
  /** Turns the checks the app makes by itself on or off. */
  setAutoCheck(enabled: boolean): void;
}

export function isAppUpdateState(value: unknown): value is AppUpdateState {
  if (typeof value !== "object" || value === null) return false;
  const { currentVersion, mode, status, latestVersion, progressPercent, releaseUrl, lastCheckedAt, autoCheck } = value as Record<string, unknown>;
  return (
    typeof currentVersion === "string" &&
    APP_UPDATE_MODES.includes(mode as AppUpdateMode) &&
    APP_UPDATE_STATUSES.includes(status as AppUpdateStatus) &&
    typeof autoCheck === "boolean" &&
    (latestVersion === undefined || typeof latestVersion === "string") &&
    (progressPercent === undefined || isFiniteNumber(progressPercent)) &&
    (lastCheckedAt === undefined || isFiniteNumber(lastCheckedAt)) &&
    (releaseUrl === undefined || isHttpsUrl(releaseUrl))
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** An https address with a host and no spaces (this package has no URL parser). */
function isHttpsUrl(value: unknown): boolean {
  return typeof value === "string" && /^https:\/\/[^\s/?#]+[^\s]*$/.test(value);
}
