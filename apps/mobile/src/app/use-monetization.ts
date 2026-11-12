import type { AdCreative, AdsEntitlement, AdsPurchase, AdsPurchaseState, AdsResponse } from "@speed-deck/core";
import { useEffect, useState } from "react";
import type { DeviceIdentity } from "../adapters/device-identity";
import type { DesktopServices } from "./composition-root";
import type { SpeechTarget } from "./use-speech-target";

/**
 * Where this page runs, which decides what Settings → Remove ads says:
 * - "computer": the computer app's own window;
 * - "paired": a phone served by the computer, which follows its ads status;
 * - "phone-only": no computer app.
 * Ads are only ever removed by the app store purchase (`Monetization.store`), never from these pages.
 */
export type MonetizationMode = "computer" | "paired" | "phone-only";

export interface Monetization {
  /** Null while it is not yet known whether a computer app answers. */
  mode: MonetizationMode | null;
  /** Whether ads are removed on the computer and thanks to which phone, once loaded. */
  ads: AdsResponse | null;
  /** The sponsor from the computer, or null for the house banner. */
  ad: AdCreative | null;
  /** False while the status is unknown, so an ad-free computer never flashes the banner. */
  showsBanner: boolean;
  /**
   * "Remove ads" on the app store (Google Play inside the Android app), or null where the app is not
   * sold through a store. It is the only way to remove ads, here and on the computer this phone uses.
   */
  store: StorePurchase | null;
}

export interface StorePurchase {
  state: AdsPurchaseState;
  /** Ads are off here because another phone's purchase removed them on the computer serving this page. */
  adsFreeByComputer: boolean;
  /** This phone owns the purchase and is connected to a computer, whose ads it removes too. */
  removesComputerAds: boolean;
  /** Opens the store's purchase flow; false when it could not be started. */
  purchase: () => boolean;
  /** Asks the store again what this account owns. */
  restore: () => void;
}

type AdsState = { status: "loading" } | { status: "loaded"; ads: AdsResponse } | { status: "failed" };

/** What the store knows for sure; "unknown" and "pending" are not facts worth telling the computer. */
const definitive = (entitlement: AdsEntitlement | undefined): "owned" | "not-owned" | null =>
  entitlement === "owned" || entitlement === "not-owned" ? entitlement : null;

/**
 * Container logic: the computer's ads status and sponsor banner, following changes on the computer, and
 * telling the computer what the app store says this phone owns.
 */
export function useMonetization(
  desktop: DesktopServices | undefined,
  target: SpeechTarget,
  adsPurchase?: AdsPurchase,
  deviceIdentity?: () => DeviceIdentity | null,
): Monetization {
  const available = desktop !== undefined && target.isDesktopAvailable;
  const mode: MonetizationMode | null = target.detection === "pending" ? null : !available ? "phone-only" : target.isOnComputer ? "computer" : "paired";
  const [adsState, setAdsState] = useState<AdsState>({ status: "loading" });
  const [ad, setAd] = useState<AdCreative | null>(null);
  const [storeState, setStoreState] = useState<AdsPurchaseState | null>(() => adsPurchase?.getState() ?? null);

  useEffect(() => {
    if (!adsPurchase) return setStoreState(null);
    const stop = adsPurchase.onChanged(setStoreState);
    // The store may have answered between the first render and this subscription.
    setStoreState(adsPurchase.getState());
    return () => void stop();
  }, [adsPurchase]);

  useEffect(() => {
    if (!available || !desktop) return;
    let active = true;
    const stop = desktop.ads.onChanged((ads) => setAdsState({ status: "loaded", ads }));
    desktop.ads.load().then(
      (ads) => active && setAdsState({ status: "loaded", ads }),
      () => active && setAdsState({ status: "failed" }),
    );
    desktop.loadAd().then(
      (loaded) => active && setAd(loaded),
      () => undefined,
    );
    return () => {
      active = false;
      stop();
    };
  }, [available, desktop]);

  // A phone that owns "remove ads" removes them on the computer it uses: it says so now, when the store's
  // answer changes (a purchase, a refund) and each time the link to the computer opens again.
  const entitlement = adsPurchase ? definitive(storeState?.entitlement) : null;
  useEffect(() => {
    if (!available || !desktop || !entitlement || !deviceIdentity) return;
    const identity = deviceIdentity();
    if (!identity) return;
    let active = true;
    const report = () =>
      void desktop.ads.report({ deviceId: identity.id, deviceName: identity.name, entitlement }).then(
        (ads) => active && setAdsState({ status: "loaded", ads }),
        // Not reached: the next connection reports again.
        () => undefined,
      );
    report();
    const stop = desktop.watchConnection((connected) => connected && report());
    return () => {
      active = false;
      stop();
    };
  }, [available, desktop, entitlement, deviceIdentity]);

  const ads = adsState.status === "loaded" ? adsState.ads : null;
  const connected = mode !== null && mode !== "phone-only";
  const owned = storeState?.entitlement === "owned";
  const showsBanner = !owned && (mode === "phone-only" || (mode !== null && (adsState.status === "failed" || (adsState.status === "loaded" && !adsState.ads.adsFree))));
  const store: StorePurchase | null =
    adsPurchase && storeState
      ? {
          state: storeState,
          adsFreeByComputer: connected && !owned && ads?.adsFree === true,
          removesComputerAds: connected && owned,
          purchase: () => adsPurchase.purchase(),
          restore: () => adsPurchase.restore(),
        }
      : null;
  return { mode, ads: connected ? ads : null, ad: connected ? ad : null, showsBanner, store };
}
