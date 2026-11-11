import type { AdCreative, LicenseResponse } from "@speed-deck/core";
import { useCallback, useEffect, useState } from "react";
import type { DesktopServices } from "./composition-root";
import type { SpeechTarget } from "./use-speech-target";

/**
 * Where the remove-ads license is managed from this page:
 * - "computer": the computer app's own window, which buys, activates and removes it;
 * - "paired": a phone served by the computer, which inherits its status;
 * - "phone-only": no computer app, so the house banner always shows (a known limit).
 */
export type MonetizationMode = "computer" | "paired" | "phone-only";

export interface Monetization {
  /** Null while it is not yet known whether a computer app answers. */
  mode: MonetizationMode | null;
  /** The computer's license, once loaded. */
  license: LicenseResponse | null;
  /** The sponsor from the computer, or null for the house banner. */
  ad: AdCreative | null;
  /** False while the status is unknown, so a licensed computer never flashes the banner. */
  showsBanner: boolean;
  /** Rejects with the desktop's refusal (DesktopRequestError with a "license-*" code). */
  activate: (key: string) => Promise<LicenseResponse>;
  remove: () => Promise<LicenseResponse>;
}

type LicenseState = { status: "loading" } | { status: "loaded"; license: LicenseResponse } | { status: "failed" };

const noLicense = () => Promise.reject(new Error("No computer app."));

/** Container logic: the license status and sponsor banner, following license changes on the computer. */
export function useMonetization(desktop: DesktopServices | undefined, target: SpeechTarget): Monetization {
  const available = desktop !== undefined && target.isDesktopAvailable;
  const mode: MonetizationMode | null = target.detection === "pending" ? null : !available ? "phone-only" : target.isOnComputer ? "computer" : "paired";
  const [licenseState, setLicenseState] = useState<LicenseState>({ status: "loading" });
  const [ad, setAd] = useState<AdCreative | null>(null);

  useEffect(() => {
    if (!available || !desktop) return;
    let active = true;
    const stop = desktop.license.onChanged((license) => setLicenseState({ status: "loaded", license }));
    desktop.license.load().then(
      (license) => active && setLicenseState({ status: "loaded", license }),
      () => active && setLicenseState({ status: "failed" }),
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

  const activate = useCallback(
    async (key: string) => {
      if (!desktop) return noLicense();
      const license = await desktop.license.activate(key);
      setLicenseState({ status: "loaded", license });
      return license;
    },
    [desktop],
  );
  const remove = useCallback(async () => {
    if (!desktop) return noLicense();
    const license = await desktop.license.remove();
    setLicenseState({ status: "loaded", license });
    return license;
  }, [desktop]);

  const license = licenseState.status === "loaded" ? licenseState.license : null;
  const showsBanner =
    mode === "phone-only" || (mode !== null && (licenseState.status === "failed" || (licenseState.status === "loaded" && !licenseState.license.adsFree)));
  return { mode, license: mode === "phone-only" ? null : license, ad: mode === "phone-only" ? null : ad, showsBanner, activate, remove };
}
