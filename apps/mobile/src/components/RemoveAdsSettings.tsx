import type { AdsPurchaseState, AdsResponse } from "@speed-deck/core";
import { useEffect, useId, useRef } from "react";
import type { MonetizationMode } from "../app/use-monetization";
import { useT } from "../i18n/I18nProvider";

interface RemoveAdsSettingsProps {
  mode: MonetizationMode | null;
  /** The computer's ads status, once loaded; null without a computer. */
  ads: AdsResponse | null;
  /** Moves focus to the heading once shown (arriving from the banner). */
  focusHeading?: boolean;
  /** Set inside an app-store build (the Android app on Google Play): the only place where ads are removed. */
  store?: StoreRemoveAds | null;
}

export interface StoreRemoveAds {
  state: AdsPurchaseState;
  /** Ads are already off here because another phone's purchase removed them on the computer. */
  adsFreeByComputer: boolean;
  /** This phone owns the purchase and is connected to a computer, whose ads it removes too. */
  removesComputerAds: boolean;
  /** The purchase button's text, with the store's price when it is known. */
  buyLabel: string;
  onPurchase: () => void;
  onRestore: () => void;
}

/** The store's flow: status, the purchase with the store's price, a pending payment, restore, or why it cannot be bought. */
function StoreRemoveAdsFlow({ state, adsFreeByComputer, removesComputerAds, buyLabel, onPurchase, onRestore }: StoreRemoveAds) {
  const t = useT();
  if (state.entitlement === "owned") {
    return (
      <>
        <p className="remove-ads-status">{t("ads.store.owned")}</p>
        {removesComputerAds && <p className="field-hint">{t("ads.store.alsoComputer")}</p>}
      </>
    );
  }
  const pending = state.entitlement === "pending";
  return (
    <>
      <p className="remove-ads-status">{pending ? t("ads.store.pending") : adsFreeByComputer ? t("ads.store.byComputer") : t("ads.settings.shown")}</p>
      {!pending && !state.available && <p className="field-hint">{t("ads.store.unavailable")}</p>}
      <div className="remove-ads-store">
        {!pending && state.available && (
          <button type="button" className="button button-primary" onClick={onPurchase}>
            {buyLabel}
          </button>
        )}
        <button type="button" className="button" onClick={onRestore}>
          {t("ads.store.restore")}
        </button>
      </div>
    </>
  );
}

/**
 * Presentational: Settings → Remove ads. In an app-store build: the store's purchase. Anywhere else nothing
 * is sold: the computer's status (with the phone whose purchase removed the ads) and where ads are removed.
 */
export function RemoveAdsSettings({ mode, ads, focusHeading = false, store = null }: RemoveAdsSettingsProps) {
  const t = useT();
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (focusHeading) heading.current?.focus();
  }, [focusHeading]);

  const adsFree = ads?.adsFree === true;
  return (
    <div className="settings-group remove-ads" role="group" aria-labelledby={titleId}>
      <h3 id={titleId} ref={heading} tabIndex={-1}>
        {t("ads.settings.title")}
      </h3>
      {store ? (
        <StoreRemoveAdsFlow {...store} />
      ) : mode === null ? null : mode === "phone-only" ? (
        <p className="field-hint">{t("ads.settings.inAndroidApp")}</p>
      ) : (
        <>
          <p className="remove-ads-status">
            {!adsFree ? t("ads.settings.shown") : ads?.grantedBy ? t("ads.settings.removedBy", { device: ads.grantedBy.deviceName }) : t("ads.settings.removed")}
          </p>
          {!adsFree && <p className="field-hint">{mode === "computer" ? t("ads.settings.howComputer") : t("ads.settings.inAndroidApp")}</p>}
        </>
      )}
    </div>
  );
}
