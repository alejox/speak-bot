/**
 * Where the "remove ads" license is sold and where sponsor banners come from. The built-in values point to
 * the published Lemon Squeezy store and feed; each one can be replaced with an env var, and an empty env var
 * turns its feature off. A missing value turns its feature off gracefully:
 * - no store or product id → keys cannot be activated (ads stay on);
 * - no checkout URL → no "Buy" button;
 * - no feed URL → only the house banner is shown.
 */
export interface MonetizationConfig {
  storeId?: number;
  productId?: number;
  checkoutUrl?: string;
  adFeedUrl?: string;
}

/**
 * Built-in values. The store and product ids are public (every License API answer carries them) and the
 * checkout and feed URLs are public pages; no license key is ever built in.
 */
const BUILT_IN: Readonly<Record<keyof MonetizationConfig, string>> = {
  storeId: "520786",
  productId: "1517249",
  checkoutUrl: "https://speeddeck.lemonsqueezy.com/checkout/buy/a38c9fa0-39f6-43c4-97a5-dc82c8635b90",
  adFeedUrl: "https://www.alejoxcode.com/speeddeck/banner.json",
};

export const MONETIZATION_ENV = {
  storeId: "SPEED_DECK_LEMON_SQUEEZY_STORE_ID",
  productId: "SPEED_DECK_LEMON_SQUEEZY_PRODUCT_ID",
  checkoutUrl: "SPEED_DECK_CHECKOUT_URL",
  adFeedUrl: "SPEED_DECK_AD_FEED_URL",
} as const;

export function loadMonetizationConfig(env: Readonly<Record<string, string | undefined>>): MonetizationConfig {
  const pick = (name: keyof MonetizationConfig) => (env[MONETIZATION_ENV[name]] ?? BUILT_IN[name]).trim();
  const config: MonetizationConfig = {};
  const storeId = positiveInteger(pick("storeId"));
  const productId = positiveInteger(pick("productId"));
  if (storeId !== undefined) config.storeId = storeId;
  if (productId !== undefined) config.productId = productId;
  const checkoutUrl = httpsUrl(pick("checkoutUrl"));
  if (checkoutUrl) config.checkoutUrl = checkoutUrl;
  const adFeedUrl = httpsUrl(pick("adFeedUrl"));
  if (adFeedUrl) config.adFeedUrl = adFeedUrl;
  return config;
}

function positiveInteger(value: string): number | undefined {
  if (!/^\d{1,15}$/.test(value)) return undefined;
  const number = Number(value);
  return number > 0 ? number : undefined;
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
