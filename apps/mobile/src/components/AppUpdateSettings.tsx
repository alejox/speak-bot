import type { AppUpdateState } from "@speed-deck/core";
import { useId } from "react";
import { useLanguage, useT } from "../i18n/I18nProvider";

interface AppUpdateSettingsProps {
  update: AppUpdateState;
  /** True in the computer's own window; a paired phone only reads the computer's version and state. */
  canControl: boolean;
  onCheck: () => void;
  onInstall: () => void;
  onAutoCheckChange: (enabled: boolean) => void;
}

/**
 * Presentational: Settings → About and updates. The computer app's version, where it is with updates in
 * plain words and, on the computer itself, the manual check, the restart or the download page, and the
 * automatic checks setting. A build that never updates shows its version only.
 */
export function AppUpdateSettings({ update, canControl, onCheck, onInstall, onAutoCheckChange }: AppUpdateSettingsProps) {
  const t = useT();
  const language = useLanguage();
  const titleId = useId();
  const { mode, status, latestVersion, lastCheckedAt } = update;
  const version = latestVersion ?? "";
  const updates = mode !== "disabled";
  const controls = updates && canControl;

  const statusText = !updates
    ? null
    : status === "checking"
      ? t("update.checking")
      : status === "up-to-date"
        ? t("update.upToDate")
        : status === "available"
          ? t("update.available", { version })
          : status === "downloading"
            ? t("update.downloading", { version })
            : status === "downloaded"
              ? t(canControl ? "update.downloaded" : "update.downloadedOnComputer", { version })
              : status === "error"
                ? t("update.error")
                : null;
  // Where updates are installed by hand, the page of the version found (also while a later check fails).
  const downloadPage = controls && mode === "notify" && latestVersion && update.releaseUrl ? update.releaseUrl : null;
  const showsLastCheck = updates && lastCheckedAt !== undefined && (status === "up-to-date" || status === "error" || status === "available");
  const busy = status === "checking" || status === "downloading";

  return (
    <div className="settings-group app-update" role="group" aria-labelledby={titleId}>
      <h3 id={titleId}>{t("update.title")}</h3>
      <p className="app-update-version">{t(canControl ? "update.version" : "update.versionOnComputer", { version: update.currentVersion })}</p>
      {statusText && (
        <p className="app-update-status" role="status">
          {statusText}
        </p>
      )}
      {updates && status === "downloading" && (
        <progress className="app-update-progress" aria-label={t("update.downloadProgress", { version })} value={update.progressPercent ?? 0} max={100} />
      )}
      {showsLastCheck && <p className="field-hint">{t("update.lastChecked", { when: formatWhen(lastCheckedAt, language) })}</p>}
      {controls && (
        <>
          <div className="app-update-actions">
            {status === "downloaded" ? (
              <button type="button" className="button button-primary" onClick={onInstall}>
                {t("update.restart")}
              </button>
            ) : (
              <button type="button" className="button" onClick={onCheck} disabled={busy}>
                {t("update.check")}
              </button>
            )}
            {downloadPage && (
              // Opens outside the app: the window hands https links to the system browser.
              <a className="button button-primary" href={downloadPage} target="_blank" rel="noopener noreferrer">
                {t("update.download", { version })}
              </a>
            )}
          </div>
          {downloadPage && <p className="field-hint">{t("update.manualHint")}</p>}
          <label className="field-check">
            <input type="checkbox" checked={update.autoCheck} onChange={(event) => onAutoCheckChange(event.target.checked)} />
            <span>{t("update.autoCheck")}</span>
          </label>
          <p className="field-hint">{t("update.autoCheckHint")}</p>
        </>
      )}
    </div>
  );
}

function formatWhen(epochMs: number, language: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(epochMs);
}
