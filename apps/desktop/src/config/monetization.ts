/**
 * Where the "remove ads" license is sold and where sponsor banners come from. Placeholders until the
 * Lemon Squeezy store and a public feed exist: every value is empty by default and each one can be
 * set with an env var. A missing value turns its feature off gracefully:
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

/** Built-in values; fill them in once the store and the feed exist. */
const BUILT_IN: Readonly<Record<keyof MonetizationConfig, string>> = {
  storeId: "",
  productId: "",
  checkoutUrl: "",
  adFeedUrl: "",
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
