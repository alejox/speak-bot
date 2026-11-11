import { describe, expect, it } from "vitest";
import { loadMonetizationConfig } from "../src/config/monetization";

describe("loadMonetizationConfig", () => {
  it("disables licensing, the buy button and the sponsor feed until they are configured", () => {
    expect(loadMonetizationConfig({})).toEqual({});
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
