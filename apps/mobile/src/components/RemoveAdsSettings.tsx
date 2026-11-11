import type { LicenseResponse } from "@speed-deck/core";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { MonetizationMode } from "../app/use-monetization";
import { useT } from "../i18n/I18nProvider";

interface RemoveAdsSettingsProps {
  mode: MonetizationMode | null;
  license: LicenseResponse | null;
  /** Resolves true when the key was activated; the caller reports failures. */
  onActivate: (key: string) => Promise<boolean>;
  onRemove: () => Promise<boolean>;
  /** Moves focus to the heading once shown (arriving from the banner). */
  focusHeading?: boolean;
}

/**
 * Presentational: Settings → Remove ads. On the computer: the status, a Buy link, the key field and
 * Remove license. On a paired phone: the status only. Without the computer app: why ads stay.
 */
export function RemoveAdsSettings({ mode, license, onActivate, onRemove, focusHeading = false }: RemoveAdsSettingsProps) {
  const t = useT();
  const titleId = useId();
  const keyId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (focusHeading) heading.current?.focus();
  }, [focusHeading]);

  const adsFree = license?.adsFree === true;
  const run = async (operation: () => Promise<boolean>) => {
    setBusy(true);
    try {
      return await operation();
    } finally {
      setBusy(false);
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(() => onActivate(key)).then((activated) => activated && setKey(""));
  };

  return (
    <div className="settings-group remove-ads" role="group" aria-labelledby={titleId}>
      <h3 id={titleId} ref={heading} tabIndex={-1}>
        {t("ads.settings.title")}
      </h3>
      {mode === null ? null : mode === "phone-only" ? (
        <p className="field-hint">{t("ads.settings.needsComputer")}</p>
      ) : (
        <>
          <p className="remove-ads-status">
            {adsFree ? t("ads.settings.removed", { key: license?.maskedKey ?? "" }) : t("ads.settings.shown")}
          </p>
          {mode === "paired" && <p className="field-hint">{t("ads.settings.onComputer")}</p>}
          {mode === "computer" && license && !license.canActivate && <p className="field-hint">{t("ads.settings.unavailable")}</p>}
          {mode === "computer" && license?.canActivate && !adsFree && (
            <>
              {license.checkoutUrl && (
                <a className="button button-primary remove-ads-buy" href={license.checkoutUrl} target="_blank" rel="noopener noreferrer">
                  {t("ads.settings.buy")}
                </a>
              )}
              <form className="remove-ads-form" onSubmit={submit} noValidate>
                <label className="remove-ads-label" htmlFor={keyId}>
                  {t("ads.settings.key")}
                </label>
                <div className="remove-ads-key">
                  <input
                    id={keyId}
                    type="text"
                    value={key}
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={200}
                    onChange={(event) => setKey(event.target.value)}
                  />
                  <button type="submit" className="button button-small" disabled={busy}>
                    {t("ads.settings.activate")}
                  </button>
                </div>
              </form>
            </>
          )}
          {mode === "computer" && license?.maskedKey && (
            <button type="button" className="button button-small remove-ads-remove" disabled={busy} onClick={() => void run(onRemove)}>
              {t("ads.settings.remove")}
            </button>
          )}
        </>
      )}
    </div>
  );
}
