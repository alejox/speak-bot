import type { ObsSettingsPatch, ObsSettingsView } from "@speed-deck/core";
import { useEffect, useId, useState, type FormEvent } from "react";
import type { ObsLive } from "../app/key-presentation";
import { useT } from "../i18n/I18nProvider";
import type { Message } from "../i18n/messages";

interface ObsSettingsProps {
  settings: ObsSettingsView;
  live: ObsLive | null;
  /** OBS settings can only change on the computer that runs the desktop app. */
  canEdit: boolean;
  /** Resolves true when saved. */
  onSave: (patch: ObsSettingsPatch) => Promise<boolean>;
  onTest: () => void;
}

/** The OBS connection group of the settings: enabled, host, port and a write-only password, with a live status. */
export function ObsSettings({ settings, live, canEdit, onSave, onTest }: ObsSettingsProps) {
  const t = useT();
  const ids = { heading: useId(), host: useId(), port: useId(), password: useId(), passwordHint: useId(), note: useId(), error: useId() };
  const [enabled, setEnabled] = useState(settings.enabled);
  const [host, setHost] = useState(settings.host);
  const [port, setPort] = useState(String(settings.port));
  const [password, setPassword] = useState("");
  const [error, setError] = useState<Message | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  // Follow changes saved elsewhere (another window, the tray).
  useEffect(() => {
    setEnabled(settings.enabled);
    setHost(settings.host);
    setPort(String(settings.port));
  }, [settings.enabled, settings.host, settings.port]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const portNumber = Number(port);
    if (host.trim() === "") return setError({ key: "obs.invalidHost" });
    if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) return setError({ key: "obs.invalidPort" });
    setError(null);
    const patch: ObsSettingsPatch = { enabled, host: host.trim(), port: portNumber };
    // The password is write-only: send it only when the user typed a new one.
    if (password !== "") patch.password = password;
    setIsBusy(true);
    void onSave(patch).then((saved) => {
      setIsBusy(false);
      if (saved) setPassword("");
    });
  };

  const status = !settings.enabled ? "off" : (live?.status ?? "disconnected");

  return (
    <section className="obs-settings" aria-labelledby={ids.heading}>
      <div className="obs-settings-header">
        <h4 id={ids.heading}>{t("obs.title")}</h4>
        <span className={`badge badge-${status}`} role="status">
          {t("obs.status", { status: t(`obs.status.${status}`) })}
        </span>
      </div>
      <p className="field-hint">{t("obs.hint")}</p>
      {!canEdit && (
        <p id={ids.note} className="notice">
          {t("obs.loopbackOnly")}
        </p>
      )}
      <form className="obs-form" onSubmit={submit} noValidate aria-describedby={canEdit ? undefined : ids.note}>
        <fieldset disabled={!canEdit || isBusy}>
          <label className="field-check">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            <span>{t("obs.enabled")}</span>
          </label>
          <div className="obs-address">
            <div className="field">
              <label htmlFor={ids.host}>{t("obs.host")}</label>
              <input id={ids.host} value={host} autoComplete="off" spellCheck={false} onChange={(event) => setHost(event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor={ids.port}>{t("obs.port")}</label>
              <input
                id={ids.port}
                type="number"
                inputMode="numeric"
                min={1}
                max={65535}
                value={port}
                aria-invalid={error?.key === "obs.invalidPort" || undefined}
                onChange={(event) => setPort(event.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor={ids.password}>{t("obs.password")}</label>
            <input
              id={ids.password}
              type="password"
              autoComplete="new-password"
              value={password}
              aria-describedby={ids.passwordHint}
              onChange={(event) => setPassword(event.target.value)}
            />
            <p id={ids.passwordHint} className="field-hint">
              {settings.hasPassword ? t("obs.passwordSaved") : t("obs.passwordNone")}
            </p>
          </div>
          <p id={ids.error} className="field-error" role="alert">
            {error ? t(error.key, error.params) : ""}
          </p>
          <div className="obs-actions">
            <button type="submit" className="button button-small button-primary">
              {t("obs.save")}
            </button>
            <button type="button" className="button button-small" onClick={onTest} disabled={!settings.enabled}>
              {t("obs.test")}
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
