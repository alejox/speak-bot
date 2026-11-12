/**
 * Where sponsor banners come from. The built-in value points to the published feed; the env var replaces
 * it, and an empty env var (or a URL that is not https) leaves only the house banner.
 */
export interface MonetizationConfig {
  adFeedUrl?: string;
}

const BUILT_IN_AD_FEED_URL = "https://www.alejoxcode.com/speeddeck/banner.json";

export const MONETIZATION_ENV = {
  adFeedUrl: "SPEED_DECK_AD_FEED_URL",
} as const;

export function loadMonetizationConfig(env: Readonly<Record<string, string | undefined>>): MonetizationConfig {
  const adFeedUrl = httpsUrl((env[MONETIZATION_ENV.adFeedUrl] ?? BUILT_IN_AD_FEED_URL).trim());
  return adFeedUrl ? { adFeedUrl } : {};
}

/** The URL when it is a well-formed https URL, else undefined. */
export function httpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname !== "" ? url.href : undefined;
  } catch {
    return undefined;
  }
}
