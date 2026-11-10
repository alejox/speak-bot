import { describe, expect, it } from "vitest";
import { DesktopApiClient } from "../src/adapters/desktop-api";
import { createQrCodeImage } from "../src/adapters/qr-code";
import { isLocalHostname } from "../src/app/composition-root";
import { createFakeFetch } from "./desktop-fakes";

describe("isLocalHostname", () => {
  it("is true only on the computer itself", () => {
    expect(isLocalHostname("localhost")).toBe(true);
    expect(isLocalHostname("127.0.0.1")).toBe(true);
    expect(isLocalHostname("[::1]")).toBe(true);
    expect(isLocalHostname("192.168.1.20")).toBe(false);
    expect(isLocalHostname("alejox.github.io")).toBe(false);
  });
});

describe("DesktopApiClient.loadConnection", () => {
  it("reads the phone and OBS URLs", async () => {
    const info = { port: 4545, lanUrls: ["http://192.168.1.20:4545/"], overlayUrl: "http://localhost:4545/overlay" };
    const { fetch } = createFakeFetch((request) => (request.url === "/api/connection" ? { body: info } : undefined));
    expect(await new DesktopApiClient(fetch).loadConnection()).toEqual(info);
  });

  it("rejects malformed answers", async () => {
    const { fetch } = createFakeFetch(() => ({ body: { port: "x", lanUrls: [1] } }));
    await expect(new DesktopApiClient(fetch).loadConnection()).rejects.toThrow("Unexpected connection info.");
  });
});

describe("createQrCodeImage", () => {
  it("renders the URL as an SVG data URL", async () => {
    const image = await createQrCodeImage("http://192.168.1.20:4545/");
    expect(image.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(decodeURIComponent(image)).toContain("<svg");
  });
});
