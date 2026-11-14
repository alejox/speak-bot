import type { AppUpdateMode, AppUpdateState } from "@speed-deck/core";
import { isNewerStableVersion, releasePageUrl } from "./versions";

/** What the updater (electron-updater behind `UpdaterBackend`) and the setting report. */
export type UpdaterEvent =
  | { type: "checking" }
  | { type: "available"; version: string }
  | { type: "not-available" }
  | { type: "progress"; percent: number }
  | { type: "downloaded"; version: string }
  | { type: "error" }
  | { type: "auto-check"; enabled: boolean };

export function initialUpdateState({ currentVersion, mode, autoCheck = true }: { currentVersion: string; mode: AppUpdateMode; autoCheck?: boolean }): AppUpdateState {
  return { currentVersion, mode, status: "idle", autoCheck };
}

/** The fields that never change with an event, plus the last check that worked. */
function base(state: AppUpdateState): AppUpdateState {
  const { currentVersion, mode, autoCheck, lastCheckedAt } = state;
  return { currentVersion, mode, status: "idle", autoCheck, ...(lastCheckedAt === undefined ? {} : { lastCheckedAt }) };
}

/** The newer version already found, kept while a later check runs or fails. */
function known(state: AppUpdateState): Partial<AppUpdateState> {
  const { latestVersion, releaseUrl } = state;
  return { ...(latestVersion === undefined ? {} : { latestVersion }), ...(releaseUrl === undefined ? {} : { releaseUrl }) };
}

const clampPercent = (percent: number) => Math.min(100, Math.max(0, Math.round(Number.isFinite(percent) ? percent : 0)));

/**
 * The next update state. Pure: returns the same object when nothing changes, so callers only broadcast real
 * changes. A downloaded update stays ready whatever comes later, and a version that is not a higher stable
 * one is never offered.
 */
export function reduceUpdate(state: AppUpdateState, event: UpdaterEvent, now: number): AppUpdateState {
  if (event.type === "auto-check") return event.enabled === state.autoCheck ? state : { ...state, autoCheck: event.enabled };
  if (state.mode === "disabled" || state.status === "downloaded") return state;

  switch (event.type) {
    case "checking":
      return state.status === "downloading" || state.status === "checking" ? state : { ...base(state), ...known(state), status: "checking" };
    case "not-available":
      return state.status === "downloading" ? state : { ...base(state), status: "up-to-date", lastCheckedAt: now };
    case "available": {
      if (!isNewerStableVersion(state.currentVersion, event.version)) return { ...base(state), status: "up-to-date", lastCheckedAt: now };
      if (state.status === "downloading" && state.latestVersion === event.version) return state;
      const found = { ...base(state), latestVersion: event.version, lastCheckedAt: now };
      return state.mode === "auto"
        ? { ...found, status: "downloading", progressPercent: 0 }
        : { ...found, status: "available", releaseUrl: releasePageUrl(event.version) };
    }
    case "progress": {
      if (state.status !== "downloading") return state;
      const progressPercent = clampPercent(event.percent);
      return progressPercent === state.progressPercent ? state : { ...state, progressPercent };
    }
    case "downloaded":
      // Only a system that installs updates itself, and only a version it would have offered.
      if (state.mode !== "auto" || !isNewerStableVersion(state.currentVersion, event.version)) return state;
      return { ...base(state), status: "downloaded", latestVersion: event.version };
    case "error":
      return state.status === "error" ? state : { ...base(state), ...known(state), status: "error" };
  }
}
