import { describe, expect, it } from "vitest";
import { loadMonetizationConfig } from "../src/config/monetization";

describe("loadMonetizationConfig", () => {
  it("uses the published store, product, checkout and feed by default", () => {
    expect(loadMonetizationConfig({})).toEqual({
      storeId: 520786,
      productId: 1517249,
      checkoutUrl: "https://speeddeck.lemonsqueezy.com/checkout/buy/a38c9fa0-39f6-43c4-97a5-dc82c8635b90",
      adFeedUrl: "https://www.alejoxcode.com/speeddeck/banner.json",
    });
  });

  it("lets env vars override the defaults, and an empty one turn a feature off", () => {
    expect(
      loadMonetizationConfig({
        SPEED_DECK_LEMON_SQUEEZY_STORE_ID: "",
        SPEED_DECK_LEMON_SQUEEZY_PRODUCT_ID: "",
        SPEED_DECK_CHECKOUT_URL: "",
        SPEED_DECK_AD_FEED_URL: "",
      }),
    ).toEqual({});
  });

  it("reads the store, product, checkout URL and feed URL from env vars", () => {
    expect(
      loadMonetizationConfig({
        SPEED_DECK_LEMON_SQUEEZY_STORE_ID: "11",
        SPEED_DECK_LEMON_SQUEEZY_PRODUCT_ID: "22",
        SPEED_DECK_CHECKOUT_URL: "https://store.example/buy",
        SPEED_DECK_AD_FEED_URL: "https://ads.example/feed.json",
      }),
    ).toEqual({ storeId: 11, productId: 22, checkoutUrl: "https://store.example/buy", adFeedUrl: "https://ads.example/feed.json" });
  });

  it("ignores ids that are not positive integers and URLs that are not https", () => {
    expect(
      loadMonetizationConfig({
        SPEED_DECK_LEMON_SQUEEZY_STORE_ID: "abc",
        SPEED_DECK_LEMON_SQUEEZY_PRODUCT_ID: "-2",
        SPEED_DECK_CHECKOUT_URL: "http://store.example/buy",
        SPEED_DECK_AD_FEED_URL: "javascript:alert(1)",
      }),
    ).toEqual({});
  });
});
