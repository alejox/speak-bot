import { isDevelopmentVersion, type AppUpdateState } from "@speed-deck/core";
import { useId, type ReactNode } from "react";
import { useLanguage, useT } from "../i18n/I18nProvider";

interface AppUpdateSettingsProps {
  update: AppUpdateState;
  /** True in the computer's own window; a paired phone only reads the computer's version and state. */
  canControl: boolean;
  onCheck: () => void;
  onInstall: () => void;
  onAutoCheckChange: (enabled: boolean) => void;
  /** Shown last in the group: the link to the open-source licences. */
  children?: ReactNode;
}

/**
 * Presentational: Settings → About, where there is no computer app to tell a version of (a phone on its
 * own, or a server started without the app): only what `children` hold, the open-source licences.
 */
export function AboutSettings({ children }: { children: ReactNode }) {
  const t = useT();
  const titleId = useId();
  return (
    <div className="settings-group app-update" role="group" aria-labelledby={titleId}>
      <h3 id={titleId}>{t("about.title")}</h3>
      {children}
    </div>
  );
}

/**
 * Presentational: Settings → About and updates. The computer app's version, where it is with updates in
 * plain words and, on the computer itself, the manual check, the restart or the download page, and the
 * automatic checks setting. A build that never updates shows its version only, and one without a release
 * version (0.0.0, built by hand) is called a development build.
 */
export function AppUpdateSettings({ update, canControl, onCheck, onInstall, onAutoCheckChange, children }: AppUpdateSettingsProps) {
  const t = useT();
  const language = useLanguage();
  const titleId = useId();
  const { mode, status, latestVersion, lastCheckedAt } = update;
  const version = latestVersion ?? "";
  const isDevelopment = isDevelopmentVersion(update.currentVersion);
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
      {isDevelopment ? (
        // 0.0.0 is not a version anyone released: say what the build is instead of showing a number.
        <>
          <p className="app-update-version">{t(canControl ? "update.versionDev" : "update.versionDevOnComputer")}</p>
          <p className="field-hint">{t("update.devHint")}</p>
        </>
      ) : (
        <p className="app-update-version">{t(canControl ? "update.version" : "update.versionOnComputer", { version: update.currentVersion })}</p>
      )}
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
      {children}
    </div>
  );
}

function formatWhen(epochMs: number, language: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(epochMs);
}
