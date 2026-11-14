import type { AdCreative } from "@speed-deck/core";
import { useT } from "../i18n/I18nProvider";

interface AdBannerProps {
  /** The sponsor, or null for the house message that leads to removing ads. */
  ad: AdCreative | null;
  onRemoveAds: () => void;
  /** The house message where an app store sells "remove ads", with the store's own price; the default names no price. */
  houseText?: string;
}

/**
 * Presentational: the banner above the Deck keys, marked as an ad. A sponsor opens its https link outside
 * the app (a new tab on a phone, the system browser in the computer app); the house message opens Settings.
 */
export function AdBanner({ ad, onRemoveAds, houseText }: AdBannerProps) {
  const t = useT();
  return (
    <section className="ad-banner" aria-label={t("ads.label")}>
      <span className="ad-banner-tag">{t("ads.tag")}</span>
      {ad ? (
        <a className="ad-banner-body" href={ad.linkUrl} target="_blank" rel="noopener noreferrer">
          {ad.imagePath && <img className="ad-banner-image" src={ad.imagePath} alt={ad.alt ?? ""} />}
          <span className="ad-banner-text">
            <strong className="ad-banner-title">{ad.title}</strong>
            {ad.text && <span className="ad-banner-detail">{ad.text}</span>}
          </span>
        </a>
      ) : (
        <button type="button" className="ad-banner-body" onClick={onRemoveAds}>
          <span className="ad-banner-text">
            <strong className="ad-banner-title">{houseText ?? t("ads.house")}</strong>
          </span>
        </button>
      )}
    </section>
  );
}
