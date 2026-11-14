import { describe, expect, it } from "vitest";
import { loadMonetizationConfig } from "../src/config/monetization";

describe("loadMonetizationConfig", () => {
  it("uses the published sponsor feed by default, and nothing else", () => {
    expect(loadMonetizationConfig({})).toEqual({ adFeedUrl: "https://www.alejoxcode.com/speeddeck/banner.json" });
  });

  it("lets an env var replace the feed, and an empty one turn it off", () => {
    expect(loadMonetizationConfig({ SPEED_DECK_AD_FEED_URL: "https://ads.example/feed.json" })).toEqual({ adFeedUrl: "https://ads.example/feed.json" });
    expect(loadMonetizationConfig({ SPEED_DECK_AD_FEED_URL: "" })).toEqual({});
  });

  it("ignores a feed URL that is not https", () => {
    expect(loadMonetizationConfig({ SPEED_DECK_AD_FEED_URL: "http://ads.example/feed.json" })).toEqual({});
    expect(loadMonetizationConfig({ SPEED_DECK_AD_FEED_URL: "javascript:alert(1)" })).toEqual({});
  });
});
