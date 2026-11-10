import { describe, expect, it } from "vitest";
import { isServiceWorkerRequest } from "../src/service-worker";

const origin = "http://127.0.0.1:4317";

describe("isServiceWorkerRequest", () => {
  it("matches the PWA service worker and its registration script on the app origin", () => {
    expect(isServiceWorkerRequest(`${origin}/sw.js`, origin)).toBe(true);
    expect(isServiceWorkerRequest(`${origin}/registerSW.js`, origin)).toBe(true);
    expect(isServiceWorkerRequest(`${origin}/sw.js?v=2`, origin)).toBe(true);
  });

  it("ignores the app's own assets and the Workbox runtime chunk", () => {
    expect(isServiceWorkerRequest(`${origin}/`, origin)).toBe(false);
    expect(isServiceWorkerRequest(`${origin}/assets/index-abc.js`, origin)).toBe(false);
    expect(isServiceWorkerRequest(`${origin}/workbox-9c191d2f.js`, origin)).toBe(false);
  });

  it("ignores other origins and malformed URLs", () => {
    expect(isServiceWorkerRequest("https://example.com/sw.js", origin)).toBe(false);
    expect(isServiceWorkerRequest("not a url", origin)).toBe(false);
  });
});
