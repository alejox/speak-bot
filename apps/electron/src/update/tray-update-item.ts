import type { AppUpdateState } from "@speed-deck/core";
import type { TrayStrings } from "../tray-strings";
import type { UpdateNotice } from "./app-update-controller";

export interface TrayUpdateItem {
  label: string;
  enabled: boolean;
  /** What pressing it does; "none" while it only reports. */
  action: "check" | "install" | "open-release" | "none";
}

const withVersion = (template: string, version: string) => template.replace("{version}", version);

/** The one tray menu item about updates, or null when this build never updates. */
export function trayUpdateItem(state: AppUpdateState, strings: TrayStrings): TrayUpdateItem | null {
  if (state.mode === "disabled") return null;
  const { status, latestVersion } = state;
  if (status === "downloaded" && latestVersion) return { label: withVersion(strings.restartToUpdate, latestVersion), enabled: true, action: "install" };
  if (status === "downloading") return { label: strings.downloadingUpdate, enabled: false, action: "none" };
  if (status === "checking") return { label: strings.checkForUpdates, enabled: false, action: "none" };
  if (state.mode === "notify" && latestVersion && state.releaseUrl) {
    return { label: withVersion(strings.downloadVersion, latestVersion), enabled: true, action: "open-release" };
  }
  return { label: strings.checkForUpdates, enabled: true, action: "check" };
}

/** The text of the single system notification for a version. */
export function updateNotification(notice: UpdateNotice, strings: TrayStrings): { title: string; body: string } {
  return notice.kind === "downloaded"
    ? { title: withVersion(strings.updateReadyTitle, notice.version), body: strings.updateReadyBody }
    : { title: withVersion(strings.updateAvailableTitle, notice.version), body: strings.updateAvailableBody };
}
